/**
 * Multi-agent orchestration pipeline.
 *
 * Event: "orion/pipeline.run"
 * Data:  { orgId, goalId, campaignId?, channels: string[] }
 *
 * Pipeline stages:
 *   1. Fetch brand profile (optional — enriches all downstream agents)
 *   2. MarketingStrategistAgent  → strategy markdown
 *   3. Auto-create campaign linked to goal + strategy
 *   4. ContentCreatorAgent       → platform content per channel
 *   5. ImageGeneratorAgent       → DALL-E 3 visual per channel (requires OPENAI_API_KEY)
 *
 * Each stage persists its output to the DB before the next stage starts so
 * that a failure mid-pipeline can be retried without re-running earlier steps.
 * Idempotency: stages check for existing DB records before running the agent.
 */

import { inngest } from "../client.js";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  campaigns,
  assets,
  brands,
  organizations,
  personas,
  usageRecords,
} from "@orion/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  MarketingStrategistAgent,
  ContentCreatorAgent,
  ImageGeneratorAgent,
  anthropic,
} from "@orion/agents";
import type { BrandBrief } from "@orion/agents";
import { agentTimer } from "@orion/agents/lib/agent-logger";
import { randomUUID, createHash } from "crypto";

// ── Headline/CTA extractor ────────────────────────────────────────────────────

function extractHeadlineAndCta(
  copyText: string,
  channel: string,
): { headline: string; cta: string } {
  const lines = copyText.split("\n").map((l) => l.trim()).filter(Boolean);

  if (channel === "email") {
    const subjectLine = lines.find((l) => /^SUBJECT:/i.test(l));
    const ctaLine = lines.find((l) => /\[.*\]/.test(l) && /button|cta|click/i.test(l));
    return {
      headline: subjectLine ? subjectLine.replace(/^SUBJECT:\s*/i, "").trim() : (lines[0] ?? ""),
      cta: ctaLine ? ctaLine.replace(/^.*?:\s*/, "").replace(/[\[\]]/g, "").trim() : "Learn More",
    };
  }

  if (channel === "blog") {
    const headlineLine = lines.find((l) => /^HEADLINE:/i.test(l));
    return {
      headline: headlineLine ? headlineLine.replace(/^HEADLINE:\s*/i, "").trim() : (lines[0] ?? ""),
      cta: "Read More",
    };
  }

  const actionWords = ["get", "try", "start", "join", "sign", "click", "learn", "discover",
    "visit", "follow", "subscribe", "download", "buy", "book", "shop", "share"];
  const headline = (lines[0] ?? "").slice(0, 80);
  const ctaLine = [...lines].reverse().find((l) =>
    actionWords.some((w) => l.toLowerCase().includes(w)),
  );
  return {
    headline,
    cta: (ctaLine ?? lines[lines.length - 1] ?? "").slice(0, 60),
  };
}

// ── Deterministic variant group ID ───────────────────────────────────────────

/** Stable UUID-shaped ID from campaignId + channel — safe across Inngest replays. */
function variantGroupIdFor(campaignId: string, channel: string): string {
  const h = createHash("md5").update(`${campaignId}:${channel}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(
    `##[^#]*${escapeRegex(heading)}[\\s\\S]*?(?=\\n##[^#]|$)`,
    "i",
  );
  return text.match(regex)?.[0] ?? "";
}

function parseTargetAudiences(text: string): Array<{ name: string; description: string }> {
  const section = extractSection(text, "Target Audiences");
  const lines = section.split("\n").filter((l) => l.trim().match(/^[-*•]|\d+\./));
  return lines.slice(0, 3).map((line) => {
    const cleaned = line.replace(/^[-*•\d.)]+\s*/, "").trim();
    const colonIdx = cleaned.indexOf(":");
    return colonIdx > -1
      ? { name: cleaned.slice(0, colonIdx).trim(), description: cleaned.slice(colonIdx + 1).trim() }
      : { name: cleaned.slice(0, 60), description: cleaned };
  });
}

