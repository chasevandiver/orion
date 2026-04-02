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
import { organizations, users, channelConnections, personas, invitations, brandVoiceEdits } from "@orion/db/schema";
import { eq, and, sql, gt, count, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { BrandVoiceAgent } from "@orion/agents";
import { logger } from "../../lib/logger.js";
import { decryptToken } from "@orion/db/lib/token-encryption";
import { LinkedInClient, ResendClient, TwilioClient } from "@orion/integrations";
import { randomBytes } from "crypto";

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
  onboardingCompleted: z.boolean().optional(),
  autoPublishEnabled: z.boolean().optional(),
  autoPublishThreshold: z.number().int().min(0).max(100).optional(),
  timezone: z.string().min(1).max(50).optional(),
  autoUtmEnabled: z.boolean().optional(),
  bannedHashtags: z.array(z.string().regex(/^#\w+$/)).max(200).optional(),
  evergreenEnabled: z.boolean().optional(),
  evergreenMinAgeDays: z.number().int().min(7).max(365).optional(),
  evergreenMinEngagementMultiplier: z.number().min(1.0).max(10.0).optional(),
  evergreenMaxRecycles: z.number().int().min(1).max(20).optional(),
  monthlyMarketingBudget: z.number().min(0).optional().nullable(),
  reportLogoUrl: z.string().url().optional().or(z.literal("")),
  reportAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  reportSections: z.array(z.enum([
    "cover", "executive_summary", "key_metrics", "channel_breakdown",
    "top_content", "recommendations",
  ])).optional(),
  reportFooterText: z.string().max(500).optional().or(z.literal("")),
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
        case "sms": {
          const client = new TwilioClient(
            req.user.orgId,
            { accessToken },
            connection.accountId ?? "",
            connection.accountName ?? "",
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

// ── Invitations ───────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

/** Fire-and-forget invitation email via Resend (system RESEND_API_KEY). */
function sendInviteEmail(opts: {
  toEmail: string;
  orgName: string;
  inviteLink: string;
  invitedByName: string;
}): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("[invite] RESEND_API_KEY not configured — skipping invitation email. Share the link manually.");
    return;
  }

  const { toEmail, orgName, inviteLink, invitedByName } = opts;
  const client = new ResendClient("system", apiKey);

  const contentText = [
    `${invitedByName} has invited you to join ${orgName} on ORION.`,
    ``,
    `ORION is an AI-powered marketing operating system that helps teams create, schedule, and optimize campaigns.`,
    ``,
    `Accept your invitation by clicking the link below:`,
    inviteLink,
    ``,
    `This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.`,
  ].join("\n");

  client
    .sendToAddress({
      toEmail,
      subject: `You've been invited to join ${orgName} on ORION`,
      contentText,
      fromName: "ORION",
    })
    .then(() => logger.info({ toEmail }, "[invite] Invitation email sent"))
    .catch((err: Error) => logger.warn({ toEmail, err: err.message }, "[invite] Failed to send invitation email"));
}

// POST /settings/members/invite — create invitation + fire email
settingsRouter.post(
  "/members/invite",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const { email, role } = inviteSchema.parse(req.body);
      const orgId = req.user.orgId;

      // Prevent inviting an existing member
      const existing = await db.query.users.findFirst({
        where: and(eq(users.email, email), eq(users.orgId as any, orgId)),
        columns: { id: true },
      });
      if (existing) {
        throw new AppError(409, "This email is already a member of your organization");
      }

      // Revoke any previous pending invite for this email in this org
      await db
        .update(invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitations.orgId, orgId),
            eq(invitations.email, email),
            eq(invitations.status, "pending"),
          ),
        );

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [invite] = await db
        .insert(invitations)
        .values({
          orgId,
          email,
          role,
          token,
          expiresAt,
          invitedByUserId: req.user.id,
        })
        .returning();

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { name: true },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const inviteLink = `${appUrl}/auth/accept-invite?token=${token}`;

      sendInviteEmail({
        toEmail: email,
        orgName: org?.name ?? "your team",
        inviteLink,
        invitedByName: req.user.email,
      });

      logger.info({ orgId, email, role }, "[invite] Invitation created");
      res.status(201).json({
        data: {
          id: invite!.id,
          email: invite!.email,
          role: invite!.role,
          status: invite!.status,
          expiresAt: invite!.expiresAt,
          inviteLink,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /settings/members/invitations — list pending invitations for the org
settingsRouter.get("/members/invitations", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const pending = await db.query.invitations.findMany({
      where: and(
        eq(invitations.orgId, req.user.orgId),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
      columns: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        token: true,
      },
      orderBy: (inv: typeof invitations.$inferSelect, { desc }: any) => [desc(inv.createdAt)],
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const data = pending.map((inv: typeof pending[number]) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      inviteLink: `${appUrl}/auth/accept-invite?token=${inv.token}`,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /settings/members/invitations/:id/resend — resend invite email
settingsRouter.post(
  "/members/invitations/:id/resend",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const invite = await db.query.invitations.findFirst({
        where: and(
          eq(invitations.id, req.params.id!),
          eq(invitations.orgId, req.user.orgId),
          eq(invitations.status, "pending"),
        ),
      });

      if (!invite) throw new AppError(404, "Invitation not found or already accepted");
      if (invite.expiresAt < new Date()) throw new AppError(410, "Invitation has expired — create a new one");

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, req.user.orgId),
        columns: { name: true },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const inviteLink = `${appUrl}/auth/accept-invite?token=${invite.token}`;

      sendInviteEmail({
        toEmail: invite.email,
        orgName: org?.name ?? "your team",
        inviteLink,
        invitedByName: req.user.email,
      });

      res.json({ data: { resent: true, inviteLink } });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /settings/members/invitations/:id — revoke an invitation
settingsRouter.delete(
  "/members/invitations/:id",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitations.id, req.params.id!),
            eq(invitations.orgId, req.user.orgId),
            eq(invitations.status, "pending"),
          ),
        )
        .returning({ id: invitations.id });

      if (!updated) throw new AppError(404, "Invitation not found");
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

// ── Brand Voice ───────────────────────────────────────────────────────────────

// GET /settings/brand-voice — edit count + cached voice profile (auto-generates if stale)
settingsRouter.get("/brand-voice", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;

    const [{ editCount }] = await db
      .select({ editCount: count() })
      .from(brandVoiceEdits)
      .where(eq(brandVoiceEdits.orgId, orgId));

    const totalEdits = Number(editCount);

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { brandVoiceProfile: true },
    });

    let profile = (org?.brandVoiceProfile as Record<string, unknown> | null) ?? null;

    if (totalEdits >= 10) {
      const lastUpdated: Date | null = profile?.lastUpdated
        ? new Date(profile.lastUpdated as string)
        : null;

      // Check whether any edits are newer than the cached profile
      let needsRegen = !lastUpdated;
      if (lastUpdated) {
        const newerEdit = await db.query.brandVoiceEdits.findFirst({
          where: and(
            eq(brandVoiceEdits.orgId, orgId),
            gt(brandVoiceEdits.createdAt, lastUpdated),
          ),
        });
        needsRegen = !!newerEdit;
      }

      if (needsRegen) {
        const recentEdits = await db.query.brandVoiceEdits.findMany({
          where: eq(brandVoiceEdits.orgId, orgId),
          orderBy: desc(brandVoiceEdits.createdAt),
          limit: 20,
        });

        const agent = new BrandVoiceAgent();
        const voiceProfile = await agent.generate({
          edits: recentEdits.map((e) => ({
            originalText: e.originalText,
            editedText: e.editedText,
            channel: e.channel,
          })),
        });

        profile = { ...voiceProfile, lastUpdated: new Date().toISOString() };

        await db
          .update(organizations)
          .set({ brandVoiceProfile: profile, updatedAt: new Date() })
          .where(eq(organizations.id, orgId));
      }
    }

    res.json({ data: { editCount: totalEdits, profile } });
  } catch (err) {
    next(err);
  }
});

// POST /settings/brand-voice/regenerate — force-regenerate the voice profile
settingsRouter.post("/brand-voice/regenerate", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const orgId = req.user.orgId;

    const recentEdits = await db.query.brandVoiceEdits.findMany({
      where: eq(brandVoiceEdits.orgId, orgId),
      orderBy: desc(brandVoiceEdits.createdAt),
      limit: 20,
    });

    if (recentEdits.length < 10) {
      throw new AppError(400, "At least 10 edits are needed to generate a voice profile");
    }

    const agent = new BrandVoiceAgent();
    const voiceProfile = await agent.generate({
      edits: recentEdits.map((e) => ({
        originalText: e.originalText,
        editedText: e.editedText,
        channel: e.channel,
      })),
    });

    const profile = { ...voiceProfile, lastUpdated: new Date().toISOString() };

    await db
      .update(organizations)
      .set({ brandVoiceProfile: profile, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    res.json({ data: { profile } });
  } catch (err) {
    next(err);
  }
});
