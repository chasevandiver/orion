/**
 * Landing Pages API
 *
 * GET  /landing-pages              — list all for org
 * GET  /landing-pages/:id          — get single
 * POST /landing-pages              — create (manual, not pipeline-generated)
 * PATCH /landing-pages/:id         — update title/slug/meta
 * POST /landing-pages/:id/publish  — set publishedAt + generate shareToken
 * DELETE /landing-pages/:id        — delete
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import crypto from "crypto";

export const landingPagesRouter = Router();

// GET /landing-pages
landingPagesRouter.get("/", async (req, res, next) => {
  try {
    const pages = await db.query.landingPages.findMany({
      where: eq(landingPages.orgId, req.user.orgId),
      orderBy: desc(landingPages.createdAt),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true } },
      },
    });
    res.json({ data: pages });
  } catch (err) {
    next(err);
  }
});

// GET /landing-pages/:id
landingPagesRouter.get("/:id", async (req, res, next) => {
  try {
    const page = await db.query.landingPages.findFirst({
      where: and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true, status: true } },
      },
    });
    if (!page) throw new AppError(404, "Landing page not found");
    res.json({ data: page });
  } catch (err) {
    next(err);
  }
});

// POST /landing-pages
landingPagesRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
      goalId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      contentJson: z.record(z.unknown()).default({}),
      metaTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(155).optional(),
    }).parse(req.body);

    const [page] = await db
      .insert(landingPages)
      .values({ orgId: req.user.orgId, ...body })
      .returning();

    res.status(201).json({ data: page });
  } catch (err) {
    next(err);
  }
});

// PATCH /landing-pages/:id
landingPagesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
      contentJson: z.record(z.unknown()).optional(),
      metaTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(155).optional(),
    }).parse(req.body);

    const [updated] = await db
      .update(landingPages)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Landing page not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /landing-pages/:id/publish — publish + generate share token
landingPagesRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const shareToken = crypto.randomBytes(20).toString("base64url");

    const [updated] = await db
      .update(landingPages)
      .set({
        publishedAt: new Date(),
        shareToken,
        updatedAt: new Date(),
      })
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Landing page not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /landing-pages/:id
landingPagesRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(landingPages)
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning({ id: landingPages.id });

    if (!deleted) throw new AppError(404, "Landing page not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
