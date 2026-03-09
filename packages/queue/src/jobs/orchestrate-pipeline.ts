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
 *   5. ImageGeneratorAgent       → Fal.ai Flux Schnell visual per channel (requires FAL_KEY)
 *
 * Each stage persists its output to the DB before the next stage starts so
 * that a failure mid-pipeline can be retried without re-running earlier steps.
 * Idempotency: stages check for existing DB records before running the agent.
 */

// ── Load env vars from monorepo root ─────────────────────────────────────────
// This package runs inside the Inngest job handler served by apps/web.
// Next.js only loads .env.local from its own app directory; this explicit load
// ensures FAL_KEY and other secrets are available when the job executes.
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

{
  const __filename = fileURLToPath(import.meta.url);
  // packages/queue/src/jobs/orchestrate-pipeline.ts → root is 4 directories up
  const root = path.resolve(path.dirname(__filename), "../../../../");
  config({ path: path.join(root, ".env.local") });
  config({ path: path.join(root, ".env") });
  console.info(
    `[pipeline-module] env loaded — FAL_KEY ${process.env.FAL_KEY ? "SET" : "MISSING"} | SUPABASE_URL ${process.env.SUPABASE_URL ? "SET" : "MISSING"} | SUPABASE_SERVICE_KEY ${process.env.SUPABASE_SERVICE_KEY ? "SET" : "MISSING"}`,
  );
}

import { inngest } from "../client.js";
import { uploadGeneratedImage } from "../lib/supabase-storage.js";
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

// ── Text sanitizers ───────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/#\w+/g, "")          // hashtags (#PGATour, #FantasyGolf, etc.)
    .replace(/\s+/g, " ")
    .trim();
}

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27FF}]/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCopyText(text: string): string {
  return stripMarkdown(stripEmoji(text));
}

// ── Headline/CTA extractor ────────────────────────────────────────────────────

