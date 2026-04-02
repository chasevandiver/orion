import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { analyticsEvents, analyticsRollups, optimizationReports, campaigns, hashtagPerformance, organizations, contacts } from "@orion/db/schema";
import { eq, and, desc, gte, lt, inArray, sql } from "drizzle-orm";
import { OptimizationAgent } from "@orion/agents";
import { AppError } from "../../middleware/error-handler.js";
import { requireTokenQuota } from "../../middleware/plan-guard.js";
import { trackTokenUsage, getOrgQuota } from "../../lib/usage.js";
import { buildClientReportPDF, type ReportSettings } from "../../lib/pdf-report.js";

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

// GET /analytics/export — CSV export for analytics rollups
analyticsRouter.get("/export", async (req, res, next) => {
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
      limit: 5000,
    });

    // Campaign name lookup
    const campaignIds = [...new Set(rollups.map((r) => r.campaignId).filter(Boolean))] as string[];
    const campaignNameMap = new Map<string, string>();
    if (campaignIds.length > 0) {
      const camps = await db.query.campaigns.findMany({
        where: and(eq(campaigns.orgId, req.user.orgId), inArray(campaigns.id, campaignIds)),
        columns: { id: true, name: true },
      });
      camps.forEach((c) => campaignNameMap.set(c.id, c.name));
    }

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["id", "date", "channel", "campaignId", "campaignName", "impressions", "clicks", "conversions", "engagements", "spend", "revenue", "isSimulated"];
    const rows = rollups.map((r) => [
      r.id,
      r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      r.channel ?? "",
      r.campaignId ?? "",
      r.campaignId ? (campaignNameMap.get(r.campaignId) ?? "") : "",
      String(r.impressions),
      String(r.clicks),
      String(r.conversions),
      String(r.engagements),
      r.spend.toFixed(4),
      r.revenue.toFixed(4),
      r.isSimulated ? "true" : "false",
    ]);

    const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="analytics-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
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

