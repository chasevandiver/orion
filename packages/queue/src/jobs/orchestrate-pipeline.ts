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
import { NonRetriableError } from "inngest";
import * as Sentry from "@sentry/node";
import fs from "fs";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  campaigns,
  assets,
  trackingLinks,
  landingPages,
  brands,
  organizations,
  personas,
  usageRecords,
  scheduledPosts,
  optimizationReports,
  notifications,
  brandVoiceEdits,
  paidAdSets,
  mediaAssets,
  hashtagPerformance,
} from "@orion/db/schema";
import { eq, and, sql, desc, isNull, asc } from "drizzle-orm";
import {
  MarketingStrategistAgent,
  ContentCreatorAgent,
  ImageGeneratorAgent,
  CompetitorIntelligenceAgent,
  SEOAgent,
  PaidAdsAgent,
  BrandVoiceAgent,
  LandingPageAgent,
  anthropic,
  validateAnthropicKey,
  extractHashtags,
} from "@orion/agents";
import type { HashtagPerformanceContext } from "@orion/agents";
import { compositeImage } from "@orion/compositor";
import type { BrandBrief, LandingPageOutput } from "@orion/agents";
import { uploadGeneratedImage } from "../lib/supabase-storage.js";
import { agentTimer } from "@orion/agents/lib/agent-logger";
import { randomUUID, createHash } from "crypto";
import { appendUtmParams, applyUtmToText, slugify, UTM_MEDIUM_MAP } from "../lib/utm.js";

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
      headline: capWords(cleanCopyText(subjectLine ? subjectLine.replace(/^SUBJECT:\s*/i, "").trim() : (lines[0] ?? "")), 5),
      cta: cleanCopyText(ctaLine ? ctaLine.replace(/^.*?:\s*/, "").replace(/[\[\]]/g, "").trim() : "Learn More"),
    };
  }

  if (channel === "blog") {
    const headlineLine = lines.find((l) => /^HEADLINE:/i.test(l));
    return {
      headline: capWords(cleanCopyText(headlineLine ? headlineLine.replace(/^HEADLINE:\s*/i, "").trim() : (lines[0] ?? "")), 5),
      cta: "Read More",
    };
  }

  const headline = capWords(cleanCopyText(lines[0] ?? ""), 5);
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

// ── Plan limits ───────────────────────────────────────────────────────────────

