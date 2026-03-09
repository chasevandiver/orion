-- Layer 6: Growth tables — org insights, landing pages, paid ads, lead magnets, email sequences

CREATE TABLE IF NOT EXISTS "org_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "insight_type" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "data_json" jsonb DEFAULT '{}',
  "period" text,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "org_insights_org_idx" ON "org_insights" ("org_id");
CREATE INDEX IF NOT EXISTS "org_insights_period_idx" ON "org_insights" ("org_id", "period");

CREATE TABLE IF NOT EXISTS "landing_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "content_json" jsonb NOT NULL DEFAULT '{}',
  "meta_title" text,
  "meta_description" text,
  "share_token" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_org_slug_idx" ON "landing_pages" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "landing_pages_share_token_idx" ON "landing_pages" ("share_token");

CREATE TABLE IF NOT EXISTS "paid_ad_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "platform" text NOT NULL,
  "ad_type" text NOT NULL,
  "content_json" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'draft',
  "budget" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "paid_ad_sets_org_idx" ON "paid_ad_sets" ("org_id");

CREATE TABLE IF NOT EXISTS "lead_magnets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL,
  "magnet_type" text NOT NULL,
  "title" text NOT NULL,
  "content_json" jsonb NOT NULL DEFAULT '{}',
  "share_token" text,
  "download_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "lead_magnets_org_idx" ON "lead_magnets" ("org_id");
CREATE INDEX IF NOT EXISTS "lead_magnets_share_token_idx" ON "lead_magnets" ("share_token");

CREATE TABLE IF NOT EXISTS "email_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text,
  "trigger_type" text NOT NULL DEFAULT 'signup',
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_sequences_org_idx" ON "email_sequences" ("org_id");

CREATE TABLE IF NOT EXISTS "email_sequence_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "email_sequences"("id") ON DELETE CASCADE,
  "step_number" integer NOT NULL,
  "delay_days" integer NOT NULL DEFAULT 0,
  "subject" text NOT NULL,
  "content_text" text NOT NULL,
  "content_html" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_seq_steps_seq_step_idx" ON "email_sequence_steps" ("sequence_id", "step_number");
