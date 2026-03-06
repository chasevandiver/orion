/**
 * Multi-agent orchestration pipeline.
 *
 * Event: "orion/pipeline.run"
 * Data:  { orgId, goalId, campaignId?, channels: string[], runId }
 *
 * Pipeline stages:
 *   1. MarketingStrategistAgent  → strategy markdown
 *   2. ContentCreatorAgent       → platform content per channel (non-streaming)
 *   3. OptimizationAgent         → quick-win recommendations
 *   4. DistributionAgent         → pre-flight validation (not auto-publish)
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
  assets,
  campaigns,
  optimizationReports,
  usageRecords,
} from "@orion/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  MarketingStrategistAgent,
  ContentCreatorAgent,
  OptimizationAgent,
} from "@orion/agents";
import { agentTimer } from "@orion/agents/lib/agent-logger";
import { randomUUID } from "crypto";

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
  const month = new Date().toISOString().slice(0, 7); // "2024-01"
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
      campaignId,
      channels: requestedChannels,
    } = event.data as {
      orgId: string;
      goalId: string;
      campaignId?: string;
      channels?: string[];
    };

    const runId = event.id ?? randomUUID();

    // ── Stage 1: Strategy ─────────────────────────────────────────────────────

    const goal = await step.run("fetch-goal", async () =>
      db.query.goals.findFirst({ where: eq(goals.id, goalId) }),
    );

    if (!goal) throw new Error(`Goal ${goalId} not found`);

    // Idempotency: use existing strategy if one already exists for this goal
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
            modelVersion: "claude-sonnet-4-20250514",
            tokensUsed: strategyResult.tokensUsed,
          })
          .returning();

        await trackTokens(orgId, strategyResult.tokensUsed);
        return s!;
      });

      strategyId = savedStrategy.id;
      strategyText = savedStrategy.contentText;
    }

    // ── Stage 2: Content creation per channel ─────────────────────────────────

    const channels =
      requestedChannels ??
      parseChannels(strategyText).slice(0, 3) ??
      ["linkedin"];

    const contentResults: Array<{ channel: string; assetId: string }> = [];

    for (const channel of channels) {
      const assetResult = await step.run(`generate-content-${channel}`, async () => {
        // Idempotency: skip if we already have a draft asset for this campaign+channel
        if (campaignId) {
          const existing = await db.query.assets.findFirst({
            where: and(
              eq(assets.campaignId, campaignId),
              eq(assets.channel, channel as any),
              eq(assets.generatedByAgent, "ContentCreatorAgent"),
            ),
          });
          if (existing) return { assetId: existing.id, skipped: true };
        }

        const agent = new ContentCreatorAgent();
        const timer = agentTimer("ContentCreatorAgent", "1.0.0", {
          runId,
          orgId,
          resourceId: campaignId ?? goalId,
          meta: { channel },
        });

        let contentText = "";
        let tokensUsed = 0;

        try {
          const result = await agent.generate(
            {
              channel,
              goalType: goal.type,
              brandName: goal.brandName,
              brandDescription: goal.brandDescription ?? undefined,
              strategyContext: strategyText.slice(0, 800),
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
            campaignId: campaignId ?? null,
            channel: channel as any,
            type: "social_post",
            contentText,
            generatedByAgent: "ContentCreatorAgent",
            modelVersion: "claude-sonnet-4-20250514",
            tokensUsed,
            status: "draft",
          })
          .returning();

        await trackTokens(orgId, tokensUsed);
        return { assetId: asset!.id, skipped: false };
      });

      contentResults.push({ channel, assetId: assetResult.assetId });
    }

    // ── Stage 3: Optimization recommendations ─────────────────────────────────

    const optimizationResult = await step.run("run-optimizer-agent", async () => {
      const agent = new OptimizationAgent();
      const timer = agentTimer("OptimizationAgent", "1.0.0", {
        runId,
        orgId,
        resourceId: campaignId,
      });

      try {
        const result = await agent.analyze({
          brandName: goal.brandName,
          goalType: goal.type,
          analytics: {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            engagementRate: 0,
            cpa: 0,
            roi: 0,
            channelBreakdown: channels.map((ch) => ({
              channel: ch,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              ctr: 0,
            })),
          },
        });
        timer.done({ tokensUsed: result.tokensUsed });
        return result;
      } catch (err) {
        timer.done({ tokensUsed: 0, errorMessage: (err as Error).message });
        throw err;
      }
    });

    await step.run("save-optimization-report", async () => {
      await db.insert(optimizationReports).values({
        orgId,
        campaignId: campaignId ?? null,
        reportText: optimizationResult.text,
        reportJson: { raw: optimizationResult.text, runId, strategyId, channels },
        modelVersion: "claude-sonnet-4-20250514",
        tokensUsed: optimizationResult.tokensUsed,
      });
      await trackTokens(orgId, optimizationResult.tokensUsed);
    });

    return {
      runId,
      strategyId,
      contentResults,
      optimizationSummary: optimizationResult.text.slice(0, 200),
    };
  },
);
