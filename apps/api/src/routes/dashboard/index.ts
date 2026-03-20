import { Router } from "express";
import { db } from "@orion/db";
import {
  campaigns,
  assets,
  scheduledPosts,
  goals,
  notifications,
} from "@orion/db/schema";
import { eq, and, count, desc, gte, sql } from "drizzle-orm";

const router = Router();

// GET / — aggregated dashboard stats for the org
router.get("/", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;

    const [
      [activeCampaignsRow],
      [pendingReviewRow],
      [publishedThisWeekRow],
      [totalGoalsRow],
      recentGoalsRows,
      recentNotificationsRows,
    ] = await Promise.all([
      // activeCampaigns
      db
        .select({ value: count() })
        .from(campaigns)
        .where(and(eq(campaigns.orgId, orgId), eq(campaigns.status, "active"))),

      // pendingReview
      db
        .select({ value: count() })
        .from(assets)
        .where(and(eq(assets.orgId, orgId), eq(assets.status, "review"))),

      // publishedThisWeek
      db
        .select({ value: count() })
        .from(scheduledPosts)
        .where(
          and(
            eq(scheduledPosts.orgId, orgId),
            eq(scheduledPosts.status, "published"),
            gte(scheduledPosts.publishedAt, sql`NOW() - INTERVAL '7 days'`),
          ),
        ),

      // totalGoals
      db
        .select({ value: count() })
        .from(goals)
        .where(eq(goals.orgId, orgId)),

      // recentGoals (with campaign join for pipelineStage)
      db
        .select({
          id: goals.id,
          brandName: goals.brandName,
          type: goals.type,
          createdAt: goals.createdAt,
          pipelineStage: campaigns.pipelineStage,
          campaignId: campaigns.id,
        })
        .from(goals)
        .leftJoin(campaigns, eq(campaigns.goalId, goals.id))
        .where(eq(goals.orgId, orgId))
        .orderBy(desc(goals.createdAt))
        .limit(5),

      // recentNotifications
      db
        .select({
          id: notifications.id,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          createdAt: notifications.createdAt,
          read: notifications.read,
        })
        .from(notifications)
        .where(eq(notifications.orgId, orgId))
        .orderBy(desc(notifications.createdAt))
        .limit(5),
    ]);

    res.json({
      data: {
        activeCampaigns: activeCampaignsRow?.value ?? 0,
        pendingReview: pendingReviewRow?.value ?? 0,
        publishedThisWeek: publishedThisWeekRow?.value ?? 0,
        totalGoals: totalGoalsRow?.value ?? 0,
        recentGoals: recentGoalsRows,
        recentNotifications: recentNotificationsRows,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
