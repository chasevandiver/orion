-- Add auto_utm_enabled toggle to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_utm_enabled boolean NOT NULL DEFAULT true;
