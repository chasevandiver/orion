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
import { organizations, users, channelConnections } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { logger } from "../../lib/logger.js";

export const settingsRouter = Router();

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

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
