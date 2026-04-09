/**
 * Tracking Links API
 *
 * GET /tracking-links         — list all for org, sorted by click count
 * GET /tracking-links/:id     — get single link
 */
import { Router } from "express";
import { db } from "@orion/db";
import { trackingLinks } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const trackingLinksRouter = Router();

// GET /tracking-links
trackingLinksRouter.get("/", async (req, res, next) => {
  try {
    const links = await db.query.trackingLinks.findMany({
      where: eq(trackingLinks.orgId, req.user.orgId),
      orderBy: [desc(trackingLinks.clickCount), desc(trackingLinks.createdAt)],
      with: {
        campaign: { columns: { id: true, name: true } },
      },
      limit: 200,
    });
    res.json({ data: links });
  } catch (err) {
    next(err);
  }
});

// GET /tracking-links/:id
trackingLinksRouter.get("/:id", async (req, res, next) => {
  try {
    const link = await db.query.trackingLinks.findFirst({
      where: eq(trackingLinks.id, req.params.id!),
      with: { campaign: { columns: { id: true, name: true } } },
    });
    if (!link || link.orgId !== req.user.orgId) throw new AppError(404, "Tracking link not found");
    res.json({ data: link });
  } catch (err) {
    next(err);
  }
});