const KNOWN_CHANNELS = [
  "linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog", "website",
] as const;

function parseChannels(text: string): string[] {
  const section = extractSection(text, "Recommended Channels").toLowerCase();
  return KNOWN_CHANNELS.filter((ch) => section.includes(ch));
}

function parseKpis(text: string): Record<string, string> {
  const section = extractSection(text, "KPI");
  const kpis: Record<string, string> = {};
  const lines = section.split("\n").filter((l) => l.includes(":"));
  for (const line of lines.slice(0, 8)) {
    const [key, ...rest] = line.split(":");
    const cleanKey = key?.replace(/^[-*•\s]+/, "").trim() ?? "";
    const val = rest.join(":").trim();
    if (cleanKey && val) kpis[cleanKey] = val;
  }
  return kpis;
}

/** Track token usage in usageRecords (upsert current month). */
async function trackTokens(orgId: string, tokensUsed: number): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await db
    .insert(usageRecords)
    .values({ orgId, month, aiTokensUsed: tokensUsed })
    .onConflictDoUpdate({
      target: [usageRecords.orgId, usageRecords.month],
      set: {
        aiTokensUsed: sql`${usageRecords.aiTokensUsed} + ${tokensUsed}`,
        updatedAt: new Date(),
      },
    });
}

// ── Orchestration job ─────────────────────────────────────────────────────────

