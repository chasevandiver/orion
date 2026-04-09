/**
 * Email Broadcast API
 *
 * POST /broadcasts/send — send a one-off email to a filtered segment of contacts
 * POST /broadcasts/preview — get contact count for a given filter
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { contacts, channelConnections } from "@orion/db/schema";
import { eq, and, gte, lte, inArray, sql, count } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { ResendClient } from "@orion/integrations";
import { decryptToken } from "@orion/db/lib/token-encryption";

export const broadcastsRouter = Router();

const filterSchema = z.object({
  statuses: z.array(z.enum(["cold", "warm", "hot", "customer", "churned"])).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
});

const sendSchema = filterSchema.extend({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  fromName: z.string().max(100).optional(),
});

function buildContactFilter(orgId: string, filter: z.infer<typeof filterSchema>) {
  const conditions = [eq(contacts.orgId, orgId)];

  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(contacts.status, filter.statuses));
  }
  if (filter.minScore !== undefined) {
    conditions.push(gte(contacts.leadScore, filter.minScore));
  }
  if (filter.maxScore !== undefined) {
    conditions.push(lte(contacts.leadScore, filter.maxScore));
  }

  return and(...conditions);
}

// POST /broadcasts/preview — count contacts matching filter
broadcastsRouter.post("/preview", async (req, res, next) => {
  try {
    const filter = filterSchema.parse(req.body);
    const where = buildContactFilter(req.user.orgId, filter);

    const [result] = await db
      .select({ value: count() })
      .from(contacts)
      .where(where!);

    res.json({ data: { count: result?.value ?? 0 } });
  } catch (err) {
    next(err);
  }
});

// POST /broadcasts/send — send emails to matching contacts
broadcastsRouter.post("/send", async (req, res, next) => {
  try {
    const body = sendSchema.parse(req.body);
    const where = buildContactFilter(req.user.orgId, body);

    // Get email channel connection for Resend API key
    const connection = await db.query.channelConnections.findFirst({
      where: and(
        eq(channelConnections.orgId, req.user.orgId),
        eq(channelConnections.channel, "email"),
      ),
    });

    if (!connection?.accessTokenEnc) {
      throw new AppError(400, "Email integration not configured. Connect Resend in Settings > Integrations.");
    }

    const apiKey = decryptToken(connection.accessTokenEnc);
    const client = new ResendClient(req.user.orgId, apiKey);

    // Fetch matching contacts
    const recipients = await db
      .select({ email: contacts.email, name: contacts.name })
      .from(contacts)
      .where(where!);

    if (recipients.length === 0) {
      throw new AppError(400, "No contacts match the selected filters.");
    }

    // Send emails individually (Resend free tier limit: 100/day)
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        await client.sendToAddress({
          subject: body.subject,
          contentText: body.body,
          toEmail: recipient.email,
          fromName: body.fromName,
        });
        sent++;
      } catch (err: unknown) {
        failed++;
        if (errors.length < 5) {
          errors.push(`${recipient.email}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
    }

    res.json({
      data: {
        sent,
        failed,
        total: recipients.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

const testEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  toEmail: z.string().email(),
});

// POST /broadcasts/test — send a single preview email to a specified address
broadcastsRouter.post("/test", async (req, res, next) => {
  try {
    const body = testEmailSchema.parse(req.body);

    const connection = await db.query.channelConnections.findFirst({
      where: and(
        eq(channelConnections.orgId, req.user.orgId),
        eq(channelConnections.channel, "email"),
      ),
    });

    if (!connection?.accessTokenEnc) {
      throw new AppError(400, "Email integration not configured. Connect Resend in Settings > Integrations.");
    }

    const apiKey = decryptToken(connection.accessTokenEnc);
    const client = new ResendClient(req.user.orgId, apiKey);

    await client.sendToAddress({
      subject: `[TEST] ${body.subject}`,
      contentText: body.body,
      toEmail: body.toEmail,
    });

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});
