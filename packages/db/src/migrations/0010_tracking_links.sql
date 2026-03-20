-- Migration 0010: tracking_links table + assets.tracking_url
--
-- Adds the closed-loop attribution layer: tracking links embedded in published
-- content (email CTAs, blog links) redirect through /t/:trackingId, record a
-- click analytics event, and attach campaign/channel attribution to contacts
-- captured via the webhook endpoint.

-- Add tracking_url column to assets
ALTER TABLE assets ADD COLUMN tracking_url TEXT;

-- Tracking links table
CREATE TABLE tracking_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id  TEXT        NOT NULL,
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id  UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  channel      TEXT,
  destination_url TEXT     NOT NULL DEFAULT '/',
  click_count  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX tracking_links_tracking_id_idx ON tracking_links (tracking_id);
CREATE INDEX        tracking_links_org_idx          ON tracking_links (org_id);
CREATE INDEX        tracking_links_campaign_idx     ON tracking_links (campaign_id);
