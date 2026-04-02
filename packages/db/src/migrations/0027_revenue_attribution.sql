-- Add revenue fields to contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "revenue" real;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "deal_closed_at" timestamp with time zone;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "attribution_json" jsonb;

-- Add estimated value to goals
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "estimated_value" real;
