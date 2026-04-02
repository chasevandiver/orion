/**
 * Job: Recycle Evergreen Content
 *
 * Runs weekly. For each org with evergreenEnabled = true:
 *   1. Computes the org's average engagement rate from analyticsRollups.
 *   2. Finds approved/published assets that are older than evergreenMinAgeDays,
 *      have not been recycled in the last 60 days, and have recycle_count below
 *      evergreenMaxRecycles.
 *   3. For each candidate, computes its asset-level engagement from analyticsEvents.
 *   4. If engagement_rate > org_avg * evergreenMinEngagementMultiplier, rewrites
 *      the content with ContentCreatorAgent and saves it as a new "recycled" asset
 *      linked to the source, then auto-schedules it.
 *
 * Manually triggered via: POST /assets/:id/recycle (single-asset fast path).
 */
import { inngest } from "../client.js";
import * as Sentry from "@sentry/node";
import { db } from "@orion/db";
import {
  assets,
  organizations,
  analyticsRollups,
  analyticsEvents,
  scheduledPosts,
} from "@orion/db/schema";
import { eq, and, lt, lte, or, isNull, sql } from "drizzle-orm";
import { ContentCreatorAgent } from "@orion/agents";
import { getOptimalPostingTime } from "../lib/posting-times.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute org-average engagement_rate = total engagements / total impressions */
async function computeOrgAvgEngagement(orgId: string): Promise<number> {
  const rows = await db
    .select({
      totalEngagements: sql<number>`sum(${analyticsRollups.engagements})`,
      totalImpressions: sql<number>`sum(${analyticsRollups.impressions})`,
    })
    .from(analyticsRollups)
    .where(eq(analyticsRollups.orgId, orgId));

  const { totalEngagements, totalImpressions } = rows[0] ?? {};
  if (!totalImpressions || totalImpressions === 0) return 0;
  return Number(totalEngagements ?? 0) / Number(totalImpressions);
}

/** Compute per-asset engagement from analyticsEvents (clicks + engagements / impressions). */
async function computeAssetEngagementRate(assetId: string): Promise<number> {
  const rows = await db
    .select({
      eventType: analyticsEvents.eventType,
      total: sql<number>`count(*)`,
    })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.assetId, assetId))
    .groupBy(analyticsEvents.eventType);

  let impressions = 0;
  let engagements = 0;
  for (const row of rows) {
    const count = Number(row.total ?? 0);
    if (row.eventType === "impression") impressions += count;
    if (row.eventType === "engagement" || row.eventType === "click") engagements += count;
  }

  if (impressions === 0) return 0;
  return engagements / impressions;
}

/** Rewrite one asset's content using ContentCreatorAgent.rewrite(). */
export async function recycleAssetContent(
  asset: { id: string; contentText: string; channel: string },
): Promise<string> {
  const agent = new ContentCreatorAgent();
  const prompt = `You are refreshing a high-performing ${asset.channel} post. Here is the original:

---
${asset.contentText}
---

Refresh this high-performing post with a new hook and slightly different angle while preserving the core message. Do not repeat the opening line. Keep the same channel format and length constraints. Output only the refreshed content — no preamble or meta-commentary.`;

  return agent.rewrite(prompt);
}

// ── Cron job ──────────────────────────────────────────────────────────────────

