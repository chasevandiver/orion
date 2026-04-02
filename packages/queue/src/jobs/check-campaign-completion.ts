/**
 * Campaign Completion Checker — cron job that runs every 15 minutes.
 *
 * For each campaign with status "active", checks if ALL of its scheduled posts
 * have reached a terminal state (published, failed, cancelled, preflight_failed).
 * If so, fires "orion/campaign.completed" and updates campaign status to "completed".
 */
import { inngest } from "../client.js";
import { db } from "@orion/db";
import { campaigns, scheduledPosts, assets } from "@orion/db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";

const TERMINAL_STATUSES = ["published", "failed", "cancelled", "preflight_failed"] as const;

export const checkCampaignCompletion = inngest.createFunction(
  {
    id: "check-campaign-completion",
    name: "Check Campaign Completion",
    retries: 1,
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    // Fetch all active campaigns
    const activeCampaigns = await step.run("fetch-active-campaigns", async () =>
      db.query.campaigns.findMany({
        where: eq(campaigns.status, "active"),
        columns: { id: true, orgId: true },
      }),
    );

    if (activeCampaigns.length === 0) return { checked: 0, completed: 0 };

    let completedCount = 0;

    for (const campaign of activeCampaigns) {
      const didComplete = await step.run(`check-${campaign.id.slice(0, 8)}`, async () => {
        // Find all assets for this campaign
        const campaignAssets = await db.query.assets.findMany({
          where: eq(assets.campaignId, campaign.id),
          columns: { id: true },
        });

        if (campaignAssets.length === 0) return false;

        const assetIds = campaignAssets.map((a) => a.id);

        // Find all scheduled posts for these assets
        const posts = await db.query.scheduledPosts.findMany({
          where: sql`${scheduledPosts.assetId} IN (${sql.join(
            assetIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          columns: { id: true, status: true },
        });

        // No posts scheduled yet — not complete
        if (posts.length === 0) return false;

        // Check if every post is in a terminal state
        const allTerminal = posts.every((p) =>
          (TERMINAL_STATUSES as readonly string[]).includes(p.status),
        );

        if (!allTerminal) return false;

        // All posts are terminal — mark campaign as completed
        await db
          .update(campaigns)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(campaigns.id, campaign.id));

        // Fire campaign.completed event for post-campaign analysis
        await inngest.send({
          name: "orion/campaign.completed",
          data: { campaignId: campaign.id, orgId: campaign.orgId },
        });

        console.info(
          `[check-campaign-completion] Campaign ${campaign.id} completed — ${posts.length} posts all terminal`,
        );

        return true;
      });

      if (didComplete) completedCount++;
    }

    return { checked: activeCampaigns.length, completed: completedCount };
  },
);
