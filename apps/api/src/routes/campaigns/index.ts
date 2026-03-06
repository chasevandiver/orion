import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { campaigns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";

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
