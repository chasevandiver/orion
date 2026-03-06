-- Migration: 0002_schema_corrections
-- Adds goal_status enum and fixes related constraints.
-- The subscriptions export alias is a TypeScript-only fix (no SQL needed).

-- Add goal_status enum
CREATE TYPE IF NOT EXISTS "goal_status" AS ENUM (
  'active',
  'paused',
  'completed',
  'archived'
);

-- Migrate the free-text status column on goals to use the enum
-- Step 1: add a typed column alongside the old one
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "status_enum" "goal_status" DEFAULT 'active';

-- Step 2: backfill from the existing text column (safe cast for known values)
UPDATE "goals"
SET "status_enum" = "status"::goal_status
WHERE "status" IN ('active', 'paused', 'completed', 'archived');

-- Step 3: drop the old column and rename (run after verifying backfill)
-- ALTER TABLE "goals" DROP COLUMN "status";
-- ALTER TABLE "goals" RENAME COLUMN "status_enum" TO "status";
-- (Split into a separate migration after data verification in staging)
