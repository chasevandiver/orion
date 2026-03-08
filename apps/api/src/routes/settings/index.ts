/**
 * Settings routes — org profile, member management, and integration API keys.
 *
 * GET  /settings/org          — get org details
 * PATCH /settings/org         — update org name/website/logo (owner/admin only)
 * GET  /settings/members      — list org members
 * POST /settings/members/invite — invite a new member (owner/admin only)
 * DELETE /settings/members/:userId — remove a member (owner only)
 * GET  /settings/integrations — list connected channel integrations
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { organizations, users, channelConnections, personas } from "@orion/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../lib/logger.js";
import { decryptToken } from "@orion/db/lib/token-encryption";
import { LinkedInClient } from "@orion/integrations";

export const settingsRouter = Router();

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  brandSecondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  fontPreference: z.enum(["modern", "serif", "minimal", "bold"]).optional(),
  logoPosition: z.enum(["auto", "top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  inspirationImageUrl: z.string().url().optional().or(z.literal("")),
});

const createPersonaSchema = z.object({
  name: z.string().min(1).max(200),
  demographics: z.string().optional(),
  psychographics: z.string().optional(),
  painPoints: z.string().optional(),
  preferredChannels: z.array(z.string()).default([]),
});

const updatePersonaSchema = createPersonaSchema.partial();

// GET /settings/org — return org details
settingsRouter.get("/org", async (req, res, next) => {
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, req.user.orgId),
    });
    if (!org) throw new AppError(404, "Organization not found");
    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

// PATCH /settings/org — update org name/website/logo
settingsRouter.patch("/org", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = updateOrgSchema.parse(req.body);

    const [updated] = await db
      .update(organizations)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(organizations.id, req.user.orgId))
      .returning();

    if (!updated) throw new AppError(404, "Organization not found");

    logger.info({ orgId: req.user.orgId }, "Org settings updated");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /settings/members — list all members of the org
settingsRouter.get("/members", async (req, res, next) => {
  try {
    const members = await db.query.users.findMany({
      where: eq(users.orgId, req.user.orgId),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        createdAt: true,
        // Never expose password hash
        passwordHash: false,
      },
    });
    res.json({ data: members });
  } catch (err) {
    next(err);
  }
});

// DELETE /settings/members/:userId — remove a member (owner only, cannot remove self)
settingsRouter.delete(
  "/members/:userId",
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const targetUserId = req.params.userId!;

      if (targetUserId === req.user.id) {
        throw new AppError(400, "You cannot remove yourself from the organization");
      }

      // Verify user belongs to this org
      const target = await db.query.users.findFirst({
        where: and(eq(users.id, targetUserId), eq(users.orgId as any, req.user.orgId)),
      });

      if (!target) throw new AppError(404, "Member not found in your organization");

      // Soft-remove: set orgId to null rather than deleting the account
      await db
        .update(users)
        .set({ orgId: null } as any)
        .where(eq(users.id, targetUserId));

      logger.info({ orgId: req.user.orgId, removedUserId: targetUserId }, "Member removed");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /settings/integrations — list channel connections (tokens redacted)
settingsRouter.get("/integrations", async (req, res, next) => {
  try {
    const connections = await db.query.channelConnections.findMany({
      where: eq(channelConnections.orgId, req.user.orgId),
      columns: {
        id: true,
        channel: true,
        accountName: true,
        accountId: true,
        scopes: true,
        isActive: true,
        connectedAt: true,
        tokenExpiresAt: true,
        // Never expose encrypted tokens
        accessTokenEnc: false,
        refreshTokenEnc: false,
      },
    });
    res.json({ data: connections });
  } catch (err) {
    next(err);
  }
});

// POST /settings/integrations/:id/validate — test token validity for a connection
settingsRouter.post("/integrations/:id/validate", async (req, res, next) => {
  try {
    const connection = await db.query.channelConnections.findFirst({
      where: and(
        eq(channelConnections.id, req.params.id!),
        eq(channelConnections.orgId, req.user.orgId),
      ),
    });

    if (!connection) throw new AppError(404, "Integration not found");

    let valid = false;
    let errorMessage: string | undefined;

    try {
      const accessToken = decryptToken(connection.accessTokenEnc);

      switch (connection.channel) {
        case "linkedin": {
          const client = new LinkedInClient(
            req.user.orgId,
            { accessToken },
            connection.accountId ?? "",
          );
          valid = await client.validateTokens();
          break;
        }
        default:
          // For channels without a full client yet, mark as not validated
          valid = false;
          errorMessage = `Token validation not yet implemented for ${connection.channel}`;
      }
    } catch (err) {
      errorMessage = (err as Error).message;
    }

    // Update the connection's isActive status based on validation result
    if (!valid) {
      await db
        .update(channelConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(channelConnections.id, connection.id));
    }

    res.json({
      data: {
        id: connection.id,
        channel: connection.channel,
        valid,
        errorMessage,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /settings/integrations/:id — disconnect a channel integration
settingsRouter.delete(
  "/integrations/:id",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(channelConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(channelConnections.id, req.params.id!),
            eq(channelConnections.orgId, req.user.orgId),
          ),
        )
        .returning({ id: channelConnections.id });

      if (!updated) throw new AppError(404, "Integration not found");

      logger.info({ integrationId: req.params.id }, "Channel integration disconnected");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ── Personas ──────────────────────────────────────────────────────────────────

// GET /settings/personas — list all personas for the org
settingsRouter.get("/personas", async (req, res, next) => {
  try {
    const orgPersonas = await db.query.personas.findMany({
      where: eq(personas.orgId, req.user.orgId),
    });
    res.json({ data: orgPersonas });
  } catch (err) {
    next(err);
  }
});

// POST /settings/personas — create a persona (max 3 per org)
settingsRouter.post("/personas", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = createPersonaSchema.parse(req.body);

    // Enforce max 3 personas
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(personas)
      .where(eq(personas.orgId, req.user.orgId));

    if (Number(count[0]?.count ?? 0) >= 3) {
      throw new AppError(400, "Maximum of 3 personas allowed per organization");
    }

    const [created] = await db
      .insert(personas)
      .values({ ...body, orgId: req.user.orgId })
      .returning();

    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

// PATCH /settings/personas/:id — update a persona
settingsRouter.patch("/personas/:id", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = updatePersonaSchema.parse(req.body);

    const [updated] = await db
      .update(personas)
      .set(body)
      .where(and(eq(personas.id, req.params.id!), eq(personas.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Persona not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /settings/personas/:id — delete a persona
settingsRouter.delete("/personas/:id", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(personas)
      .where(and(eq(personas.id, req.params.id!), eq(personas.orgId, req.user.orgId)))
      .returning({ id: personas.id });

    if (!deleted) throw new AppError(404, "Persona not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
