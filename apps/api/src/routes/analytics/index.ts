import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { analyticsEvents, analyticsRollups, optimizationReports, campaigns } from "@orion/db/schema";
import { eq, and, desc, gte, lt, inArray } from "drizzle-orm";
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

type MetricTotals = { impressions: number; clicks: number; conversions: number; engagements: number; spend: number; revenue: number };

// Helper to sum rollup rows into metric totals
function sumRollups(rows: MetricTotals[]): MetricTotals {
  return rows.reduce(
    (acc: MetricTotals, r: MetricTotals) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + r.conversions,
      engagements: acc.engagements + r.engagements,
      spend: acc.spend + r.spend,
      revenue: acc.revenue + r.revenue,
    }),
    { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 },
  );
}

// GET /analytics/overview — aggregated totals for the org over a date range
// Returns combined, real, and simulated metric breakdowns.
analyticsRouter.get("/overview", async (req, res, next) => {
  try {
    const { from, to, campaignId } = dateRangeSchema.parse(req.query);

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
        campaignId ? eq(analyticsRollups.campaignId, campaignId) : undefined,
      ),
      orderBy: desc(analyticsRollups.date),
    });

    const realRollups = rollups.filter((r) => !r.isSimulated);
    const simulatedRollups = rollups.filter((r) => r.isSimulated);

    const realMetrics = sumRollups(realRollups);
    const simulatedMetrics = sumRollups(simulatedRollups);
    const combinedMetrics = sumRollups(rollups);

    res.json({
      data: {
        totals: combinedMetrics,          // backward-compat alias
        rollups,
        realMetrics,
        simulatedMetrics,
        combinedMetrics,
        hasSimulatedData: simulatedRollups.length > 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/campaigns/:campaignId — campaign-scoped performance overview
analyticsRouter.get("/campaigns/:campaignId", async (req, res, next) => {
  try {
    const campaignId = req.params.campaignId!;

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, req.user.orgId)),
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        eq(analyticsRollups.campaignId, campaignId),
        gte(analyticsRollups.date, fromDate),
      ),
      orderBy: desc(analyticsRollups.date),
    });

    const hasSimulatedData = rollups.some((r) => r.isSimulated);
    const realRollups = rollups.filter((r) => !r.isSimulated);
    const combined = sumRollups(rollups);
    const real = sumRollups(realRollups);

    // Use real metrics if available, otherwise fall back to combined for health score
    const metricsForScore = real.impressions > 0 ? real : combined;
    const ctr = metricsForScore.impressions > 0
      ? (metricsForScore.clicks / metricsForScore.impressions) * 100
      : 0;
    const convRate = metricsForScore.clicks > 0
      ? (metricsForScore.conversions / metricsForScore.clicks) * 100
      : 0;
    const engRate = metricsForScore.impressions > 0
      ? (metricsForScore.engagements / metricsForScore.impressions) * 100
      : 0;

    // Simple health score: weighted average of CTR, conv rate, eng rate vs benchmarks
    const BENCHMARKS = { ctr: 2.0, conv: 1.5, eng: 3.0 };
    const ctrScore = Math.min(100, (ctr / BENCHMARKS.ctr) * 60);
    const convScore = Math.min(100, (convRate / BENCHMARKS.conv) * 20);
    const engScore = Math.min(100, (engRate / BENCHMARKS.eng) * 20);
    const healthScore = rollups.length > 0 ? Math.round(ctrScore + convScore + engScore) : 0;

    // Per-channel breakdown
    const channelMap = new Map<string, { impressions: number; clicks: number; conversions: number; isSimulated: boolean }>();
    for (const r of rollups) {
      const ch = r.channel ?? "unknown";
      const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0, isSimulated: r.isSimulated };
      channelMap.set(ch, {
        impressions: prev.impressions + r.impressions,
        clicks: prev.clicks + r.clicks,
        conversions: prev.conversions + r.conversions,
        isSimulated: prev.isSimulated || r.isSimulated,
      });
    }

    const CHANNEL_BENCHMARKS: Record<string, number> = {
      linkedin: 0.025, twitter: 0.018, instagram: 0.022,
      facebook: 0.015, email: 0.025, blog: 0.01,
    };

    const channelPerformance = Array.from(channelMap.entries()).map(([channel, data]) => {
      const chCtr = data.impressions > 0 ? data.clicks / data.impressions : 0;
      const benchmark = CHANNEL_BENCHMARKS[channel] ?? 0.02;
      const status: "above" | "on_track" | "below" =
        chCtr >= benchmark * 1.1 ? "above" : chCtr >= benchmark * 0.8 ? "on_track" : "below";
      return { channel, impressions: data.impressions, clicks: data.clicks, ctr: chCtr, benchmark, status, isSimulated: data.isSimulated };
    });

    res.json({
      data: {
        hasData: rollups.length > 0,
        hasSimulatedData,
        healthScore,
        letterGrade: healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 70 ? "C" : healthScore >= 60 ? "D" : "F",
        channelPerformance,
        combinedMetrics: combined,
        realMetrics: real,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/variant-comparison?assetIdA=X&assetIdB=Y
analyticsRouter.get("/variant-comparison", async (req, res, next) => {
  try {
    const { assetIdA, assetIdB } = z
      .object({ assetIdA: z.string().uuid(), assetIdB: z.string().uuid() })
      .parse(req.query);

    const events = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.orgId, req.user.orgId),
          inArray(analyticsEvents.assetId, [assetIdA, assetIdB]),
        ),
      );

    function computeStats(assetId: string) {
      const ev = events.filter((e) => e.assetId === assetId);
      const impressions = Math.round(ev.filter((e) => e.eventType === "impression").reduce((s, e) => s + e.value, 0));
      const clicks      = Math.round(ev.filter((e) => e.eventType === "click").reduce((s, e) => s + e.value, 0));
      const engagements = Math.round(ev.filter((e) => e.eventType === "engagement").reduce((s, e) => s + e.value, 0));
      const ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;
      return { assetId, impressions, clicks, engagements, ctr };
    }

    const variantA = computeStats(assetIdA);
    const variantB = computeStats(assetIdB);

    const minImpressions = Math.min(variantA.impressions, variantB.impressions);
    const confidence: "low" | "medium" | "high" =
      minImpressions > 200 ? "high" : minImpressions > 50 ? "medium" : "low";

    const ctrDiff = Math.abs(variantA.ctr - variantB.ctr);
    const winner: "a" | "b" | "inconclusive" =
      ctrDiff < 0.5
        ? "inconclusive"
        : variantA.ctr > variantB.ctr
        ? "a"
        : "b";

    const note =
      winner === "inconclusive"
        ? `CTR difference of ${ctrDiff.toFixed(2)}% is below the 0.5% threshold — too close to call.`
        : `Variant ${winner.toUpperCase()} leads by ${ctrDiff.toFixed(2)}% CTR (${confidence} confidence based on ${minImpressions} impressions per variant).`;

    res.json({ data: { variantA, variantB, winner, confidence, note } });
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
        modelVersion: "claude-sonnet-4-6",
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

// POST /analytics/reports — persist a client-side report (e.g. "Save Report" button)
analyticsRouter.post("/reports", async (req, res, next) => {
  try {
    const { campaignId, reportJson, reportText } = z
      .object({
        campaignId: z.string().uuid().optional(),
        reportJson: z.record(z.unknown()),
        reportText: z.string().optional(),
      })
      .parse(req.body);

    const [saved] = await db
      .insert(optimizationReports)
      .values({
        orgId: req.user.orgId,
        campaignId: campaignId ?? null,
        reportJson,
        reportText: reportText ?? "",
        modelVersion: "client-saved",
        tokensUsed: 0,
      })
      .returning({ id: optimizationReports.id });

    res.json({ data: { reportId: saved!.id } });
  } catch (err) {
    next(err);
  }
});
