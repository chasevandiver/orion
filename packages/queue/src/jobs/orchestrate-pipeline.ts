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
    `[pipeline-module] env loaded — ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING"} | SUPABASE_URL ${process.env.SUPABASE_URL ? "SET" : "MISSING"}`,
  );
}

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
  scheduledPosts,
  optimizationReports,
  notifications,
} from "@orion/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  MarketingStrategistAgent,
  ContentCreatorAgent,
  ImageGeneratorAgent,
  CompetitorIntelligenceAgent,
  SEOAgent,
  LandingPageAgent,
  anthropic,
} from "@orion/agents";
import { compositeImage } from "@orion/compositor";
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
      console.info(`[pipeline] job start — goalId: ${goalId}`);
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

    // ── Stage 2: Parallel — Competitor Intelligence + Trend Research ─────────

    const [trendResult, competitorResult] = await Promise.allSettled([
      step.run("research-trends", async () => {
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
      }),

      step.run("competitor-intelligence", async () => {
        try {
          const agent = new CompetitorIntelligenceAgent();
          const result = await agent.generate({
            brandName: brandProfile?.name ?? goal.brandName,
            industry: brandProfile?.description ?? goal.brandDescription ?? goal.type,
            goalType: goal.type,
          });
          return result.parsed;
        } catch {
          return null;
        }
      }),
    ]);

    const trendContext = trendResult.status === "fulfilled" ? trendResult.value : undefined;
    const competitorContext = competitorResult.status === "fulfilled" && competitorResult.value
      ? `Competitor Intelligence:\n` +
        (competitorResult.value.competitors ?? []).slice(0, 3).map((c) =>
          `- ${c.name}: "${c.headline}" — claims: ${c.mainClaim}`
        ).join("\n") +
        `\n\nDifferentiation opportunities:\n${(competitorResult.value.whitespace ?? []).join("; ")}` +
        `\n\nRecommended positioning: ${competitorResult.value.recommendedPositioning ?? ""}`
      : undefined;

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
      // Fetch past optimization reports to close the feedback loop
      const recentOptReports = await step.run("fetch-optimization-reports", async () =>
        db.query.optimizationReports.findMany({
          where: eq(optimizationReports.orgId, orgId),
          orderBy: desc(optimizationReports.generatedAt),
          limit: 3,
          columns: { reportText: true, generatedAt: true },
        }),
      );

      const optimizationContext = recentOptReports.length > 0
        ? `Past Optimization Insights (last ${recentOptReports.length} campaign(s)):\n` +
          recentOptReports.map((r, i) => `[Report ${i + 1}]: ${r.reportText.slice(0, 1200)}`).join("\n\n")
        : undefined;

      const strategyResult = await step.run("run-strategist-agent", async () => {
        const agent = new MarketingStrategistAgent();
        const timer = agentTimer("MarketingStrategistAgent", "2.0.0", {
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
            optimizationContext,
            competitorContext,
          });
          timer.done({ tokensUsed: result.tokensUsed });
          return result;
        } catch (err) {
          timer.done({ tokensUsed: 0, errorMessage: (err as Error).message });
          throw err;
        }
      });

      const savedStrategy = await step.run("save-strategy", async () => {
        // Prefer JSON-parsed output; fall back to legacy regex parsing for resilience
        const parsed = strategyResult.parsed;
        const targetAudiences = parsed
          ? parsed.audiences.map((a) => ({ name: a.name, description: a.description }))
          : parseTargetAudiences(strategyResult.text);
        const channels = parsed
          ? parsed.channels
          : parseChannels(strategyResult.text);
        const kpis = parsed ? parsed.kpis : parseKpis(strategyResult.text);

        const [s] = await db
          .insert(strategies)
          .values({
            goalId,
            orgId,
            contentText: strategyResult.text,
            contentJson: parsed ? { ...parsed, runId } : { raw: strategyResult.text, runId },
            targetAudiences,
            channels,
            kpis,
            promptVersion: "2.0.0",
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

    // Use JSON-parsed channels if available; fall back to regex parse then default
    const parsedStrategyJson = (() => {
      try {
        return JSON.parse(strategyText) as { channels?: string[]; keyMessagesByChannel?: Record<string, string> } | null;
      } catch {
        return null;
      }
    })();

    const channels =
      requestedChannels ??
      parsedStrategyJson?.channels?.slice(0, 3) ??
      parseChannels(strategyText).slice(0, 3) ??
      ["linkedin"];

    const keyMessagesByChannel: Record<string, string> =
      parsedStrategyJson?.keyMessagesByChannel ?? {};

    const contentResults: Array<{ channel: string; assetId: string; variant: "a" | "b" }> = [];

    // ── Stage 3b: SEOAgent for blog channel ──────────────────────────────────

    let seoBrief: string | undefined;
    if (channels.includes("blog")) {
      seoBrief = await step.run("seo-brief-blog", async () => {
        try {
          const agent = new SEOAgent();
          const result = await agent.generate({
            brandName: brandProfile?.name ?? goal.brandName,
            industry: brandProfile?.description ?? goal.brandDescription ?? goal.type,
            goalType: goal.type,
            channel: "blog",
            targetAudience: goal.targetAudience ?? undefined,
          });
          return result.parsed?.contentBrief;
        } catch {
          return undefined;
        }
      });
    }

    const VARIANT_INSTRUCTIONS: Record<"a" | "b", string> = {
      a: "Write in a direct, benefit-first style with a clear, concise CTA.",
      b: "Variant B: Open with a surprising statistic or uncomfortable question that challenges a common assumption in this industry. The first line must make the reader stop scrolling. Build to the CTA — it should feel earned, not bolted on. Use a completely different hook angle than Variant A. If Variant A leads with a benefit, Variant B leads with a problem or a challenge.",
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
                strategyContext: strategyText.slice(0, 2000),
                voiceTone: brandProfile?.voiceTone ?? undefined,
                products: brandProfile?.products ?? undefined,
                personaContext,
                photoContext,
                brandVoiceProfile: brandVoiceProfileStr,
                variantInstruction: VARIANT_INSTRUCTIONS[variant],
                keyMessage: keyMessagesByChannel[channel],
                ...(channel === "blog" && seoBrief ? { strategyContext: seoBrief + "\n\n" + strategyText.slice(0, 1000) } : {}),
              },
              (chunk) => { contentText += chunk; },
            );
            tokensUsed = result.tokensUsed;
            timer.done({ tokensUsed });

            // Twitter 280-char enforcement
            if (channel === "twitter" && contentText.length > 280) {
              const overage = contentText.length - 280;
              try {
                contentText = await agent.rewrite(
                  `This tweet is ${overage} characters too long.\nOriginal: "${contentText}"\nRewrite it to be 270 characters or fewer while keeping the core message and CTA. Count every character before responding. Output ONLY the tweet text.`,
                );
              } catch {
                // Truncate as last resort
                contentText = contentText.slice(0, 277) + "…";
              }
            }
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

    // ── Stage 4: Image generation (parallel — Unsplash Source API) ───────────

    const isUserPhotoFlow = !!goal.sourcePhotoUrl;
    console.info(`[pipeline] Image path — goalId: ${goalId}, flow: ${isUserPhotoFlow ? "user-photo" : "unsplash"}`);

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
      // Generate flow: fetch Unsplash stock photos in parallel (no API key required)
      const imageSettled = await Promise.allSettled(
        contentResults.map(({ channel, assetId, variant }) =>
          step.run(`generate-image-v2-${channel}-${variant}`, async () => {
            // Idempotency: skip if imageUrl already set
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

              console.info(`[pipeline] Unsplash image for ${channel}-${variant}: ${imageUrl ?? "null (will use gradient)"}`);

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

      const succeeded = imageSettled.filter((r) => r.status === "fulfilled").length;
      const failed = imageSettled.filter((r) => r.status === "rejected").length;
      console.info(`[pipeline] Image generation complete — ${succeeded}/${imageSettled.length} succeeded, ${failed} failed`);
    }

    // ── Stage 5: Compositor — parallel per channel (direct import, no HTTP) ──

    const compositeResults = await Promise.all(
      contentResults.map(({ channel, assetId, variant }) =>
        step.run(`composite-image-${channel}-${variant}`, async () => {
          try {
            // Idempotency: skip if already composited
            const copyAsset = await db.query.assets.findFirst({
              where: eq(assets.id, assetId),
            });
            if (!copyAsset) return { compositedImageUrl: null };
            if (copyAsset.compositedImageUrl) return { compositedImageUrl: copyAsset.compositedImageUrl, skipped: true };

            const backgroundImageUrl =
              flowType === "user-photo"
                ? goal.sourcePhotoUrl!
                : (copyAsset.imageUrl ?? undefined);

            const { headline, cta } = extractHeadlineAndCta(copyAsset.contentText, channel);

            // Resolve outputDir to the Next.js web app's public directory
            // packages/queue is 2 levels deep from monorepo root; web app is at apps/web
            const { fileURLToPath: _fup } = await import("url");
            const { dirname: _dn, resolve: _res } = await import("path");
            const __f = _fup(import.meta.url);
            const monoRoot = _res(_dn(__f), "../../../../");
            const outputDir = _res(monoRoot, "apps/web/public/generated/composited");

            const result = await compositeImage({
              backgroundImageUrl,
              headlineText: headline,
              ctaText: cta,
              logoUrl: brandBrief.logoUrl,
              brandName: brandProfile?.name ?? org?.name ?? "",
              brandPrimaryColor: brandBrief.primaryColor,
              channel,
              flowType,
              logoPosition: brandBrief.logoPosition,
              outputDir,
            });

            const compositedImageUrl = result.url;

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

    // ── Stage 6: Auto-schedule posts with optimal send times ─────────────────

    const scheduledPostIds = await step.run("schedule-posts", async () => {
      const now = new Date();
      const created: string[] = [];

      for (const { channel, assetId, variant } of contentResults) {
        try {
          // Idempotency: skip if already scheduled
          const existing = await db.query.scheduledPosts.findFirst({
            where: eq(scheduledPosts.assetId, assetId),
          });
          if (existing) { created.push(existing.id); continue; }

          const scheduledFor = computeOptimalSendTime(channel, variant, now, created.length);

          const [sp] = await db
            .insert(scheduledPosts)
            .values({
              orgId,
              assetId,
              channel: channel as any,
              scheduledFor,
              status: "scheduled",
            })
            .returning();

          if (sp) {
            created.push(sp.id);
            // Mark asset as approved now that it's scheduled
            await db
              .update(assets)
              .set({ status: "approved", approvedAt: new Date() })
              .where(eq(assets.id, assetId));
          }
        } catch (err) {
          console.error(`[pipeline] schedule-posts failed for asset ${assetId}:`, (err as Error).message);
        }
      }

      return created;
    });

    // ── Stage 8: LandingPageAgent (for leads/conversions goals) ──────────────

    let landingPageContent: unknown = null;
    if (goal.type === "leads" || goal.type === "conversions") {
      landingPageContent = await step.run("generate-landing-page", async () => {
        try {
          const agent = new LandingPageAgent();
          const parsed = await agent.generate({
            brandName: brandProfile?.name ?? goal.brandName,
            brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
            goalType: goal.type,
            targetAudience: goal.targetAudience ?? undefined,
            keyMessage: parsedStrategyJson?.keyMessagesByChannel?.["linkedin"] ?? undefined,
          });
          return parsed;
        } catch (err) {
          console.warn("[pipeline] LandingPageAgent failed:", (err as Error).message);
          return null;
        }
      });
    }

    // ── Fire pipeline_complete notification ───────────────────────────────────

    await step.run("notify-pipeline-complete", async () => {
      try {
        const channelList = [...new Set(contentResults.map((r) => r.channel))].join(", ");
        const campaignRecord = await db.query.campaigns.findFirst({
          where: eq(campaigns.id, campaignId),
          columns: { name: true },
        });
        await db.insert(notifications).values({
          orgId,
          type: "pipeline_complete",
          title: "Your campaign is ready to review",
          body: `${campaignRecord?.name ?? "Campaign"} — ${contentResults.length} assets generated across ${channelList}`,
          resourceType: "campaign",
          resourceId: campaignId,
        });
      } catch (err) {
        // Non-critical — don't fail the pipeline
        console.warn("[pipeline] Failed to create notification:", (err as Error).message);
      }
    });

    return {
      runId,
      strategyId,
      campaignId,
      flowType,
      contentResults,
      compositeResults,
      scheduledPostIds,
    };
  },
);

// ── Optimal send time calculator ──────────────────────────────────────────────

/**
 * Returns the next optimal UTC datetime for a given channel.
 * Spreads posts so no two go out within 1 hour of each other.
 */
function computeOptimalSendTime(
  channel: string,
  variant: "a" | "b",
  from: Date,
  offsetIndex: number,
): Date {
  const d = new Date(from);
  // Add 1 hour per post to ensure spacing
  d.setHours(d.getHours() + offsetIndex);

  // B variant: add 2 extra days to spread A/B variants
  const variantDayOffset = variant === "b" ? 2 : 0;

  switch (channel) {
    case "linkedin":
    case "email": {
      // Tue/Wed/Thu 8–10am UTC
      const target = nextWeekday(d, [2, 3, 4], 8);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
    case "instagram": {
      // Sat/Sun 18–21 UTC, or weekday 19–21 UTC
      const target = nextWeekend(d, 18);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
    case "twitter": {
      // Weekdays spread: 9am, 12pm, 3pm, 6pm UTC (cycle by offsetIndex)
      const hours = [9, 12, 15, 18];
      const hour = hours[offsetIndex % hours.length]!;
      const target = nextWeekday(d, [1, 2, 3, 4, 5], hour);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
    case "facebook": {
      // Weekdays 12–14 UTC
      const target = nextWeekday(d, [1, 2, 3, 4, 5], 12);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
    case "tiktok":
    case "blog": {
      // Mon/Tue 10am UTC for blog; weekday 19–21 UTC for TikTok
      const hour = channel === "blog" ? 10 : 19;
      const days = channel === "blog" ? [1, 2] : [1, 2, 3, 4, 5];
      const target = nextWeekday(d, days, hour);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
    default: {
      // Fallback: next weekday 9am UTC
      const target = nextWeekday(d, [1, 2, 3, 4, 5], 9);
      target.setDate(target.getDate() + variantDayOffset);
      return target;
    }
  }
}

/** Returns the next date that falls on one of the specified weekdays (0=Sun…6=Sat) at the given UTC hour. */
function nextWeekday(from: Date, weekdays: number[], hour: number): Date {
  const d = new Date(from);
  d.setUTCHours(hour, 0, 0, 0);
  // If the target time today is in the past, start from tomorrow
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (weekdays.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Returns the next weekend day (Sat/Sun) at the given UTC hour. */
function nextWeekend(from: Date, hour: number): Date {
  return nextWeekday(from, [0, 6], hour);
}
