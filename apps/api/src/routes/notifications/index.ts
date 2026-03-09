import { Router } from "express";
import { db } from "@orion/db";
import { notifications } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const notificationsRouter = Router();

// GET /notifications — list unread notifications for the org (newest first, limit 20)
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const results = await db.query.notifications.findMany({
      where: eq(notifications.orgId, req.user.orgId),
      orderBy: desc(notifications.createdAt),
      limit: 20,
    });
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all — mark all notifications as read (must be before /:id/read)
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

// PATCH /notifications/:id/read — mark a notification as read
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
