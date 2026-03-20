-- Add metadata JSONB column to assets for storing imageSource and other pipeline metadata
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}';
