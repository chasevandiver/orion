/**
 * Email Sequences API
 *
 * GET  /email-sequences              — list all sequences for org
 * GET  /email-sequences/:id          — get sequence + steps
 * POST /email-sequences              — create sequence
 * PATCH /email-sequences/:id         — update sequence metadata
 * DELETE /email-sequences/:id        — delete sequence + steps
 *
 * Steps:
 * GET  /email-sequences/:id/steps         — list steps
 * POST /email-sequences/:id/steps         — add step
 * PATCH /email-sequences/:id/steps/:stepId — update step
 * DELETE /email-sequences/:id/steps/:stepId — delete step
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { emailSequences, emailSequenceSteps } from "@orion/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

export const emailSequencesRouter = Router();

const sequenceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  goalId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  triggerType: z.enum(["welcome", "trial_ending", "re_engagement", "manual", "signup", "download", "purchase"]).default("welcome"),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
});

const stepSchema = z.object({
  stepNumber: z.number().int().min(1),
  delayDays: z.number().int().min(0).default(0),
  subject: z.string().min(1).max(200),
  contentText: z.string().min(1),
  contentHtml: z.string().optional(),
});

// GET /email-sequences
emailSequencesRouter.get("/", async (req, res, next) => {
  try {
    const sequences = await db.query.emailSequences.findMany({
      where: eq(emailSequences.orgId, req.user.orgId),
      orderBy: desc(emailSequences.createdAt),
      with: {
        steps: { orderBy: asc(emailSequenceSteps.stepNumber) },
        goal: { columns: { type: true, brandName: true } },
      },
    });
    res.json({ data: sequences });
  } catch (err) {
    next(err);
  }
});

// GET /email-sequences/:id
emailSequencesRouter.get("/:id", async (req, res, next) => {
  try {
    const sequence = await db.query.emailSequences.findFirst({
      where: and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)),
      with: {
        steps: { orderBy: asc(emailSequenceSteps.stepNumber) },
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true } },
      },
    });
    if (!sequence) throw new AppError(404, "Email sequence not found");
    res.json({ data: sequence });
  } catch (err) {
    next(err);
  }
});

// POST /email-sequences
emailSequencesRouter.post("/", async (req, res, next) => {
  try {
    const body = sequenceSchema.parse(req.body);
    const [seq] = await db
      .insert(emailSequences)
      .values({ orgId: req.user.orgId, ...body })
      .returning();
    res.status(201).json({ data: seq });
  } catch (err) {
    next(err);
  }
});

// PATCH /email-sequences/:id
emailSequencesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = sequenceSchema.partial().parse(req.body);
    const [updated] = await db
      .update(emailSequences)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)))
      .returning();
    if (!updated) throw new AppError(404, "Email sequence not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /email-sequences/:id
emailSequencesRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(emailSequences)
      .where(and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)))
      .returning({ id: emailSequences.id });
    if (!deleted) throw new AppError(404, "Email sequence not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Steps ───────────────────────────────────────────────────────────────────

// GET /email-sequences/:id/steps
emailSequencesRouter.get("/:id/steps", async (req, res, next) => {
  try {
    // Verify ownership
    const seq = await db.query.emailSequences.findFirst({
      where: and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!seq) throw new AppError(404, "Email sequence not found");

    const steps = await db.query.emailSequenceSteps.findMany({
      where: eq(emailSequenceSteps.sequenceId, seq.id),
      orderBy: asc(emailSequenceSteps.stepNumber),
    });
    res.json({ data: steps });
  } catch (err) {
    next(err);
  }
});

// POST /email-sequences/:id/steps
emailSequencesRouter.post("/:id/steps", async (req, res, next) => {
  try {
    const seq = await db.query.emailSequences.findFirst({
      where: and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!seq) throw new AppError(404, "Email sequence not found");

    const body = stepSchema.parse(req.body);
    const [step] = await db
      .insert(emailSequenceSteps)
      .values({ sequenceId: seq.id, ...body })
      .returning();
    res.status(201).json({ data: step });
  } catch (err) {
    next(err);
  }
});

// PATCH /email-sequences/:id/steps/:stepId
emailSequencesRouter.patch("/:id/steps/:stepId", async (req, res, next) => {
  try {
    const seq = await db.query.emailSequences.findFirst({
      where: and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!seq) throw new AppError(404, "Email sequence not found");

    const body = stepSchema.partial().parse(req.body);
    const [updated] = await db
      .update(emailSequenceSteps)
      .set(body)
      .where(and(eq(emailSequenceSteps.id, req.params.stepId!), eq(emailSequenceSteps.sequenceId, seq.id)))
      .returning();
    if (!updated) throw new AppError(404, "Step not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /email-sequences/:id/steps/:stepId
emailSequencesRouter.delete("/:id/steps/:stepId", async (req, res, next) => {
  try {
    const seq = await db.query.emailSequences.findFirst({
      where: and(eq(emailSequences.id, req.params.id!), eq(emailSequences.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!seq) throw new AppError(404, "Email sequence not found");

    const [deleted] = await db
      .delete(emailSequenceSteps)
      .where(and(eq(emailSequenceSteps.id, req.params.stepId!), eq(emailSequenceSteps.sequenceId, seq.id)))
      .returning({ id: emailSequenceSteps.id });
    if (!deleted) throw new AppError(404, "Step not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
