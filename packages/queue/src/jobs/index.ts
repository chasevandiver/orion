import { Inngest } from "inngest";
import { db, goals, strategies, scheduledPosts, analyticsRollups, analyticsEvents } from "@orion/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { MarketingStrategistAgent } from "@orion/agents";

export const inngest = new Inngest({ id: "orion" });

// ── Job: Generate Strategy ────────────────────────────────────────────────────

export const generateStrategy = inngest.createFunction(
  {
    id: "generate-strategy",
    name: "Generate Marketing Strategy",
    retries: 3,
    throttle: { limit: 10, period: "1m" }, // 10 strategy generations per minute
  },
  { event: "orion/strategy.generate" },
  async ({ event, step }) => {
    const { goalId, orgId } = event.data as { goalId: string; orgId: string; userId: string };

    // Fetch the goal
    const goal = await step.run("fetch-goal", async () => {
      return db.query.goals.findFirst({ where: eq(goals.id, goalId) });
    });

    if (!goal) throw new Error(`Goal ${goalId} not found`);

    // Generate strategy via AI agent
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

    // Persist strategy
    const [strategy] = await step.run("save-strategy", async () => {
      return db
        .insert(strategies)
        .values({
          goalId,
          orgId,
          contentText: result.text,
          contentJson: { raw: result.text },
          modelVersion: "claude-sonnet-4-20250514",
          tokensUsed: result.tokensUsed,
        })
        .returning();
    });

    return { strategyId: strategy.id };
  },
);

// ── Job: Publish Scheduled Post ───────────────────────────────────────────────

export const publishScheduledPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    name: "Publish Scheduled Post",
    retries: 3,
  },
  {
    // Runs every 5 minutes to check for posts due to publish
    cron: "*/5 * * * *",
  },
  async ({ step }) => {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Find all posts due to publish in next 5 minutes
    const duePosts = await step.run("fetch-due-posts", async () => {
      return db.query.scheduledPosts.findMany({
        where: and(
          eq(scheduledPosts.status, "scheduled"),
          gte(scheduledPosts.scheduledFor, now),
          lt(scheduledPosts.scheduledFor, fiveMinutesFromNow),
        ),
        with: { asset: true },
      });
    });

    // Publish each post
    for (const post of duePosts) {
      await step.run(`publish-post-${post.id}`, async () => {
        try {
          // TODO: Call the appropriate platform integration
          // const integration = getPlatformIntegration(post.channel);
          // const platformPostId = await integration.publish(post);

          await db
            .update(scheduledPosts)
            .set({
              status: "published",
              publishedAt: new Date(),
              platformPostId: `mock_${Date.now()}`, // Replace with real platform ID
            })
            .where(eq(scheduledPosts.id, post.id));
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
          throw err; // Let Inngest handle retry
        }
      });
    }

    return { processed: duePosts.length };
  },
);

// ── Job: Analytics Rollup ─────────────────────────────────────────────────────

export const rollupAnalytics = inngest.createFunction(
  {
    id: "rollup-analytics",
    name: "Hourly Analytics Rollup",
  },
  { cron: "0 * * * *" }, // Every hour
  async ({ step }) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const rawEvents = await step.run("fetch-raw-events", async () => {
      return db.query.analyticsEvents.findMany({
        where: gte(analyticsEvents.occurredAt, oneHourAgo),
      });
    });

    if (rawEvents.length === 0) return { processed: 0 };

    // Group events by org + campaign + channel + date
    const groups = new Map<string, typeof rawEvents>();
    for (const event of rawEvents) {
      const date = new Date(event.occurredAt);
      date.setHours(0, 0, 0, 0);
      const key = `${event.orgId}:${event.campaignId}:${event.channel}:${date.toISOString()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    }

    // Upsert rollups
    for (const [key, events] of groups) {
      const [orgId, campaignId, channel, dateStr] = key.split(":");

      await step.run(`rollup-${key.slice(0, 20)}`, async () => {
        const rollup = {
          orgId: orgId!,
          campaignId: campaignId === "null" ? null : campaignId,
          channel: channel === "null" ? null : channel,
          date: new Date(dateStr!),
          impressions: events.filter((e) => e.eventType === "impression").length,
          clicks: events.filter((e) => e.eventType === "click").length,
          conversions: events.filter((e) => e.eventType === "conversion").length,
          engagements: events.filter((e) => e.eventType === "engagement").length,
        };

        await db
          .insert(analyticsRollups)
          .values(rollup)
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

// ── Export all functions for Inngest serve handler ────────────────────────────

export const allFunctions = [generateStrategy, publishScheduledPost, rollupAnalytics];
