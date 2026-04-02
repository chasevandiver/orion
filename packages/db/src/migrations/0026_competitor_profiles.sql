CREATE TABLE IF NOT EXISTS "competitor_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "competitor_name" text NOT NULL,
  "website_url" text,
  "analysis_json" jsonb,
  "competitor_changes" jsonb,
  "last_analyzed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "competitor_profiles_org_idx" ON "competitor_profiles" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "competitor_profiles_org_name_idx" ON "competitor_profiles" ("org_id", "competitor_name");
