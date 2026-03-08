import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { brands } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const brandsRouter = Router();

const brandSchema = z.object({
  name: z.string().min(1).max(100),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  voiceTone: z.enum(["professional", "casual", "bold", "playful", "authoritative"]).optional(),
  targetAudience: z.string().max(500).optional(),
  products: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500),
  })).max(20).optional(),
});

// GET /brands
brandsRouter.get("/", async (req, res, next) => {
  try {
    const results = await db.query.brands.findMany({
      where: eq(brands.orgId, req.user.orgId),
      orderBy: (b, { desc }) => [desc(b.createdAt)],
    });
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// GET /brands/:id
brandsRouter.get("/:id", async (req, res, next) => {
  try {
    const brand = await db.query.brands.findFirst({
      where: and(eq(brands.id, req.params.id!), eq(brands.orgId, req.user.orgId)),
    });
    if (!brand) throw new AppError(404, "Brand not found");
    res.json({ data: brand });
  } catch (err) {
    next(err);
  }
});

// POST /brands
brandsRouter.post("/", async (req, res, next) => {
  try {
    const body = brandSchema.parse(req.body);
    const [brand] = await db
      .insert(brands)
      .values({
        orgId: req.user.orgId,
        ...body,
        logoUrl: body.logoUrl || null,
        websiteUrl: body.websiteUrl || null,
        products: body.products ?? [],
      })
      .returning();
    res.status(201).json({ data: brand });
  } catch (err) {
    next(err);
  }
});

// PATCH /brands/:id
brandsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = brandSchema.partial().parse(req.body);
    const [updated] = await db
      .update(brands)
      .set({
        ...body,
        logoUrl: body.logoUrl === "" ? null : body.logoUrl,
        websiteUrl: body.websiteUrl === "" ? null : body.websiteUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(brands.id, req.params.id!), eq(brands.orgId, req.user.orgId)))
      .returning();
    if (!updated) throw new AppError(404, "Brand not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /brands/:id
brandsRouter.delete("/:id", async (req, res, next) => {
  try {
    await db
      .delete(brands)
      .where(and(eq(brands.id, req.params.id!), eq(brands.orgId, req.user.orgId)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
