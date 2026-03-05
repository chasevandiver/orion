import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { assets } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { ContentCreatorAgent } from "@orion/agents";
import { rateLimit } from "express-rate-limit";

export const assetsRouter = Router();

// Stricter rate limit for AI generation endpoints
const generationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many generation requests. Please wait." },
  keyGenerator: (req) => req.user.id,
});

const generateSchema = z.object({
  campaignId: z.string().uuid().optional(),
  goalId: z.string().uuid(),
  channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"]),
  brandName: z.string(),
  brandDescription: z.string().optional(),
  goalType: z.string(),
  strategyContext: z.string().optional(),
});

// GET /assets — list assets for org
assetsRouter.get("/", async (req, res, next) => {
  try {
    const { campaignId, channel, status } = req.query;

    const results = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, req.user.orgId),
        campaignId ? eq(assets.campaignId, campaignId as string) : undefined,
        channel ? eq(assets.channel, channel as string) : undefined,
        status ? eq(assets.status, status as string) : undefined,
      ),
      orderBy: desc(assets.createdAt),
      limit: 50,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /assets/generate — SSE streaming content generation
assetsRouter.post("/generate", generationLimiter, async (req, res, next) => {
  try {
    const body = generateSchema.parse(req.body);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("status", { message: "Content Creator Agent initializing..." });

    const agent = new ContentCreatorAgent();

    let fullContent = "";
    await agent.generate(
      {
        channel: body.channel,
        goalType: body.goalType,
        brandName: body.brandName,
        brandDescription: body.brandDescription,
        strategyContext: body.strategyContext,
      },
      (chunk) => {
        fullContent += chunk;
        sendEvent("chunk", { text: chunk });
      },
    );

    // Persist to database
    const [asset] = await db
      .insert(assets)
      .values({
        orgId: req.user.orgId,
        campaignId: body.campaignId,
        channel: body.channel,
        type: body.channel === "email" ? "email" : body.channel === "blog" ? "blog" : "social_post",
        contentText: fullContent,
        status: "draft",
        generatedByAgent: "content_creator",
        modelVersion: "claude-sonnet-4-20250514",
      })
      .returning();

    sendEvent("done", { assetId: asset.id, content: fullContent });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Generation failed" })}\n\n`);
      res.end();
    }
  }
});

// PATCH /assets/:id — update content, status, approval
assetsRouter.patch("/:id", async (req, res, next) => {
  try {
    const allowedFields = ["contentText", "contentHtml", "status", "approvedBy", "approvedAt"];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowedFields.includes(k)),
    );

    const [updated] = await db
      .update(assets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(assets.id, req.params.id!), eq(assets.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Asset not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /assets/:id
assetsRouter.delete("/:id", async (req, res, next) => {
  try {
    await db
      .delete(assets)
      .where(and(eq(assets.id, req.params.id!), eq(assets.orgId, req.user.orgId)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
