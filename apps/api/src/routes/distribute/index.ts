import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { scheduledPosts, assets } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { DistributionAgent } from "@orion/agents";

export const distributeRouter = Router();

// GET /distribute — list scheduled posts for the org
distributeRouter.get("/", async (req, res, next) => {
  try {
    const { status, assetId } = req.query;

    const results = await db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.orgId, req.user.orgId),
        status ? eq(scheduledPosts.status, status as string) : undefined,
        assetId ? eq(scheduledPosts.assetId, assetId as string) : undefined,
      ),
      orderBy: desc(scheduledPosts.scheduledFor),
      with: {
        asset: {
          columns: { id: true, channel: true, contentText: true, compositedImageUrl: true },
        },
      },
      limit: 100,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /distribute — manually schedule a post
distributeRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      assetId: z.string().uuid().optional(),
      channel: z.enum(["linkedin","twitter","instagram","facebook","tiktok","email","blog","website"]),
      scheduledFor: z.string().datetime(),
      contentText: z.string().optional(),
    }).parse(req.body);

    const [post] = await db
      .insert(scheduledPosts)
      .values({
        orgId: req.user.orgId,
        assetId: body.assetId ?? null,
        channel: body.channel,
        scheduledFor: new Date(body.scheduledFor),
        status: "scheduled",
      })
      .returning();

    res.status(201).json({ data: post });
  } catch (err) {
    next(err);
  }
});

// GET /distribute/:id — get a scheduled post
distributeRouter.get("/:id", async (req, res, next) => {
  try {
    const post = await db.query.scheduledPosts.findFirst({
      where: and(eq(scheduledPosts.id, req.params.id!), eq(scheduledPosts.orgId, req.user.orgId)),
      with: { asset: true },
    });
    if (!post) throw new AppError(404, "Scheduled post not found");
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

// PATCH /distribute/:id — reschedule or update a post
distributeRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({
      scheduledFor: z.string().datetime().optional(),
      status: z.enum(["scheduled","cancelled"]).optional(),
    }).parse(req.body);

    const [updated] = await db
      .update(scheduledPosts)
      .set({
        ...(body.scheduledFor ? { scheduledFor: new Date(body.scheduledFor) } : {}),
        ...(body.status ? { status: body.status } : {}),
      })
      .where(and(eq(scheduledPosts.id, req.params.id!), eq(scheduledPosts.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Scheduled post not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /distribute/:id/publish — immediately publish a scheduled post
// Body: { force?: boolean } — when force=true, skip preflight (Publish Anyway)
distributeRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const { force } = z.object({ force: z.boolean().default(false) }).parse(req.body ?? {});

    const post = await db.query.scheduledPosts.findFirst({
      where: and(eq(scheduledPosts.id, req.params.id!), eq(scheduledPosts.orgId, req.user.orgId)),
      with: { asset: { columns: { contentText: true, campaignId: true, compositedImageUrl: true, imageUrl: true } } },
    });

    if (!post) throw new AppError(404, "Scheduled post not found");

    const contentText = (post as any).asset?.contentText ?? "";
    if (!contentText) throw new AppError(400, "No content text associated with this post");

    const imageUrl: string | null =
      (post as any).asset?.compositedImageUrl ?? (post as any).asset?.imageUrl ?? null;

    // If this is a "Publish Anyway" override, reset status back to scheduled first
    if (force && post.status === "preflight_failed") {
      await db
        .update(scheduledPosts)
        .set({ status: "scheduled", preflightStatus: null, preflightErrors: [] })
        .where(eq(scheduledPosts.id, post.id));
    }

    const agent = new DistributionAgent();
    const result = await agent.publish({
      orgId: req.user.orgId,
      scheduledPostId: post.id,
      channel: post.channel,
      contentText,
      mediaUrls: imageUrl ? [imageUrl] : undefined,
      campaignId: (post as any).asset?.campaignId ?? undefined,
      assetId: post.assetId ?? undefined,
      force,
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /distribute/:id — update status of a scheduled post (e.g. cancel)
distributeRouter.patch("/:id", async (req, res, next) => {
  try {
    const { status } = z
      .object({ status: z.enum(["scheduled", "cancelled"]) })
      .parse(req.body);

    const [updated] = await db
      .update(scheduledPosts)
      .set({ status })
      .where(and(eq(scheduledPosts.id, req.params.id!), eq(scheduledPosts.orgId, req.user.orgId)))
      .returning({ id: scheduledPosts.id });

    if (!updated) throw new AppError(404, "Scheduled post not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /distribute/:id — cancel a scheduled post
distributeRouter.delete("/:id", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(scheduledPosts)
      .set({ status: "cancelled" })
      .where(and(eq(scheduledPosts.id, req.params.id!), eq(scheduledPosts.orgId, req.user.orgId)))
      .returning({ id: scheduledPosts.id });

    if (!updated) throw new AppError(404, "Scheduled post not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
