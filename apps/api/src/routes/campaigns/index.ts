import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { campaigns, assets, scheduledPosts } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { DistributionAgent } from "@orion/agents";
import { getOrgQuota } from "../../lib/usage.js";

export const campaignsRouter = Router();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goalId: z.string().uuid().optional(),
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
});

// GET /campaigns — list campaigns for the org
campaignsRouter.get("/", async (req, res, next) => {
  try {
    const { status, goalId } = req.query;

    const results = await db.query.campaigns.findMany({
      where: and(
        eq(campaigns.orgId, req.user.orgId),
        status ? eq(campaigns.status, status as string) : undefined,
        goalId ? eq(campaigns.goalId, goalId as string) : undefined,
      ),
      orderBy: desc(campaigns.createdAt),
      with: {
        goal: { columns: { id: true, type: true, brandName: true } },
        assets: { columns: { id: true, channel: true, type: true, status: true } },
      },
      limit: 50,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns — create a new campaign
campaignsRouter.post("/", async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        orgId: req.user.orgId,
        name: body.name,
        description: body.description,
        goalId: body.goalId,
        strategyId: body.strategyId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        budget: body.budget,
        status: "draft",
      })
      .returning();

    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id — get a campaign with its strategy, assets, and analytics
campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: {
        goal: true,
        strategy: true,
        assets: { orderBy: (a: any, { desc: d }: any) => [d(a.createdAt)] },
      },
    });

    if (!campaign) throw new AppError(404, "Campaign not found");
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// PATCH /campaigns/:id — update campaign fields or status
campaignsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateCampaignSchema.parse(req.body);

    const [updated] = await db
      .update(campaigns)
      .set({
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Campaign not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns/:id/launch — approve assets, confirm scheduled posts, activate campaign
campaignsRouter.post("/:id/launch", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const { approvedAssetIds } = z.object({
      approvedAssetIds: z.array(z.string().uuid()).optional().default([]),
    }).parse(req.body);

    const campaignAssets = await db.query.assets.findMany({
      where: and(eq(assets.campaignId, campaign.id), eq(assets.orgId, req.user.orgId)),
    });

    // If no approved IDs passed, use all approved assets in campaign
    const assetIds = approvedAssetIds.length > 0
      ? approvedAssetIds
      : campaignAssets.filter((a: any) => a.status === "approved").map((a: any) => a.id);

    if (assetIds.length === 0) {
      throw new AppError(409, "No approved assets. Please review and approve content before launching.");
    }

    // Check monthly post quota before creating scheduled posts
    const quota = await getOrgQuota(req.user.orgId);
    if (quota.postsRemaining <= 0) {
      return res.status(402).json({
        error: "Monthly post limit reached",
        upgradeUrl: "/billing",
      });
    }

    let launched = 0;
    let failed = 0;
    const createdPosts: any[] = [];

    const agent = new DistributionAgent();

    for (const assetId of assetIds) {
      const asset = campaignAssets.find((a: any) => a.id === assetId);
      if (!asset) continue;

      try {
        // Run pre-flight check
        const preflight = await agent.preflight(asset.channel, asset.contentText);

        if (!preflight.approved) {
          console.warn(`[launch] Pre-flight failed for asset ${assetId}: ${preflight.issues?.join(", ")}`);
          // Continue anyway — let user decide
        }

        // Check if a scheduled post already exists from pipeline auto-scheduling
        const existing = await db.query.scheduledPosts.findFirst({
          where: eq(scheduledPosts.assetId, assetId),
        });

        if (existing) {
          createdPosts.push(existing);
          launched++;
        } else {
          // Compute optimal send time and create new scheduled post
          const scheduledFor = computeOptimalSendTime(asset.channel, new Date());
          const [sp] = await db
            .insert(scheduledPosts)
            .values({
              orgId: req.user.orgId,
              assetId,
              channel: asset.channel,
              scheduledFor,
              status: "scheduled",
            })
            .returning();
          if (sp) { createdPosts.push(sp); launched++; }
        }
      } catch (err) {
        console.error(`[launch] Failed for asset ${assetId}:`, (err as Error).message);
        failed++;
      }
    }

    // Activate campaign
    await db
      .update(campaigns)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    res.json({ data: { launched, failed, scheduledPosts: createdPosts } });
  } catch (err) {
    next(err);
  }
});

function computeOptimalSendTime(channel: string, from: Date): Date {
  const d = new Date(from);
  switch (channel) {
    case "linkedin":
    case "email":
      return nextWeekday(d, [2, 3, 4], 9);
    case "instagram":
      return nextWeekday(d, [0, 6], 18);
    case "twitter":
      return nextWeekday(d, [1, 2, 3, 4, 5], 12);
    case "facebook":
      return nextWeekday(d, [1, 2, 3, 4, 5], 12);
    case "tiktok":
      return nextWeekday(d, [1, 2, 3, 4, 5], 19);
    case "blog":
      return nextWeekday(d, [1, 2], 10);
    default:
      return nextWeekday(d, [1, 2, 3, 4, 5], 9);
  }
}

function nextWeekday(from: Date, weekdays: number[], hour: number): Date {
  const d = new Date(from);
  d.setUTCHours(hour, 0, 0, 0);
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (weekdays.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// DELETE /campaigns/:id — soft-delete by archiving
campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(campaigns)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)))
      .returning({ id: campaigns.id });

    if (!updated) throw new AppError(404, "Campaign not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
