-- Evergreen content recycling system.
-- Adds asset-level recycle tracking and org-level evergreen settings.

-- Assets: recycle tracking fields
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS recyclable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_recycled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recycle_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

-- Organizations: evergreen automation settings
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS evergreen_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evergreen_min_age_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS evergreen_min_engagement_multiplier REAL NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS evergreen_max_recycles INTEGER NOT NULL DEFAULT 3;

-- Index for fast evergreen candidate queries
CREATE INDEX IF NOT EXISTS assets_recyclable_idx ON assets (org_id, recyclable, last_recycled_at)
  WHERE recyclable = true;
