import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { goals, strategies, campaigns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { inngest } from "../../lib/inngest.js";
import { requireTokenQuota } from "../../middleware/plan-guard.js";

// ---------------------------------------------------------------------------
// In-memory cache for /pipeline-status — avoids DB hammering from polling
// ---------------------------------------------------------------------------
interface PipelineStatusCacheEntry { data: object; expiresAt: number; }
const pipelineStatusCache = new Map<string, PipelineStatusCacheEntry>();
const PIPELINE_STATUS_TTL_MS = 2_000;

function getPipelineStatusCached(key: string): object | null {
  const entry = pipelineStatusCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pipelineStatusCache.delete(key); return null; }
  return entry.data;
}

function setPipelineStatusCached(key: string, data: object): void {
  pipelineStatusCache.set(key, { data, expiresAt: Date.now() + PIPELINE_STATUS_TTL_MS });
}

export function invalidatePipelineStatusCache(orgId: string, goalId: string): void {
  pipelineStatusCache.delete(`${orgId}:${goalId}`);
}

// Map the pipeline_stage varchar written by the Inngest job → numeric stage
// used by the War Room progress ring and agent-status logic.
function mapPipelineStage(pipelineStage: string | null | undefined): {
  stage: number;
  stagesComplete: string[];
} {
  switch (pipelineStage) {
    case "strategy":   return { stage: 1, stagesComplete: ["strategy"] };
    case "content":    return { stage: 2, stagesComplete: ["strategy", "campaign"] };
    case "images":     return { stage: 3, stagesComplete: ["strategy", "campaign", "content"] };
    case "scheduling": return { stage: 4, stagesComplete: ["strategy", "campaign", "content", "scheduled"] };
    case "complete":   return { stage: 5, stagesComplete: ["strategy", "campaign", "content", "scheduled"] };
    default:           return { stage: 0, stagesComplete: [] };
  }
}

export const goalsRouter = Router();

const createGoalSchema = z.object({
  type: z.enum([
    "leads",
    "awareness",
    "event",
    "product",
    "traffic",
    "social",
    "conversions",
  ]),
  brandName: z.string().min(1).max(100),
  brandDescription: z.string().max(500).optional(),
  targetAudience: z.string().max(500).optional(),
  timeline: z.enum(["1_week", "2_weeks", "1_month", "3_months"]).default("1_month"),
  budget: z.number().positive().optional(),
  sourcePhotoUrl: z.string().url().optional().or(z.literal("")),
  channels: z.array(z.string()).max(7).optional(),
  abTesting: z.boolean().default(false),
  useBrandPhotos: z.boolean().default(false),
});

// GET /goals — list all goals for the org
goalsRouter.get("/", async (req, res, next) => {
  try {
    const orgGoals = await db.query.goals.findMany({
      where: eq(goals.orgId, req.user.orgId),
      orderBy: desc(goals.createdAt),
      with: {
        strategies: {
          limit: 1,
          orderBy: (s: any, { desc: d }: any) => [d(s.generatedAt)],
        },
        campaigns: { columns: { id: true, name: true, status: true } },
      },
    });
    res.json({ data: orgGoals });
  } catch (err) {
    next(err);
  }
});

// POST /goals — create a goal and trigger strategy generation
goalsRouter.post("/", requireTokenQuota, async (req, res, next) => {
  try {
    const body = createGoalSchema.parse(req.body);

    const [goal] = await db
      .insert(goals)
      .values({
        orgId: req.user.orgId,
        userId: req.user.id,
        type: body.type,
        brandName: body.brandName,
        brandDescription: body.brandDescription,
        targetAudience: body.targetAudience,
        timeline: body.timeline,
        budget: body.budget,
        sourcePhotoUrl: body.sourcePhotoUrl || undefined,
        status: "active",
      })
      .returning();

    // Trigger the full multi-agent pipeline via Inngest:
    // Stage 1: MarketingStrategistAgent  → strategy
    // Stage 2: ContentCreatorAgent       → assets per channel
    // Stage 3: OptimizationAgent         → recommendations
    await inngest.send({
      name: "orion/pipeline.run",
      data: {
        goalId: goal!.id,
        orgId: req.user.orgId,
        userId: req.user.id,
        channels: body.channels,
        abTesting: body.abTesting,
        useBrandPhotos: body.useBrandPhotos,
      },
    });

    res.status(201).json({ data: goal });
  } catch (err) {
    next(err);
  }
});

