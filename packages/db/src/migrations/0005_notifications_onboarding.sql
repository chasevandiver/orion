-- Migration 0005: Add notifications table and onboarding_completed flag

-- Add onboarding_completed to organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false;

-- Create notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "resource_type" text,
  "resource_id" uuid,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS "notifications_org_idx" ON "notifications" ("org_id");
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" ("org_id", "read");
