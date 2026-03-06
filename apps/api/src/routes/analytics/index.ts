import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { analyticsEvents, analyticsRollups } from "@orion/db/schema";
import { eq, and, desc, gte, lt } from "drizzle-orm";

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