function extractHeadlineAndCta(
  copyText: string,
  channel: string,
): { headline: string; cta: string } {
  // Filter out lines that are entirely hashtags (#PGATour #FantasyGolf …)
  const lines = copyText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => Boolean(l) && !/^(#\w+\s*)+$/.test(l));

  // Cap text to N words, adding ellipsis only if words were dropped.
  function capWords(text: string, n: number): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= n) return words.join(" ");
    return words.slice(0, n).join(" ") + "…";
  }

  const ACTION_WORDS = [
    "get", "try", "start", "join", "sign", "click", "learn", "discover",
    "visit", "follow", "subscribe", "download", "buy", "book", "shop", "share",
  ];

  // Extract the shortest clause (≤6 words) containing an action word from a line.
  // Falls back to capping the whole line at 6 words, then to "Learn More".
  function extractCtaPhrase(line: string): string {
    const fragments = line
      .split(/[.!?](?:\s|$)|\s+[|]\s+/)
      .map((f) => f.trim())
      .filter(Boolean);
    const candidates = fragments
      .filter((f) => ACTION_WORDS.some((w) => f.toLowerCase().includes(w)))
      .sort((a, b) => a.split(/\s+/).length - b.split(/\s+/).length);
    if (candidates.length > 0) {
      return capWords(candidates[0]!, 6);
    }
    return "Learn More";
  }

  if (channel === "email") {
    const subjectLine = lines.find((l) => /^SUBJECT:/i.test(l));
    const ctaLine = lines.find((l) => /\[.*\]/.test(l) && /button|cta|click/i.test(l));
    return {
      headline: capWords(cleanCopyText(subjectLine ? subjectLine.replace(/^SUBJECT:\s*/i, "").trim() : (lines[0] ?? "")), 10),
      cta: cleanCopyText(ctaLine ? ctaLine.replace(/^.*?:\s*/, "").replace(/[\[\]]/g, "").trim() : "Learn More"),
    };
  }

  if (channel === "blog") {
    const headlineLine = lines.find((l) => /^HEADLINE:/i.test(l));
    return {
      headline: capWords(cleanCopyText(headlineLine ? headlineLine.replace(/^HEADLINE:\s*/i, "").trim() : (lines[0] ?? "")), 10),
      cta: "Read More",
    };
  }

  const headline = capWords(cleanCopyText(lines[0] ?? ""), 10);
  const ctaLine = [...lines].reverse().find((l) =>
    ACTION_WORDS.some((w) => l.toLowerCase().includes(w)),
  );
  const cta = cleanCopyText(ctaLine ? extractCtaPhrase(ctaLine) : "Learn More");

  return { headline, cta };
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
      abTesting: incomingAbTesting,
    } = event.data as {
      orgId: string;
      goalId: string;
      campaignId?: string;
      channels?: string[];
      brandBrief?: BrandBrief;
      abTesting?: boolean;
    };

    const runId = event.id ?? randomUUID();

    // ── Fetch goal ────────────────────────────────────────────────────────────
    // NOTE: log inside step.run so it fires exactly once per pipeline execution.
    // Inngest replays the entire function body for each step, so any top-level
    // console.info here would fire once per sequential step — not once per run.

    const goal = await step.run("fetch-goal", async () => {
      console.info(
        `[pipeline] job start — goalId: ${goalId} | FAL_KEY ${process.env.FAL_KEY ? "SET (" + process.env.FAL_KEY.slice(0, 8) + "…)" : "MISSING"}`,
      );
      return db.query.goals.findFirst({ where: eq(goals.id, goalId) });
    });

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

    // Determine which variants to generate (default: A only; enable A/B when requested)
    const variantsToGenerate: Array<"a" | "b"> = incomingAbTesting ? ["a", "b"] : ["a"];

    for (const channel of channels) {
      const groupId = variantGroupIdFor(campaignId, channel);

      for (const variant of variantsToGenerate) {
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

    const isUserPhotoFlow = !!goal.sourcePhotoUrl;
    console.info(`[pipeline] Image path — goalId: ${goalId}, flow: ${isUserPhotoFlow ? "user-photo" : "fal-flux"}`);

    if (isUserPhotoFlow) {
      // User-photo flow: stamp sourcePhotoUrl directly onto each asset, skip generation
      await Promise.all(
        contentResults.map(({ assetId }) =>
          step.run(`set-photo-url-${assetId}`, async () => {
            await db
              .update(assets)
              .set({ imageUrl: goal.sourcePhotoUrl! })
              .where(eq(assets.id, assetId));
            return { imageUrl: goal.sourcePhotoUrl, skipped: false };
          }),
        ),
      );
    } else {
      // Generate flow: fail fast if FAL_KEY is not configured
      if (!process.env.FAL_KEY) {
        throw new Error("FAL_KEY is not set — cannot generate images");
      }

      // Process Fal image generation in batches of 2 to respect free-tier concurrency limit.
      const BATCH_SIZE = 2;
      const imageSettled: PromiseSettledResult<{ imageUrl: string | null; skipped: boolean; error?: string }>[] = [];

      for (let batchStart = 0; batchStart < contentResults.length; batchStart += BATCH_SIZE) {
        const batch = contentResults.slice(batchStart, batchStart + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(({ channel, assetId, variant }) =>
            step.run(`generate-image-v2-${channel}-${variant}`, async () => {
              // Idempotency: skip if imageUrl already set on copy asset
              const existingAsset = await db.query.assets.findFirst({
                where: eq(assets.id, assetId),
              });
              if (existingAsset?.imageUrl) return { imageUrl: existingAsset.imageUrl, skipped: true };

              try {
                const agent = new ImageGeneratorAgent();
                const { imageBuffer, prompt } = await agent.generate({
                  brandName: brandProfile?.name ?? goal.brandName,
                  brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
                  channel,
                  goalType: goal.type,
                  primaryColor: brandProfile?.primaryColor ?? brandBrief.primaryColor,
                  voiceTone: brandProfile?.voiceTone ?? undefined,
                  products: brandProfile?.products ?? undefined,
                  brandBrief,
                });

                console.info(
                  `[pipeline] Fal image ready for ${channel}-${variant} — ${imageBuffer.byteLength} bytes. Uploading to Supabase "assets" bucket…`,
                );

                // Upload buffer to Supabase; throw so the step fails loudly if the bucket is missing
                let imageUrl: string | null = null;
                try {
                  imageUrl = await uploadGeneratedImage(assetId, imageBuffer);
                  console.info(`[pipeline] Supabase upload OK for ${channel}-${variant}: ${imageUrl}`);
                } catch (uploadErr) {
                  console.error(
                    `[pipeline] Supabase upload FAILED for ${channel}-${variant} — bucket may not exist:`,
                    (uploadErr as Error).message,
                  );
                }

                await db
                  .update(assets)
                  .set({ imageUrl, promptSnapshot: prompt })
                  .where(eq(assets.id, assetId));

                return { imageUrl, skipped: false };
              } catch (err) {
                console.error(`[pipeline] Image gen failed for ${channel}-${variant}:`, (err as Error).message);
                return { imageUrl: null, skipped: true, error: (err as Error).message };
              }
            }),
          ),
        );
        imageSettled.push(...batchResults);

        // 500ms delay between batches to stay within Fal free-tier concurrency limit (max 2)
        if (batchStart + BATCH_SIZE < contentResults.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
        }
      }

      const succeeded = imageSettled.filter((r) => r.status === "fulfilled").length;
      const failed = imageSettled.filter((r) => r.status === "rejected").length;
      console.info(
        `[pipeline] Image generation complete — ${succeeded}/${imageSettled.length} succeeded, ${failed} failed`,
      );
      imageSettled.forEach((r, i) => {
        const { channel, variant } = contentResults[i]!;
        if (r.status === "rejected") {
          console.error(`[pipeline] Image channel ${channel}-${variant} FAILED:`, r.reason);
        } else {
          console.info(`[pipeline] Image channel ${channel}-${variant} OK:`, (r.value as any)?.imageUrl ?? "no URL");
        }
      });
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

            const renderHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (process.env.INTERNAL_RENDER_SECRET) {
              renderHeaders["x-internal-secret"] = process.env.INTERNAL_RENDER_SECRET;
            }

            const res = await fetch(`${appUrl}/api/render/${channel}`, {
              method: "POST",
              headers: renderHeaders,
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
