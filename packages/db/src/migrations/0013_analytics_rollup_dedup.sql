-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0013 — Fix analytics_rollups unique index + deduplicate rows
--
-- Root cause: the previous unique index included nullable columns (campaign_id,
-- channel). PostgreSQL treats (A, NULL) and (A, NULL) as DISTINCT in a unique
-- index, so ON CONFLICT never fires and duplicate rows accumulate indefinitely.
--
-- Fix:
--   1. Deduplicate any existing duplicate rows (idempotent — safe to re-run).
--   2. Drop the old column-list unique index.
--   3. Create a new functional unique index using COALESCE() so NULL values
--      compare equal within the same logical rollup bucket.
--
-- The new conflict target used by the application is:
--   (org_id, COALESCE(campaign_id, sentinel_uuid), COALESCE(channel, ''), date, is_simulated)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Deduplicate existing rows ────────────────────────────────────────
--
-- For each group that shares the same logical rollup key (normalising NULLs
-- with COALESCE), keep the most-recently-computed row and accumulate all metric
-- totals into it, then delete the superseded duplicates.
--
-- This is fully idempotent: when no duplicates exist the UPDATE and DELETE are
-- no-ops and the index operations below proceed without error.

DO $$
BEGIN

  -- 1a. Accumulate metrics from duplicates into the keeper row (latest computed_at).
  WITH groups AS (
    SELECT
      org_id,
      COALESCE(campaign_id::text, '') AS norm_campaign,
      COALESCE(channel, '')           AS norm_channel,
      date,
      is_simulated,
      MAX(computed_at)                AS latest_computed_at,
      SUM(impressions)                AS total_impressions,
      SUM(clicks)                     AS total_clicks,
      SUM(conversions)                AS total_conversions,
      SUM(engagements)                AS total_engagements,
      SUM(spend)                      AS total_spend,
      SUM(revenue)                    AS total_revenue
    FROM analytics_rollups
    GROUP BY
      org_id,
      COALESCE(campaign_id::text, ''),
      COALESCE(channel, ''),
      date,
      is_simulated
    HAVING COUNT(*) > 1          -- only groups that actually have duplicates
  ),
  keepers AS (
    -- Identify the single row to keep per group (most recent computed_at)
    SELECT DISTINCT ON (
        r.org_id,
        COALESCE(r.campaign_id::text, ''),
        COALESCE(r.channel, ''),
        r.date,
        r.is_simulated
      )
      r.id,
      g.total_impressions,
      g.total_clicks,
      g.total_conversions,
      g.total_engagements,
      g.total_spend,
      g.total_revenue
    FROM analytics_rollups r
    JOIN groups g
      ON  r.org_id                    = g.org_id
      AND COALESCE(r.campaign_id::text, '') = g.norm_campaign
      AND COALESCE(r.channel, '')     = g.norm_channel
      AND r.date                      = g.date
      AND r.is_simulated              = g.is_simulated
    ORDER BY
      r.org_id,
      COALESCE(r.campaign_id::text, ''),
      COALESCE(r.channel, ''),
      r.date,
      r.is_simulated,
      r.computed_at DESC,
      r.id DESC
  )
  UPDATE analytics_rollups ar
  SET
    impressions  = k.total_impressions,
    clicks       = k.total_clicks,
    conversions  = k.total_conversions,
    engagements  = k.total_engagements,
    spend        = k.total_spend,
    revenue      = k.total_revenue,
    computed_at  = now()
  FROM keepers k
  WHERE ar.id = k.id;

  -- 1b. Delete all duplicate rows that were NOT chosen as the keeper.
  DELETE FROM analytics_rollups
  WHERE id IN (
    SELECT r.id
    FROM analytics_rollups r
    WHERE (
      SELECT COUNT(*)
      FROM analytics_rollups r2
      WHERE
        r2.org_id                     = r.org_id
        AND COALESCE(r2.campaign_id::text, '') = COALESCE(r.campaign_id::text, '')
        AND COALESCE(r2.channel, '')  = COALESCE(r.channel, '')
        AND r2.date                   = r.date
        AND r2.is_simulated           = r.is_simulated
    ) > 1
    AND r.id NOT IN (
      -- Keep the row with the latest computed_at (break ties with id DESC)
      SELECT DISTINCT ON (
          r3.org_id,
          COALESCE(r3.campaign_id::text, ''),
          COALESCE(r3.channel, ''),
          r3.date,
          r3.is_simulated
        ) r3.id
      FROM analytics_rollups r3
      ORDER BY
        r3.org_id,
        COALESCE(r3.campaign_id::text, ''),
        COALESCE(r3.channel, ''),
        r3.date,
        r3.is_simulated,
        r3.computed_at DESC,
        r3.id DESC
    )
  );

END $$;

-- ── Step 2: Drop the old column-list unique index ─────────────────────────────

DROP INDEX IF EXISTS analytics_rollups_unique_idx;

-- ── Step 3: Create the COALESCE-based functional unique index ─────────────────
--
-- COALESCE(campaign_id, sentinel) maps NULL → a fixed sentinel UUID so that
-- two rows with NULL campaign_id in the same org/channel/date bucket collide.
-- COALESCE(channel, '') does the same for the nullable channel column.

CREATE UNIQUE INDEX IF NOT EXISTS analytics_rollups_unique_idx
  ON analytics_rollups (
    org_id,
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel, ''),
    date,
    is_simulated
  );
