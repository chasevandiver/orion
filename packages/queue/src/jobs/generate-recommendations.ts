/**
 * generate-recommendations.ts
 *
 * Inngest cron job that runs every 6 hours. For each active org, it analyzes
 * recent analytics, content calendar gaps, campaign staleness, and top
 * performers to produce 3-5 actionable recommendations stored in the
 * `recommendations` table.
 */
import { inngest } from "../client.js";
import { db } from "@orion/db";
import {
  organizations,
  recommendations,
  analyticsRollups,
  scheduledPosts,
  goals,
  campaigns,
  assets,
  contacts,
} from "@orion/db/schema";
import { eq, and, gte, lte, desc, sql, ne, lt } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

interface Recommendation {
  orgId: string;
  type: "content_gap" | "performance_drop" | "stale_campaign" | "top_performer" | "audience_growth";
  title: string;
  description: string;
  actionType: "create_campaign" | "repurpose" | "adjust_schedule" | "review_content";
  actionPayload: Record<string, unknown>;
  priority: number;
  expiresAt: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ── Recommendation generators ────────────────────────────────────────────────

async function detectContentGaps(orgId: string): Promise<Recommendation | null> {
  const now = new Date();
  const threeDaysOut = daysFromNow(3);

  // Count scheduled posts in the next 3 days
  const upcoming = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.orgId, orgId),
        gte(scheduledPosts.scheduledFor, now),
        lte(scheduledPosts.scheduledFor, threeDaysOut),
        eq(scheduledPosts.status, "scheduled"),
      ),
    );

  const count = upcoming[0]?.count ?? 0;
  if (count > 0) return null;

  // Build day names for the gap
  const gapDays: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = daysFromNow(i);
    gapDays.push(DAY_NAMES[d.getDay()]!);
  }
  const dayList = gapDays.join(", ");

  return {
    orgId,
    type: "content_gap",
    title: `Nothing scheduled for ${dayList}`,
    description: `You have no posts scheduled in the next 3 days. Consistent posting keeps your audience engaged and helps algorithms favor your content.`,
    actionType: "create_campaign",
    actionPayload: { goalType: "awareness", timeline: "1_week" },
    priority: 1,
    expiresAt: daysFromNow(2),
  };
}

async function detectPerformanceDrop(orgId: string): Promise<Recommendation | null> {
  const now = new Date();
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);

  // Current period: last 7 days
  const currentRows = await db
    .select({
      impressions: sql<number>`coalesce(sum(${analyticsRollups.impressions}), 0)::int`,
      engagements: sql<number>`coalesce(sum(${analyticsRollups.engagements}), 0)::int`,
      channel: analyticsRollups.channel,
    })
    .from(analyticsRollups)
    .where(
      and(
        eq(analyticsRollups.orgId, orgId),
        gte(analyticsRollups.date, sevenDaysAgo),
        lte(analyticsRollups.date, now),
      ),
    )
    .groupBy(analyticsRollups.channel);

  // Previous period: 14-7 days ago
  const previousRows = await db
    .select({
      impressions: sql<number>`coalesce(sum(${analyticsRollups.impressions}), 0)::int`,
      engagements: sql<number>`coalesce(sum(${analyticsRollups.engagements}), 0)::int`,
      channel: analyticsRollups.channel,
    })
    .from(analyticsRollups)
    .where(
      and(
        eq(analyticsRollups.orgId, orgId),
        gte(analyticsRollups.date, fourteenDaysAgo),
        lt(analyticsRollups.date, sevenDaysAgo),
      ),
    )
    .groupBy(analyticsRollups.channel);

  // Find channels with 20%+ engagement rate drop
  for (const curr of currentRows) {
    if (!curr.channel || curr.impressions < 10) continue;

    const prev = previousRows.find((p) => p.channel === curr.channel);
    if (!prev || prev.impressions < 10) continue;

    const currRate = curr.engagements / curr.impressions;
    const prevRate = prev.engagements / prev.impressions;
    const dropPct = prevRate > 0 ? ((prevRate - currRate) / prevRate) * 100 : 0;

    if (dropPct >= 20) {
      const channelName = (curr.channel ?? "").charAt(0).toUpperCase() + (curr.channel ?? "").slice(1);
      return {
        orgId,
        type: "performance_drop",
        title: `${channelName} engagement dropped ${Math.round(dropPct)}%`,
        description: `Your ${channelName} engagement rate fell from ${(prevRate * 100).toFixed(1)}% to ${(currRate * 100).toFixed(1)}% this week. Try shorter captions with a question hook to boost interaction.`,
        actionType: "create_campaign",
        actionPayload: { goalType: "social", channels: [curr.channel] },
        priority: 2,
        expiresAt: daysFromNow(3),
      };
    }
  }

  return null;
}

async function detectStaleCampaign(orgId: string): Promise<Recommendation | null> {
  // Find the most recent goal
  const [latestGoal] = await db
    .select({ createdAt: goals.createdAt })
    .from(goals)
    .where(eq(goals.orgId, orgId))
    .orderBy(desc(goals.createdAt))
    .limit(1);

  if (!latestGoal) return null;

  const daysSince = Math.floor(
    (Date.now() - new Date(latestGoal.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince < 14) return null;

  // Check for audience growth to add context
  const recentContacts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        gte(contacts.createdAt, daysAgo(14)),
      ),
    );

  const newContacts = recentContacts[0]?.count ?? 0;
  const growthNote =
    newContacts > 0
      ? ` Your audience grew by ${newContacts} contact${newContacts !== 1 ? "s" : ""} in the meantime.`
      : "";

  return {
    orgId,
    type: "stale_campaign",
    title: `${daysSince} days since your last campaign`,
    description: `It's been ${daysSince} days since your last campaign.${growthNote} Launch a new campaign to keep momentum going.`,
    actionType: "create_campaign",
    actionPayload: { goalType: "awareness" },
    priority: 3,
    expiresAt: daysFromNow(3),
  };
}

