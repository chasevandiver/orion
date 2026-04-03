// Use the canonical Inngest client — do NOT create a second instance here.
// The duplicate `new Inngest({ id: "orion" })` that previously lived here was
// causing functions to be registered against a client that had no eventKey or
// signingKey, breaking event delivery in all environments.
import { inngest } from "../client.js";
import * as Sentry from "@sentry/node";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  campaigns,
  scheduledPosts,
  analyticsRollups,
  analyticsEvents,
  optimizationReports,
  contacts,
  contactEvents,
  notifications,
  assets,
  emailSequences,
  emailSequenceSteps,
  workflows,
  workflowRuns,
} from "@orion/db/schema";
import { eq, and, lte, lt, sql, gte, desc, asc } from "drizzle-orm";
import { MarketingStrategistAgent, OptimizationAgent, DistributionAgent, CRMIntelligenceAgent, runPreflightChecks } from "@orion/agents";
import { TwitterClient, MetaClient, LinkedInClient, ResendClient } from "@orion/integrations";
import { channelConnections, organizations } from "@orion/db/schema";
import { getOptimalPostingTime, computeOrgBestPostingTimes } from "../lib/posting-times.js";
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
    try {
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
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
  },
);

// ── Job: Publish Scheduled Post ────────────────────────────────────────────────

