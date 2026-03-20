/**
 * GET /t/:trackingId
 *
 * Public redirect endpoint that:
 *   1. Looks up the tracking link by its short ID.
 *   2. Records a "click" analytics_event (fire-and-forget — never blocks the redirect).
 *   3. Increments the link's click_count counter.
 *   4. Redirects the browser to the stored destination URL.
 *
 * Tracking IDs are org-scoped in the tracking_links table so a link from one
 * org can never attribute contacts to another org.
 *
 * Mount BEFORE authMiddleware — this endpoint is public (no session required).
 */

import { Router } from "express";
import { db } from "@orion/db";
import { trackingLinks, analyticsEvents } from "@orion/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export const trackRouter = Router();

trackRouter.get("/:trackingId", async (req, res) => {
  const { trackingId } = req.params;

  // Default fallback — used when the tracking ID is unknown
  const fallback = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let destination = fallback;

  try {
    const [link] = await db
      .select()
      .from(trackingLinks)
      .where(eq(trackingLinks.trackingId, trackingId))
      .limit(1);

    if (!link) {
      logger.warn(`[track] Unknown trackingId: ${trackingId}`);
      return res.redirect(302, fallback);
    }

    destination = link.destinationUrl;

    // ── Fire-and-forget side effects ─────────────────────────────────────────
    // We do NOT await these — the redirect must be instant.
    setImmediate(() => {
      // Record the click as an analytics event
      db.insert(analyticsEvents)
        .values({
          orgId: link.orgId,
          ...(link.campaignId ? { campaignId: link.campaignId } : {}),
          channel: link.channel ?? undefined,
          eventType: "click",
          value: 1,
          isSimulated: false,
          metadataJson: {
            trackingId,
            userAgent: req.headers["user-agent"] ?? null,
            referer: req.headers["referer"] ?? null,
          },
          occurredAt: new Date(),
        })
        .catch((err: Error) =>
          logger.warn(`[track] Failed to insert analytics event: ${err.message}`)
        );

      // Increment click counter
      db.update(trackingLinks)
        .set({ clickCount: sql`${trackingLinks.clickCount} + 1` })
        .where(eq(trackingLinks.trackingId, trackingId))
        .catch((err: Error) =>
          logger.warn(`[track] Failed to increment click_count: ${err.message}`)
        );
    });
  } catch (err) {
    logger.error(`[track] Redirect error for ${trackingId}: ${(err as Error).message}`);
    // Always redirect even on error — never return an error page to the user
  }

  return res.redirect(302, destination);
});
