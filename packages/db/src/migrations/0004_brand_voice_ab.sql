-- Migration: brand voice learning + A/B variant columns

-- 1. variant enum
DO $$ BEGIN
  CREATE TYPE "variant" AS ENUM('a', 'b');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add brandVoiceProfile to organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "brand_voice_profile" jsonb;

-- 3. Add variant columns to assets
ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "variant" "variant" NOT NULL DEFAULT 'a',
  ADD COLUMN IF NOT EXISTS "variant_group_id" uuid;

-- 4. Create brand_voice_edits table
CREATE TABLE IF NOT EXISTS "brand_voice_edits" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel"       text NOT NULL,
  "original_text" text NOT NULL,
  "edited_text"   text NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brand_voice_edits_org_idx" ON "brand_voice_edits" ("org_id");