async function detectTopPerformer(orgId: string): Promise<Recommendation | null> {
  const fourteenDaysAgo = daysAgo(14);

  // Find assets with analytics rollups from the last 14 days
  // Get per-campaign rollup totals
  const campaignStats = await db
    .select({
      campaignId: analyticsRollups.campaignId,
      impressions: sql<number>`coalesce(sum(${analyticsRollups.impressions}), 0)::int`,
      engagements: sql<number>`coalesce(sum(${analyticsRollups.engagements}), 0)::int`,
    })
    .from(analyticsRollups)
    .where(
      and(
        eq(analyticsRollups.orgId, orgId),
        gte(analyticsRollups.date, fourteenDaysAgo),
      ),
    )
    .groupBy(analyticsRollups.campaignId);

  if (campaignStats.length < 2) return null;

  // Calculate average engagement
  const totalEngagements = campaignStats.reduce((s, r) => s + r.engagements, 0);
  const avgEngagement = totalEngagements / campaignStats.length;

  if (avgEngagement === 0) return null;

  // Find 3x outlier
  const topCampaign = campaignStats
    .filter((c) => c.campaignId && c.engagements >= avgEngagement * 3)
    .sort((a, b) => b.engagements - a.engagements)[0];

  if (!topCampaign || !topCampaign.campaignId) return null;

  // Fetch campaign details + first asset content snippet
  const [campaign] = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.id, topCampaign.campaignId))
    .limit(1);

  if (!campaign) return null;

  const [topAsset] = await db
    .select({ id: assets.id, contentText: assets.contentText, channel: assets.channel })
    .from(assets)
    .where(eq(assets.campaignId, campaign.id))
    .limit(1);

  const snippet = topAsset?.contentText?.slice(0, 60) ?? campaign.name;

  return {
    orgId,
    type: "top_performer",
    title: `"${snippet}…" is outperforming`,
    description: `This content got ${topCampaign.engagements.toLocaleString()} engagements — ${Math.round(topCampaign.engagements / avgEngagement)}x your average. Repurpose it to other channels to maximize reach.`,
    actionType: "repurpose",
    actionPayload: {
      campaignId: campaign.id,
      assetId: topAsset?.id,
      sourceChannel: topAsset?.channel,
    },
    priority: 2,
    expiresAt: daysFromNow(5),
  };
}

// ── Main cron job ────────────────────────────────────────────────────────────

export const generateRecommendations = inngest.createFunction(
  {
    id: "generate-recommendations",
    name: "Generate Smart Recommendations",
    retries: 1,
    concurrency: { limit: 3 },
  },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step }) => {
    // Fetch all orgs that have at least one goal (active users)
    const activeOrgs = await step.run("fetch-active-orgs", async () => {
      const rows = await db
        .select({ orgId: goals.orgId })
        .from(goals)
        .groupBy(goals.orgId);
      return rows.map((r) => r.orgId);
    });

    let totalGenerated = 0;

    for (const orgId of activeOrgs) {
      const count = await step.run(`generate-for-${orgId}`, async () => {
        // Expire old pending recommendations for this org
        await db
          .update(recommendations)
          .set({ status: "dismissed" })
          .where(
            and(
              eq(recommendations.orgId, orgId),
              eq(recommendations.status, "pending"),
              lt(recommendations.expiresAt, new Date()),
            ),
          );

        // Run all detectors in parallel
        const [contentGap, perfDrop, staleCampaign, topPerformer] = await Promise.all([
          detectContentGaps(orgId),
          detectPerformanceDrop(orgId),
          detectStaleCampaign(orgId),
          detectTopPerformer(orgId),
        ]);

        const newRecs = [contentGap, perfDrop, staleCampaign, topPerformer].filter(
          (r): r is Recommendation => r !== null,
        );

        if (newRecs.length === 0) return 0;

        // Check for existing pending recs of the same type to avoid duplicates
        const existingTypes = await db
          .select({ type: recommendations.type })
          .from(recommendations)
          .where(
            and(
              eq(recommendations.orgId, orgId),
              eq(recommendations.status, "pending"),
              gte(recommendations.expiresAt, new Date()),
            ),
          );

        const existingTypeSet = new Set(existingTypes.map((r) => r.type));
        const deduped = newRecs.filter((r) => !existingTypeSet.has(r.type));

        if (deduped.length === 0) return 0;

        await db.insert(recommendations).values(
          deduped.map((r) => ({
            orgId: r.orgId,
            type: r.type,
            title: r.title,
            description: r.description,
            actionType: r.actionType,
            actionPayload: r.actionPayload,
            priority: r.priority,
            expiresAt: r.expiresAt,
          })),
        );

        return deduped.length;
      });

      totalGenerated += count;
    }

    return { orgsProcessed: activeOrgs.length, recommendationsGenerated: totalGenerated };
  },
);