const PLAN_LIMITS = {
  free:       { tokensPerMonth: 50_000,  postsPerMonth: 5 },
  pro:        { tokensPerMonth: 500_000, postsPerMonth: 250 },
  enterprise: { tokensPerMonth: Infinity, postsPerMonth: Infinity },
} as const;

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
  async ({ event, step, attempt }) => {
    // Tracks the current pipeline stage for error reporting
    let currentPipelineStage = "strategy";

    try {
    const {
      orgId,
      goalId,
      campaignId: incomingCampaignId,
      channels: requestedChannels,
      brandBrief: incomingBrandBrief,
      abTesting: incomingAbTesting,
      repurposeSourceAssetId,
      useBrandPhotos,
    } = event.data as {
      orgId: string;
      goalId: string;
      campaignId?: string;
      channels?: string[];
      brandBrief?: BrandBrief;
      abTesting?: boolean;
      repurposeSourceAssetId?: string;
      useBrandPhotos?: boolean;
    };

    const runId = event.id ?? randomUUID();

    // ── Plan quota check ──────────────────────────────────────────────────────

    await step.run("check-plan-quota", async () => {
      const month = new Date().toISOString().slice(0, 7);

      const [org, usage] = await Promise.all([
        db.query.organizations.findFirst({
          where: eq(organizations.id, orgId),
          columns: { plan: true },
        }),
        db.query.usageRecords.findFirst({
          where: and(eq(usageRecords.orgId, orgId), eq(usageRecords.month, month)),
        }),
      ]);

      const plan = (org?.plan ?? "free") as keyof typeof PLAN_LIMITS;
      const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
      const tokensUsed = usage?.aiTokensUsed ?? 0;
      const postsPublished = usage?.postsPublished ?? 0;

      if (tokensUsed >= limit.tokensPerMonth || postsPublished >= limit.postsPerMonth) {
        // Notify the org before throwing so the war room can surface it
        try {
          await db.insert(notifications).values({
            orgId,
            type: "plan_limit",
            title: "Monthly limit reached",
            body: "You've reached your monthly limit. Upgrade to Pro to run more campaigns.",
            resourceType: "billing",
          });
        } catch {
          // Non-critical — don't mask the real error
        }
        throw new NonRetriableError(
          "Plan limit reached. Upgrade to Pro to continue.",
        );
      }

      return { plan, tokensUsed, postsPublished };
    });

    // ── Validate Anthropic API key before any agent calls ─────────────────────
    // NonRetriableError tells Inngest to stop retrying — a bad/missing key will
    // never succeed, so retrying would only waste quota and time.

    await step.run("validate-anthropic-key", async () => {
      const validation = await validateAnthropicKey();
      if (!validation.valid) {
        throw new NonRetriableError(
          `Anthropic API key validation failed: ${validation.error ?? "unknown error"}. ` +
          "Check ANTHROPIC_API_KEY in your environment.",
        );
      }
      return { model: validation.model };
    });

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
      // Prefer brand-profile logoUrl over org logoUrl (brand is more specific)
      logoUrl: brandProfile?.logoUrl ?? org?.logoUrl ?? undefined,
      primaryColor: brandProfile?.primaryColor ?? org?.brandPrimaryColor ?? undefined,
      secondaryColor: org?.brandSecondaryColor ?? undefined,
      fontPreference: org?.fontPreference ?? undefined,
      logoPosition: org?.logoPosition ?? undefined,
      inspirationImageUrl: org?.inspirationImageUrl ?? undefined,
      // Merge any fields passed in via event data (highest priority)
      ...incomingBrandBrief,
    };
    console.log(`[pipeline] brandBrief.logoUrl resolved to: ${brandBrief.logoUrl ?? "(none)"} — brandProfile.logoUrl=${brandProfile?.logoUrl ?? "(none)"}, org.logoUrl=${org?.logoUrl ?? "(none)"}`);

    const personaContext = orgPersonas.length > 0
      ? orgPersonas.map((p, i) => {
          const channels = (p.preferredChannels as string[] | null)?.join(", ") ?? "not specified";
          return `Persona ${i + 1}: ${p.name}. Demographics: ${p.demographics ?? "not specified"}. Psychographics: ${p.psychographics ?? "not specified"}. Pain Points: ${p.painPoints ?? "not specified"}. Preferred Channels: ${channels}.`;
        }).join(" | ")
      : undefined;

    // ── BrandVoiceAgent: refresh voice profile when org has 10+ edits ────────

    let brandVoiceProfileStr = org?.brandVoiceProfile
      ? JSON.stringify(org.brandVoiceProfile)
      : undefined;

    // ── Fetch hashtag performance context for this org ────────────────────────
    // Passed to ContentCreatorAgent so it can prefer high-performing hashtags
    // and avoid low-performing or banned ones (feedback loop).

    type HashtagCtxResult = {
      high: Array<{ hashtag: string; avgEngagementRate: number }>;
      low:  Array<{ hashtag: string; avgEngagementRate: number }>;
      banned: string[];
    };

    const hashtagCtx = (await step.run("fetch-hashtag-context", async (): Promise<HashtagCtxResult> => {
      const rows = await db.query.hashtagPerformance.findMany({
        where: eq(hashtagPerformance.orgId, orgId),
        orderBy: desc(hashtagPerformance.avgEngagementRate),
        limit: 30,
      });

      const high: Array<{ hashtag: string; avgEngagementRate: number }> = rows
        .filter((r) => r.avgEngagementRate >= 0.03 && r.timesUsed >= 2)
        .slice(0, 8)
        .map((r) => ({ hashtag: r.hashtag, avgEngagementRate: r.avgEngagementRate }));

      const low: Array<{ hashtag: string; avgEngagementRate: number }> = rows
        .filter((r) => r.avgEngagementRate < 0.01 && r.timesUsed >= 3)
        .slice(0, 5)
        .map((r) => ({ hashtag: r.hashtag, avgEngagementRate: r.avgEngagementRate }));

      const banned: string[] = (org?.bannedHashtags as string[] | null) ?? [];

      return { high, low, banned };
    })) as HashtagCtxResult;

    const hashtagContext: HashtagPerformanceContext | undefined =
      (hashtagCtx.high.length > 0 || hashtagCtx.low.length > 0)
        ? { highPerforming: hashtagCtx.high, lowPerforming: hashtagCtx.low }
        : undefined;

    const bannedHashtags: string[] = hashtagCtx.banned;

    const refreshedVoiceProfile = await step.run("maybe-refresh-brand-voice", async () => {
      try {
        const editCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(brandVoiceEdits)
          .where(eq(brandVoiceEdits.orgId, orgId));
        const count = editCount[0]?.count ?? 0;
        if (count < 10) return null;

        const edits = await db.query.brandVoiceEdits.findMany({
          where: eq(brandVoiceEdits.orgId, orgId),
          orderBy: desc(brandVoiceEdits.createdAt),
          limit: 50,
        });

        const agent = new BrandVoiceAgent();
        const profile = await agent.generate({
          edits: edits.map((e) => ({
            originalText: e.originalText,
            editedText: e.editedText,
            channel: e.channel,
          })),
          orgName: org?.name,
        });

        // Persist refreshed voice profile on the org record
        await db
          .update(organizations)
          .set({ brandVoiceProfile: profile, updatedAt: new Date() })
          .where(eq(organizations.id, orgId));

        console.info(`[pipeline] Brand voice profile refreshed from ${count} edits`);
        return profile;
      } catch (err) {
        console.warn("[pipeline] BrandVoiceAgent failed (non-blocking):", (err as Error).message);
        return null;
      }
    });

    if (refreshedVoiceProfile) {
      brandVoiceProfileStr = JSON.stringify(refreshedVoiceProfile);
    }

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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: [
                { type: "image", source: { type: "url", url: goal.sourcePhotoUrl! } },
                {
                  type: "text",
                  text: "Analyze this photo for marketing copy context. Describe: the mood/emotional tone, main subject, visual setting, and overall aesthetic style. Keep it to 2-3 concise sentences suitable for guiding marketing copywriters.",
                },
              ] as any,
            },
          ],
        });
        return (response.content[0] as { text: string }).text;
      });
    }

    const photoContext = photoAnalysis
      ? `This content will accompany a photo of: ${photoAnalysis}. Write copy that feels written for this specific image.`
      : undefined;

    // ── Fetch repurpose source asset (if this is a repurpose run) ────────────

    const repurposeSource = repurposeSourceAssetId
      ? await step.run("fetch-repurpose-source", async () => {
          const sourceAsset = await db.query.assets.findFirst({
            where: and(eq(assets.id, repurposeSourceAssetId), eq(assets.orgId, orgId)),
          });
          return sourceAsset ?? null;
        })
      : null;

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
          return result;
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

    // Idempotency: check goalId + orgId to prevent cross-org collisions
    const existingStrategy = await step.run("check-existing-strategy", async () =>
      db.query.strategies.findFirst({
        where: and(eq(strategies.goalId, goalId), eq(strategies.orgId, orgId)),
      }),
    );

    if (existingStrategy) {
      console.info(`[pipeline] Skipping strategy — already exists (id: ${existingStrategy.id})`);
      strategyId = existingStrategy.id;
      strategyText = existingStrategy.contentText;
    } else if (repurposeSource?.campaignId) {
      // Repurpose run: reuse the source campaign's strategy instead of generating a new one
      const sourceStrategy = await step.run("fetch-source-strategy", async () => {
        // First get the source campaign's goalId
        const sourceCampaign = await db.query.campaigns.findFirst({
          where: eq(campaigns.id, repurposeSource.campaignId!),
          columns: { goalId: true },
        });
        if (!sourceCampaign?.goalId) return null;
        return db.query.strategies.findFirst({
          where: and(
            eq(strategies.orgId, orgId),
            eq(strategies.goalId, sourceCampaign.goalId),
          ),
          orderBy: desc(strategies.generatedAt),
        });
      });

      if (sourceStrategy) {
        console.info(`[pipeline] Repurpose: reusing strategy id=${sourceStrategy.id} from source campaign`);
        // Copy the strategy and associate it with the new goal so the war room can find it
        const [copiedStrategy] = await step.run("copy-strategy-for-repurpose", async () =>
          db
            .insert(strategies)
            .values({
              goalId,
              orgId,
              contentText: sourceStrategy.contentText,
              contentJson: sourceStrategy.contentJson,
              targetAudiences: sourceStrategy.targetAudiences,
              channels: sourceStrategy.channels,
              kpis: sourceStrategy.kpis,
              promptVersion: sourceStrategy.promptVersion ?? "2.0.0",
              modelVersion: sourceStrategy.modelVersion ?? "claude-sonnet-4-6",
              tokensUsed: 0,
            })
            .returning(),
        );
        strategyId = copiedStrategy!.id;
        strategyText = sourceStrategy.contentText;
      } else {
        // Fallback: generate a fresh strategy if source not found
        strategyId = "";
        strategyText = "";
      }
    } else {
      // Fetch past optimization reports to close the feedback loop
      const recentOptReports = await step.run("fetch-optimization-reports", async () =>
        db.query.optimizationReports.findMany({
          where: eq(optimizationReports.orgId, orgId),
          orderBy: desc(optimizationReports.generatedAt),
          limit: 3,
          columns: { reportText: true, reportJson: true, generatedAt: true },
        }),
      );

      const optimizationContext = recentOptReports.length > 0
        ? `Past Optimization Insights (last ${recentOptReports.length} campaign(s)):\n` +
          recentOptReports.map((r: any, i: number) => {
            const json = r.reportJson as any;
            if (json?.structured) {
              // Use structured JSON for richer context
              const s = json.structured;
              const window = json.analysisWindowStart
                ? ` (${json.analysisWindowStart.slice(0, 10)} → ${json.analysisWindowEnd?.slice(0, 10) ?? "now"})`
                : "";
              return `[Report ${i + 1}${window}]:\n` +
                `Summary: ${s.executiveSummary ?? ""}\n` +
                `Top Performers: ${(s.topPerformers ?? []).map((p: any) => `${p.channel} (${p.metric}: ${p.value})`).join(", ")}\n` +
                `Bottom Performers: ${(s.bottomPerformers ?? []).map((p: any) => `${p.channel}: ${p.issue}`).join(", ")}\n` +
                `Quick Wins: ${(s.quickWins ?? []).slice(0, 3).join("; ")}\n` +
                `30-Day Forecast: ${s.thirtyDayForecast?.notes ?? ""}`;
            }
            return `[Report ${i + 1}]: ${r.reportText.slice(0, 1200)}`;
          }).join("\n\n")
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
            ...(brandProfile !== undefined && { brand: brandProfile }),
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

      // Resolve competitor result for storage (settled earlier in parallel)
      const resolvedCompetitorOutput = competitorResult.status === "fulfilled" && competitorResult.value
        ? competitorResult.value
        : null;

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
            contentJson: parsed
              ? { ...parsed, runId, informedByReports: recentOptReports.length }
              : { raw: strategyResult.text, runId, informedByReports: recentOptReports.length },
            targetAudiences,
            channels,
            kpis,
            competitorContext: resolvedCompetitorOutput,
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

    // Write pipelineStage to DB now that we have a campaign ID — earliest possible moment.
    // "strategy" indicates strategy completed/was skipped and content is about to begin.
    await step.run("update-stage-strategy", async () => {
      await db
        .update(campaigns)
        .set({ pipelineStage: "strategy" })
        .where(eq(campaigns.id, campaignId));
    });

    currentPipelineStage = "content";

    await step.run("update-stage-content", async () => {
      await db
        .update(campaigns)
        .set({ pipelineStage: "content" })
        .where(eq(campaigns.id, campaignId));
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

    const VALID_CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"];
    const safeChannels = channels.filter((c) => VALID_CHANNELS.includes(c));
    if (safeChannels.length === 0) {
      throw new NonRetriableError(
        "Strategist returned no valid channels. Expected one of: linkedin, twitter, instagram, facebook, tiktok, email, blog",
      );
    }

    const keyMessagesByChannel: Record<string, string> =
      parsedStrategyJson?.keyMessagesByChannel ?? {};

    const contentResults: Array<{ channel: string; assetId: string; variant: "a" | "b" }> = [];

    // ── Stage 3b: SEOAgent — runs for ALL campaigns ──────────────────────────
    // Keywords and messaging alignment improve social copy too, not just blog.

    const seoOutput = await step.run("seo-brief", async () => {
      try {
        const agent = new SEOAgent();
        const primaryChannel = safeChannels.includes("blog") ? "blog" : safeChannels[0] ?? "linkedin";
        const result = await agent.generate({
          brandName: brandProfile?.name ?? goal.brandName,
          industry: brandProfile?.description ?? goal.brandDescription ?? goal.type,
          goalType: goal.type,
          channel: primaryChannel,
          targetAudience: goal.targetAudience ?? undefined,
        });
        return result;
      } catch {
        return null;
      }
    });

    const seoBrief = seoOutput?.contentBrief;
    const seoKeywords = seoOutput
      ? [seoOutput.targetKeyword, ...(seoOutput.secondaryKeywords ?? [])].filter(Boolean).join(", ")
      : undefined;

    // Store SEO output on the strategy record
    if (seoOutput && strategyId) {
      await step.run("save-seo-context", async () => {
        await db
          .update(strategies)
          .set({ seoContext: seoOutput })
          .where(eq(strategies.id, strategyId));
      });
    }

    const VARIANT_INSTRUCTIONS: Record<"a" | "b", string> = {
      a: "Write in a direct, benefit-first style with a clear, concise CTA.",
      b: "Variant B: Open with a surprising statistic or uncomfortable question that challenges a common assumption in this industry. The first line must make the reader stop scrolling. Build to the CTA — it should feel earned, not bolted on. Use a completely different hook angle than Variant A. If Variant A leads with a benefit, Variant B leads with a problem or a challenge.",
    };

    // Determine which variants to generate (default: A only; enable A/B when requested)
    const variantsToGenerate: Array<"a" | "b"> = incomingAbTesting ? ["a", "b"] : ["a"];

    for (const channel of safeChannels) {
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

          // Blog gets the full SEO brief; other channels get keyword guidance
          let seoPrefix = "";
          if (channel === "blog" && seoBrief) {
            seoPrefix = seoBrief + "\n\n";
          } else if (seoKeywords) {
            seoPrefix = `SEO Keywords (weave naturally into copy): ${seoKeywords}\n\n`;
          }
          const resolvedStrategyContext = seoPrefix + strategyText.slice(0, 2000);

          console.info(
            `[pipeline] ContentCreatorAgent — channel: ${channel}, variant: ${variant}, strategyContext length: ${resolvedStrategyContext.length}, keyMessage: ${keyMessagesByChannel[channel] ?? "(none)"}`,
          );

          // Build repurpose context if this is a repurpose run
          const repurposeContext = repurposeSource?.contentText
            ? `Adapt the following content for ${channel}. Maintain the core message but optimize for the target platform's format, tone, and audience expectations. Source content:\n\n${repurposeSource.contentText}`
            : undefined;

          try {
            const result = await agent.generate(
              {
                channel,
                goalType: goal.type,
                brandName: brandProfile?.name ?? goal.brandName,
                brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
                strategyContext: resolvedStrategyContext,
                ...(brandProfile?.voiceTone !== undefined && { voiceTone: brandProfile.voiceTone }),
                ...(brandProfile?.products !== undefined && { products: brandProfile.products }),
                personaContext,
                photoContext: repurposeContext ?? photoContext,
                brandVoiceProfile: brandVoiceProfileStr,
                variantInstruction: VARIANT_INSTRUCTIONS[variant],
                ...(keyMessagesByChannel[channel] !== undefined && { keyMessage: keyMessagesByChannel[channel] }),
                hashtagContext,
                bannedHashtags: bannedHashtags.length > 0 ? bannedHashtags : undefined,
              },
              (chunk) => { contentText += chunk; },
            );
            tokensUsed = result.tokensUsed;
            timer.done({ tokensUsed });

            console.info(`[pipeline] ContentCreatorAgent — ${channel}-${variant} complete, ${contentText.length} chars`);

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
            console.error(
              `[pipeline] ContentCreatorAgent FAILED — channel: ${channel}, variant: ${variant}, error:`,
              (err as Error).message,
              (err as Error).stack,
            );
            timer.done({ tokensUsed: 0, errorMessage: (err as Error).message });
            throw err;
          }

          // Extract hashtags for social channels before saving
          const hashtagsUsed = extractHashtags(contentText, channel);

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
              hashtagsUsed,
            })
            .returning();

          await trackTokens(orgId, tokensUsed);

          // ── Generate tracking link for CTA-bearing channels ────────────────
          // Email and blog assets contain CTAs where a trackable URL adds
          // closed-loop attribution: click → analytics event → contact capture.
          if (channel === "email" || channel === "blog") {
            try {
              const trackingId = randomUUID().replace(/-/g, "").slice(0, 12);
              const apiBase =
                process.env.PUBLIC_API_URL ??
                process.env.INTERNAL_API_URL ??
                "http://localhost:3001";
              const trackingUrl = `${apiBase}/t/${trackingId}`;
              const destinationUrl =
                process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

              await db.insert(trackingLinks).values({
                trackingId,
                orgId,
                campaignId,
                channel: channel as any,
                destinationUrl,
              });
              await db
                .update(assets)
                .set({ trackingUrl })
                .where(eq(assets.id, asset!.id));

              console.info(
                `[pipeline] Tracking link created — channel: ${channel}, trackingId: ${trackingId}`,
              );
            } catch (err) {
              // Non-critical — content is still usable without a tracking URL
              console.warn(
                `[pipeline] Failed to create tracking link for ${channel}: ${(err as Error).message}`,
              );
            }
          }

          return { assetId: asset!.id, skipped: false };
        });

        contentResults.push({ channel, assetId: (assetResult as { assetId: string }).assetId, variant });
      }
    }

    // ── PaidAdsAgent: generate ad sets for leads/conversions goals ────────────
    // Optional/non-blocking — failure logs a warning but doesn't fail the pipeline.

    if (goal.type === "leads" || goal.type === "conversions") {
      await step.run("generate-paid-ads", async () => {
        try {
          // Idempotency: skip if ad sets already exist for this campaign
          const existingAdSets = await db.query.paidAdSets.findMany({
            where: eq(paidAdSets.campaignId, campaignId),
            columns: { id: true },
          });
          if (existingAdSets.length > 0) {
            console.info(`[pipeline] Skipping paid ads — ${existingAdSets.length} ad sets already exist`);
            return { skipped: true };
          }

          const agent = new PaidAdsAgent();
          const adsOutput = await agent.generate({
            brandName: brandProfile?.name ?? goal.brandName,
            brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
            goalType: goal.type,
            targetAudience: goal.targetAudience ?? undefined,
            ...(keyMessagesByChannel[safeChannels[0] ?? "linkedin"] !== undefined && { keyMessage: keyMessagesByChannel[safeChannels[0] ?? "linkedin"] }),
            budget: goal.budget ?? undefined,
          });

          // Save each platform's ad set as a separate record
          const adSetRecords = [
            { platform: "google", adType: "search", contentJson: adsOutput.googleAds },
            { platform: "meta", adType: "social", contentJson: adsOutput.metaAds },
            { platform: "linkedin", adType: "social", contentJson: adsOutput.linkedInAds },
          ];

          for (const rec of adSetRecords) {
            await db.insert(paidAdSets).values({
              orgId,
              campaignId,
              platform: rec.platform,
              adType: rec.adType,
              contentJson: rec.contentJson,
              status: "draft",
            });
          }

          console.info(`[pipeline] Paid ads generated — 3 ad sets (google, meta, linkedin)`);
          return { generated: 3 };
        } catch (err) {
          console.warn("[pipeline] PaidAdsAgent failed (non-blocking):", (err as Error).message);
          return { error: (err as Error).message };
        }
      });
    }

    currentPipelineStage = "images";

    await step.run("update-stage-images", async () => {
      await db
        .update(campaigns)
        .set({ pipelineStage: "images" })
        .where(eq(campaigns.id, campaignId));
    });

    // ── DEV image bypass ──────────────────────────────────────────────────────
    // Set DEV_SKIP_IMAGES=1 to skip image generation and compositing entirely.
    // Pipeline completes in ~30s instead of 2+ minutes — useful during local dev.
    // See .env.example for documentation.
    const skipImages = process.env.DEV_SKIP_IMAGES === "1";
    if (skipImages) {
      console.info("[pipeline] DEV_SKIP_IMAGES=1 — skipping image generation and compositing");
    }

    // ── Stage 4: Image generation (parallel — Unsplash Source API) ───────────

    const isUserPhotoFlow = !!goal.sourcePhotoUrl;
    let compositeResults: Array<{ compositedImageUrl: string | null; skipped?: boolean }> = [];

    // ── Brand-photos flow: pick a media asset by tag matching ────────────────
    // Preference: tags matching goal type → any asset → fall back to AI gen.
    const GOAL_TAG_MAP: Record<string, string[]> = {
      product:     ["product", "lifestyle"],
      leads:       ["team", "office", "lifestyle"],
      awareness:   ["brand", "lifestyle", "hero"],
      event:       ["event", "venue", "lifestyle"],
      traffic:     ["product", "hero", "lifestyle"],
      social:      ["lifestyle", "team", "social"],
      conversions: ["product", "cta", "lifestyle"],
    };

    let brandPhotoUrl: string | null = null;
    if (useBrandPhotos) {
      brandPhotoUrl = await step.run("pick-brand-photo", async () => {
        const allMedia = await db.query.mediaAssets.findMany({
          where: and(eq(mediaAssets.orgId, orgId), isNull(mediaAssets.deletedAt)),
          orderBy: [desc(mediaAssets.createdAt)],
        });
        if (allMedia.length === 0) return null;
        const wantedTags = GOAL_TAG_MAP[goal.type] ?? [];
        const scored = allMedia
          .filter((m) => m.mimeType.startsWith("image/"))
          .map((m) => {
            const tags = (m.tags as string[] | null) ?? [];
            const score = wantedTags.reduce((acc, t) => acc + (tags.includes(t) ? 1 : 0), 0);
            return { url: m.url, score };
          })
          .sort((a, b) => b.score - a.score);
        return scored[0]?.url ?? allMedia[0]?.url ?? null;
      });
      console.info(`[pipeline] Brand photo: ${brandPhotoUrl ?? "none found — falling back to AI gen"}`);
    }

    if (!skipImages) {
    console.info(`[pipeline] Image path — goalId: ${goalId}, flow: ${isUserPhotoFlow ? "user-photo" : (brandPhotoUrl ? "brand-photo" : "unsplash")}`);

    // Brand-photo flow reuses the same stamping logic as user-photo
    const stampPhotoUrl = isUserPhotoFlow ? goal.sourcePhotoUrl : brandPhotoUrl;

    if (stampPhotoUrl) {
      // Stamp a single URL directly onto each asset (user-photo or brand-photo flow)
      await Promise.all(
        contentResults.map(({ assetId }) =>
          step.run(`set-photo-url-${assetId}`, async () => {
            // Idempotency: skip if imageUrl already set
            const existing = await db.query.assets.findFirst({
              where: eq(assets.id, assetId),
              columns: { imageUrl: true },
            });
            if (existing?.imageUrl) {
              console.info(`[pipeline] Skipping set-photo-url for asset ${assetId} — imageUrl already set`);
              return { imageUrl: existing.imageUrl, skipped: true };
            }
            await db
              .update(assets)
              .set({ imageUrl: stampPhotoUrl })
              .where(eq(assets.id, assetId));
            return { imageUrl: stampPhotoUrl, skipped: false };
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
              let { imageUrl, prompt, imageSource } = await agent.generate({
                brandName: brandProfile?.name ?? goal.brandName,
                brandDescription: brandProfile?.description ?? goal.brandDescription ?? undefined,
                channel,
                goalType: goal.type,
                primaryColor: brandProfile?.primaryColor ?? brandBrief.primaryColor,
                voiceTone: brandProfile?.voiceTone ?? undefined,
                products: brandProfile?.products ?? undefined,
                brandBrief,
              });

              console.info(`[pipeline] Image gen for ${channel}-${variant}: source=${imageSource}, url=${imageUrl ?? "null (will use brand graphic)"}`);

              // Upload the generated image to Supabase so it's accessible from Vercel.
              // Falls back to the remote URL (Pollinations/Fal) if Supabase is not configured.
              if (imageUrl) {
                try {
                  const controller = new AbortController();
                  const dlTimeout = setTimeout(() => controller.abort(), 45_000);
                  const imgRes = await fetch(imageUrl, { redirect: "follow", signal: controller.signal });
                  clearTimeout(dlTimeout);

                  if (imgRes.ok) {
                    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                    imageUrl = await uploadGeneratedImage(`raw-${assetId}`, imgBuffer);
                    console.info(`[pipeline] Generated image uploaded to Supabase: ${imageUrl}`);
                  }
                } catch (dlErr) {
                  console.warn(`[pipeline] Supabase image upload failed — keeping remote URL:`, (dlErr as Error).message);
                }
              }

              await db
                .update(assets)
                .set({ imageUrl, promptSnapshot: prompt, metadata: { imageSource } })
                .where(eq(assets.id, assetId));

              return { imageUrl, imageSource, skipped: false };
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

    compositeResults = await Promise.all(
      contentResults.map(({ channel, assetId, variant }) =>
        step.run(`composite-image-${channel}-${variant}`, async (): Promise<{ compositedImageUrl: string | null; skipped?: boolean }> => {
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
            // publicDir is needed so the compositor can resolve local /generated/... paths
            // (e.g. cached Pollinations images) — process.cwd() in this worker is NOT apps/web
            const publicDir = _res(monoRoot, "apps/web/public");

            const result = await compositeImage({
              backgroundImageUrl,
              headlineText: headline,
              ctaText: cta,
              logoUrl: brandBrief.logoUrl ?? "",
              brandName: brandProfile?.name ?? org?.name ?? "",
              ...(brandBrief.primaryColor !== undefined && { brandPrimaryColor: brandBrief.primaryColor }),
              ...(brandBrief.secondaryColor !== undefined && { brandSecondaryColor: brandBrief.secondaryColor }),
              channel,
              flowType,
              ...(brandBrief.logoPosition !== undefined && { logoPosition: brandBrief.logoPosition }),
              imageSource: (copyAsset.metadata as Record<string, string> | null)?.imageSource as "fal" | "pollinations" | undefined,
              outputDir,
              publicDir,
            });

            // Upload to Supabase Storage so the URL is accessible from Vercel.
            // Falls back to the local relative path if Supabase is not configured.
            let compositedImageUrl: string = result.url;
            try {
              compositedImageUrl = await uploadGeneratedImage(assetId, result.pngBuffer);
              console.info(`[pipeline] Composited image uploaded to Supabase: ${compositedImageUrl}`);
            } catch (uploadErr) {
              console.warn(`[pipeline] Supabase upload failed — storing local path (images will not display on Vercel):`, (uploadErr as Error).message);
            }
            // Merge imageSource into existing metadata (may have been set in generate step)
            const existingMeta = (copyAsset.metadata as Record<string, unknown> | null) ?? {};
            const updatedMeta = { ...existingMeta, imageSource: result.imageSource };

            await db
              .update(assets)
              .set({ compositedImageUrl, metadata: updatedMeta })
              .where(eq(assets.id, assetId));

            return { compositedImageUrl };
          } catch (err) {
            console.error(`[pipeline] Compositor error for ${channel}-${variant}:`, (err as Error).message);
            return { compositedImageUrl: null };
          }
        }),
      ),
    );

    // ── Emit auto-publish events (only when org has auto-publish enabled) ───────
    // These fire AFTER compositing so the asset is fully complete before the
    // autoPublishAsset job evaluates it.  The job is responsible for quality
    // scoring, approving the asset, and creating the scheduled post.

    if (org?.autoPublishEnabled) {
      await step.run("emit-auto-publish-events", async () => {
        const qualityThreshold = org!.autoPublishThreshold ?? 80;
        const events = contentResults.map(({ assetId }) => ({
          name: "orion/asset.auto-publish" as const,
          data: { assetId, orgId, qualityThreshold },
        }));
        try {
          await inngest.send(events);
          console.info(
            `[pipeline] Emitted ${events.length} auto-publish event(s) — threshold: ${qualityThreshold}`,
          );
        } catch (err) {
          // Non-critical — manual review flow still works if this fails
          console.warn(
            "[pipeline] Failed to emit auto-publish events:",
            (err as Error).message,
          );
        }
      });
    }

    } // end if (!skipImages)

    currentPipelineStage = "scheduling";

    await step.run("update-stage-scheduling", async () => {
      await db
        .update(campaigns)
        .set({ pipelineStage: "scheduling" })
        .where(eq(campaigns.id, campaignId));
    });

    // ── Stage 6: Auto-schedule posts with optimal send times ─────────────────

    const scheduledPostIds = await step.run("schedule-posts", async () => {
      const now = new Date();
      const created: string[] = [];

      // Fetch campaign name for UTM slug
      const campaignRecord = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
        columns: { name: true },
      });
      const campaignSlug = slugify(campaignRecord?.name ?? goal.brandName ?? "campaign");

      for (const { channel, assetId, variant } of contentResults) {
        try {
          // Idempotency: skip if already scheduled
          const existing = await db.query.scheduledPosts.findFirst({
            where: eq(scheduledPosts.assetId, assetId),
          });
          if (existing) { created.push(existing.id); continue; }

          // Apply UTM params to any URLs in the asset's content text
          if (org?.autoUtmEnabled !== false) {
            const asset = await db.query.assets.findFirst({
              where: eq(assets.id, assetId),
              columns: { id: true, contentText: true },
            });
            if (asset?.contentText) {
              const utmParams = {
                source: channel,
                medium: UTM_MEDIUM_MAP[channel] ?? "social",
                campaign: campaignSlug,
                ...(incomingAbTesting && variant !== undefined ? { content: variant } : {}),
              };
              const taggedText = applyUtmToText(asset.contentText, utmParams);
              if (taggedText !== asset.contentText) {
                await db
                  .update(assets)
                  .set({ contentText: taggedText, updatedAt: new Date() })
                  .where(eq(assets.id, assetId));
              }
            }
          }

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
            primaryAudience: goal.targetAudience ?? undefined,
            ...(parsedStrategyJson?.keyMessagesByChannel?.["linkedin"] !== undefined && { keyMessage: parsedStrategyJson.keyMessagesByChannel["linkedin"] }),
          });
          return parsed;
        } catch (err) {
          console.warn("[pipeline] LandingPageAgent failed:", (err as Error).message);
          return null;
        }
      });
    }

    // ── Persist landing page + create tracking link ───────────────────────────

    if (landingPageContent) {
      await step.run("save-landing-page", async () => {
        try {
          const lp = landingPageContent as LandingPageOutput;

          const trackingId = randomUUID().replace(/-/g, "").slice(0, 12);
          const apiBase = process.env.PUBLIC_API_URL ?? process.env.INTERNAL_API_URL ?? "http://localhost:3001";
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

          // Slug made unique by embedding campaignId suffix
          const slug = `${lp.slug || "landing-page"}-${campaignId.slice(0, 8)}`;

          // shareToken used to construct the public URL
          const shareToken = randomUUID().replace(/-/g, "").slice(0, 20);
          const publicUrl = `${appUrl}/share/${shareToken}`;

          // Build contentJson that the share page renderer understands
          const contentJson = {
            hero: {
              headline: lp.heroSection.headline,
              subheadline: lp.heroSection.subheadline,
              ctaText: lp.heroSection.ctaText,
              ctaUrl: "#cta-form",
            },
            benefits: lp.benefitsSections.map((b) => ({ title: b.title, description: b.description })),
            socialProof: lp.socialProof.map((s) => ({ quote: s.quote, author: s.author, company: s.company })),
            faq: lp.faqSection.map((f) => ({ question: f.question, answer: f.answer })),
            cta: {
              headline: lp.ctaSection.headline,
              subtext: lp.ctaSection.subtext,
              buttonText: lp.ctaSection.buttonLabel,
              formFields: lp.ctaSection.formFields,
            },
            // Attribution fields embedded so the renderer can pre-populate the form
            _trackingId: trackingId,
            _captureEndpoint: `${apiBase}/contacts/capture`,
          };

          // Apply UTM params to the landing page URL (email/leads campaigns)
          const lpCampaignSlug = slugify(
            (await db.query.campaigns.findFirst({
              where: eq(campaigns.id, campaignId),
              columns: { name: true },
            }))?.name ?? goal.brandName ?? "campaign",
          );
          const lpDestUrl =
            org?.autoUtmEnabled !== false
              ? appendUtmParams(publicUrl, {
                  source: "email",
                  medium: "email",
                  campaign: lpCampaignSlug,
                })
              : publicUrl;

          // Create tracking link pointing back to the published landing page
          await db.insert(trackingLinks).values({
            trackingId,
            orgId,
            campaignId,
            channel: "landing_page" as any,
            destinationUrl: lpDestUrl,
          });

          await db.insert(landingPages).values({
            orgId,
            campaignId,
            goalId: goalId!,
            title: lp.headline || slug,
            slug,
            contentJson,
            metaTitle: lp.metaTitle || undefined,
            metaDescription: lp.metaDescription || undefined,
            shareToken,
            publishedAt: new Date(),
          });

          console.info(`[pipeline] Landing page saved: /share/${shareToken}`);
        } catch (err) {
          console.warn("[pipeline] Failed to save landing page:", (err as Error).message);
        }
      });
    }

    // ── Mark campaign as active (pipeline complete, ready to review) ──────────

    await step.run("mark-campaign-ready", async () => {
      try {
        await db
          .update(campaigns)
          .set({ status: "active", pipelineStage: "complete", pipelineError: null, updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
        console.info(`[pipeline] Campaign ${campaignId} marked as active`);
      } catch (err) {
        console.warn("[pipeline] Failed to mark campaign active:", (err as Error).message);
      }
    });

    // ── Fire pipeline_complete notification ───────────────────────────────────

    await step.run("notify-pipeline-complete", async () => {
      try {
        const channelList = [...new Set(contentResults.map((r) => r.channel))].join(", ");
        const campaignRecord = await db.query.campaigns.findFirst({
          where: eq(campaigns.id, campaignId),
          columns: { name: true },
        });
        const campaignName = campaignRecord?.name ?? "Your campaign";
        await db.insert(notifications).values({
          orgId,
          type: "pipeline_complete",
          title: `Your campaign '${campaignName}' is ready for review`,
          body: `${contentResults.length} assets generated across ${channelList}`,
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
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);

      // Re-extract orgId/goalId from event.data since they were declared inside the try scope
      const { orgId, goalId } = event.data as { orgId: string; goalId: string };

      // Always write pipelineError to DB so the War Room surfaces it immediately,
      // even if Inngest will retry. mark-campaign-ready clears this on success.
      // Only send a user notification on the first attempt or final attempt to avoid spam.
      const isFinalAttempt = err instanceof NonRetriableError || attempt >= 2;
      const shouldNotify = attempt === 0 || isFinalAttempt;
      const errorMessage = (err as Error).message ?? String(err);
      try {
        // Find the campaign linked to this goal (may not exist if failure was early)
        const failedCampaign = await db.query.campaigns.findFirst({
          where: eq(campaigns.goalId, goalId),
          columns: { id: true, name: true },
        });

        if (failedCampaign) {
          await db
            .update(campaigns)
            .set({
              pipelineError: errorMessage,
              pipelineErrorAt: new Date(),
              pipelineStage: currentPipelineStage,
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, failedCampaign.id));
        }

        if (shouldNotify) {
          // Notify the goal owner so they get alerted even if they've left the War Room
          const failedGoal = await db.query.goals.findFirst({
            where: eq(goals.id, goalId),
            columns: { userId: true },
          });

          const campaignName = failedCampaign?.name ?? "Campaign";
          // Sanitize error: strip long stack traces and internal paths, cap length
          const sanitizedError = errorMessage
            .replace(/\s+at\s+\S+:\d+:\d+/g, "")
            .replace(/\/[^\s]+\/([^/\s]+)/g, "$1")
            .slice(0, 120)
            .trim();

          await db.insert(notifications).values({
            orgId,
            userId: failedGoal?.userId ?? undefined,
            type: "pipeline_error",
            title: `Pipeline failed for '${campaignName}': ${sanitizedError}`,
            body: `Failed during the ${currentPipelineStage} stage. Open the campaign to retry.`,
            resourceType: "goal",
            resourceId: goalId,
          });
        }
      } catch (dbErr) {
        console.error("[pipeline] Failed to write error state to DB:", (dbErr as Error).message);
      }

      throw err;
    }
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
