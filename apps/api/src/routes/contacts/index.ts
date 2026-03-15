/**
 * Contacts API routes.
 *
 * Two routers are exported:
 *
 *   contactsCaptureRouter  — PUBLIC (no session auth). Mount BEFORE authMiddleware.
 *   contactsRouter         — Protected (session auth required). Mount AFTER authMiddleware.
 *
 * ── Webhook capture endpoint ───────────────────────────────────────────────────
 * POST /contacts/capture
 *
 * Called by external tools (LinkedIn lead gen forms, email platforms, landing
 * pages) to upsert a contact and log an interaction event. Auth is via the
 * x-orion-webhook-secret header (set ORION_WEBHOOK_SECRET in your env).
 *
 * Example curl:
 *   curl -X POST https://api.your-domain.com/contacts/capture \
 *     -H "Content-Type: application/json" \
 *     -H "x-orion-webhook-secret: YOUR_ORION_WEBHOOK_SECRET" \
 *     -d '{
 *           "orgId": "550e8400-e29b-41d4-a716-446655440000",
 *           "email": "alex@company.com",
 *           "name": "Alex Johnson",
 *           "company": "Acme Corp",
 *           "sourceChannel": "email",
 *           "eventType": "form_submit"
 *         }'
 *
 * Response: 202 { data: { contactId: "<uuid>", queued: true } }
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { contacts, contactEvents } from "@orion/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { CRMIntelligenceAgent } from "@orion/agents";
import { logger } from "../../lib/logger.js";
import { inngest } from "@orion/queue";

// ── Public webhook capture router ─────────────────────────────────────────────
// Mount in index.ts BEFORE authMiddleware so it does not require a session.

export const contactsCaptureRouter = Router();

const captureSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  sourceChannel: z
    .enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog", "website"])
    .optional(),
  sourceCampaignId: z.string().uuid().optional(),
  eventType: z.enum(["form_submit", "email_open", "link_click"]),
});

contactsCaptureRouter.post("/capture", async (req, res, next) => {
  try {
    // ── Webhook secret validation ───────────────────────────────────────────
    const secret = process.env.ORION_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers["x-orion-webhook-secret"];
      if (!provided || provided !== secret) {
        return res.status(401).json({ error: "Invalid or missing webhook secret" });
      }
    }

    const body = captureSchema.parse(req.body);

    // ── Upsert contact ──────────────────────────────────────────────────────
    // Conflict target: unique index on (orgId, email). On conflict, update
    // only the fields that were provided — leave existing values intact.
    const [contact] = await db
      .insert(contacts)
      .values({
        orgId: body.orgId,
        email: body.email,
        name: body.name ?? null,
        company: body.company ?? null,
        sourceChannel: body.sourceChannel ?? null,
        sourceCampaignId: body.sourceCampaignId ?? null,
        leadScore: 0,
        status: "cold",
      })
      .onConflictDoUpdate({
        target: [contacts.orgId, contacts.email],
        set: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.company !== undefined ? { company: body.company } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    // ── Log the interaction event ───────────────────────────────────────────
    await db.insert(contactEvents).values({
      contactId: contact!.id,
      eventType: body.eventType,
      metadataJson: {
        sourceChannel: body.sourceChannel ?? null,
        capturedAt: new Date().toISOString(),
      },
      occurredAt: new Date(),
    });

    // ── Queue async CRM intelligence scoring ───────────────────────────────
    try {
      await inngest.send({
        name: "orion/crm.score",
        data: { contactId: contact!.id, orgId: body.orgId },
      });
    } catch (err) {
      // Non-critical — scoring is best-effort; capture still succeeds
      logger.warn(`[capture] Failed to queue CRM score job: ${(err as Error).message}`);
    }

    logger.info(`[capture] Contact upserted — id: ${contact!.id}, event: ${body.eventType}`);
    return res.status(202).json({ data: { contactId: contact!.id, queued: true } });
  } catch (err) {
    next(err);
  }
});

// ── Authenticated contacts router ─────────────────────────────────────────────

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

// GET /contacts/stats — pipeline health summary
contactsRouter.get("/stats", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const allContacts = await db.query.contacts.findMany({
      where: eq(contacts.orgId, orgId),
      columns: { id: true, status: true, sourceChannel: true, leadScore: true, createdAt: true },
    });

    const total = allContacts.length;
    const byStatus: Record<string, number> = {};
    for (const c of allContacts) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }

    const newThisMonth = allContacts.filter((c) => c.createdAt >= thirtyDaysAgo).length;

    const channelCounts: Record<string, number> = {};
    for (const c of allContacts) {
      if (c.sourceChannel) {
        channelCounts[c.sourceChannel] = (channelCounts[c.sourceChannel] ?? 0) + 1;
      }
    }
    const topSourceChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const avgScore = total > 0 ? Math.round(allContacts.reduce((s, c) => s + c.leadScore, 0) / total) : 0;

    res.json({ data: { total, byStatus, newThisMonth, topSourceChannel, avgScore } });
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

    // Fire auto-score event after contact creation
    try {
      await inngest.send({
        name: "orion/crm.contact_created",
        data: { contactId: contact!.id, orgId: req.user.orgId },
      });
    } catch (err) {
      logger.warn(`[contacts] Failed to fire orion/crm.contact_created event: ${(err as Error).message}`);
    }

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

// GET /contacts/:id/intelligence — AI-powered lead scoring and enrichment (lazy-loadable)
contactsRouter.get("/:id/intelligence", async (req, res, next) => {
  try {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)),
    });
    if (!contact) throw new AppError(404, "Contact not found");

    const agent = new CRMIntelligenceAgent();
    const analysis = await agent.analyzeContact(req.params.id!, req.user.orgId);

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