export const recycleEvergreenContent = inngest.createFunction(
  {
    id: "recycle-evergreen-content",
    name: "Recycle Evergreen Content",
    retries: 2,
    throttle: { limit: 5, period: "1m" },
  },
  { cron: "0 9 * * 1" }, // Every Monday at 09:00 UTC
  async ({ step }) => {
    try {
      const RECYCLE_COOLDOWN_DAYS = 60;

      // ── 1. Fetch all orgs with evergreen enabled ────────────────────────
      const evergreenOrgs = await step.run("fetch-evergreen-orgs", async () =>
        db.query.organizations.findMany({
          where: eq(organizations.evergreenEnabled, true),
          columns: {
            id: true,
            timezone: true,
            evergreenMinAgeDays: true,
            evergreenMinEngagementMultiplier: true,
            evergreenMaxRecycles: true,
          },
        }),
      );

      if (evergreenOrgs.length === 0) return { skipped: true, reason: "no orgs with evergreen enabled" };

      let totalRecycled = 0;

      for (const org of evergreenOrgs) {
        const orgResult = await step.run(`process-org-${org.id}`, async () => {
          const minAgeMs = (org.evergreenMinAgeDays ?? 30) * 24 * 60 * 60 * 1000;
          const cutoffDate = new Date(Date.now() - minAgeMs);
          const cooldownDate = new Date(Date.now() - RECYCLE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
          const maxRecycles = org.evergreenMaxRecycles ?? 3;
          const multiplier = org.evergreenMinEngagementMultiplier ?? 1.5;

          // ── 2. Compute org avg engagement ──────────────────────────────
          const orgAvgEngagement = await computeOrgAvgEngagement(org.id);

          // ── 3. Find candidate assets ───────────────────────────────────
          // Approved or published, old enough, not recycled recently,
          // recycle_count below max, not themselves recycled variants
          const candidates = await db.query.assets.findMany({
            where: and(
              eq(assets.orgId, org.id),
              or(eq(assets.status, "approved"), eq(assets.status, "published")),
              lte(assets.createdAt, cutoffDate),
              lte(assets.recycleCount, maxRecycles - 1),
              isNull(assets.sourceAssetId), // skip already-recycled variants
              or(
                isNull(assets.lastRecycledAt),
                lt(assets.lastRecycledAt, cooldownDate),
              ),
            ),
            columns: {
              id: true,
              orgId: true,
              campaignId: true,
              channel: true,
              type: true,
              contentText: true,
              recycleCount: true,
            },
            limit: 20, // cap per org per run to avoid runaway
          });

          if (candidates.length === 0) return { recycled: 0 };

          let recycled = 0;

          for (const asset of candidates) {
            try {
              // ── 4. Compute asset engagement ──────────────────────────
              const assetEngagement = await computeAssetEngagementRate(asset.id);
              const threshold = orgAvgEngagement * multiplier;

              // If we have no org-level data, fall back to marking recyclable=true
              // so the UI can surface it, but skip auto-recycling
              if (orgAvgEngagement > 0 && assetEngagement < threshold) continue;

              // ── 5. Mark source asset as recyclable + bump lastRecycledAt ─
              await db
                .update(assets)
                .set({
                  recyclable: true,
                  lastRecycledAt: new Date(),
                  recycleCount: (asset.recycleCount ?? 0) + 1,
                  updatedAt: new Date(),
                })
                .where(eq(assets.id, asset.id));

              // ── 6. Rewrite content ────────────────────────────────────
              const freshContent = await recycleAssetContent({
                id: asset.id,
                contentText: asset.contentText,
                channel: asset.channel,
              });

              if (!freshContent) continue;

              // ── 7. Insert recycled asset ──────────────────────────────
              const [newAsset] = await db
                .insert(assets)
                .values({
                  orgId: asset.orgId,
                  campaignId: asset.campaignId ?? undefined,
                  channel: asset.channel,
                  type: asset.type,
                  contentText: freshContent,
                  status: "approved",
                  generatedByAgent: "evergreen-recycler",
                  modelVersion: "claude-sonnet-4-6",
                  sourceAssetId: asset.id,
                  metadata: { recycledFrom: asset.id, recycleRound: (asset.recycleCount ?? 0) + 1 },
                })
                .returning({ id: assets.id, channel: assets.channel });

              if (!newAsset) continue;

              // ── 8. Auto-schedule recycled asset ───────────────────────
              const scheduledFor = await getOptimalPostingTime(
                org.id,
                newAsset.channel,
                new Date(),
                org.timezone ?? "America/Chicago",
              );

              await db.insert(scheduledPosts).values({
                orgId: org.id,
                assetId: newAsset.id,
                channel: newAsset.channel as any,
                status: "scheduled",
                scheduledFor,
              });

              recycled++;
            } catch (assetErr) {
              console.error(
                `[recycleEvergreen] Failed to recycle asset ${asset.id}:`,
                (assetErr as Error).message,
              );
            }
          }

          return { recycled };
        });

        totalRecycled += orgResult.recycled ?? 0;
      }

      return { totalRecycled, orgsProcessed: evergreenOrgs.length };
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
  },
);

// ── Event-triggered single-asset recycle (Recycle Now button) ─────────────────

export const recycleSingleAsset = inngest.createFunction(
  {
    id: "recycle-single-asset",
    name: "Recycle Single Asset",
    retries: 2,
  },
  { event: "orion/asset.recycle" },
  async ({ event, step }) => {
    try {
      const { assetId, orgId } = event.data as { assetId: string; orgId: string };

      const [asset, org] = await step.run("fetch-asset-and-org", async () =>
        Promise.all([
          db.query.assets.findFirst({
            where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
            columns: {
              id: true,
              orgId: true,
              campaignId: true,
              channel: true,
              type: true,
              contentText: true,
              recycleCount: true,
              sourceAssetId: true,
            },
          }),
          db.query.organizations.findFirst({
            where: eq(organizations.id, orgId),
            columns: {
              evergreenMaxRecycles: true,
              timezone: true,
            },
          }),
        ]),
      );

      if (!asset) return { skipped: true, reason: "asset not found" };
      if (asset.sourceAssetId) return { skipped: true, reason: "cannot recycle a recycled variant" };

      const maxRecycles = org?.evergreenMaxRecycles ?? 3;
      if ((asset.recycleCount ?? 0) >= maxRecycles) {
        return { skipped: true, reason: `max recycles (${maxRecycles}) reached` };
      }

      // Rewrite content
      const freshContent = await step.run("rewrite-content", async () =>
        recycleAssetContent({
          id: asset.id,
          contentText: asset.contentText,
          channel: asset.channel,
        }),
      );

      // Mark source as recyclable + bump counters
      await step.run("update-source-asset", async () =>
        db
          .update(assets)
          .set({
            recyclable: true,
            lastRecycledAt: new Date(),
            recycleCount: (asset.recycleCount ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(assets.id, assetId)),
      );

      // Insert recycled asset
      const newAssetId = await step.run("create-recycled-asset", async () => {
        const [newAsset] = await db
          .insert(assets)
          .values({
            orgId: asset.orgId,
            campaignId: asset.campaignId ?? undefined,
            channel: asset.channel,
            type: asset.type,
            contentText: freshContent,
            status: "approved",
            generatedByAgent: "evergreen-recycler",
            modelVersion: "claude-sonnet-4-6",
            sourceAssetId: asset.id,
            metadata: { recycledFrom: asset.id, recycleRound: (asset.recycleCount ?? 0) + 1 },
          })
          .returning({ id: assets.id });
        return newAsset?.id ?? null;
      });

      if (!newAssetId) return { skipped: true, reason: "failed to create recycled asset" };

      // Schedule the new asset
      const scheduledPostId = await step.run("schedule-recycled-asset", async () => {
        const scheduledFor = await getOptimalPostingTime(
          orgId,
          asset.channel,
          new Date(),
          org?.timezone ?? "America/Chicago",
        );

        const [post] = await db
          .insert(scheduledPosts)
          .values({
            orgId,
            assetId: newAssetId,
            channel: asset.channel as any,
            status: "scheduled",
            scheduledFor,
          })
          .returning({ id: scheduledPosts.id });

        return post?.id ?? null;
      });

      return { recycled: true, newAssetId, scheduledPostId };
    } catch (err) {
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      throw err;
    }
  },
);
