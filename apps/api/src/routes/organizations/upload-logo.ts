import { Router } from "express";
import multer from "multer";
import { db } from "@orion/db";
import { organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { uploadLogo } from "../../lib/supabase-storage.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter(_req, file, cb) {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPEG, and WebP images are allowed"));
    }
  },
});

export const uploadLogoRouter = Router();

// POST /organizations/logo — upload logo file, store in Supabase, save URL to org
uploadLogoRouter.post(
  "/logo",
  requireRole("owner", "admin"),
  upload.single("logo"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError(400, "No logo file provided");

      const logoUrl = await uploadLogo(
        req.user.orgId,
        req.file.buffer,
        req.file.mimetype,
      );

      await db
        .update(organizations)
        .set({ logoUrl })
        .where(eq(organizations.id, req.user.orgId));

      res.json({ data: { logoUrl } });
    } catch (err) {
      next(err);
    }
  },
);