// GET /analytics/hashtags — org hashtag performance sorted by engagement rate
analyticsRouter.get("/hashtags", async (req, res, next) => {
  try {
    const { channel } = z.object({ channel: z.string().optional() }).parse(req.query);

    const rows = await db.query.hashtagPerformance.findMany({
      where: and(
        eq(hashtagPerformance.orgId, req.user.orgId),
        channel ? eq(hashtagPerformance.channel, channel) : undefined,
      ),
      orderBy: desc(hashtagPerformance.avgEngagementRate),
      limit: 100,
    });

    res.json({ data: rows });
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

// GET /analytics/posting-times — best posting time per channel, stored on the org.
// Populated by the optimization agent after each analysis run.
analyticsRouter.get("/posting-times", async (req, res, next) => {
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, req.user.orgId),
      columns: { bestPostingTimes: true },
    });

    res.json({ data: org?.bestPostingTimes ?? [] });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/budget — monthly budget utilization, per-campaign spend, per-channel spend
analyticsRouter.get("/budget", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Org monthly budget
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { monthlyMarketingBudget: true },
    });
    const monthlyBudget = org?.monthlyMarketingBudget ?? null;

    // Active/recent campaigns for this month
    const allCampaigns = await db.query.campaigns.findMany({
      where: eq(campaigns.orgId, orgId),
      columns: { id: true, name: true, budget: true, actualSpend: true, spendByChannel: true, startDate: true, endDate: true },
      orderBy: desc(campaigns.createdAt),
      limit: 100,
    });

    // Analytics rollups this month for lead/conversion counts per campaign
    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, orgId),
        gte(analyticsRollups.date, monthStart),
        lt(analyticsRollups.date, monthEnd),
      ),
    });

    // Aggregate leads (conversions) per campaign from rollups
    const conversionsByCampaign = new Map<string, number>();
    const impressionsByCampaign = new Map<string, number>();
    for (const r of rollups) {
      if (!r.campaignId) continue;
      conversionsByCampaign.set(r.campaignId, (conversionsByCampaign.get(r.campaignId) ?? 0) + r.conversions);
      impressionsByCampaign.set(r.campaignId, (impressionsByCampaign.get(r.campaignId) ?? 0) + r.impressions);
    }

    // Build per-campaign spend rows
    const spendByCampaign = allCampaigns
      .filter((c) => (c.actualSpend ?? 0) > 0 || (c.budget ?? 0) > 0)
      .map((c) => {
        const leads = conversionsByCampaign.get(c.id) ?? 0;
        const spend = c.actualSpend ?? 0;
        const costPerLead = leads > 0 && spend > 0 ? Number((spend / leads).toFixed(2)) : null;
        return {
          campaignId: c.id,
          campaignName: c.name,
          budgetAllocated: c.budget ?? null,
          actualSpend: spend,
          leads,
          costPerLead,
          spendByChannel: (c.spendByChannel as Record<string, number> | null) ?? {},
        };
      })
      .sort((a, b) => b.actualSpend - a.actualSpend);

    // Total spend this month: sum all actualSpend across campaigns
    const totalSpendThisMonth = spendByCampaign.reduce((s, c) => s + c.actualSpend, 0);

    // Aggregate per-channel spend across all campaigns
    const channelSpendMap = new Map<string, number>();
    for (const c of spendByCampaign) {
      for (const [ch, amount] of Object.entries(c.spendByChannel ?? {})) {
        channelSpendMap.set(ch, (channelSpendMap.get(ch) ?? 0) + amount);
      }
    }
    const spendByChannel = Array.from(channelSpendMap.entries())
      .map(([channel, spend]) => ({ channel, spend }))
      .sort((a, b) => b.spend - a.spend);

    // Org-level cost per lead and cost per conversion
    const totalLeads = spendByCampaign.reduce((s, c) => s + c.leads, 0);
    const costPerLead = totalLeads > 0 && totalSpendThisMonth > 0
      ? Number((totalSpendThisMonth / totalLeads).toFixed(2))
      : null;

    // Projected end-of-month: linear extrapolation based on days elapsed
    const daysInMonth = monthEnd.getTime() === monthStart.getTime() ? 30
      : (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24);
    const daysElapsed = Math.max(1, (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
    const projectedSpend = daysElapsed < daysInMonth
      ? Number(((totalSpendThisMonth / daysElapsed) * daysInMonth).toFixed(2))
      : totalSpendThisMonth;

    res.json({
      data: {
        monthlyBudget,
        totalSpendThisMonth: Number(totalSpendThisMonth.toFixed(2)),
        projectedMonthlySpend: projectedSpend,
        spendByCampaign,
        spendByChannel,
        costPerLead,
        costPerConversion: costPerLead, // same metric for now — conversions tracked in rollups
        budgetUtilizationPct: monthlyBudget && monthlyBudget > 0
          ? Number(((totalSpendThisMonth / monthlyBudget) * 100).toFixed(1))
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/attribution — revenue attribution by campaign, channel, and pipeline
analyticsRouter.get("/attribution", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all converted customers for this org
    const customers = await db.query.contacts.findMany({
      where: and(
        eq(contacts.orgId, orgId),
        eq(contacts.status, "customer"),
      ),
      with: {
        sourceCampaign: { columns: { id: true, name: true, budget: true } },
      },
    });

    // Revenue by campaign
    const campaignMap = new Map<string, {
      campaignId: string;
      campaignName: string;
      revenue: number;
      customerCount: number;
      budget: number | null;
    }>();

    let totalRevenueThisMonth = 0;

    for (const c of customers) {
      const rev = c.revenue ?? 0;
      const campaignId = c.sourceCampaignId;
      const closedThisMonth = c.dealClosedAt && c.dealClosedAt >= monthStart;

      if (closedThisMonth) {
        totalRevenueThisMonth += rev;
      }

      if (campaignId) {
        const existing = campaignMap.get(campaignId);
        if (existing) {
          existing.revenue += rev;
          existing.customerCount += 1;
        } else {
          const camp = (c as any).sourceCampaign;
          campaignMap.set(campaignId, {
            campaignId,
            campaignName: camp?.name ?? "Unknown Campaign",
            revenue: rev,
            customerCount: 1,
            budget: camp?.budget ?? null,
          });
        }
      }
    }

    const revenueByCampaign = Array.from(campaignMap.values())
      .map((r) => ({
        ...r,
        costPerAcquisition: r.budget && r.customerCount > 0
          ? Number((r.budget / r.customerCount).toFixed(2))
          : null,
        roi: r.budget && r.budget > 0
          ? Number((((r.revenue - r.budget) / r.budget) * 100).toFixed(1))
          : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Revenue by channel
    const channelMap = new Map<string, { channel: string; revenue: number; customerCount: number }>();
    for (const c of customers) {
      const ch = c.sourceChannel ?? "unknown";
      const rev = c.revenue ?? 0;
      const existing = channelMap.get(ch);
      if (existing) {
        existing.revenue += rev;
        existing.customerCount += 1;
      } else {
        channelMap.set(ch, { channel: ch, revenue: rev, customerCount: 1 });
      }
    }
    const revenueByChannel = Array.from(channelMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    // Pipeline value — sum of estimated revenue from warm + hot contacts
    const pipelineContacts = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalScore: sql<number>`coalesce(sum(lead_score), 0)::int`,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          inArray(contacts.status, ["warm", "hot"]),
        ),
      );

    // Use average customer revenue as multiplier for pipeline estimation
    const totalCustomerRevenue = customers.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const avgDealSize = customers.length > 0
      ? totalCustomerRevenue / customers.length
      : 0;
    const pipelineCount = pipelineContacts[0]?.count ?? 0;
    const pipelineValue = Math.round(pipelineCount * avgDealSize);

    res.json({
      data: {
        totalRevenueThisMonth,
        totalRevenue: totalCustomerRevenue,
        totalCustomers: customers.length,
        avgDealSize: Number(avgDealSize.toFixed(2)),
        revenueByCampaign,
        revenueByChannel,
        pipelineValue,
        pipelineLeadCount: pipelineCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /analytics/monthly-report — generate a PDF report across all campaigns for the month
analyticsRouter.get("/monthly-report", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();

    // Default to current month, but allow custom date range
    const { from, to } = req.query;
    const fromDate = from
      ? new Date(from as string)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to
      ? new Date(to as string)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    // Fetch all active/completed campaigns for this org in the date range
    const allCampaigns = await db.query.campaigns.findMany({
      where: and(
        eq(campaigns.orgId, orgId),
        inArray(campaigns.status, ["active", "completed", "paused"]),
      ),
      with: {
        goal: true,
        strategy: true,
        assets: { orderBy: (a: any, { desc: d }: any) => [d(a.createdAt)] },
      },
      orderBy: desc(campaigns.createdAt),
      limit: 20,
    });

    // Fetch all rollups for the date range
    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, orgId),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
      ),
    });

    const reportSettings: ReportSettings = {
      logoUrl: org?.reportLogoUrl || org?.logoUrl || undefined,
      accentColor: org?.reportAccentColor || org?.brandPrimaryColor || undefined,
      sections: (org?.reportSections as string[] | null) ?? undefined,
      footerText: org?.reportFooterText || undefined,
      orgName: org?.name ?? "",
    };

    const monthLabel = fromDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const pdfBuffer = await buildClientReportPDF({
      campaigns: allCampaigns,
      rollups,
      fromDate,
      toDate,
      settings: reportSettings,
      title: `Monthly Marketing Report — ${monthLabel}`,
    });

    const slug = (org?.name ?? "org").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const monthSlug = fromDate.toISOString().slice(0, 7);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="monthly-report-${slug}-${monthSlug}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
