-- Add competitor intelligence + SEO context columns to strategies table
ALTER TABLE "strategies" ADD COLUMN IF NOT EXISTS "competitor_context" jsonb;
ALTER TABLE "strategies" ADD COLUMN IF NOT EXISTS "seo_context" jsonb;
