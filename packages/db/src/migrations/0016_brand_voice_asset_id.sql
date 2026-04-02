-- Add asset_id to brand_voice_edits for per-asset edit traceability
ALTER TABLE "brand_voice_edits" ADD COLUMN IF NOT EXISTS "asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL;
