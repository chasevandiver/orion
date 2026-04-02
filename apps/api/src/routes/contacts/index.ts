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
import { contacts, contactEvents, trackingLinks } from "@orion/db/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { CRMIntelligenceAgent } from "@orion/agents";
import { logger } from "../../lib/logger.js";
import { inngest } from "@orion/queue";
import { attributeRevenue } from "../../lib/attribute-revenue.js";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";

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
  // When provided, auto-populates sourceChannel + sourceCampaignId from the
  // tracking link record (org-scoped; ignored if the link belongs to a different org).
  trackingId: z.string().max(64).optional(),
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

    // ── Resolve tracking link attribution ───────────────────────────────────
    // If a trackingId was provided, look up the link and use its campaign/channel
    // data to fill in attribution fields that weren't already set by the caller.
    // The link must belong to the same org to prevent cross-org data injection.
    if (body.trackingId) {
      try {
        const [link] = await db
          .select()
          .from(trackingLinks)
          .where(
            and(
              eq(trackingLinks.trackingId, body.trackingId),
              eq(trackingLinks.orgId, body.orgId),
            ),
          )
          .limit(1);
        if (link) {
          if (!body.sourceChannel && link.channel) {
            (body as any).sourceChannel = link.channel;
          }
          if (!body.sourceCampaignId && link.campaignId) {
            (body as any).sourceCampaignId = link.campaignId;
          }
        }
      } catch (err) {
        // Non-critical — attribution enrichment is best-effort
        logger.warn(`[capture] Failed to resolve trackingId ${body.trackingId}: ${(err as Error).message}`);
      }
    }

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

// ── POST /contacts/capture/link ────────────────────────────────────────────────
//
// Generates a unique tracking link for a campaign channel. The link is used to
// embed attribution context in published content (email CTAs, blog links).
//
// When a visitor clicks the link (/t/:trackingId) they are:
//   1. Recorded as a "click" analytics event
//   2. Redirected to destinationUrl
// When they then submit a form at that destination using POST /contacts/capture
// with the trackingId, their contact record is automatically attributed to this
// campaign and channel.
//
// Request body: { campaignId, channel, destinationUrl? }
// Response: 201 { data: { trackingId, trackingUrl, captureEndpoint } }

const createLinkSchema = z.object({
  campaignId: z.string().uuid(),
  channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog", "website"]),
  destinationUrl: z.string().url().optional(),
});

contactsRouter.post("/capture/link", async (req, res, next) => {
  try {
    const body = createLinkSchema.parse(req.body);
    const orgId = req.user.orgId;

    const { randomUUID } = await import("crypto");
    const trackingId = randomUUID().replace(/-/g, "").slice(0, 12);

    const apiBase = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const trackingUrl = `${apiBase}/t/${trackingId}`;
    const captureEndpoint = `${apiBase}/contacts/capture`;

    const destinationUrl =
      body.destinationUrl ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    await db.insert(trackingLinks).values({
      trackingId,
      orgId,
      campaignId: body.campaignId,
      channel: body.channel,
      destinationUrl,
    });

    logger.info(`[capture/link] Created trackingId ${trackingId} for campaign ${body.campaignId} / ${body.channel}`);
    return res.status(201).json({
      data: { trackingId, trackingUrl, captureEndpoint },
    });
  } catch (err) {
    next(err);
  }
});

// Multer instance — memory storage, 5 MB limit (CSV files are small)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

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
  revenue: z.number().min(0).optional(),
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

