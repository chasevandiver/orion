import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { workflows, workflowRuns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../lib/logger.js";

export const workflowsRouter = Router();

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(["manual", "schedule", "event"]),
  triggerConfig: z.record(z.unknown()).optional(),
  steps: z.array(z.record(z.unknown())).optional(),
});

const updateWorkflowSchema = createWorkflowSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

// GET /workflows — list workflows for the org
workflowsRouter.get("/", async (req, res, next) => {
  try {
    const results = await db.query.workflows.findMany({
      where: eq(workflows.orgId, req.user.orgId),
      orderBy: desc(workflows.createdAt),
    });
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /workflows — create a workflow (admins and owners only)
workflowsRouter.post("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = createWorkflowSchema.parse(req.body);

    const [workflow] = await db
      .insert(workflows)
      .values({
        orgId: req.user.orgId,
        name: body.name,
        description: body.description,
        triggerType: body.triggerType,
        triggerConfigJson: body.triggerConfig ?? {},
        stepsJson: body.steps ?? [],
        status: "draft",
      })
      .returning();

    res.status(201).json({ data: workflow });
  } catch (err) {
    next(err);
  }
});

// GET /workflows/:id — get a workflow with its recent run history
workflowsRouter.get("/:id", async (req, res, next) => {
  try {
    const workflow = await db.query.workflows.findFirst({
      where: and(eq(workflows.id, req.params.id!), eq(workflows.orgId, req.user.orgId)),
    });

    if (!workflow) throw new AppError(404, "Workflow not found");

    const runs = await db.query.workflowRuns.findMany({
      where: eq(workflowRuns.workflowId, req.params.id!),
      orderBy: desc(workflowRuns.startedAt),
      limit: 20,
    });

    res.json({ data: { ...workflow, runs } });
  } catch (err) {
    next(err);
  }
});

// PATCH /workflows/:id — update fields or change status
workflowsRouter.patch("/:id", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = updateWorkflowSchema.parse(req.body);

    const [updated] = await db
      .update(workflows)
      .set({
        ...body,
        triggerConfigJson: body.triggerConfig,
        stepsJson: body.steps,
        updatedAt: new Date(),
      })
      .where(and(eq(workflows.id, req.params.id!), eq(workflows.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Workflow not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /workflows/:id — archive (soft delete)
workflowsRouter.delete("/:id", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(workflows)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(workflows.id, req.params.id!), eq(workflows.orgId, req.user.orgId)))
      .returning({ id: workflows.id });

    if (!updated) throw new AppError(404, "Workflow not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /workflows/:id/trigger — manually kick off an active workflow
workflowsRouter.post("/:id/trigger", async (req, res, next) => {
  try {
    const workflow = await db.query.workflows.findFirst({
      where: and(eq(workflows.id, req.params.id!), eq(workflows.orgId, req.user.orgId)),
    });

    if (!workflow) throw new AppError(404, "Workflow not found");
    if (workflow.status !== "active") throw new AppError(400, "Workflow is not active");

    const [run] = await db
      .insert(workflowRuns)
      .values({ workflowId: workflow.id, status: "running", startedAt: new Date() })
      .returning();

    await db
      .update(workflows)
      .set({ runCount: workflow.runCount + 1, lastRunAt: new Date() })
      .where(eq(workflows.id, workflow.id));

    logger.info({ workflowId: workflow.id, runId: run.id }, "Workflow triggered manually");

    // TODO: Phase 2C — dispatch to Inngest for actual step execution
    res.status(202).json({ data: { runId: run.id, status: "running" } });
  } catch (err) {
    next(err);
  }
});