// POST /goals/:id/run-pipeline — trigger the full multi-agent pipeline for a goal
goalsRouter.post("/:id/run-pipeline", requireTokenQuota, async (req, res, next) => {
  try {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)),
    });

    if (!goal) throw new AppError(404, "Goal not found");

    const { campaignId, channels, abTesting } = z
      .object({
        campaignId: z.string().uuid().optional(),
        channels: z.array(z.string()).max(5).optional(),
        sourcePhotoUrl: z.string().url().optional(),
        abTesting: z.boolean().default(false),
      })
      .parse(req.body);

    await inngest.send({
      name: "orion/pipeline.run",
      data: {
        orgId: req.user.orgId,
        goalId: goal.id,
        campaignId,
        channels,
        abTesting,
      },
    });

    res.status(202).json({
      data: { message: "Pipeline queued", goalId: goal.id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /goals/:id
goalsRouter.get("/:id", async (req, res, next) => {
  try {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)),
      with: {
        strategies: { orderBy: (s: any, { desc: d }: any) => [d(s.createdAt)] },
        campaigns: true,
      },
    });

    if (!goal) throw new AppError(404, "Goal not found");
    res.json({ data: goal });
  } catch (err) {
    next(err);
  }
});

// PATCH /goals/:id
goalsRouter.patch("/:id", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(goals)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Goal not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /goals/:id/pipeline-status — queryable pipeline progress
goalsRouter.get("/:id/pipeline-status", async (req, res, next) => {
  try {
    const cacheKey = `${req.user.orgId}:${req.params.id}`;
    const cached = getPipelineStatusCached(cacheKey);
    if (cached) {
      const cachedStage = (cached as any).stage ?? 0;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Pipeline-Stage", String(cachedStage));
      res.setHeader("X-Pipeline-Cache", "HIT");
      return res.json(cached);
    }

    // Verify goal exists and belongs to this org (security check)
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!goal) throw new AppError(404, "Goal not found");

    // Single-table read: pipelineStage written by the Inngest job encodes all progress
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        pipelineError: campaigns.pipelineError,
        pipelineErrorAt: campaigns.pipelineErrorAt,
        pipelineStage: campaigns.pipelineStage,
      })
      .from(campaigns)
      .where(eq(campaigns.goalId, goal.id))
      .limit(1);

    const hasPipelineError = !!(campaign?.pipelineError);
    const { stage, stagesComplete } = mapPipelineStage(campaign?.pipelineStage);

    const isComplete = !hasPipelineError && campaign?.pipelineStage === "complete";
    const effectiveStage = isComplete ? 5 : stage;
    const pipelineStatus = hasPipelineError ? "failed" : (isComplete ? "complete" : "running");

    const payload = {
      goalId: goal.id,
      stage: effectiveStage,
      status: pipelineStatus,
      stagesTotal: 12,
      stagesComplete,
      strategy: null,
      campaign: campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            pipelineError: campaign.pipelineError ?? null,
            pipelineErrorAt: campaign.pipelineErrorAt ?? null,
            pipelineStage: campaign.pipelineStage ?? null,
          }
        : null,
      campaignId: campaign?.id ?? null,
      assetCount: 0,
      scheduledCount: 0,
      pipelineError: campaign?.pipelineError ?? null,
      pipelineErrorAt: campaign?.pipelineErrorAt ?? null,
      pipelineStage: campaign?.pipelineStage ?? null,
    };

    // Cache unless the pipeline has failed (errors should surface immediately)
    if (!hasPipelineError) {
      setPipelineStatusCached(cacheKey, payload);
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Pipeline-Stage", String(effectiveStage));
    res.setHeader("X-Pipeline-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /goals/:id/retry — clear pipeline error and re-trigger the pipeline
goalsRouter.post("/:id/retry", requireTokenQuota, async (req, res, next) => {
  try {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)),
    });
    if (!goal) throw new AppError(404, "Goal not found");

    const { channels, abTesting } = z
      .object({
        channels: z.array(z.string()).max(7).optional(),
        abTesting: z.boolean().default(false),
      })
      .parse(req.body);

    // Clear error fields from the linked campaign so the war room stops showing the error
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.goalId, goal.id))
      .limit(1);

    if (campaign) {
      await db
        .update(campaigns)
        .set({ pipelineError: null, pipelineErrorAt: null, pipelineStage: null, updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));
    }

    // Bust the cache so the War Room immediately sees the reset state
    invalidatePipelineStatusCache(req.user.orgId, goal.id);

    await inngest.send({
      name: "orion/pipeline.run",
      data: {
        goalId: goal.id,
        orgId: req.user.orgId,
        userId: req.user.id,
        channels,
        abTesting,
      },
    });

    res.status(200).json({ data: { message: "Pipeline retry queued", goalId: goal.id } });
  } catch (err) {
    next(err);
  }
});

// DELETE /goals/:id
goalsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(goals)
      .where(and(eq(goals.id, req.params.id!), eq(goals.orgId, req.user.orgId)))
      .returning({ id: goals.id });

    if (!deleted) throw new AppError(404, "Goal not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
