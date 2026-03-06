import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { analyticsEvents, analyticsRollups, optimizationReports, campaigns } from "@orion/db/schema";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import { OptimizationAgent } from "@orion/agents";
import { AppError } from "../../middleware/error-handler.js";
import { requireTokenQuota } from "../../middleware/plan-guard.js";
import { trackTokenUsage, getOrgQuota } from "../../lib/usage.js";

export const analyticsRouter = Router();

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  campaignId: z.string().uuid().optional(),
  channel: z.string().optional(),
});

// GET /analytics/overview — aggregated totals for the org over a date range
analyticsRouter.get("/overview", async (req, res, next) => {
  try {
    const { from, to } = dateRangeSchema.parse(req.query);

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
      ),
      orderBy: desc(analyticsRollups.date),
    });

    const totals = rollups.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        conversions: acc.conversions + r.conversions,
        engagements: acc.engagements + r.engagements,
        spend: acc.spend + r.spend,
        revenue: acc.revenue + r.revenue,
      }),
      { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 },
    );

    res.json({ data: { totals, rollups } });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/rollups — daily rollup rows with optional campaign/channel filter
analyticsRouter.get("/rollups", async (req, res, next) => {
  try {
    const { from, to, campaignId, channel } = dateRangeSchema.parse(req.query);

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const results = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
        campaignId ? eq(analyticsRollups.campaignId, campaignId) : undefined,
        channel ? eq(analyticsRollups.channel, channel) : undefined,
      ),
      orderBy: desc(analyticsRollups.date),
      limit: 200,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/events — raw analytics events (capped at 500, defaults to last 7 days)
analyticsRouter.get("/events", async (req, res, next) => {
  try {
    const { from, to, campaignId } = dateRangeSchema.parse(req.query);

    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const results = await db.query.analyticsEvents.findMany({
      where: and(
        eq(analyticsEvents.orgId, req.user.orgId),
        gte(analyticsEvents.occurredAt, fromDate),
        lt(analyticsEvents.occurredAt, toDate),
        campaignId ? eq(analyticsEvents.campaignId, campaignId) : undefined,
      ),
      orderBy: desc(analyticsEvents.occurredAt),
      limit: 500,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/quota — current month token + post usage for the org
analyticsRouter.get("/quota", async (req, res, next) => {
  try {
    const quota = await getOrgQuota(req.user.orgId);
    res.json({ data: quota });
  } catch (err) {
    next(err);
  }
});

// POST /analytics/optimize — run OptimizationAgent on recent campaign data
analyticsRouter.post("/optimize", requireTokenQuota, async (req, res, next) => {
  try {
    const { campaignId } = z
      .object({ campaignId: z.string().uuid().optional() })
      .parse(req.body);

    // Fetch last 7 days of rollup data for context
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        gte(analyticsRollups.date, fromDate),
        campaignId ? eq(analyticsRollups.campaignId, campaignId) : undefined,
      ),
      orderBy: desc(analyticsRollups.date),
      limit: 100,
    });

    // Aggregate totals for the agent input
    const totals = rollups.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        conversions: acc.conversions + r.conversions,
        engagements: acc.engagements + r.engagements,
        spend: acc.spend + r.spend,
        revenue: acc.revenue + r.revenue,
      }),
      { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 },
    );

    // Build per-channel breakdown
    const channelMap = new Map<
      string,
      { impressions: number; clicks: number; conversions: number }
    >();
    for (const r of rollups) {
      const ch = r.channel ?? "unknown";
      const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0 };
      channelMap.set(ch, {
        impressions: prev.impressions + r.impressions,
        clicks: prev.clicks + r.clicks,
        conversions: prev.conversions + r.conversions,
      });
    }
    const channelBreakdown = Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      ...data,
      ctr:
        data.impressions > 0
          ? parseFloat(((data.clicks / data.impressions) * 100).toFixed(2))
          : 0,
    }));

    // Resolve brand name + goal type from campaign if provided
    let brandName = "ORION Campaign";
    let goalType = "growth";
    if (campaignId) {
      const campaign = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, req.user.orgId)),
        with: { goal: { columns: { type: true, brandName: true } } },
      });
      if (!campaign) throw new AppError(404, "Campaign not found");
      brandName = campaign.goal?.brandName ?? brandName;
      goalType = campaign.goal?.type ?? goalType;
    }

    const agent = new OptimizationAgent();
    const result = await agent.analyze({
      brandName,
      goalType,
      analytics: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        conversions: totals.conversions,
        engagementRate:
          totals.impressions > 0
            ? parseFloat(((totals.engagements / totals.impressions) * 100).toFixed(2))
            : 0,
        cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
        roi: totals.spend > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0,
        channelBreakdown,
      },
    });

    // Persist the optimization report
    const [report] = await db
      .insert(optimizationReports)
      .values({
        orgId: req.user.orgId,
        campaignId: campaignId ?? null,
        reportJson: { totals, channelBreakdown },
        reportText: result.text,
        modelVersion: "claude-sonnet-4-20250514",
        tokensUsed: result.tokensUsed,
      })
      .returning();

    // Track token usage against the org's monthly quota
    await trackTokenUsage(req.user.orgId, result.tokensUsed);

    res.json({ data: { reportId: report.id, report: result.text } });
  } catch (err) {
    next(err);
  }
});
