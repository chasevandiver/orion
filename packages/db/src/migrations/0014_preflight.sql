-- Add preflight_failed to the post_status enum
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL,
-- so this must be the first statement and the migration runner must handle it accordingly.
ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'preflight_failed';

-- Add preflight result columns to scheduled_posts
ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "preflight_status" text,
  ADD COLUMN IF NOT EXISTS "preflight_errors" jsonb DEFAULT '[]'::jsonb;
