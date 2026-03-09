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
  contacts,
  contactEvents,
  notifications,
  assets,
} from "@orion/db/schema";
import { eq, and, lte, lt, sql, gte, desc } from "drizzle-orm";
import { MarketingStrategistAgent, OptimizationAgent, DistributionAgent, CRMIntelligenceAgent } from "@orion/agents";
import { TwitterClient, MetaClient, LinkedInClient, ResendClient } from "@orion/integrations";
import { channelConnections, organizations } from "@orion/db/schema";
import { decryptTokenSafe } from "@orion/db/lib/token-encryption";

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

    // FIXED: Use lte (<=) so overdue posts are picked up, not just future ones.
    // Also enforce a max retry limit of 3 to avoid infinite failure loops.
    const duePosts = await step.run("fetch-due-posts", async () =>
      db.query.scheduledPosts.findMany({
        where: and(
          eq(scheduledPosts.status, "scheduled"),
          lte(scheduledPosts.scheduledFor, now),
          lt(scheduledPosts.retryCount, 3),
        ),
        with: { asset: true },
      }),
    );

    for (const post of duePosts) {
      await step.run(`publish-post-${post.id}`, async () => {
        try {
          const contentText = (post as any).asset?.contentText ?? "";

          if (!contentText) {
            await db
              .update(scheduledPosts)
              .set({
                status: "failed",
                errorMessage: "No content text available — link an approved asset to this post",
              })
              .where(eq(scheduledPosts.id, post.id));
            return;
          }

          // Load platform connection credentials
          const connection = await db.query.channelConnections.findFirst({
            where: and(
              eq(channelConnections.orgId, post.orgId),
              eq(channelConnections.channel, post.channel as any),
              eq(channelConnections.isActive, true),
            ),
          });

          let platformPostId = "";
          let publishUrl = "";
          let isSimulated = false;

          if (!connection) {
            // No platform connection — simulate and prevent further retries
            platformPostId = `sim_${Date.now()}_${post.channel}`;
            isSimulated = true;
            await db
              .update(scheduledPosts)
              .set({
                status: "scheduled",
                platformPostId,
                retryCount: 3,
                isSimulated: true,
                errorMessage: `SIMULATED — no ${post.channel} platform connection configured`,
              })
              .where(eq(scheduledPosts.id, post.id));
            console.warn(`[publish] SIMULATED ${post.channel} — no connection`);
          } else {
            const accessToken = decryptTokenSafe(connection.accessTokenEnc);
            if (!accessToken) throw new Error("Failed to decrypt platform access token");

            const mediaUrls = (post as any).asset?.compositedImageUrl
              ? [(post as any).asset.compositedImageUrl]
              : (post as any).asset?.imageUrl
                ? [(post as any).asset.imageUrl]
                : undefined;

            // ── Route to the correct platform client ───────────────────────
            switch (post.channel) {
              case "twitter": {
                const client = new TwitterClient(
                  post.orgId,
                  {
                    accessToken,
                    refreshToken: connection.refreshTokenEnc
                      ? (decryptTokenSafe(connection.refreshTokenEnc) ?? undefined)
                      : undefined,
                    expiresAt: connection.tokenExpiresAt ?? undefined,
                  },
                  connection.accountId ?? post.orgId,
                );
                const result = await client.publish({ content: contentText, mediaUrls });
                platformPostId = result.platformPostId;
                publishUrl = result.url;
                break;
              }

              case "facebook": {
                const client = new MetaClient(
                  post.orgId,
                  { accessToken },
                  "facebook",
                  connection.accountId ?? post.orgId,
                );
                const result = await client.publish({ content: contentText, mediaUrls });
                platformPostId = result.platformPostId;
                publishUrl = result.url;
                break;
              }

              case "instagram": {
                const client = new MetaClient(
                  post.orgId,
                  { accessToken },
                  "instagram",
                  connection.accountId ?? post.orgId,
                );
                const result = await client.publish({ content: contentText, mediaUrls });
                platformPostId = result.platformPostId;
                publishUrl = result.url;
                break;
              }

              case "email": {
                const emailClient = new ResendClient(post.orgId, accessToken);
                // Derive subject from first line of content (up to 80 chars)
                const subject = contentText.split("\n")[0]?.slice(0, 80) ?? "New from ORION";
                const result = await emailClient.publish({
                  subject,
                  contentText,
                  listId: connection.accountId ?? undefined,
                });
                platformPostId = result.platformPostId;
                publishUrl = result.url;
                break;
              }

              case "linkedin": {
                const client = new LinkedInClient(
                  post.orgId,
                  {
                    accessToken,
                    refreshToken: connection.refreshTokenEnc
                      ? (decryptTokenSafe(connection.refreshTokenEnc) ?? undefined)
                      : undefined,
                    expiresAt: connection.tokenExpiresAt ?? undefined,
                  },
                  connection.accountId ?? `urn:li:organization:${post.orgId}`,
                );
                const result = await client.publish({ content: contentText, mediaUrls });
                platformPostId = result.platformPostId;
                publishUrl = result.url;
                break;
              }

              default: {
                // blog, website, tiktok — use DistributionAgent (AI pre-flight + stub)
                const agent = new DistributionAgent();
                const result = await agent.publish({
                  orgId: post.orgId,
                  scheduledPostId: post.id,
                  channel: post.channel,
                  contentText,
                  mediaUrls,
                });
                platformPostId = result.platformPostId ?? `pending_${post.channel}_${Date.now()}`;
                publishUrl = result.url ?? "";
                isSimulated = !!(result as any)?.simulate;
              }
            }

            if (!isSimulated) {
              await db
                .update(scheduledPosts)
                .set({ status: "published", publishedAt: new Date(), platformPostId })
                .where(eq(scheduledPosts.id, post.id));
            }
          }

          const result = { simulate: isSimulated, platformPostId, url: publishUrl };

          // Mark scheduled_post with simulated flag
          if (isSimulated) {
            await db
              .update(scheduledPosts)
              .set({ isSimulated: true })
              .where(eq(scheduledPosts.id, post.id));
          }

          // Insert analytics events for every publish (real or simulated)
          const assetId = post.assetId ?? undefined;
          const campaignId = (post as any).asset?.campaignId ?? undefined;
          try {
            await db.insert(analyticsEvents).values([
              {
                orgId: post.orgId,
                campaignId,
                assetId,
                channel: post.channel,
                eventType: "impression",
                isSimulated,
                metadataJson: {
                  publishedAt: new Date().toISOString(),
                  dayOfWeek: new Date().getDay(),
                  hourOfDay: new Date().getHours(),
                  platformPostId: (result as any)?.platformPostId ?? null,
                },
                occurredAt: new Date(),
              },
              {
                orgId: post.orgId,
                campaignId,
                assetId,
                channel: post.channel,
                eventType: "publish_success",
                isSimulated,
                metadataJson: {
                  publishedAt: new Date().toISOString(),
                  platformPostId: (result as any)?.platformPostId ?? null,
                  simulate: isSimulated,
                },
                occurredAt: new Date(),
              },
            ]);
          } catch (analyticsErr) {
            // Non-critical — don't fail the publish if analytics insert fails
            console.error("[publish] analytics event insert failed:", (analyticsErr as Error).message);
          }

          // Only create success notification for real (non-simulated) publishes
          if (!isSimulated) {
            try {
              await db.insert(notifications).values({
                orgId: post.orgId,
                type: "publish_success",
                title: `Post published on ${post.channel}`,
                body: contentText.slice(0, 100),
                resourceType: "scheduled_post",
                resourceId: post.id,
              });
            } catch { /* non-critical */ }
          }
        } catch (err) {
          const error = err as Error;
          const updated = await db
            .update(scheduledPosts)
            .set({
              status: "failed",
              errorMessage: error.message,
              retryCount: sql`${scheduledPosts.retryCount} + 1`,
            })
            .where(eq(scheduledPosts.id, post.id))
            .returning();

          // Fire publish_failed notification after max retries
          if ((updated[0]?.retryCount ?? 0) >= 3) {
            try {
              await db.insert(notifications).values({
                orgId: post.orgId,
                type: "publish_failed",
                title: `Failed to publish on ${post.channel}`,
                body: error.message.slice(0, 200),
                resourceType: "scheduled_post",
                resourceId: post.id,
              });
            } catch { /* non-critical */ }
          }

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

// ── Job: Post-publish Optimization Trigger ─────────────────────────────────────

export const runPostPublishOptimization = inngest.createFunction(
  { id: "run-post-publish-optimization", name: "Post-Publish Optimization Check" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const fiftyFourHoursAgo = new Date(now.getTime() - 54 * 60 * 60 * 1000);
    const fortyEightHoursAgoForReport = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Find posts published 48–54 hours ago
    const recentlyPublished = await step.run("find-published-posts", async () =>
      db.query.scheduledPosts.findMany({
        where: and(
          eq(scheduledPosts.status, "published"),
          gte(scheduledPosts.publishedAt!, fiftyFourHoursAgo),
          lte(scheduledPosts.publishedAt!, fortyEightHoursAgo),
        ),
        with: { asset: { columns: { campaignId: true, orgId: true } } },
        limit: 50,
      }),
    );

    if (recentlyPublished.length === 0) return { triggered: 0 };

    // Deduplicate by campaignId and check no recent report already exists
    const seen = new Set<string>();
    let triggered = 0;

    for (const post of recentlyPublished) {
      const campaignId = (post as any).asset?.campaignId;
      const orgId = (post as any).asset?.orgId ?? post.orgId;
      if (!campaignId || seen.has(campaignId)) continue;
      seen.add(campaignId);
      if (triggered >= 10) break;

      const existingReport = await step.run(`check-report-${campaignId.slice(0, 8)}`, async () =>
        db.query.optimizationReports.findFirst({
          where: and(
            eq(optimizationReports.campaignId, campaignId),
            gte(optimizationReports.generatedAt, fortyEightHoursAgoForReport),
          ),
        }),
      );

      if (!existingReport) {
        await step.run(`trigger-opt-${campaignId.slice(0, 8)}`, () =>
          inngest.send({ name: "orion/optimization.run", data: { campaignId, orgId } }),
        );
        triggered++;
      }
    }

    return { triggered };
  },
);

export const runOptimizationAgent = inngest.createFunction(
  { id: "run-optimization-agent", name: "Run Optimization Agent", retries: 2 },
  { event: "orion/optimization.run" },
  async ({ event, step }) => {
    const { campaignId, orgId } = event.data as { campaignId: string; orgId: string };

    const rollups = await step.run("fetch-rollups", async () =>
      db.query.analyticsRollups.findMany({
        where: eq(analyticsRollups.campaignId, campaignId),
      }),
    );

    if (rollups.length === 0) return { skipped: true, reason: "no analytics data" };

    const totalImpressions = rollups.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const totalClicks = rollups.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const totalConversions = rollups.reduce((s, r) => s + (r.conversions ?? 0), 0);
    const totalEngagements = rollups.reduce((s, r) => s + (r.engagements ?? 0), 0);
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;

    const channelMap = new Map<string, typeof rollups[0]>();
    for (const r of rollups) {
      const ch = r.channel ?? "unknown";
      const existing = channelMap.get(ch);
      if (!existing) {
        channelMap.set(ch, { ...r });
      } else {
        existing.impressions += r.impressions;
        existing.clicks += r.clicks;
        existing.conversions += r.conversions;
        existing.engagements += r.engagements;
      }
    }

    const channelBreakdown = Array.from(channelMap.entries()).map(([channel, r]) => ({
      channel,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      ctr: r.impressions > 0 ? parseFloat(((r.clicks / r.impressions) * 100).toFixed(2)) : 0,
    }));

    const report = await step.run("run-optimization-agent", async () => {
      const agent = new OptimizationAgent();
      return agent.analyze({
        brandName: "Campaign",
        goalType: "marketing",
        analytics: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          engagementRate: parseFloat(engagementRate.toFixed(2)),
          cpa: totalConversions > 0 ? 0 : 0,
          roi: 0,
          channelBreakdown,
        },
      });
    });

    await step.run("save-report", async () =>
      db.insert(optimizationReports).values({
        orgId,
        campaignId,
        reportJson: { channelBreakdown, totals: { totalImpressions, totalClicks, totalConversions } },
        reportText: report.text,
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: report.tokensUsed,
      }),
    );

    return { saved: true };
  },
);

// ── Job: Auto-score new contacts ─────────────────────────────────────────────

export const scorePendingContacts = inngest.createFunction(
  { id: "score-pending-contacts", name: "Score New Contact", retries: 2 },
  { event: "orion/crm.contact_created" },
  async ({ event, step }) => {
    const { contactId, orgId } = event.data as { contactId: string; orgId: string };

    // Wait 60 seconds for any initial events to accumulate
    await step.sleep("wait-for-events", "60s");

    const contact = await step.run("fetch-contact", async () =>
      db.query.contacts.findFirst({
        where: eq(contacts.id, contactId),
        with: { events: { orderBy: (e: any, { desc: d }: any) => [d(e.occurredAt)], limit: 10 } },
      }),
    );

    if (!contact) return { skipped: true };

    await step.run("score-contact", async () => {
      try {
        const agent = new CRMIntelligenceAgent();
        await agent.analyzeContact(contactId, orgId);
      } catch (err) {
        console.error(`[scorePendingContacts] Failed to score contact ${contactId}:`, (err as Error).message);
      }
    });

    return { scored: true, contactId };
  },
);

// ── Job: Auto-update lead statuses based on engagement ────────────────────────

export const updateLeadStatuses = inngest.createFunction(
  { id: "update-lead-statuses", name: "Update Lead Statuses" },
  { cron: "0 */4 * * *" },
  async ({ step }) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Contacts with 3+ events in last 7 days: cold → warm
    const coldToWarmCount = await step.run("cold-to-warm", async () => {
      const coldContacts = await db.query.contacts.findMany({
        where: eq(contacts.status, "cold"),
        with: {
          events: {
            where: gte(contactEvents.occurredAt, sevenDaysAgo),
          },
        },
      });

      const toUpgrade = coldContacts.filter((c: any) => (c.events?.length ?? 0) >= 3);
      if (toUpgrade.length === 0) return 0;

      await Promise.all(
        toUpgrade.map((c: any) =>
          db.update(contacts).set({ status: "warm", updatedAt: new Date() }).where(eq(contacts.id, c.id)),
        ),
      );

      console.info(`[updateLeadStatuses] cold→warm: ${toUpgrade.length} contacts`);
      return toUpgrade.length;
    });

    // Contacts with 7+ events in last 7 days: warm → hot
    const warmToHotCount = await step.run("warm-to-hot", async () => {
      const warmContacts = await db.query.contacts.findMany({
        where: eq(contacts.status, "warm"),
        with: {
          events: {
            where: gte(contactEvents.occurredAt, sevenDaysAgo),
          },
        },
      });

      const toUpgrade = warmContacts.filter((c: any) => (c.events?.length ?? 0) >= 7);
      if (toUpgrade.length === 0) return 0;

      await Promise.all(
        toUpgrade.map((c: any) =>
          db.update(contacts).set({ status: "hot", updatedAt: new Date() }).where(eq(contacts.id, c.id)),
        ),
      );

      console.info(`[updateLeadStatuses] warm→hot: ${toUpgrade.length} contacts`);
      return toUpgrade.length;
    });

    return { coldToWarm: coldToWarmCount, warmToHot: warmToHotCount };
  },
);

// ── Job: Auto-publish approved asset based on confidence threshold ─────────────
// Triggered when a new asset is created by the pipeline.
// If the org has autoPublishEnabled and the asset's campaign is "active",
// create a scheduledPost set to publish immediately.

export const autoPublishAsset = inngest.createFunction(
  { id: "auto-publish-asset", name: "Auto-Publish Approved Asset", retries: 1 },
  { event: "orion/asset.created" },
  async ({ event, step }) => {
    const { assetId, orgId, channel } = event.data as {
      assetId: string;
      orgId: string;
      channel: string;
      campaignId?: string;
    };

    const org = await step.run("fetch-org", async () =>
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { autoPublishEnabled: true, autoPublishThreshold: true },
      }),
    );

    if (!org?.autoPublishEnabled) return { skipped: true, reason: "auto-publish disabled" };

    const asset = await step.run("fetch-asset", async () =>
      db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
        columns: {
          id: true,
          orgId: true,
          campaignId: true,
          channel: true,
          contentText: true,
          status: true,
          qualityScore: true,
        },
      }),
    );

    if (!asset || asset.status !== "approved") {
      return { skipped: true, reason: "asset not approved" };
    }

    const score = (asset as any).qualityScore ?? 0;
    if (score < org.autoPublishThreshold) {
      return { skipped: true, reason: `quality score ${score} below threshold ${org.autoPublishThreshold}` };
    }

    // Create a scheduled post to publish now
    const [post] = await step.run("schedule-post", async () =>
      db
        .insert(scheduledPosts)
        .values({
          orgId,
          assetId: asset.id,
          channel: (asset.channel ?? channel) as any,
          status: "scheduled",
          scheduledFor: new Date(), // publish immediately on next cron
        })
        .returning(),
    );

    return { scheduled: true, scheduledPostId: post?.id };
  },
);

// ── Export all functions for the Inngest serve handler ─────────────────────────

export { runAgentPipeline } from "./orchestrate-pipeline.js";
import { runAgentPipeline } from "./orchestrate-pipeline.js";
export { runPostCampaignAnalysis, sendMonthlyDigest } from "./post-campaign-analysis.js";
import { runPostCampaignAnalysis, sendMonthlyDigest } from "./post-campaign-analysis.js";

export const allFunctions = [
  generateStrategy,
  publishScheduledPost,
  rollupAnalytics,
  runAgentPipeline,
  runPostPublishOptimization,
  runOptimizationAgent,
  scorePendingContacts,
  updateLeadStatuses,
  autoPublishAsset,
  runPostCampaignAnalysis,
  sendMonthlyDigest,
];
