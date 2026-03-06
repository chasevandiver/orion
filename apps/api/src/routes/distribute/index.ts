/**
 * Distribution routes — manage scheduled posts and trigger publishing.
 *
 * GET  /distribute              — list scheduled posts for the org
 * POST /distribute              — schedule a new post
 * POST /distribute/:id/publish  — immediately publish a post via DistributionAgent
 * GET  /distribute/connections  — list active channel connections
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { scheduledPosts, assets, channelConnections } from "@orion/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { DistributionAgent } from "@orion/agents";
import { logger } from "../../lib/logger.js";

export const distributeRouter = Router();

const createPostSchema = z.object({
  assetId: z.string().uuid().optional(),
  channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"]),
  contentText: z.string().min(1).max(63206),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledFor: z.string().datetime(),
});

// GET /distribute — list scheduled posts (upcoming + recent)
distributeRouter.get("/", async (req, res, next) => {
  try {
    const { status, channel } = req.query;

    const results = await db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.orgId, req.user.orgId),
        status ? eq(scheduledPosts.status, status as any) : undefined,
        channel ? eq(scheduledPosts.channel, channel as any) : undefined,
      ),
      with: {
        asset: {
          columns: {
            id: true,
            contentText: true,
            channel: true,
            status: true,
          },
        },
      },
      orderBy: desc(scheduledPosts.scheduledFor),
      limit: 100,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /distribute — schedule a new post
distributeRouter.post("/", async (req, res, next) => {
  try {
    const body = createPostSchema.parse(req.body);

    // If assetId provided, verify it belongs to this org
    if (body.assetId) {
      const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, body.assetId), eq(assets.orgId, req.user.orgId)),
      });
      if (!asset) throw new AppError(404, "Asset not found");
    }

    const [post] = await db
      .insert(scheduledPosts)
      .values({
        orgId: req.user.orgId,
        assetId: body.assetId,
        channel: body.channel,
        scheduledFor: new Date(body.scheduledFor),
        status: "scheduled",
      })
      .returning();

    logger.info({ postId: post.id, channel: post.channel }, "Scheduled post created");
    res.status(201).json({ data: post });
  } catch (err) {
    next(err);
  }
});

// GET /distribute/connections — list connected platform channels
distributeRouter.get("/connections", async (req, res, next) => {
  try {
    const connections = await db.query.channelConnections.findMany({
      where: and(
        eq(channelConnections.orgId, req.user.orgId),
        eq(channelConnections.isActive, true),
      ),
      columns: {
        id: true,
        channel: true,
        accountName: true,
        accountId: true,
        scopes: true,
        connectedAt: true,
        tokenExpiresAt: true,
        isActive: true,
        // Never expose encrypted tokens
        accessTokenEnc: false,
        refreshTokenEnc: false,
      },
    });

    res.json({ data: connections });
  } catch (err) {
    next(err);
  }
});

// GET /distribute/:id — get a single scheduled post
distributeRouter.get("/:id", async (req, res, next) => {
  try {
    const post = await db.query.scheduledPosts.findFirst({
      where: and(
        eq(scheduledPosts.id, req.params.id!),
        eq(scheduledPosts.orgId, req.user.orgId),
      ),
      with: { asset: true },
    });

    if (!post) throw new AppError(404, "Scheduled post not found");
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

// POST /distribute/:id/publish — immediately publish via DistributionAgent
distributeRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const post = await db.query.scheduledPosts.findFirst({
      where: and(
        eq(scheduledPosts.id, req.params.id!),
        eq(scheduledPosts.orgId, req.user.orgId),
      ),
      with: { asset: true },
    });

    if (!post) throw new AppError(404, "Scheduled post not found");
    if (post.status === "published") throw new AppError(400, "Post already published");
    if (post.status === "cancelled") throw new AppError(400, "Post has been cancelled");

    // Resolve content text: prefer asset text, fall back to a placeholder
    const contentText = (post as any).asset?.contentText ?? "";
    if (!contentText) {
      throw new AppError(400, "Post has no content text — link an asset or attach content");
    }

    const agent = new DistributionAgent();
    const result = await agent.publish({
      orgId: req.user.orgId,
      scheduledPostId: post.id,
      channel: post.channel,
      contentText,
    });

    if (!result.success) {
      logger.warn({ postId: post.id, error: result.error }, "Distribution failed");
      return res.status(422).json({
        error: result.error ?? "Publishing failed",
        preflight: result.preflight,
      });
    }

    logger.info(
      { postId: post.id, platformPostId: result.platformPostId },
      "Post published via DistributionAgent",
    );

    res.json({
      data: {
        postId: post.id,
        platformPostId: result.platformPostId,
        url: result.url,
        publishedAt: result.publishedAt,
      },
    });
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
      .where(
        and(
          eq(scheduledPosts.id, req.params.id!),
          eq(scheduledPosts.orgId, req.user.orgId),
        ),
      )
      .returning({ id: scheduledPosts.id });

    if (!updated) throw new AppError(404, "Scheduled post not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
