-- Layer 5: Auto-publish configuration on organizations
-- Enables confidence-based automatic distribution of scheduled posts

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "auto_publish_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auto_publish_threshold" integer NOT NULL DEFAULT 80;

-- Ensure publish_success exists in analytics event type enum
-- (may already be present from session migration 0001_complete_runaways.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'publish_success'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'analytics_event_type'
      )
  ) THEN
    ALTER TYPE "public"."analytics_event_type" ADD VALUE 'publish_success';
  END IF;
END $$;

-- is_simulated on analytics_events (idempotent)
ALTER TABLE "analytics_events"
  ADD COLUMN IF NOT EXISTS "is_simulated" boolean NOT NULL DEFAULT false;

-- is_simulated on scheduled_posts (idempotent)
ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "is_simulated" boolean NOT NULL DEFAULT false;
