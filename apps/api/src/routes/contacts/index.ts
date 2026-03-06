import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { contacts, contactEvents } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { CRMIntelligenceAgent } from "@orion/agents";
import { logger } from "../../lib/logger.js";

export const contactsRouter = Router();

const createContactSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  linkedinUrl: z.string().url().optional(),
  sourceChannel: z
    .enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog", "website"])
    .optional(),
  sourceCampaignId: z.string().uuid().optional(),
  leadScore: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const updateContactSchema = createContactSchema.partial().extend({
  status: z.enum(["cold", "warm", "hot", "customer", "churned"]).optional(),
});

// GET /contacts — list contacts for the org
contactsRouter.get("/", async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const results = await db.query.contacts.findMany({
      where: and(
        eq(contacts.orgId, req.user.orgId),
        status ? eq(contacts.status, status as string) : undefined,
      ),
      orderBy: desc(contacts.leadScore),
      limit: 100,
    });

    // In-memory search filter (avoids LIKE injection; Phase 2D can add DB-level FTS)
    const filtered =
      search && typeof search === "string"
        ? results.filter(
            (c) =>
              c.email.includes(search) ||
              c.name?.toLowerCase().includes(search.toLowerCase()) ||
              c.company?.toLowerCase().includes(search.toLowerCase()),
          )
        : results;

    res.json({ data: filtered });
  } catch (err) {
    next(err);
  }
});

// POST /contacts — create a contact (upsert by email is handled at DB level via unique index)
contactsRouter.post("/", async (req, res, next) => {
  try {
    const body = createContactSchema.parse(req.body);

    const [contact] = await db
      .insert(contacts)
      .values({ orgId: req.user.orgId, ...body })
      .returning();

    res.status(201).json({ data: contact });
  } catch (err) {
    next(err);
  }
});

// GET /contacts/:id — get a contact with its event history
contactsRouter.get("/:id", async (req, res, next) => {
  try {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)),
      with: {
        events: {
          orderBy: (e: any, { desc: d }: any) => [d(e.occurredAt)],
          limit: 50,
        },
        sourceCampaign: { columns: { id: true, name: true } },
      },
    });

    if (!contact) throw new AppError(404, "Contact not found");
    res.json({ data: contact });
  } catch (err) {
    next(err);
  }
});

// PATCH /contacts/:id — update contact fields or status
contactsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateContactSchema.parse(req.body);

    const [updated] = await db
      .update(contacts)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Contact not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /contacts/:id — hard delete (contact data is org-owned)
contactsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(contacts)
      .where(and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)))
      .returning({ id: contacts.id });

    if (!deleted) throw new AppError(404, "Contact not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /contacts/:id/events — log a lifecycle event for a contact
contactsRouter.post("/:id/events", async (req, res, next) => {
  try {
    const { eventType, metadata } = req.body as {
      eventType: string;
      metadata?: Record<string, unknown>;
    };

    if (!eventType) throw new AppError(400, "eventType is required");

    // Verify contact belongs to org before inserting event
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)),
    });
    if (!contact) throw new AppError(404, "Contact not found");

    const [event] = await db
      .insert(contactEvents)
      .values({
        contactId: req.params.id!,
        eventType,
        metadataJson: metadata ?? {},
        occurredAt: new Date(),
      })
      .returning();

    res.status(201).json({ data: event });
  } catch (err) {
    next(err);
  }
});

// POST /contacts/:id/analyze — run CRMIntelligenceAgent on a contact
// Scores, enriches, and generates relationship insights. Persists updates to DB.
contactsRouter.post("/:id/analyze", async (req, res, next) => {
  try {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)),
    });
    if (!contact) throw new AppError(404, "Contact not found");

    const agent = new CRMIntelligenceAgent();
    const analysis = await agent.analyzeContact(req.params.id!, req.user.orgId);

    logger.info(
      { contactId: req.params.id, score: analysis.score.score, tokensUsed: analysis.totalTokensUsed },
      "CRM intelligence analysis complete",
    );

    res.json({
      data: {
        contactId: req.params.id!,
        score: analysis.score,
        enrichment: analysis.enrichment,
        insights: analysis.insights,
        tokensUsed: analysis.totalTokensUsed,
      },
    });
  } catch (err) {
    next(err);
  }
});
