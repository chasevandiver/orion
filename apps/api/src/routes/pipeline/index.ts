import { Router } from "express";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  campaigns,
  assets,
  organizations,
} from "@orion/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";

export const pipelineRouter = Router();

type StageId = "strategy" | "brand" | "copy" | "visuals" | "designing" | "campaign" | "ready";
type StageState = "waiting" | "active" | "complete";

function deriveState(complete: boolean, active: boolean): StageState {
  if (complete) return "complete";
  if (active) return "active";
  return "waiting";
}

// GET /pipeline/status/:goalId — poll pipeline progress derived from DB state
pipelineRouter.get("/status/:goalId", async (req, res, next) => {
  try {
    const goalId = req.params.goalId!;
    const orgId = req.user.orgId;

    const [goal, org] = await Promise.all([
      db.query.goals.findFirst({
        where: and(eq(goals.id, goalId), eq(goals.orgId, orgId)),
      }),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          logoUrl: true,
          brandPrimaryColor: true,
          brandSecondaryColor: true,
          inspirationImageUrl: true,
        },
      }),
    ]);

    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const strategy = await db.query.strategies.findFirst({
      where: eq(strategies.goalId, goalId),
      columns: { id: true, contentText: true },
    });

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.goalId, goalId), eq(campaigns.orgId, orgId)),
      columns: { id: true, name: true },
    });

    type AssetRow = {
      id: string;
      channel: string;
      imageUrl: string | null;
      compositedImageUrl: string | null;
      variant: "a" | "b";
      contentText: string;
    };

    let allAssets: AssetRow[] = [];
    if (campaign) {
      allAssets = (await db.query.assets.findMany({
        where: and(
          eq(assets.campaignId, campaign.id),
          eq(assets.generatedByAgent, "ContentCreatorAgent"),
        ),
        columns: {
          id: true,
          channel: true,
          imageUrl: true,
          compositedImageUrl: true,
          variant: true,
          contentText: true,
        },
      })) as AssetRow[];
    }

    const channels = [...new Set(allAssets.map((a) => a.channel))];

    const channelCounts: Record<
      string,
      { copy: number; images: number; composites: number; total: number }
    > = {};
    for (const ch of channels) {
      const chAssets = allAssets.filter((a) => a.channel === ch);
      channelCounts[ch] = {
        total: chAssets.length,
        copy: chAssets.length,
        images: chAssets.filter((a) => a.imageUrl).length,
        composites: chAssets.filter((a) => a.compositedImageUrl).length,
      };
    }

    const assetPreviews = allAssets.map((a) => ({
      id: a.id,
      channel: a.channel,
      variant: a.variant,
      imageUrl: a.imageUrl,
      compositedImageUrl: a.compositedImageUrl,
      contentPreview: a.contentText.slice(0, 120),
    }));

    const hasStrategy = !!strategy;
    const hasCampaign = !!campaign;
    const hasCopy = allAssets.length > 0;
    const hasImages = allAssets.some((a) => a.imageUrl);
    const imagesComplete = hasCopy && allAssets.every((a) => a.imageUrl);
    const hasComposites = allAssets.some((a) => a.compositedImageUrl);
    const compositesComplete = hasCopy && allAssets.every((a) => a.compositedImageUrl);
    const allDone = hasStrategy && hasCampaign && compositesComplete;

    const stages: Array<{ id: StageId; state: StageState }> = [
      { id: "strategy",  state: deriveState(hasStrategy, !hasStrategy) },
      { id: "brand",     state: deriveState(hasStrategy, false) },
      { id: "copy",      state: deriveState(hasCopy, hasStrategy && !hasCopy) },
      { id: "visuals",   state: deriveState(imagesComplete, hasCopy && !imagesComplete) },
      { id: "designing", state: deriveState(compositesComplete, hasImages && !compositesComplete) },
      { id: "campaign",  state: deriveState(hasCampaign && hasCopy, hasCampaign && !hasCopy) },
      { id: "ready",     state: deriveState(allDone, compositesComplete && !allDone) },
    ];

    res.json({
      data: {
        stages,
        campaignId: campaign?.id ?? null,
        campaignName: campaign?.name ?? null,
        goalId,
        done: allDone,
        strategyText: strategy?.contentText ?? null,
        channels,
        channelCounts,
        assetPreviews,
        org: org
          ? {
              logoUrl: org.logoUrl,
              brandPrimaryColor: org.brandPrimaryColor,
              brandSecondaryColor: org.brandSecondaryColor,
              inspirationImageUrl: org.inspirationImageUrl,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /pipeline/calendar — assets grouped by creation date for calendar view
pipelineRouter.get("/calendar", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const { year, month } = req.query as { year?: string; month?: string };

    const y = parseInt(year ?? String(new Date().getFullYear()));
    const m = parseInt(month ?? String(new Date().getMonth() + 1));

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const monthAssets = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, orgId),
        gte(assets.createdAt, from),
        lt(assets.createdAt, to),
      ),
      columns: {
        id: true,
        channel: true,
        contentText: true,
        compositedImageUrl: true,
        imageUrl: true,
        status: true,
        variant: true,
        campaignId: true,
        createdAt: true,
      },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    // Group by ISO date string (YYYY-MM-DD)
    const grouped: Record<string, typeof monthAssets> = {};
    for (const asset of monthAssets) {
      const day = asset.createdAt.toISOString().slice(0, 10);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(asset);
    }

    res.json({ data: { grouped, year: y, month: m } });
  } catch (err) {
    next(err);
  }
});
