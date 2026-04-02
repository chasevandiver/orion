import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { notifications } from "@orion/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const notificationsRouter = Router();

// GET /notifications — list notifications for the org
// Query params:
//   ?unread=true   — only unread notifications
//   ?page=1        — 1-based page number (default 1)
//   ?limit=20      — items per page (default 20, max 100)
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const { unread, page, limit } = z
      .object({
        unread: z.enum(["true", "false"]).optional(),
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const offset = (page - 1) * limit;

    const results = await db.query.notifications.findMany({
      where: and(
        eq(notifications.orgId, req.user.orgId),
        unread === "true" ? eq(notifications.read, false) : undefined,
      ),
      orderBy: desc(notifications.createdAt),
      limit,
      offset,
    });

    const countRows = await db
      .select({ unreadCount: count() })
      .from(notifications)
      .where(and(eq(notifications.orgId, req.user.orgId), eq(notifications.read, false)));
    const unreadCount = countRows[0]?.unreadCount ?? 0;

    res.json({ data: results, meta: { page, limit, unreadCount } });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all — must be before /:id/read to avoid route conflict
notificationsRouter.patch("/read-all", async (req, res, next) => {
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.orgId, req.user.orgId));

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read — mark a single notification as read
notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id!), eq(notifications.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Notification not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
