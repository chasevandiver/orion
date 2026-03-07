import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { goals } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { inngest } from "../../lib/inngest.js";
import { requireTokenQuota } from "../../middleware/plan-guard.js";

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
        status: "active",
      })
      .returning();

    // Trigger the full multi-agent pipeline via Inngest:
    // Stage 1: MarketingStrategistAgent  → strategy
    // Stage 2: ContentCreatorAgent       → assets per channel
    // Stage 3: OptimizationAgent         → recommendations
    await inngest.send({
      name: "orion/pipeline.run",
      data: { goalId: goal.id, orgId: req.user.orgId, userId: req.user.id },
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

    const { campaignId, channels } = z
      .object({
        campaignId: z.string().uuid().optional(),
        channels: z.array(z.string()).max(5).optional(),
      })
      .parse(req.body);

    await inngest.send({
      name: "orion/pipeline.run",
      data: {
        orgId: req.user.orgId,
        goalId: goal.id,
        campaignId,
        channels,
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
