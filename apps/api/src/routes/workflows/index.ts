import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { workflows, workflowRuns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../lib/logger.js";
import { inngest } from "@orion/queue";
import { TEMPLATE_MAP, WORKFLOW_TEMPLATES } from "@orion/queue";

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

// GET /workflows/templates — list all 5 pre-built templates with activation status
workflowsRouter.get("/templates", async (req, res, next) => {
  try {
    // Fetch all org workflows once and filter in JS (avoids JSONB complexity)
    const orgWorkflows = await db.query.workflows.findMany({
      where: and(eq(workflows.orgId, req.user.orgId)),
      columns: { id: true, status: true, stepsJson: true, runCount: true, lastRunAt: true },
      orderBy: desc(workflows.createdAt),
    });

    const result = WORKFLOW_TEMPLATES.map((tpl) => {
      const match = orgWorkflows.find((w: { id: string; status: string; stepsJson: unknown; runCount: number; lastRunAt: Date | null }) => {
        const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
        return steps[0]?.templateId === tpl.id;
      });
      return {
        ...tpl,
        workflowId: match?.id ?? null,
        status: match?.status ?? null,
        runCount: match?.runCount ?? 0,
        lastRunAt: match?.lastRunAt ?? null,
        isActive: match?.status === "active",
      };
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /workflows/templates/:templateId/activate — create + activate a template workflow
workflowsRouter.post(
  "/templates/:templateId/activate",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const { templateId } = req.params;
      const tpl = TEMPLATE_MAP[templateId!];
      if (!tpl) throw new AppError(404, `Template "${templateId}" not found`);

      // Check if this org already has a (non-archived) workflow for this template
      const orgWorkflows = await db.query.workflows.findMany({
        where: and(eq(workflows.orgId, req.user.orgId)),
        columns: { id: true, status: true, stepsJson: true },
      });
      const existing = orgWorkflows.find((w: { id: string; status: string; stepsJson: unknown }) => {
        const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
        return steps[0]?.templateId === tpl.id && w.status !== "archived";
      });

      if (existing) {
        // Re-activate if paused
        if (existing.status !== "active") {
          const [updated] = await db
            .update(workflows)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(workflows.id, existing.id))
            .returning();
          logger.info({ workflowId: existing.id, templateId }, "Template workflow re-activated");
          return res.json({ data: updated });
        }
        return res.json({ data: existing }); // already active
      }

      // Create new workflow record
      const [workflow] = await db
        .insert(workflows)
        .values({
          orgId: req.user.orgId,
          name: tpl.name,
          description: tpl.description,
          triggerType: tpl.triggerType,
          triggerConfigJson: tpl.triggerConfigJson,
          stepsJson: tpl.stepsJson,
          status: "active",
        })
        .returning();

      logger.info({ workflowId: workflow!.id, templateId }, "Template workflow activated");
      res.status(201).json({ data: workflow });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /workflows/templates/:templateId/activate — deactivate (pause) a template workflow
workflowsRouter.delete(
  "/templates/:templateId/activate",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const { templateId } = req.params;
      const tpl = TEMPLATE_MAP[templateId!];
      if (!tpl) throw new AppError(404, `Template "${templateId}" not found`);

      const orgWorkflows = await db.query.workflows.findMany({
        where: and(eq(workflows.orgId, req.user.orgId)),
        columns: { id: true, status: true, stepsJson: true },
      });
      const existing = orgWorkflows.find((w: { id: string; status: string; stepsJson: unknown }) => {
        const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
        return steps[0]?.templateId === tpl.id && w.status !== "archived";
      });

      if (!existing) throw new AppError(404, "Template workflow not found for this org");

      const [updated] = await db
        .update(workflows)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(workflows.id, existing.id))
        .returning();

      logger.info({ workflowId: existing.id, templateId }, "Template workflow deactivated");
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// GET /workflows/templates/:templateId/runs — last 10 runs for this template
workflowsRouter.get("/templates/:templateId/runs", async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const orgWorkflows = await db.query.workflows.findMany({
      where: and(eq(workflows.orgId, req.user.orgId)),
      columns: { id: true, stepsJson: true },
    });
    const match = orgWorkflows.find((w: { id: string; stepsJson: unknown }) => {
      const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
      return steps[0]?.templateId === templateId;
    });

    if (!match) return res.json({ data: [] });

    const runs = await db.query.workflowRuns.findMany({
      where: eq(workflowRuns.workflowId, match.id),
      orderBy: desc(workflowRuns.startedAt),
      limit: 10,
    });

    res.json({ data: runs });
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
      data: { workflowId: workflow.id, runId: run!.id, orgId: req.user.orgId },
    });

    logger.info({ workflowId: workflow.id, runId: run!.id }, "Workflow triggered manually");
    res.status(202).json({ data: { runId: run!.id, status: "running" } });
  } catch (err) {
    next(err);
  }
});
