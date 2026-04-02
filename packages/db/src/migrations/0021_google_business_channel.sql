-- Migration: Add "google_business" to the channel enum
-- Affects: assets, scheduled_posts, channel_connections, analytics_rollups (all use the channel enum)

ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'google_business';
