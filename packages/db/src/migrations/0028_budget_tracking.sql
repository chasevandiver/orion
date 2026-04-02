-- Migration: budget tracking fields
-- campaigns: actual spend + per-channel spend breakdown
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "actual_spend" real,
  ADD COLUMN IF NOT EXISTS "spend_by_channel" jsonb;

-- organizations: monthly marketing budget
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "monthly_marketing_budget" real;
