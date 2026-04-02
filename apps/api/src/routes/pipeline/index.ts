import { Router } from "express";
import { db } from "@orion/db";
import {
  goals,
  strategies,
  campaigns,
  assets,
  organizations,
  scheduledPosts,
} from "@orion/db/schema";
import { eq, and, gte, lt, lte, asc } from "drizzle-orm";

export const pipelineRouter = Router();

type StageId = "strategy" | "brand" | "copy" | "visuals" | "designing" | "campaign" | "ready";
type StageState = "waiting" | "active" | "complete";

function deriveState(complete: boolean, active: boolean): StageState {
  if (complete) return "complete";
  if (active) return "active";
  return "waiting";
}

// GET /pipeline/status/:goalId — SSE stream of pipeline progress derived from DB state
pipelineRouter.get("/status/:goalId", async (req, res) => {
  const goalId = req.params.goalId!;
  const orgId = req.user.orgId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  type AssetRow = {
    id: string;
    channel: string;
    imageUrl: string | null;
    compositedImageUrl: string | null;
    variant: "a" | "b";
    contentText: string;
  };

  async function buildSnapshot() {
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

    if (!goal) return null;

    const strategy = await db.query.strategies.findFirst({
      where: eq(strategies.goalId, goalId),
      columns: { id: true, contentText: true },
    });

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.goalId, goalId), eq(campaigns.orgId, orgId)),
      columns: { id: true, name: true },
    });

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

    return {
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
    };
  }

  // Send initial snapshot immediately
  try {
    const snapshot = await buildSnapshot();
    if (!snapshot) {
      res.write(`data: ${JSON.stringify({ error: "Goal not found" })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "Failed to load status" })}\n\n`);
  }

  // Poll every 1.5s and stream updates
  const interval = setInterval(async () => {
    try {
      const snapshot = await buildSnapshot();
      if (snapshot) {
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      }
    } catch {
      // Non-fatal — skip this tick
    }
  }, 1500);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

// GET /pipeline/calendar — scheduled posts and assets grouped by date for calendar view
pipelineRouter.get("/calendar", async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const { year, month } = req.query as { year?: string; month?: string };

    const y = parseInt(year ?? String(new Date().getFullYear()));
    // month param is 0-indexed to match JS Date convention
    const m = parseInt(month ?? String(new Date().getMonth()));

    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 1);

    // Fetch scheduled posts for the month (joined with asset via with:)
    const monthPosts = await db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.orgId, orgId),
        gte(scheduledPosts.scheduledFor, from),
        lt(scheduledPosts.scheduledFor, to),
      ),
      with: {
        asset: {
          columns: {
            contentText: true,
            compositedImageUrl: true,
            campaignId: true,
          },
          with: {
            campaign: { columns: { name: true } },
          },
        },
      },
      orderBy: [asc(scheduledPosts.scheduledFor)],
    });

    // Also include draft assets created in the month that have no scheduled post yet
    const monthAssets = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, orgId),
        eq(assets.status, "draft"),
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
      with: {
        campaign: { columns: { name: true } },
        scheduledPosts: { columns: { id: true } },
      },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      limit: 100,
    });

    type CalendarEntry = {
      id: string;
      assetId: string | null;
      channel: string;
      status: string;
      isSimulated: boolean;
      scheduledFor: string | null;
      publishedAt: string | null;
      contentPreview: string;
      compositedImageUrl: string | null;
      campaignName: string | null;
      retryCount: number;
      errorMessage: string | null;
    };

    const days: Record<string, CalendarEntry[]> = {};

    // Add scheduled posts grouped by scheduledFor date
    for (const post of monthPosts) {
      const day = post.scheduledFor.toISOString().slice(0, 10);
      if (!days[day]) days[day] = [];
      days[day].push({
        id: post.id,
        assetId: post.assetId ?? null,
        channel: post.channel,
        status: post.status,
        isSimulated: post.isSimulated,
        scheduledFor: post.scheduledFor.toISOString(),
        publishedAt: post.publishedAt?.toISOString() ?? null,
        contentPreview: ((post as any).asset?.contentText ?? "").slice(0, 40),
        compositedImageUrl: (post as any).asset?.compositedImageUrl ?? null,
        campaignName: (post as any).asset?.campaign?.name ?? null,
        retryCount: post.retryCount,
        errorMessage: post.errorMessage ?? null,
      });
    }

    // Add draft assets that don't have a scheduled post yet
    const scheduledAssetIds = new Set(monthPosts.map((p) => p.assetId).filter(Boolean));
    for (const asset of monthAssets) {
      if (scheduledAssetIds.has(asset.id)) continue;
      const hasScheduled = (asset as any).scheduledPosts?.length > 0;
      if (hasScheduled) continue;

      const day = asset.createdAt.toISOString().slice(0, 10);
      if (!days[day]) days[day] = [];
      days[day].push({
        id: `draft-${asset.id}`,
        assetId: asset.id,
        channel: asset.channel,
        status: "draft",
        isSimulated: false,
        scheduledFor: null,
        publishedAt: null,
        contentPreview: asset.contentText.slice(0, 40),
        compositedImageUrl: asset.compositedImageUrl ?? null,
        campaignName: (asset as any).campaign?.name ?? null,
        retryCount: 0,
        errorMessage: null,
      });
    }

    const stats = {
      scheduled: monthPosts.filter((p) => p.status === "scheduled").length,
      published: monthPosts.filter((p) => p.status === "published").length,
      failed: monthPosts.filter((p) => p.status === "failed").length,
      draft: monthAssets.filter((a: any) => !(a.scheduledPosts?.length > 0)).length,
    };

    res.json({ data: { days, stats, year: y, month: m } });
  } catch (err) {
    next(err);
  }
});
