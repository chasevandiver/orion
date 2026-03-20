import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { workflows, workflowRuns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../lib/logger.js";
import { inngest } from "@orion/queue";

export const workflowsRouter = Router();

// ── Schedules ─────────────────────────────────────────────────────────────────

const SCHEDULE_PRESETS: Record<string, { days: number[]; hour: number }> = {
  daily_morning: { days: [0, 1, 2, 3, 4, 5, 6], hour: 9 },
  daily_evening: { days: [0, 1, 2, 3, 4, 5, 6], hour: 18 },
  weekly_monday: { days: [1], hour: 9 },
  weekly_friday: { days: [5], hour: 9 },
};

function computeNextRunAt(schedule: string): Date {
  const preset = SCHEDULE_PRESETS[schedule] ?? SCHEDULE_PRESETS.daily_morning!;
  const now = new Date();
  const d = new Date(now);
  d.setUTCHours(preset.hour, 0, 0, 0);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (preset.days.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// ── Validation ────────────────────────────────────────────────────────────────

const actionSchema = z.object({
  type: z.enum(["publish_queue", "run_analytics", "score_contacts", "send_sequence"]),
  sequenceId: z.string().uuid().optional(),       // send_sequence only
  contactStatus: z.string().optional(),            // send_sequence only
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(["manual", "schedule", "event"]),
  action: actionSchema,
  // schedule trigger config
  schedule: z.enum(["daily_morning", "daily_evening", "weekly_monday", "weekly_friday"]).optional(),
  // event trigger config
  eventName: z.string().optional(),
});

const updateWorkflowSchema = createWorkflowSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

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

    const triggerConfigJson: Record<string, unknown> = {};
    if (body.triggerType === "schedule" && body.schedule) {
      triggerConfigJson.schedule = body.schedule;
      triggerConfigJson.nextRunAt = computeNextRunAt(body.schedule).toISOString();
    }
    if (body.triggerType === "event" && body.eventName) {
      triggerConfigJson.event = body.eventName;
    }

    const [workflow] = await db
      .insert(workflows)
      .values({
        orgId: req.user.orgId,
        name: body.name,
        description: body.description,
        triggerType: body.triggerType,
        triggerConfigJson,
        stepsJson: [body.action],
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

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.description !== undefined) updatePayload.description = body.description;
    if (body.status !== undefined) updatePayload.status = body.status;

    if (body.action !== undefined) {
      updatePayload.stepsJson = [body.action];
    }

    if (body.triggerType !== undefined) {
      updatePayload.triggerType = body.triggerType;
      const config: Record<string, unknown> = {};
      if (body.triggerType === "schedule" && body.schedule) {
        config.schedule = body.schedule;
        config.nextRunAt = computeNextRunAt(body.schedule).toISOString();
      }
      if (body.triggerType === "event" && body.eventName) {
        config.event = body.eventName;
      }
      updatePayload.triggerConfigJson = config;
    }

    const [updated] = await db
      .update(workflows)
      .set(updatePayload)
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
      .set({ runCount: workflow.runCount + 1, lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(workflows.id, workflow.id));

    // Dispatch to Inngest for actual execution
    await inngest.send({
      name: "orion/workflow.execute",
      data: { workflowId: workflow.id, runId: run.id, orgId: req.user.orgId },
    });

    logger.info({ workflowId: workflow.id, runId: run.id }, "Workflow triggered manually");
    res.status(202).json({ data: { runId: run.id, status: "running" } });
  } catch (err) {
    next(err);
  }
});
