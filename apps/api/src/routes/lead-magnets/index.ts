/**
 * Lead Magnets API
 *
 * GET  /lead-magnets              — list all for org
 * GET  /lead-magnets/:id          — get single
 * POST /lead-magnets              — create
 * PATCH /lead-magnets/:id         — update
 * POST /lead-magnets/:id/share    — generate shareToken
 * DELETE /lead-magnets/:id        — delete
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { leadMagnets } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import crypto from "crypto";

export const leadMagnetsRouter = Router();

// GET /lead-magnets
leadMagnetsRouter.get("/", async (req, res, next) => {
  try {
    const magnets = await db.query.leadMagnets.findMany({
      where: eq(leadMagnets.orgId, req.user.orgId),
      orderBy: desc(leadMagnets.createdAt),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true } },
      },
    });
    res.json({ data: magnets });
  } catch (err) {
    next(err);
  }
});

// GET /lead-magnets/:id
leadMagnetsRouter.get("/:id", async (req, res, next) => {
  try {
    const magnet = await db.query.leadMagnets.findFirst({
      where: and(eq(leadMagnets.id, req.params.id!), eq(leadMagnets.orgId, req.user.orgId)),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true } },
      },
    });
    if (!magnet) throw new AppError(404, "Lead magnet not found");
    res.json({ data: magnet });
  } catch (err) {
    next(err);
  }
});

// POST /lead-magnets
leadMagnetsRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      magnetType: z.enum(["ebook", "checklist", "template", "webinar", "quiz"]),
      title: z.string().min(1).max(200),
      goalId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      contentJson: z.record(z.unknown()).default({}),
    }).parse(req.body);

    const [magnet] = await db
      .insert(leadMagnets)
      .values({ orgId: req.user.orgId, ...body })
      .returning();
    res.status(201).json({ data: magnet });
  } catch (err) {
    next(err);
  }
});

// PATCH /lead-magnets/:id
leadMagnetsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      contentJson: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const [updated] = await db
      .update(leadMagnets)
      .set(body)
      .where(and(eq(leadMagnets.id, req.params.id!), eq(leadMagnets.orgId, req.user.orgId)))
      .returning();
    if (!updated) throw new AppError(404, "Lead magnet not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /lead-magnets/:id/share — generate public share token
leadMagnetsRouter.post("/:id/share", async (req, res, next) => {
  try {
    const shareToken = crypto.randomBytes(20).toString("base64url");
    const [updated] = await db
      .update(leadMagnets)
      .set({ shareToken })
      .where(and(eq(leadMagnets.id, req.params.id!), eq(leadMagnets.orgId, req.user.orgId)))
      .returning();
    if (!updated) throw new AppError(404, "Lead magnet not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /lead-magnets/:id
leadMagnetsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(leadMagnets)
      .where(and(eq(leadMagnets.id, req.params.id!), eq(leadMagnets.orgId, req.user.orgId)))
      .returning({ id: leadMagnets.id });
    if (!deleted) throw new AppError(404, "Lead magnet not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