export const publishScheduledPost = inngest.createFunction(
  { id: "publish-scheduled-post", name: "Publish Scheduled Post", retries: 3 },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    try {
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

          // ── Preflight checks (deterministic, no AI, < 5s per post) ────────
          const preflight = await runPreflightChecks(post.channel, contentText);
          if (preflight.hasCritical) {
            await db
              .update(scheduledPosts)
              .set({
                status: "preflight_failed",
                preflightStatus: "failed",
                preflightErrors: preflight.issues,
                errorMessage: preflight.issues.map((i: { message: string }) => i.message).join("; "),
              })
              .where(eq(scheduledPosts.id, post.id));
            console.warn(
              `[publish] Preflight critical failure for post ${post.id} (${post.channel}):`,
              preflight.issues.map((i: { message: string }) => i.message).join("; "),
            );
            return;
          }

          // Store preflight warnings so the UI can surface them
          if (preflight.hasWarnings) {
            await db
              .update(scheduledPosts)
              .set({ preflightStatus: "warning", preflightErrors: preflight.issues })
              .where(eq(scheduledPosts.id, post.id));
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
                  campaignId: (post as any).asset?.campaignId ?? undefined,
                  assetId: post.assetId ?? undefined,
                });
                platformPostId = result.platformPostId ?? `pending_${post.channel}_${Date.now()}`;
                publishUrl = result.url ?? "";
                isSimulated = !!(result as any)?.simulate;
              }
            }

            if (!isSimulated) {
              await db
                .update(scheduledPosts)
                .set({
                  status: "published",
                  publishedAt: new Date(),
                  platformPostId,
                  preflightStatus: preflight.hasWarnings ? "warning" : "passed",
                })
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
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
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
      // Include isSimulated in the key so real and simulated events roll up separately
      const key = `${event.orgId}|${event.campaignId}|${event.channel}|${date.toISOString()}|${event.isSimulated}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    }

    for (const [key, events] of groups) {
      const [orgId, campaignId, channel, dateStr, isSimulatedStr] = key.split("|");
      await step.run(`rollup-${key.slice(0, 20)}`, async () => {
        // Use a raw SQL upsert so the ON CONFLICT target exactly matches the
        // COALESCE-based functional unique index created in migration 0013.
        //
        // A plain Drizzle .onConflictDoUpdate({ target: [columns] }) cannot
        // reference the COALESCE expression, and — because campaignId and channel
        // are nullable — Postgres would never detect a conflict on NULL values
        // with the old column-list approach (NULL != NULL in unique indexes).
        const campaignIdVal = campaignId === "null" ? null : campaignId;
        const channelVal    = channel    === "null" ? null : channel;
        const dateVal       = new Date(dateStr!);
        const isSimulated   = isSimulatedStr === "true";
        const impressions   = events.filter((e) => e.eventType === "impression").length;
        const clicks        = events.filter((e) => e.eventType === "click").length;
        const conversions   = events.filter((e) => e.eventType === "conversion").length;
        const engagements   = events.filter((e) => e.eventType === "engagement").length;

        await db.execute(sql`
          INSERT INTO analytics_rollups
            (id, org_id, campaign_id, channel, date, is_simulated,
             impressions, clicks, conversions, engagements, computed_at)
          VALUES (
            gen_random_uuid(),
            ${orgId}::uuid,
            ${campaignIdVal}::uuid,
            ${channelVal},
            ${dateVal}::timestamptz,
            ${isSimulated},
            ${impressions},
            ${clicks},
            ${conversions},
            ${engagements},
            now()
          )
          ON CONFLICT (
            org_id,
            COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
            COALESCE(channel, ''),
            date,
            is_simulated
          )
          DO UPDATE SET
            impressions  = analytics_rollups.impressions  + EXCLUDED.impressions,
            clicks       = analytics_rollups.clicks       + EXCLUDED.clicks,
            conversions  = analytics_rollups.conversions  + EXCLUDED.conversions,
            engagements  = analytics_rollups.engagements  + EXCLUDED.engagements,
            computed_at  = now()
        `);
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find all posts published at least 48 hours ago (no upper bound — dedup prevents re-runs)
    const recentlyPublished = await step.run("find-published-posts", async () =>
      db.query.scheduledPosts.findMany({
        where: and(
          eq(scheduledPosts.status, "published"),
          lte(scheduledPosts.publishedAt!, fortyEightHoursAgo),
        ),
        with: { asset: { columns: { campaignId: true, orgId: true } } },
        limit: 50,
      }),
    );

    if (recentlyPublished.length === 0) return { triggered: 0 };

    // Deduplicate by campaignId and check no report exists in the last 7 days
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
            gte(optimizationReports.generatedAt, sevenDaysAgo),
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
    try {
    const { campaignId, orgId } = event.data as { campaignId: string; orgId: string };

    // Fetch campaign + goal for real brandName/goalType
    const campaign = await step.run("fetch-campaign", async () =>
      db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
        with: { goal: { columns: { brandName: true, type: true } } },
      }),
    );

    const rollups = await step.run("fetch-rollups", async () =>
      db.query.analyticsRollups.findMany({
        where: eq(analyticsRollups.campaignId, campaignId),
      }),
    );

    if (rollups.length === 0) return { skipped: true, reason: "no analytics data" };

    const totalImpressions = rollups.reduce((s, r) => s + (r.impressions ?? 0), 0);

    if (totalImpressions < 100 || rollups.length < 3) {
      return { skipped: true, reason: "insufficient_data" };
    }

    const totalClicks = rollups.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const totalConversions = rollups.reduce((s, r) => s + (r.conversions ?? 0), 0);
    const totalEngagements = rollups.reduce((s, r) => s + (r.engagements ?? 0), 0);
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;

    // Compute analysis window from rollup dates
    const rollupDates = (rollups as Array<{ date: string | null }>)
      .map((r: { date: string | null }) => r.date)
      .filter((d): d is string => !!d)
      .map((d: string) => new Date(d).getTime())
      .sort((a: number, b: number) => a - b);
    const analysisWindowStart = rollupDates.length > 0 ? new Date(rollupDates[0]).toISOString() : null;
    const analysisWindowEnd = rollupDates.length > 0 ? new Date(rollupDates[rollupDates.length - 1]).toISOString() : null;

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

    const brandName = (campaign as any)?.goal?.brandName ?? campaign?.name ?? "Campaign";
    const goalType = (campaign as any)?.goal?.type ?? "marketing";

    const report = await step.run("run-optimization-agent", async () => {
      const agent = new OptimizationAgent();
      return agent.analyze({
        brandName,
        goalType,
        analytics: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          engagementRate: parseFloat(engagementRate.toFixed(2)),
          cpa: 0,
          roi: 0,
          channelBreakdown,
        },
      });
    });

    await step.run("save-report", async () =>
      db.insert(optimizationReports).values({
        orgId,
        campaignId,
        reportJson: {
          structured: report.structured,
          channelBreakdown,
          totals: { totalImpressions, totalClicks, totalConversions },
          analysisWindowStart,
          analysisWindowEnd,
          brandName,
          goalType,
        },
        reportText: report.structured
          ? report.structured.executiveSummary
          : report.text,
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: report.tokensUsed,
      }),
    );

    // Compute data-driven best posting times per channel and persist on the org
    // so the scheduling function and UI can read them without re-running the agent.
    await step.run("update-org-posting-times", async () => {
      const channels = channelBreakdown.map((c) => c.channel);
      const bestTimes = await computeOrgBestPostingTimes(orgId, channels);

      // Merge agent-inferred times for any channel missing from DB data
      const agentTimes = report.structured?.bestPostingTimes ?? [];
      const dbChannels = new Set(bestTimes.map((t) => t.channel));
      for (const at of agentTimes) {
        if (!dbChannels.has(at.channel)) bestTimes.push(at);
      }

      if (bestTimes.length > 0) {
        await db
          .update(organizations)
          .set({ bestPostingTimes: bestTimes, updatedAt: new Date() })
          .where(eq(organizations.id, orgId));
      }
      return { channelsUpdated: bestTimes.length };
    });

    return { saved: true };
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
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

// ── Job: Score contact captured via webhook ───────────────────────────────────
// Triggered by POST /contacts/capture — runs CRM intelligence immediately
// (no sleep delay, since the contact was just submitted via a live form/webhook).

export const scoreCapturedContact = inngest.createFunction(
  { id: "score-captured-contact", name: "Score Captured Contact", retries: 2 },
  { event: "orion/crm.score" },
  async ({ event, step }) => {
    try {
      const { contactId, orgId } = event.data as { contactId: string; orgId: string };

      const contact = await step.run("fetch-contact", async () =>
        db.query.contacts.findFirst({ where: eq(contacts.id, contactId) }),
      );

      if (!contact) return { skipped: true, reason: "contact not found" };

      await step.run("score-contact", async () => {
        const agent = new CRMIntelligenceAgent();
        await agent.analyzeContact(contactId, orgId);
      });

      // Fire event_trigger so any event-based workflows watching "contact.scored" run
      await step.run("fire-workflow-event", async () => {
        await inngest
          .send({ name: "orion/workflow.event_trigger", data: { orgId, eventName: "contact.scored" } })
          .catch(() => {}); // non-critical
      });

      // Fire contact_scored so the hot-lead threshold check can trigger
      await step.run("fire-contact-scored", async () => {
        await inngest
          .send({ name: "orion/crm.contact_scored", data: { contactId, orgId } })
          .catch(() => {}); // non-critical
      });

      return { scored: true, contactId };
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
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

      // Fire sequence enrollment for each upgraded contact
      await Promise.allSettled(
        toUpgrade.map((c: any) =>
          inngest.send({
            name: "orion/crm.sequence_enroll",
            data: { contactId: c.id, orgId: c.orgId, triggerType: "re_engagement" },
          }),
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

      // Fire sequence enrollment for each upgraded contact
      await Promise.allSettled(
        toUpgrade.map((c: any) =>
          inngest.send({
            name: "orion/crm.sequence_enroll",
            data: { contactId: c.id, orgId: c.orgId, triggerType: "trial_ending" },
          }),
        ),
      );

      console.info(`[updateLeadStatuses] warm→hot: ${toUpgrade.length} contacts`);
      return toUpgrade.length;
    });

    return { coldToWarm: coldToWarmCount, warmToHot: warmToHotCount };
  },
);

// ── Job: Auto-publish asset based on quality threshold ────────────────────────
// Triggered by the pipeline AFTER image compositing, so the asset is complete.
// Computes a quality score from available asset data, approves the asset if the
// score meets the org's threshold, and creates a scheduled post so the
// publishScheduledPost cron can pick it up.

/** Compute a 0-100 quality score from available asset fields (no LLM call). */
function computeAssetQualityScore(asset: {
  contentText: string | null;
  compositedImageUrl: string | null;
}): number {
  let score = 0;
  const textLen = asset.contentText?.trim().length ?? 0;
  if (textLen >= 50) score += 10;   // has meaningful content
  if (textLen >= 100) score += 30;  // good length
  if (textLen >= 300) score += 20;  // substantial content
  if (asset.compositedImageUrl) score += 30; // composited visual ready
  // Bonus: content isn't just whitespace/punctuation
  if (textLen >= 50 && /[a-zA-Z]{5,}/.test(asset.contentText ?? "")) score += 10;
  return Math.min(score, 100);
}

export const autoPublishAsset = inngest.createFunction(
  { id: "auto-publish-asset", name: "Auto-Publish Approved Asset", retries: 1 },
  { event: "orion/asset.auto-publish" },
  async ({ event, step }) => {
    const { assetId, orgId, qualityThreshold } = event.data as {
      assetId: string;
      orgId: string;
      qualityThreshold: number;
    };

    // Secondary safety check — confirm auto-publish is still enabled on the org
    // (user may have toggled it off between pipeline run and job execution)
    const org = await step.run("fetch-org", async () =>
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { autoPublishEnabled: true, timezone: true },
      }),
    );

    if (!org?.autoPublishEnabled) {
      return { skipped: true, reason: "auto-publish disabled on org" };
    }

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
          compositedImageUrl: true,
        },
      }),
    );

    if (!asset) {
      return { skipped: true, reason: "asset not found" };
    }

    // Compute quality score from content + image readiness
    const score = computeAssetQualityScore(asset);
    if (score < qualityThreshold) {
      return {
        skipped: true,
        reason: `quality score ${score} below threshold ${qualityThreshold}`,
        score,
      };
    }

    // Approve the asset so it appears as reviewed in the UI
    await step.run("approve-asset", async () => {
      await db
        .update(assets)
        .set({ status: "approved", updatedAt: new Date() })
        .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)));
    });

    // Create a scheduled post — skip if one already exists for this asset
    // (the pipeline's schedule-posts step may have already created one)
    const scheduledPostId = await step.run("schedule-post", async () => {
      const existing = await db.query.scheduledPosts.findFirst({
        where: eq(scheduledPosts.assetId, assetId),
        columns: { id: true },
      });
      if (existing) return existing.id;

      // Schedule at the next optimal time for this channel (data-driven if enough history)
      const channel = asset.channel ?? "linkedin";
      const now = new Date();
      const scheduledFor = await getOptimalPostingTime(orgId, channel, now, org?.timezone ?? "America/Chicago");

      const [post] = await db
        .insert(scheduledPosts)
        .values({
          orgId,
          assetId,
          channel: channel as any,
          status: "scheduled",
          scheduledFor,
        })
        .returning({ id: scheduledPosts.id });

      return post?.id ?? null;
    });

    return { approved: true, score, qualityThreshold, scheduledPostId };
  },
);

// ── Job: Enroll contact in matching email sequence ────────────────────────────
// Triggered when a contact's status changes (cold→warm, warm→hot, etc.) or
// when a contact is created with a specific trigger type.
//
// NOTE: Full per-contact enrollment tracking (scheduled step jobs, open/click
// events) requires a `sequenceEnrollments` table that doesn't exist yet.
// This job resolves matching sequences and logs the enrollment intent.
// To execute step delivery, add the table + schedule per-step Inngest jobs.

export const enrollContactInSequence = inngest.createFunction(
  { id: "enroll-contact-in-sequence", name: "Enroll Contact in Sequence", retries: 2 },
  { event: "orion/crm.sequence_enroll" },
  async ({ event, step }) => {
    try {
      const { contactId, orgId, triggerType } = event.data as {
        contactId: string;
        orgId: string;
        triggerType: string;
      };

      // Find active sequences matching this trigger
      const matchingSequences = await step.run("find-active-sequences", async () =>
        db.query.emailSequences.findMany({
          where: and(
            eq(emailSequences.orgId, orgId),
            eq(emailSequences.triggerType, triggerType),
            eq(emailSequences.status, "active"),
          ),
          with: {
            steps: { orderBy: asc(emailSequenceSteps.stepNumber) },
          },
        }),
      );

      if (matchingSequences.length === 0) {
        return { enrolled: 0, reason: `no active sequences for trigger "${triggerType}"` };
      }

      // Fetch the contact
      const contact = await step.run("fetch-contact", async () =>
        db.query.contacts.findFirst({
          where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)),
          columns: { id: true, email: true, status: true },
        }),
      );

      if (!contact) return { enrolled: 0, reason: "contact not found" };
      if (!contact.email) return { enrolled: 0, reason: "contact has no email" };

      // Schedule a delayed Inngest event for each step across all matching sequences.
      // Delay is cumulative: step delayDays is relative to the previous step.
      const scheduledEvents: { sequenceId: string; stepId: string; scheduledFor: string }[] = [];

      await step.run("schedule-step-emails", async () => {
        const now = Date.now();
        const eventsToSend: Parameters<typeof inngest.send>[0][] = [];

        for (const seq of matchingSequences) {
          let cumulativeDays = 0;
          for (const seqStep of seq.steps) {
            cumulativeDays += seqStep.delayDays;
            const scheduledFor = new Date(now + cumulativeDays * 24 * 60 * 60 * 1000);
            eventsToSend.push({
              name: "orion/sequence.send_step" as const,
              data: {
                contactId,
                contactEmail: contact.email,
                orgId,
                sequenceId: seq.id,
                sequenceName: seq.name,
                stepId: seqStep.id,
                stepNumber: seqStep.stepNumber,
                subject: seqStep.subject,
                contentText: seqStep.contentText,
                scheduledFor: scheduledFor.toISOString(),
              },
              ts: scheduledFor.getTime(),
            });
            scheduledEvents.push({
              sequenceId: seq.id,
              stepId: seqStep.id,
              scheduledFor: scheduledFor.toISOString(),
            });
          }
        }

        if (eventsToSend.length > 0) {
          await inngest.send(eventsToSend as any);
        }

        // Log enrollment in contactEvents for audit trail
        await db.insert(contactEvents).values(
          matchingSequences.map((seq) => ({
            contactId,
            eventType: "sequence_enrolled",
            metadataJson: {
              sequenceId: seq.id,
              sequenceName: seq.name,
              triggerType,
              stepCount: seq.steps.length,
            },
          })),
        );
      });

      console.info(
        `[enrollContactInSequence] Contact ${contact.email} (${contactId}) ` +
          `enrolled in ${matchingSequences.length} sequence(s) for trigger "${triggerType}": ` +
          matchingSequences.map((s) => `"${s.name}"`).join(", "),
      );

      return {
        enrolled: matchingSequences.length,
        contactId,
        triggerType,
        scheduledSteps: scheduledEvents.length,
        sequences: matchingSequences.map((s) => ({ id: s.id, name: s.name, steps: s.steps.length })),
      };
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
  },
);

// ── Job: Send a single sequence step email ────────────────────────────────────

export const sendSequenceStep = inngest.createFunction(
  { id: "send-sequence-step", name: "Send Sequence Step Email", retries: 3 },
  { event: "orion/sequence.send_step" },
  async ({ event, step }) => {
    const {
      contactId,
      contactEmail,
      orgId,
      sequenceId,
      sequenceName,
      stepId,
      stepNumber,
      subject,
      contentText,
    } = event.data as {
      contactId: string;
      contactEmail: string;
      orgId: string;
      sequenceId: string;
      sequenceName: string;
      stepId: string;
      stepNumber: number;
      subject: string;
      contentText: string;
      scheduledFor: string;
    };

    // Verify sequence is still active and step still exists
    const [sequence, seqStep] = await step.run("verify-sequence-step", async () =>
      Promise.all([
        db.query.emailSequences.findFirst({
          where: and(eq(emailSequences.id, sequenceId), eq(emailSequences.orgId, orgId)),
          columns: { id: true, status: true },
        }),
        db.query.emailSequenceSteps.findFirst({
          where: and(
            eq(emailSequenceSteps.id, stepId),
            eq(emailSequenceSteps.sequenceId, sequenceId),
          ),
          columns: { id: true },
        }),
      ]),
    );

    if (!sequence || sequence.status !== "active") {
      return { skipped: true, reason: "sequence no longer active" };
    }
    if (!seqStep) {
      return { skipped: true, reason: "step was deleted" };
    }

    // Verify contact is still active and hasn't unsubscribed
    const contact = await step.run("verify-contact", async () =>
      db.query.contacts.findFirst({
        where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)),
        columns: { id: true, email: true, status: true },
      }),
    );

    if (!contact || (contact.status as string) === "unsubscribed") {
      return { skipped: true, reason: "contact unsubscribed or not found" };
    }

    // Fetch org email connection (Resend API key)
    const connection = await step.run("fetch-email-connection", async () =>
      db.query.channelConnections.findFirst({
        where: and(
          eq(channelConnections.orgId, orgId),
          eq(channelConnections.channel, "email"),
          eq(channelConnections.isActive, true),
        ),
        columns: { accessTokenEnc: true, accountName: true },
      }),
    );

    if (!connection?.accessTokenEnc) {
      console.warn(`[sendSequenceStep] No email connection for org ${orgId} — skipping step ${stepNumber} of "${sequenceName}"`);
      return { skipped: true, reason: "no active email connection" };
    }

    const apiKey = decryptTokenSafe(connection.accessTokenEnc);
    if (!apiKey) {
      return { skipped: true, reason: "could not decrypt email API key" };
    }

    // Send the email
    await step.run("send-email", async () => {
      const emailClient = new ResendClient(orgId, apiKey);
      await emailClient.sendToAddress({
        toEmail: contact.email!,
        subject,
        contentText,
        fromName: connection.accountName ?? undefined,
      });
    });

    // Record the send event on the contact
    await step.run("record-send-event", async () => {
      await db.insert(contactEvents).values({
        contactId,
        eventType: "sequence_email_sent",
        metadataJson: {
          sequenceId,
          sequenceName,
          stepId,
          stepNumber,
          subject,
        },
      });
    });

    console.info(
      `[sendSequenceStep] Sent step ${stepNumber} of "${sequenceName}" to ${contactEmail}`,
    );

    return { sent: true, contactEmail, stepNumber, sequenceName };
  },
);

// ── Workflow actions ──────────────────────────────────────────────────────────
// Schedule presets → next UTC run time
const SCHEDULE_PRESETS: Record<string, { days: number[]; hour: number }> = {
  daily_morning: { days: [0, 1, 2, 3, 4, 5, 6], hour: 9 },
  daily_evening: { days: [0, 1, 2, 3, 4, 5, 6], hour: 18 },
  weekly_monday: { days: [1], hour: 9 },
  weekly_friday: { days: [5], hour: 9 },
};

function computeNextRunAt(schedule: string): Date {
  const preset = SCHEDULE_PRESETS[schedule] ?? SCHEDULE_PRESETS.daily_morning!;
  const now = new Date();
  const d = new Date(now);
  d.setUTCHours(preset.hour, 0, 0, 0);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (preset.days.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// ── Job: Execute a workflow action ────────────────────────────────────────────

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow", name: "Execute Workflow Action", retries: 1 },
  { event: "orion/workflow.execute" },
  async ({ event, step }) => {
    const { workflowId, runId, orgId } = event.data as {
      workflowId: string;
      runId: string;
      orgId: string;
    };

    const workflow = await step.run("fetch-workflow", async () =>
      db.query.workflows.findFirst({ where: eq(workflows.id, workflowId) }),
    );

    if (!workflow) {
      await db
        .update(workflowRuns)
        .set({ status: "failed", completedAt: new Date(), logJson: { error: "Workflow not found" } })
        .where(eq(workflowRuns.id, runId));
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const stepsArr = Array.isArray(workflow.stepsJson) ? (workflow.stepsJson as any[]) : [];
    const action = (stepsArr[0]?.type as string) ?? "unknown";
    const actionConfig = stepsArr[0] ?? {};

    let result: Record<string, unknown> = {};
    let failed = false;
    let errorMessage = "";

    try {
      switch (action) {
        // ── Publish Queue: schedule all approved assets that have no post yet ──
        case "publish_queue": {
          result = await step.run("action-publish-queue", async () => {
            const [wfOrg, approved] = await Promise.all([
              db.query.organizations.findFirst({
                where: eq(organizations.id, orgId),
                columns: { timezone: true },
              }),
              db.query.assets.findMany({
                where: and(eq(assets.orgId, orgId), eq(assets.status, "approved")),
                columns: { id: true, channel: true },
              }),
            ]);
            const orgTimezone = wfOrg?.timezone ?? "America/Chicago";
            let scheduled = 0;
            for (const asset of approved) {
              const existing = await db.query.scheduledPosts.findFirst({
                where: eq(scheduledPosts.assetId, asset.id),
                columns: { id: true },
              });
              if (!existing) {
                await db.insert(scheduledPosts).values({
                  orgId,
                  assetId: asset.id,
                  channel: (asset.channel ?? "email") as any,
                  status: "scheduled",
                  scheduledFor: await getOptimalPostingTime(orgId, asset.channel ?? "email", new Date(), orgTimezone),
                });
                scheduled++;
              }
            }
            return { scheduled, total: approved.length };
          });
          break;
        }

        // ── Run Analytics: trigger optimization for all active campaigns ────────
        case "run_analytics": {
          result = await step.run("action-run-analytics", async () => {
            const activeCampaigns = await db.query.campaigns.findMany({
              where: and(eq(campaigns.orgId, orgId), eq(campaigns.status, "active")),
              columns: { id: true },
            });
            await Promise.all(
              activeCampaigns.map((c) =>
                inngest.send({ name: "orion/optimization.run", data: { campaignId: c.id, orgId } }),
              ),
            );
            return { campaigns: activeCampaigns.length };
          });
          break;
        }

        // ── Score Contacts: re-score contacts with 0 lead score ────────────────
        case "score_contacts": {
          result = await step.run("action-score-contacts", async () => {
            const unscored = await db.query.contacts.findMany({
              where: and(eq(contacts.orgId, orgId), eq(contacts.leadScore, 0)),
              columns: { id: true },
              limit: 50,
            });
            await Promise.all(
              unscored.map((c) =>
                inngest.send({ name: "orion/crm.score", data: { contactId: c.id, orgId } }),
              ),
            );
            return { contacts: unscored.length };
          });
          break;
        }

        // ── Send Sequence: enroll contacts by status into an email sequence ────
        case "send_sequence": {
          const { sequenceId, contactStatus = "warm" } = actionConfig as {
            sequenceId?: string;
            contactStatus?: string;
          };
          result = await step.run("action-send-sequence", async () => {
            if (!sequenceId) throw new Error("send_sequence requires a sequenceId in action config");
            const targets = await db.query.contacts.findMany({
              where: and(eq(contacts.orgId, orgId), eq(contacts.status, contactStatus as any)),
              columns: { id: true },
              limit: 200,
            });
            await Promise.all(
              targets.map((c) =>
                inngest.send({
                  name: "orion/crm.sequence_enroll",
                  data: { contactId: c.id, orgId, triggerType: "manual" },
                }),
              ),
            );
            return { contacts: targets.length, sequenceId, contactStatus };
          });
          break;
        }

        default:
          throw new Error(
            `Unknown workflow action "${action}". Valid: publish_queue, run_analytics, score_contacts, send_sequence`,
          );
      }
    } catch (err) {
      failed = true;
      errorMessage = (err as Error).message;
    }

    await step.run("finalize-run", async () =>
      db
        .update(workflowRuns)
        .set({
          status: failed ? "failed" : "completed",
          completedAt: new Date(),
          logJson: { action, ...(failed ? { error: errorMessage } : { result }) },
        })
        .where(eq(workflowRuns.id, runId)),
    );

    if (failed) throw new Error(errorMessage);
    return { success: true, action, result };
  },
);

// ── Job: Check scheduled workflows (runs every 15 min) ────────────────────────

export const checkScheduledWorkflows = inngest.createFunction(
  { id: "check-scheduled-workflows", name: "Check Scheduled Workflows" },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const now = new Date();

    const scheduled = await step.run("find-scheduled-workflows", async () =>
      db.query.workflows.findMany({
        where: and(eq(workflows.triggerType, "schedule"), eq(workflows.status, "active")),
      }),
    );

    let triggered = 0;

    for (const workflow of scheduled) {
      const config = (workflow.triggerConfigJson ?? {}) as {
        schedule?: string;
        nextRunAt?: string;
      };
      if (!config.nextRunAt) continue;
      const nextRun = new Date(config.nextRunAt);
      if (nextRun > now) continue;

      await step.run(`fire-workflow-${workflow.id.slice(0, 8)}`, async () => {
        const [run] = await db
          .insert(workflowRuns)
          .values({ workflowId: workflow.id, status: "running", startedAt: new Date() })
          .returning();

        // Advance nextRunAt to the next scheduled time
        const nextNextRunAt = computeNextRunAt(config.schedule ?? "daily_morning").toISOString();
        await db
          .update(workflows)
          .set({
            runCount: workflow.runCount + 1,
            lastRunAt: new Date(),
            triggerConfigJson: { ...config, nextRunAt: nextNextRunAt },
            updatedAt: new Date(),
          })
          .where(eq(workflows.id, workflow.id));

        await inngest.send({
          name: "orion/workflow.execute",
          data: { workflowId: workflow.id, runId: run.id, orgId: workflow.orgId },
        });
      });

      triggered++;
    }

    return { checked: scheduled.length, triggered };
  },
);

// ── Job: Dispatch event-triggered workflows ───────────────────────────────────
// Send orion/workflow.event_trigger from any job to auto-fire matching workflows.

export const dispatchEventWorkflows = inngest.createFunction(
  { id: "dispatch-event-workflows", name: "Dispatch Event-Triggered Workflows", retries: 1 },
  { event: "orion/workflow.event_trigger" },
  async ({ event, step }) => {
    const { orgId, eventName } = event.data as { orgId: string; eventName: string };

    const eventWorkflows = await step.run("find-event-workflows", async () =>
      db.query.workflows.findMany({
        where: and(
          eq(workflows.orgId, orgId),
          eq(workflows.triggerType, "event"),
          eq(workflows.status, "active"),
        ),
      }),
    );

    const matching = eventWorkflows.filter((w) => {
      const config = (w.triggerConfigJson ?? {}) as { event?: string };
      return config.event === eventName;
    });

    for (const workflow of matching) {
      await step.run(`trigger-event-${workflow.id.slice(0, 8)}`, async () => {
        const [run] = await db
          .insert(workflowRuns)
          .values({ workflowId: workflow.id, status: "running", startedAt: new Date() })
          .returning();

        await db
          .update(workflows)
          .set({ runCount: workflow.runCount + 1, lastRunAt: new Date(), updatedAt: new Date() })
          .where(eq(workflows.id, workflow.id));

        await inngest.send({
          name: "orion/workflow.execute",
          data: { workflowId: workflow.id, runId: run.id, orgId: workflow.orgId },
        });
      });
    }

    return { dispatched: matching.length, orgId, eventName };
  },
);

// ── Autopilot: weekly auto-campaign generation ──────────────────────────────

export const autopilotWeeklyCampaign = inngest.createFunction(
  {
    id: "autopilot-weekly-campaign",
    name: "Autopilot: Weekly Campaign Generation",
  },
  { cron: "TZ=UTC 0 9 * * 1" }, // Every Monday at 9 AM UTC
  async ({ step }) => {
    // Find all orgs with autopilot enabled
    const orgs = await step.run("fetch-autopilot-orgs", async () => {
      return db.query.organizations.findMany({
        where: eq(organizations.autoPublishEnabled, true),
        columns: {
          id: true,
          name: true,
        },
      });
    });

    if (orgs.length === 0) return { skipped: true, reason: "no autopilot orgs" };

    let triggered = 0;

    for (const org of orgs) {
      await step.run(`autopilot-${org.id}`, async () => {
        // Create a weekly awareness goal
        const [goal] = await db
          .insert(goals)
          .values({
            orgId: org.id,
            type: "awareness",
            brandName: org.name,
            brandDescription: `Automated weekly content campaign for ${org.name}`,
            timeline: "1_week",
            status: "active",
          })
          .returning();

        // Determine channels: use connected channels, fallback to defaults
        const connections = await db.query.channelConnections.findMany({
          where: eq(channelConnections.orgId, org.id),
          columns: { channel: true },
        });

        const connectedChannels = connections.map((c) => c.channel);
        const channelsToUse =
          connectedChannels.length > 0
            ? connectedChannels
            : ["instagram", "facebook", "twitter"];

        // Trigger the pipeline
        await inngest.send({
          name: "orion/pipeline.run",
          data: {
            goalId: goal.id,
            orgId: org.id,
            channels: channelsToUse,
            abTesting: false,
          },
        });

        triggered++;
      });
    }

    return { triggered, totalOrgs: orgs.length };
  },
);

// ── Export all functions for the Inngest serve handler ─────────────────────────

export { runAgentPipeline } from "./orchestrate-pipeline.js";
import { runAgentPipeline } from "./orchestrate-pipeline.js";
export { runPostCampaignAnalysis, sendMonthlyDigest } from "./post-campaign-analysis.js";
import { runPostCampaignAnalysis, sendMonthlyDigest } from "./post-campaign-analysis.js";
export { checkCampaignCompletion } from "./check-campaign-completion.js";
import { checkCampaignCompletion } from "./check-campaign-completion.js";
export { generateRecommendations } from "./generate-recommendations.js";
import { generateRecommendations } from "./generate-recommendations.js";
export { recycleEvergreenContent, recycleSingleAsset } from "./recycle-evergreen-content.js";
import { recycleEvergreenContent, recycleSingleAsset } from "./recycle-evergreen-content.js";
export { refreshCompetitorIntel } from "./refresh-competitor-intel.js";
import { refreshCompetitorIntel } from "./refresh-competitor-intel.js";
export {
  templateWelcomeNewLead,
  templateHotLeadAlert,
  templateWeeklyPerformanceDigest,
  templateStaleCampaignReactivation,
  templateContentApprovalPipeline,
  checkAndFireHotLeadEvent,
} from "./workflow-templates.js";
import {
  templateWelcomeNewLead,
  templateHotLeadAlert,
  templateWeeklyPerformanceDigest,
  templateStaleCampaignReactivation,
  templateContentApprovalPipeline,
  checkAndFireHotLeadEvent,
} from "./workflow-templates.js";

export const allFunctions = [
  generateStrategy,
  publishScheduledPost,
  rollupAnalytics,
  runAgentPipeline,
  runPostPublishOptimization,
  runOptimizationAgent,
  scorePendingContacts,
  scoreCapturedContact,
  updateLeadStatuses,
  autoPublishAsset,
  runPostCampaignAnalysis,
  sendMonthlyDigest,
  enrollContactInSequence,
  sendSequenceStep,
  executeWorkflow,
  checkScheduledWorkflows,
  dispatchEventWorkflows,
  autopilotWeeklyCampaign,
  checkCampaignCompletion,
  // ── Workflow templates ──────────────────────────────────────────────────────
  templateWelcomeNewLead,
  templateHotLeadAlert,
  templateWeeklyPerformanceDigest,
  templateStaleCampaignReactivation,
  templateContentApprovalPipeline,
  checkAndFireHotLeadEvent,
  generateRecommendations,
  recycleEvergreenContent,
  recycleSingleAsset,
  refreshCompetitorIntel,
];
