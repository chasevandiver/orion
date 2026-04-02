-- Add best_posting_times JSONB column to organizations.
-- Populated by the optimization agent after each analysis run.
-- Shape: [{ channel, dayOfWeek, hourUtc, engagementRate }]
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS best_posting_times JSONB;