// POST /contacts/import — bulk import contacts from a CSV file
// Expects multipart/form-data with a "file" field containing a CSV.
// Required columns: firstName (or name), email
// Optional columns: lastName, company, notes
// Deduplicates by email (case-insensitive) within the org.
// Limit: 1000 rows per import.
contactsRouter.post("/import", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, "No file uploaded. Send a CSV file in the 'file' field.");

    const orgId = req.user.orgId;
    const IMPORT_LIMIT = 1000;

    // ── Parse CSV from buffer ───────────────────────────────────────────────
    const rows: Record<string, string>[] = await new Promise((resolve, reject) => {
      const results: Record<string, string>[] = [];
      const readable = Readable.from(req.file!.buffer);
      readable
        .pipe(
          parse({
            columns: true,        // first row is headers
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
          }),
        )
        .on("data", (row: Record<string, string>) => results.push(row))
        .on("error", reject)
        .on("end", () => resolve(results));
    });

    if (rows.length === 0) {
      return res.json({ data: { imported: 0, skipped: 0, errors: [] } });
    }

    if (rows.length > IMPORT_LIMIT) {
      throw new AppError(400, `Import limit is ${IMPORT_LIMIT} rows. File contains ${rows.length} rows.`);
    }

    // ── Fetch existing emails for this org (case-insensitive dedup) ─────────
    const existingContacts = await db.query.contacts.findMany({
      where: eq(contacts.orgId, orgId),
      columns: { email: true },
    });
    const existingEmails = new Set(existingContacts.map((c: { email: string }) => c.email.toLowerCase()));

    // ── Validate and collect rows ───────────────────────────────────────────
    const toInsert: Array<typeof contacts.$inferInsert> = [];
    const errors: Array<{ row: number; reason: string }> = [];
    const seenEmails = new Set<string>(); // deduplicate within the CSV itself

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2; // 1-indexed, offset by header row

      // Normalise common column name variants
      const rawEmail = (row["email"] ?? row["Email"] ?? row["EMAIL"] ?? "").trim();
      const firstName = (row["firstName"] ?? row["first_name"] ?? row["First Name"] ?? row["firstname"] ?? "").trim();
      const lastName = (row["lastName"] ?? row["last_name"] ?? row["Last Name"] ?? row["lastname"] ?? "").trim();
      const nameCol = (row["name"] ?? row["Name"] ?? "").trim();
      const company = (row["company"] ?? row["Company"] ?? row["COMPANY"] ?? "").trim() || undefined;
      const notes = (row["notes"] ?? row["Notes"] ?? "").trim() || undefined;

      if (!rawEmail) {
        errors.push({ row: rowNum, reason: "Missing email" });
        continue;
      }

      const emailParsed = z.string().email().safeParse(rawEmail);
      if (!emailParsed.success) {
        errors.push({ row: rowNum, reason: `Invalid email: ${rawEmail}` });
        continue;
      }

      const email = emailParsed.data.toLowerCase();

      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, reason: `Email already exists: ${rawEmail}` });
        continue;
      }

      if (seenEmails.has(email)) {
        errors.push({ row: rowNum, reason: `Duplicate email in import: ${rawEmail}` });
        continue;
      }

      seenEmails.add(email);

      // Build display name: firstName + lastName, falling back to name column
      const derivedName =
        firstName || lastName
          ? [firstName, lastName].filter(Boolean).join(" ")
          : nameCol || undefined;

      toInsert.push({
        orgId,
        email,
        name: derivedName ?? null,
        company: company ?? null,
        notes: notes ?? null,
        leadScore: 0,
        status: "cold",
        sourceChannel: null,
      });
    }

    // ── Bulk insert ─────────────────────────────────────────────────────────
    let importedCount = 0;
    if (toInsert.length > 0) {
      const inserted = await db
        .insert(contacts)
        .values(toInsert)
        .onConflictDoNothing()
        .returning({ id: contacts.id });

      importedCount = inserted.length;

      // Fire scoring events for imported contacts
      if (importedCount > 0) {
        try {
          await inngest.send(
            inserted.map((c) => ({
              name: "orion/crm.contact_created" as const,
              data: { contactId: c.id, orgId },
            })),
          );
        } catch (err) {
          logger.warn(`[contacts/import] Failed to fire scoring events: ${(err as Error).message}`);
        }
      }
    }

    const skipped = rows.length - toInsert.length;

    logger.info(
      { orgId, imported: importedCount, skipped, errors: errors.length },
      "[contacts/import] CSV import complete",
    );

    return res.json({ data: { imported: importedCount, skipped, errors } });
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

    // Fetch current status before update so we can detect changes
    const existing = body.status
      ? await db.query.contacts.findFirst({
          where: and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)),
          columns: { status: true },
        })
      : null;

    // Build update payload — add dealClosedAt when transitioning to customer
    const updatePayload: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (
      body.status === "customer" &&
      existing &&
      existing.status !== "customer"
    ) {
      updatePayload.dealClosedAt = new Date();
    }

    const [updated] = await db
      .update(contacts)
      .set(updatePayload)
      .where(and(eq(contacts.id, req.params.id!), eq(contacts.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Contact not found");

    // Fire sequence enrollment when status changes
    if (body.status && existing && existing.status !== body.status) {
      const TRIGGER_MAP: Record<string, string> = {
        warm: "re_engagement",
        hot:  "trial_ending",
      };
      const triggerType = TRIGGER_MAP[body.status];
      if (triggerType) {
        inngest
          .send({
            name: "orion/crm.sequence_enroll",
            data: {
              contactId: updated.id,
              orgId: req.user.orgId,
              triggerType,
            },
          })
          .catch((err: Error) =>
            logger.warn("[contacts] sequence enroll event failed", { error: err.message }),
          );
      }

      // Run revenue attribution when contact becomes a customer
      if (body.status === "customer") {
        attributeRevenue(updated.id).catch((err: Error) =>
          logger.warn("[contacts] attribution failed", { error: err.message }),
        );
      }
    }

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
