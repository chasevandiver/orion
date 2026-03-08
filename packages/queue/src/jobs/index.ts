// Use the canonical Inngest client — do NOT create a second instance here.
// The duplicate `new Inngest({ id: "orion" })` that previously lived here was
// causing functions to be registered against a client that had no eventKey or
// signingKey, breaking event delivery in all environments.
import { inngest } from "../client.js";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  scheduledPosts,
  analyticsRollups,
  analyticsEvents,
  optimizationReports,
} from "@orion/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { MarketingStrategistAgent, OptimizationAgent, DistributionAgent } from "@orion/agents";

// ── Strategy output parser ─────────────────────────────────────────────────────
// Extracts structured fields from the Strategist agent's markdown output.

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
  const lines = section
    .split("\n")
    .filter((l) => l.trim().match(/^[-*•]|\d+\./));
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

// ── Job: Generate Strategy ─────────────────────────────────────────────────────

export const generateStrategy = inngest.createFunction(
  {
    id: "generate-strategy",
    name: "Generate Marketing Strategy",
    retries: 3,
    throttle: { limit: 10, period: "1m" },
  },
  { event: "orion/strategy.generate" },
  async ({ event, step }) => {
    const { goalId, orgId } = event.data as { goalId: string; orgId: string; userId: string };

    const goal = await step.run("fetch-goal", async () =>
      db.query.goals.findFirst({ where: eq(goals.id, goalId) }),
    );

    if (!goal) throw new Error(`Goal ${goalId} not found`);

    const result = await step.run("run-strategist-agent", async () => {
      const agent = new MarketingStrategistAgent();
      return agent.generate({
        goalType: goal.type,
        brandName: goal.brandName,
        brandDescription: goal.brandDescription ?? undefined,
        targetAudience: goal.targetAudience ?? undefined,
        timeline: goal.timeline,
        budget: goal.budget ?? undefined,
      });
    });

    // Parse structured fields from the markdown strategy output
    const targetAudiences = parseTargetAudiences(result.text);
    const channels = parseChannels(result.text);
    const kpis = parseKpis(result.text);

    const [strategy] = await step.run("save-strategy", async () =>
      db
        .insert(strategies)
        .values({
          goalId,
          orgId,
          contentText: result.text,
          contentJson: { raw: result.text },
          targetAudiences,
          channels,
          kpis,
          modelVersion: "claude-sonnet-4-6",
          tokensUsed: result.tokensUsed,
        })
        .returning(),
    );

    return { strategyId: strategy.id };
  },
);

// ── Job: Publish Scheduled Post ────────────────────────────────────────────────

export const publishScheduledPost = inngest.createFunction(
  { id: "publish-scheduled-post", name: "Publish Scheduled Post", retries: 3 },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    const duePosts = await step.run("fetch-due-posts", async () =>
      db.query.scheduledPosts.findMany({
        where: and(
          eq(scheduledPosts.status, "scheduled"),
          gte(scheduledPosts.scheduledFor, now),
          lt(scheduledPosts.scheduledFor, fiveMinutesFromNow),
        ),
        with: { asset: true },
      }),
    );

    for (const post of duePosts) {
      await step.run(`publish-post-${post.id}`, async () => {
        try {
          // Use DistributionAgent — handles pre-flight checks, platform client
          // selection, token decryption, and DB persistence of platformPostId.
          const contentText = (post as any).asset?.contentText ?? "";

          if (!contentText) {
            // No content text available — mark as failed rather than publishing empty
            await db
              .update(scheduledPosts)
              .set({
                status: "failed",
                errorMessage: "No content text available — link an approved asset to this post",
              })
              .where(eq(scheduledPosts.id, post.id));
            return;
          }

          const agent = new DistributionAgent();
          await agent.publish({
            orgId: post.orgId,
            scheduledPostId: post.id,
            channel: post.channel,
            contentText,
          });
        } catch (err) {
          const error = err as Error;
          await db
            .update(scheduledPosts)
            .set({
              status: "failed",
              errorMessage: error.message,
              retryCount: sql`${scheduledPosts.retryCount} + 1`,
            })
            .where(eq(scheduledPosts.id, post.id));
          throw err;
        }
      });
    }

    return { processed: duePosts.length };
  },
);

// ── Job: Analytics Rollup ──────────────────────────────────────────────────────

export const rollupAnalytics = inngest.createFunction(
  { id: "rollup-analytics", name: "Hourly Analytics Rollup" },
  { cron: "0 * * * *" },
  async ({ step }) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const rawEvents = await step.run("fetch-raw-events", async () =>
      db.query.analyticsEvents.findMany({
        where: gte(analyticsEvents.occurredAt, oneHourAgo),
      }),
    );

    if (rawEvents.length === 0) return { processed: 0 };

    const groups = new Map<string, typeof rawEvents>();
    for (const event of rawEvents) {
      const date = new Date(event.occurredAt);
      date.setHours(0, 0, 0, 0);
      const key = `${event.orgId}:${event.campaignId}:${event.channel}:${date.toISOString()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    }

    for (const [key, events] of groups) {
      const [orgId, campaignId, channel, dateStr] = key.split(":");
      await step.run(`rollup-${key.slice(0, 20)}`, async () => {
        await db
          .insert(analyticsRollups)
          .values({
            orgId: orgId!,
            campaignId: campaignId === "null" ? null : campaignId,
            channel: channel === "null" ? null : channel,
            date: new Date(dateStr!),
            impressions: events.filter((e) => e.eventType === "impression").length,
            clicks: events.filter((e) => e.eventType === "click").length,
            conversions: events.filter((e) => e.eventType === "conversion").length,
            engagements: events.filter((e) => e.eventType === "engagement").length,
          })
          .onConflictDoUpdate({
            target: [
              analyticsRollups.orgId,
              analyticsRollups.campaignId,
              analyticsRollups.channel,
              analyticsRollups.date,
            ],
            set: {
              impressions: sql`${analyticsRollups.impressions} + excluded.impressions`,
              clicks: sql`${analyticsRollups.clicks} + excluded.clicks`,
              conversions: sql`${analyticsRollups.conversions} + excluded.conversions`,
              engagements: sql`${analyticsRollups.engagements} + excluded.engagements`,
              computedAt: new Date(),
            },
          });
      });
    }

    return { processed: rawEvents.length };
  },
);

// ── Export all functions for the Inngest serve handler ─────────────────────────

export { runAgentPipeline } from "./orchestrate-pipeline.js";
import { runAgentPipeline } from "./orchestrate-pipeline.js";

export const allFunctions = [generateStrategy, publishScheduledPost, rollupAnalytics, runAgentPipeline];