export const runAgentPipeline = inngest.createFunction(
  {
    id: "run-agent-pipeline",
    name: "Run Multi-Agent Marketing Pipeline",
    retries: 2,
    concurrency: { limit: 5 },
  },
  { event: "orion/pipeline.run" },
  async ({ event, step }) => {
    const {
      orgId,
      goalId,
      campaignId: incomingCampaignId,
      channels: requestedChannels,
      brandBrief: incomingBrandBrief,
    } = event.data as {
      orgId: string;
      goalId: string;
      campaignId?: string;
      channels?: string[];
      brandBrief?: BrandBrief;
    };

    const runId = event.id ?? randomUUID();

    // ── Fetch goal ────────────────────────────────────────────────────────────

    const goal = await step.run("fetch-goal", async () =>
      db.query.goals.findFirst({ where: eq(goals.id, goalId) }),
    );

    if (!goal) throw new Error(`Goal ${goalId} not found`);

    // ── Fetch brand profile (optional) ───────────────────────────────────────

    const brand = await step.run("fetch-brand", async () =>
      db.query.brands.findFirst({
        where: and(eq(brands.orgId, orgId), eq(brands.isActive, true)),
      }),
    );

    const brandProfile = brand
      ? {
          name: brand.name,
          tagline: brand.tagline ?? undefined,
          description: brand.description ?? undefined,
          logoUrl: brand.logoUrl ?? undefined,
          websiteUrl: brand.websiteUrl ?? undefined,
          primaryColor: brand.primaryColor ?? undefined,
          voiceTone: brand.voiceTone ?? undefined,
          targetAudience: brand.targetAudience ?? undefined,
          products: (brand.products as Array<{ name: string; description: string }> | null) ?? [],
        }
      : undefined;

    // ── Fetch org brand design settings + personas ────────────────────────────

    const [org, orgPersonas] = await step.run("fetch-org-context", async () =>
      Promise.all([
        db.query.organizations.findFirst({ where: eq(organizations.id, orgId) }),
        db.query.personas.findMany({ where: eq(personas.orgId, orgId) }),
      ]),
    );

    const brandBrief: BrandBrief = {
      logoUrl: org?.logoUrl ?? undefined,
      primaryColor: org?.brandPrimaryColor ?? undefined,
      secondaryColor: org?.brandSecondaryColor ?? undefined,
      fontPreference: org?.fontPreference ?? undefined,
      logoPosition: org?.logoPosition ?? undefined,
      inspirationImageUrl: org?.inspirationImageUrl ?? undefined,
      // Merge any fields passed in via event data
      ...incomingBrandBrief,
    };

    const personaContext = orgPersonas.length > 0
      ? orgPersonas.map((p, i) => {
          const channels = (p.preferredChannels as string[] | null)?.join(", ") ?? "not specified";
          return `Persona ${i + 1}: ${p.name}. Demographics: ${p.demographics ?? "not specified"}. Psychographics: ${p.psychographics ?? "not specified"}. Pain Points: ${p.painPoints ?? "not specified"}. Preferred Channels: ${channels}.`;
        }).join(" | ")
      : undefined;

    const brandVoiceProfileStr = org?.brandVoiceProfile
      ? JSON.stringify(org.brandVoiceProfile)
      : undefined;

    // ── Detect flow type + analyze source photo (before content creation) ──────

    const flowType: "generate" | "user-photo" = goal.sourcePhotoUrl ? "user-photo" : "generate";

    let photoAnalysis: string | undefined;
    if (flowType === "user-photo" && goal.sourcePhotoUrl) {
      photoAnalysis = await step.run("analyze-source-photo", async () => {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "url", url: goal.sourcePhotoUrl! } },
                {
                  type: "text",
                  text: "Analyze this photo for marketing copy context. Describe: the mood/emotional tone, main subject, visual setting, and overall aesthetic style. Keep it to 2-3 concise sentences suitable for guiding marketing copywriters.",
                },
              ],
            },
          ],
        });
        return (response.content[0] as { text: string }).text;
      });
    }

    const photoContext = photoAnalysis
      ? `This content will accompany a photo of: ${photoAnalysis}. Write copy that feels written for this specific image.`
      : undefined;

    // ── Research trends (Task C) ──────────────────────────────────────────────

    const trendContext = await step.run("research-trends", async () => {
      if (!process.env.BRAVE_SEARCH_API_KEY) return undefined;
      try {
        const query = encodeURIComponent(`${goal.type} marketing trends ${new Date().getFullYear()}`);
        const braveRes = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${query}&count=5`,
          {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
            },
          },
        );
        if (!braveRes.ok) return undefined;
        const braveData = (await braveRes.json()) as {
          web?: { results?: Array<{ title: string; description: string }> };
        };
        const snippets =
          braveData.web?.results
            ?.slice(0, 5)
            .map((r) => `- ${r.title}: ${r.description}`)
            .join("\n") ?? "";
        if (!snippets) return undefined;

        const summary = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Summarize these search results into 3-4 key marketing trends relevant to "${goal.type}" goals, in 2-3 sentences total:\n\n${snippets}`,
            },
          ],
        });
        return (summary.content[0] as { text: string }).text;
      } catch {
        return undefined;
      }
    });

    // ── Stage 1: Strategy ─────────────────────────────────────────────────────

    let strategyId: string;
    let strategyText: string;

    const existingStrategy = await step.run("check-existing-strategy", async () =>
      db.query.strategies.findFirst({ where: eq(strategies.goalId, goalId) }),
    );

    if (existingStrategy) {
      strategyId = existingStrategy.id;
      strategyText = existingStrategy.contentText;
    } else {
      const strategyResult = await step.run("run-strategist-agent", async () => {
        const agent = new MarketingStrategistAgent();
        const timer = agentTimer("MarketingStrategistAgent", "1.0.0", {
          runId,
          orgId,
          resourceId: goalId,
        });
        try {
          const result = await agent.generate({
            goalType: goal.type,
            brandName: goal.brandName,
            brandDescription: goal.brandDescription ?? undefined,
            targetAudience: goal.targetAudience ?? undefined,
            timeline: goal.timeline,
            budget: goal.budget ?? undefined,
            brand: brandProfile,
            personaContext,
            brandBrief,
            trendContext: trendContext ?? undefined,
          });
          timer.done({ tokensUsed: result.tokensUsed });
          return result;
        } catch (err) {
          timer.done({ tokensUsed: 0, errorMessage: (err as Error).message });
          throw err;
        }
      });

      const savedStrategy = await step.run("save-strategy", async () => {
        const targetAudiences = parseTargetAudiences(strategyResult.text);
        const channels = parseChannels(strategyResult.text);
        const kpis = parseKpis(strategyResult.text);

        const [s] = await db
          .insert(strategies)
          .values({
            goalId,
            orgId,
            contentText: strategyResult.text,
            contentJson: { raw: strategyResult.text, runId },
            targetAudiences,
            channels,
            kpis,
            promptVersion: "1.0.0",
            modelVersion: "claude-sonnet-4-6",
            tokensUsed: strategyResult.tokensUsed,
          })
          .returning();

        await trackTokens(orgId, strategyResult.tokensUsed);
        return s!;
      });

      strategyId = savedStrategy.id;
      strategyText = savedStrategy.contentText;
    }

    // ── Stage 2: Auto-create campaign ─────────────────────────────────────────

    const campaignId = await step.run("create-campaign", async () => {
      if (incomingCampaignId) return incomingCampaignId;

      // Idempotency: reuse existing campaign for this goal if one exists
      const existing = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.goalId, goalId), eq(campaigns.orgId, orgId)),
      });
      if (existing) return existing.id;

      const brandName = brandProfile?.name ?? goal.brandName;
      const goalLabel = goal.type.replace(/_/g, " ");
      const [c] = await db
        .insert(campaigns)
        .values({
          orgId,
          goalId,
          strategyId,
          name: `${brandName} — ${goalLabel}`,
          description: `Auto-generated campaign from goal: ${goal.type}`,
          status: "draft",
          budget: goal.budget ?? null,
        })
        .returning();
      return c!.id;
    });

    // ── Stage 3: Content creation per channel (A + B variants) ───────────────

    const channels =
      requestedChannels ??
      parseChannels(strategyText).slice(0, 3) ??
      ["linkedin"];

    const contentResults: Array<{ channel: string; assetId: string; variant: "a" | "b" }> = [];

    const VARIANT_INSTRUCTIONS: Record<"a" | "b", string> = {
      a: "Write in a direct, benefit-first style with a clear, concise CTA.",
      b: "Write in a storytelling, curiosity-driven style that leads the reader to the CTA.",
    };

    for (const channel of channels) {
      const groupId = variantGroupIdFor(campaignId, channel);

      for (const variant of ["a", "b"] as const) {
        const assetResult = await step.run(`generate-content-${channel}-${variant}`, async () => {
          // Idempotency: skip if this variant already exists for campaign+channel
          const existing = await db.query.assets.findFirst({
            where: and(
              eq(assets.campaignId, campaignId),
              eq(assets.channel, channel as any),
              eq(assets.variant, variant),
              eq(assets.generatedByAgent, "ContentCreatorAgent"),
            ),
          });
          if (existing) return { assetId: existing.id, skipped: true };

          const agent = new ContentCreatorAgent();
          const timer = agentTimer("ContentCreatorAgent", "1.0.0", {
            runId,
            orgId,
            resourceId: campaignId,
            meta: { channel, variant },
          });

          let contentText = "";
          let tokensUsed = 0;

          try {
            const result = await agent.generate(
              {
                channel,
                goalType: goal.type,
                brandName: brandProfile?.name ?? goal.brandName,
                brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
                strategyContext: strategyText.slice(0, 800),
                voiceTone: brandProfile?.voiceTone ?? undefined,
                products: brandProfile?.products ?? undefined,
                personaContext,
                photoContext,
                brandVoiceProfile: brandVoiceProfileStr,
                variantInstruction: VARIANT_INSTRUCTIONS[variant],
              },
              (chunk) => { contentText += chunk; },
            );
            tokensUsed = result.tokensUsed;
            timer.done({ tokensUsed });
          } catch (err) {
            timer.done({ tokensUsed: 0, errorMessage: (err as Error).message });
            throw err;
          }

          const [asset] = await db
            .insert(assets)
            .values({
              orgId,
              campaignId,
              channel: channel as any,
              type: "social_post",
              contentText,
              variant,
              variantGroupId: groupId,
              generatedByAgent: "ContentCreatorAgent",
              modelVersion: "claude-sonnet-4-6",
              tokensUsed,
              status: "draft",
            })
            .returning();

          await trackTokens(orgId, tokensUsed);
          return { assetId: asset!.id, skipped: false };
        });

        contentResults.push({ channel, assetId: assetResult.assetId, variant });
      }
    }

    // ── Stage 4: Image generation (parallel, generate flow only) ─────────────

    if (flowType === "generate" && process.env.OPENAI_API_KEY) {
      await Promise.all(
        contentResults.map(({ channel, assetId, variant }) =>
          step.run(`generate-image-${channel}-${variant}`, async () => {
            const copyResult = { channel, assetId, variant };
            if (!copyResult) return;

            // Idempotency: skip if imageUrl already set on copy asset
            const existingAsset = await db.query.assets.findFirst({
              where: eq(assets.id, assetId),
            });
            if (existingAsset?.imageUrl) return { imageUrl: existingAsset.imageUrl, skipped: true };

            try {
              const agent = new ImageGeneratorAgent();
              const { imageUrl, prompt } = await agent.generate({
                brandName: brandProfile?.name ?? goal.brandName,
                brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
                channel,
                goalType: goal.type,
                primaryColor: brandProfile?.primaryColor ?? brandBrief.primaryColor,
                voiceTone: brandProfile?.voiceTone ?? undefined,
                products: brandProfile?.products ?? undefined,
                brandBrief,
              });

              await db
                .update(assets)
                .set({ imageUrl, promptSnapshot: prompt })
                .where(eq(assets.id, assetId));

              return { imageUrl, skipped: false };
            } catch (err) {
              console.error(`[pipeline] Image gen failed for ${channel}:`, (err as Error).message);
              return { imageUrl: null, skipped: true, error: (err as Error).message };
            }
          }),
        ),
      );
    }

    // ── Stage 5: Compositor — parallel per channel ────────────────────────────

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const compositeResults = await Promise.all(
      contentResults.map(({ channel, assetId, variant }) =>
        step.run(`composite-image-${channel}-${variant}`, async () => {
          try {
            // Get latest asset state (may have imageUrl set by Stage 4)
            const copyAsset = await db.query.assets.findFirst({
              where: eq(assets.id, assetId),
            });
            if (!copyAsset) return { compositedImageUrl: null };

            const backgroundImageUrl =
              flowType === "user-photo"
                ? goal.sourcePhotoUrl!
                : (copyAsset.imageUrl ?? undefined);

            if (!backgroundImageUrl) return { compositedImageUrl: null };

            const { headline, cta } = extractHeadlineAndCta(copyAsset.contentText, channel);

            const res = await fetch(`${appUrl}/api/render/${channel}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                backgroundImageUrl,
                headlineText: headline,
                ctaText: cta,
                logoUrl: brandBrief.logoUrl,
                brandPrimaryColor: brandBrief.primaryColor,
                channel,
                flowType,
                logoPosition: brandBrief.logoPosition,
              }),
            });

            if (!res.ok) {
              console.error(`[pipeline] Compositor failed for ${channel}-${variant}: ${res.status}`);
              return { compositedImageUrl: null };
            }

            const { url: compositedImageUrl } = (await res.json()) as { url: string };

            await db
              .update(assets)
              .set({ compositedImageUrl })
              .where(eq(assets.id, assetId));

            return { compositedImageUrl };
          } catch (err) {
            console.error(`[pipeline] Compositor error for ${channel}-${variant}:`, (err as Error).message);
            return { compositedImageUrl: null };
          }
        }),
      ),
    );

    return {
      runId,
      strategyId,
      campaignId,
      flowType,
      contentResults,
      compositeResults,
    };
  },
);
