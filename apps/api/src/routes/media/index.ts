/**
 * Media library routes.
 *
 * GET  /media              — list org media (filter: ?tags=product,team  &q=filename)
 * POST /media/upload       — multipart upload; saves to Supabase `media` bucket
 * PATCH /media/:id         — update tags / altText
 * DELETE /media/:id        — soft delete (sets deleted_at)
 */

import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "@orion/db";
import { mediaAssets } from "@orion/db/schema";
import { eq, and, isNull, sql, or, ilike } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { uploadMediaAsset, getImageDimensions } from "../../lib/supabase-storage.js";

export const mediaRouter = Router();

const ALLOWED_MIME = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "image/svg+xml", "image/avif",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: PNG, JPEG, WebP, GIF, SVG, AVIF."));
    }
  },
});

// GET /media
mediaRouter.get("/", async (req, res, next) => {
  try {
    const { tags, q } = req.query as { tags?: string; q?: string };

    const rows = await db.query.mediaAssets.findMany({
      where: and(
        eq(mediaAssets.orgId, req.user.orgId),
        isNull(mediaAssets.deletedAt),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    // Client-side tag + filename filtering (tables are small for an org)
    let results = rows;
    if (tags) {
      const wanted = tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      results = results.filter((r) => {
        const assetTags = (r.tags as string[] | null) ?? [];
        return wanted.some((w) => assetTags.map((t) => t.toLowerCase()).includes(w));
      });
    }
    if (q) {
      const query = q.toLowerCase();
      results = results.filter((r) => r.filename.toLowerCase().includes(query));
    }

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /media/upload
mediaRouter.post(
  "/upload",
  requireRole("owner", "admin", "editor"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError(400, "No file provided");

      const { tags, altText } = z
        .object({
          tags: z.string().optional(), // comma-separated
          altText: z.string().max(500).optional(),
        })
        .parse(req.body);

      const tagList: string[] = tags
        ? tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];

      const url = await uploadMediaAsset(
        req.user.orgId,
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype,
      );

      const dims = getImageDimensions(req.file.buffer, req.file.mimetype);

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          orgId: req.user.orgId,
          filename: req.file.originalname,
          url,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          tags: tagList,
          altText: altText || null,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          uploadedBy: req.user.id,
        })
        .returning();

      res.status(201).json({ data: asset });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /media/:id
mediaRouter.patch(
  "/:id",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          tags: z.array(z.string().max(50)).max(20).optional(),
          altText: z.string().max(500).nullable().optional(),
        })
        .parse(req.body);

      const existing = await db.query.mediaAssets.findFirst({
        where: and(
          eq(mediaAssets.id, req.params.id!),
          eq(mediaAssets.orgId, req.user.orgId),
          isNull(mediaAssets.deletedAt),
        ),
      });
      if (!existing) throw new AppError(404, "Media asset not found");

      const updates: Record<string, unknown> = {};
      if (body.tags !== undefined) updates.tags = body.tags.map((t) => t.toLowerCase());
      if (body.altText !== undefined) updates.altText = body.altText;

      const [updated] = await db
        .update(mediaAssets)
        .set(updates)
        .where(eq(mediaAssets.id, req.params.id!))
        .returning();

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /media/:id
mediaRouter.delete(
  "/:id",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const existing = await db.query.mediaAssets.findFirst({
        where: and(
          eq(mediaAssets.id, req.params.id!),
          eq(mediaAssets.orgId, req.user.orgId),
          isNull(mediaAssets.deletedAt),
        ),
      });
      if (!existing) throw new AppError(404, "Media asset not found");

      await db
        .update(mediaAssets)
        .set({ deletedAt: new Date() })
        .where(eq(mediaAssets.id, req.params.id!));

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
