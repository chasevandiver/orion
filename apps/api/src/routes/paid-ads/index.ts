/**
 * Paid Ad Sets API
 *
 * GET  /paid-ads              — list all for org
 * GET  /paid-ads/:id          — get single
 * POST /paid-ads              — create
 * PATCH /paid-ads/:id         — update content/status
 * DELETE /paid-ads/:id        — delete
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { paidAdSets } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const paidAdsRouter = Router();

const adSetSchema = z.object({
  campaignId: z.string().uuid().optional(),
  platform: z.enum(["google", "meta", "linkedin"]),
  adType: z.enum(["search", "display", "social"]),
  contentJson: z.record(z.unknown()).default({}),
  status: z.enum(["draft", "submitted", "active", "paused"]).default("draft"),
  budget: z.number().int().positive().optional(),
});

// GET /paid-ads
paidAdsRouter.get("/", async (req, res, next) => {
  try {
    const adSets = await db.query.paidAdSets.findMany({
      where: eq(paidAdSets.orgId, req.user.orgId),
      orderBy: desc(paidAdSets.createdAt),
      with: {
        campaign: { columns: { id: true, name: true } },
      },
    });
    res.json({ data: adSets });
  } catch (err) {
    next(err);
  }
});

// GET /paid-ads/:id
paidAdsRouter.get("/:id", async (req, res, next) => {
  try {
    const adSet = await db.query.paidAdSets.findFirst({
      where: and(eq(paidAdSets.id, req.params.id!), eq(paidAdSets.orgId, req.user.orgId)),
      with: { campaign: { columns: { id: true, name: true } } },
    });
    if (!adSet) throw new AppError(404, "Ad set not found");
    res.json({ data: adSet });
  } catch (err) {
    next(err);
  }
});

// POST /paid-ads
paidAdsRouter.post("/", async (req, res, next) => {
  try {
    const body = adSetSchema.parse(req.body);
    const [adSet] = await db
      .insert(paidAdSets)
      .values({ orgId: req.user.orgId, ...body })
      .returning();
    res.status(201).json({ data: adSet });
  } catch (err) {
    next(err);
  }
});

// PATCH /paid-ads/:id
paidAdsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = adSetSchema.partial().parse(req.body);
    const [updated] = await db
      .update(paidAdSets)
      .set(body)
      .where(and(eq(paidAdSets.id, req.params.id!), eq(paidAdSets.orgId, req.user.orgId)))
      .returning();
    if (!updated) throw new AppError(404, "Ad set not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /paid-ads/:id
paidAdsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(paidAdSets)
      .where(and(eq(paidAdSets.id, req.params.id!), eq(paidAdSets.orgId, req.user.orgId)))
      .returning({ id: paidAdSets.id });
    if (!deleted) throw new AppError(404, "Ad set not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
