-- Migration 0022: Hashtag performance analytics
-- Adds:
--   1. hashtags_used jsonb column on assets (extracted hashtags per social post)
--   2. banned_hashtags jsonb column on organizations (org-level blocklist)
--   3. hashtag_performance table (aggregated per-hashtag engagement data)

-- 1. hashtags_used on assets
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS hashtags_used jsonb NOT NULL DEFAULT '[]';

-- 2. banned_hashtags on organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS banned_hashtags jsonb NOT NULL DEFAULT '[]';

-- 3. hashtag_performance table
CREATE TABLE IF NOT EXISTS hashtag_performance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hashtag      text NOT NULL,
  channel      text NOT NULL,
  times_used   integer NOT NULL DEFAULT 0,
  total_impressions  integer NOT NULL DEFAULT 0,
  total_engagement   integer NOT NULL DEFAULT 0,
  avg_engagement_rate real NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one row per org + hashtag + channel combination
CREATE UNIQUE INDEX IF NOT EXISTS hashtag_perf_org_hashtag_channel_idx
  ON hashtag_performance (org_id, hashtag, channel);

CREATE INDEX IF NOT EXISTS hashtag_perf_org_idx
  ON hashtag_performance (org_id);
