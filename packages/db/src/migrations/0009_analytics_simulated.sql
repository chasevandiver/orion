-- Add is_simulated column to analytics_rollups
-- This allows the hourly rollup cron to create separate rows for real vs simulated events,
-- so the analytics API and dashboard can distinguish projected estimates from real data.

ALTER TABLE "analytics_rollups" ADD COLUMN "is_simulated" boolean NOT NULL DEFAULT false;

-- Rebuild the unique index to include is_simulated.
-- This lets the same (org, campaign, channel, date) have two rows: one real, one simulated.
DROP INDEX IF EXISTS "analytics_rollups_unique_idx";
CREATE UNIQUE INDEX "analytics_rollups_unique_idx"
  ON "analytics_rollups" ("org_id", "campaign_id", "channel", "date", "is_simulated");
