import postgres from 'postgres';

const sql = postgres('postgresql://orion:orion_dev_password@localhost:5432/orion_dev');

const migrations = [
  {
    name: '0003_image_pipeline',
    sql: `
      ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "image_url" text;
      ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "composited_image_url" text;
      ALTER TABLE "goals"  ADD COLUMN IF NOT EXISTS "source_photo_url" text;
    `,
  },
  {
    name: '0004_brand_voice_ab',
    sql: `
      DO $$ BEGIN
        CREATE TYPE "variant" AS ENUM('a', 'b');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "brand_voice_profile" jsonb;

      ALTER TABLE "assets"
        ADD COLUMN IF NOT EXISTS "variant" "variant" NOT NULL DEFAULT 'a',
        ADD COLUMN IF NOT EXISTS "variant_group_id" uuid;

      CREATE TABLE IF NOT EXISTS "brand_voice_edits" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "channel"       text NOT NULL,
        "original_text" text NOT NULL,
        "edited_text"   text NOT NULL,
        "created_at"    timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "brand_voice_edits_org_idx" ON "brand_voice_edits" ("org_id");
    `,
  },
  {
    name: '0005_notifications_onboarding',
    sql: `
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "user_id"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "type"          text NOT NULL,
        "title"         text NOT NULL,
        "body"          text,
        "resource_type" text,
        "resource_id"   uuid,
        "read"          boolean NOT NULL DEFAULT false,
        "created_at"    timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "notifications_org_idx"  ON "notifications" ("org_id");
      CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" ("org_id", "read");
    `,
  },
  {
    name: '0006_auto_publish_integrations',
    sql: `
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "auto_publish_enabled"   boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "auto_publish_threshold" integer NOT NULL DEFAULT 80;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'publish_success'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'analytics_event_type')
        ) THEN
          ALTER TYPE "public"."analytics_event_type" ADD VALUE 'publish_success';
        END IF;
      END $$;

      ALTER TABLE "analytics_events"  ADD COLUMN IF NOT EXISTS "is_simulated" boolean NOT NULL DEFAULT false;
      ALTER TABLE "scheduled_posts"   ADD COLUMN IF NOT EXISTS "is_simulated" boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: '0007_layer6_growth',
    sql: `
      CREATE TABLE IF NOT EXISTS "org_insights" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "campaign_id"  uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "insight_type" text NOT NULL,
        "title"        text NOT NULL,
        "summary"      text NOT NULL,
        "data_json"    jsonb DEFAULT '{}',
        "period"       text,
        "generated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "org_insights_org_idx"    ON "org_insights" ("org_id");
      CREATE INDEX IF NOT EXISTS "org_insights_period_idx" ON "org_insights" ("org_id", "period");

      CREATE TABLE IF NOT EXISTS "landing_pages" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"           uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "campaign_id"      uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "goal_id"          uuid REFERENCES "goals"("id") ON DELETE SET NULL,
        "title"            text NOT NULL,
        "slug"             text NOT NULL,
        "content_json"     jsonb NOT NULL DEFAULT '{}',
        "meta_title"       text,
        "meta_description" text,
        "share_token"      text,
        "published_at"     timestamp with time zone,
        "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_org_slug_idx"    ON "landing_pages" ("org_id", "slug");
      CREATE        INDEX IF NOT EXISTS "landing_pages_share_token_idx"  ON "landing_pages" ("share_token");

      CREATE TABLE IF NOT EXISTS "paid_ad_sets" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "campaign_id"  uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "platform"     text NOT NULL,
        "ad_type"      text NOT NULL,
        "content_json" jsonb NOT NULL DEFAULT '{}',
        "status"       text NOT NULL DEFAULT 'draft',
        "budget"       integer,
        "created_at"   timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "paid_ad_sets_org_idx" ON "paid_ad_sets" ("org_id");

      CREATE TABLE IF NOT EXISTS "lead_magnets" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"         uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "campaign_id"    uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "goal_id"        uuid REFERENCES "goals"("id") ON DELETE SET NULL,
        "magnet_type"    text NOT NULL,
        "title"          text NOT NULL,
        "content_json"   jsonb NOT NULL DEFAULT '{}',
        "share_token"    text,
        "download_count" integer NOT NULL DEFAULT 0,
        "created_at"     timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "lead_magnets_org_idx"          ON "lead_magnets" ("org_id");
      CREATE INDEX IF NOT EXISTS "lead_magnets_share_token_idx"  ON "lead_magnets" ("share_token");

      CREATE TABLE IF NOT EXISTS "email_sequences" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "campaign_id"  uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "goal_id"      uuid REFERENCES "goals"("id") ON DELETE SET NULL,
        "name"         text NOT NULL,
        "description"  text,
        "trigger_type" text NOT NULL DEFAULT 'signup',
        "status"       text NOT NULL DEFAULT 'draft',
        "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "email_sequences_org_idx" ON "email_sequences" ("org_id");

      CREATE TABLE IF NOT EXISTS "email_sequence_steps" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "sequence_id"  uuid NOT NULL REFERENCES "email_sequences"("id") ON DELETE CASCADE,
        "step_number"  integer NOT NULL,
        "delay_days"   integer NOT NULL DEFAULT 0,
        "subject"      text NOT NULL,
        "content_text" text NOT NULL,
        "content_html" text,
        "created_at"   timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "email_seq_steps_seq_step_idx" ON "email_sequence_steps" ("sequence_id", "step_number");
    `,
  },
  {
    name: '0008_pipeline_error',
    sql: `
      ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "pipeline_error"    text;
      ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "pipeline_error_at" timestamp with time zone;
      ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "pipeline_stage"    varchar(50);
    `,
  },
  {
    name: '0009_analytics_simulated',
    sql: `
      ALTER TABLE "analytics_rollups" ADD COLUMN IF NOT EXISTS "is_simulated" boolean NOT NULL DEFAULT false;

      DROP INDEX IF EXISTS "analytics_rollups_unique_idx";
      CREATE UNIQUE INDEX IF NOT EXISTS "analytics_rollups_unique_idx"
        ON "analytics_rollups" ("org_id", "campaign_id", "channel", "date", "is_simulated");
    `,
  },
  {
    name: '0010_tracking_links',
    sql: `
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS tracking_url TEXT;

      CREATE TABLE IF NOT EXISTS tracking_links (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_id     TEXT        NOT NULL,
        org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        campaign_id     UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
        channel         TEXT,
        destination_url TEXT        NOT NULL DEFAULT '/',
        click_count     INTEGER     NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS tracking_links_tracking_id_idx ON tracking_links (tracking_id);
      CREATE        INDEX IF NOT EXISTS tracking_links_org_idx          ON tracking_links (org_id);
      CREATE        INDEX IF NOT EXISTS tracking_links_campaign_idx     ON tracking_links (campaign_id);
    `,
  },
  {
    name: '0011_invitations',
    sql: `
      DO $$ BEGIN
        CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS invitations (
        id                 UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id             UUID              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email              TEXT              NOT NULL,
        role               role              NOT NULL DEFAULT 'viewer',
        token              TEXT              NOT NULL,
        status             invitation_status NOT NULL DEFAULT 'pending',
        invited_by_user_id UUID              REFERENCES users(id) ON DELETE SET NULL,
        expires_at         TIMESTAMPTZ       NOT NULL,
        accepted_at        TIMESTAMPTZ,
        created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_idx      ON invitations (token);
      CREATE        INDEX IF NOT EXISTS invitations_org_email_idx  ON invitations (org_id, email);
      CREATE        INDEX IF NOT EXISTS invitations_org_status_idx ON invitations (org_id, status);
    `,
  },
  {
    name: '0012_asset_metadata',
    sql: `
      ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}';
    `,
  },
  {
    name: '0013_analytics_rollup_dedup',
    // Run the dedup DO block, then rebuild the index with COALESCE
    sql: `
      DO $$
      BEGIN
        WITH groups AS (
          SELECT
            org_id,
            COALESCE(campaign_id::text, '') AS norm_campaign,
            COALESCE(channel, '')           AS norm_channel,
            date,
            is_simulated,
            MAX(computed_at)                AS latest_computed_at,
            SUM(impressions)                AS total_impressions,
            SUM(clicks)                     AS total_clicks,
            SUM(conversions)                AS total_conversions,
            SUM(engagements)                AS total_engagements,
            SUM(spend)                      AS total_spend,
            SUM(revenue)                    AS total_revenue
          FROM analytics_rollups
          GROUP BY
            org_id,
            COALESCE(campaign_id::text, ''),
            COALESCE(channel, ''),
            date,
            is_simulated
          HAVING COUNT(*) > 1
        ),
        keepers AS (
          SELECT DISTINCT ON (
              r.org_id,
              COALESCE(r.campaign_id::text, ''),
              COALESCE(r.channel, ''),
              r.date,
              r.is_simulated
            )
            r.id,
            g.total_impressions,
            g.total_clicks,
            g.total_conversions,
            g.total_engagements,
            g.total_spend,
            g.total_revenue
          FROM analytics_rollups r
          JOIN groups g
            ON  r.org_id                          = g.org_id
            AND COALESCE(r.campaign_id::text, '') = g.norm_campaign
            AND COALESCE(r.channel, '')           = g.norm_channel
            AND r.date                            = g.date
            AND r.is_simulated                    = g.is_simulated
          ORDER BY
            r.org_id,
            COALESCE(r.campaign_id::text, ''),
            COALESCE(r.channel, ''),
            r.date,
            r.is_simulated,
            r.computed_at DESC,
            r.id DESC
        )
        UPDATE analytics_rollups ar
        SET
          impressions  = k.total_impressions,
          clicks       = k.total_clicks,
          conversions  = k.total_conversions,
          engagements  = k.total_engagements,
          spend        = k.total_spend,
          revenue      = k.total_revenue,
          computed_at  = now()
        FROM keepers k
        WHERE ar.id = k.id;

        DELETE FROM analytics_rollups
        WHERE id IN (
          SELECT r.id
          FROM analytics_rollups r
          WHERE (
            SELECT COUNT(*)
            FROM analytics_rollups r2
            WHERE
              r2.org_id                              = r.org_id
              AND COALESCE(r2.campaign_id::text, '') = COALESCE(r.campaign_id::text, '')
              AND COALESCE(r2.channel, '')           = COALESCE(r.channel, '')
              AND r2.date                            = r.date
              AND r2.is_simulated                    = r.is_simulated
          ) > 1
          AND r.id NOT IN (
            SELECT DISTINCT ON (
                r3.org_id,
                COALESCE(r3.campaign_id::text, ''),
                COALESCE(r3.channel, ''),
                r3.date,
                r3.is_simulated
              ) r3.id
            FROM analytics_rollups r3
            ORDER BY
              r3.org_id,
              COALESCE(r3.campaign_id::text, ''),
              COALESCE(r3.channel, ''),
              r3.date,
              r3.is_simulated,
              r3.computed_at DESC,
              r3.id DESC
          )
        );
      END $$;

      DROP INDEX IF EXISTS analytics_rollups_unique_idx;

      CREATE UNIQUE INDEX IF NOT EXISTS analytics_rollups_unique_idx
        ON analytics_rollups (
          org_id,
          COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(channel, ''),
          date,
          is_simulated
        );
    `,
  },
  {
    name: '0014_preflight',
    // ADD VALUE cannot run in a transaction, handled by unsafe() below
    addEnumValue: `ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'preflight_failed'`,
    sql: `
      ALTER TABLE "scheduled_posts"
        ADD COLUMN IF NOT EXISTS "preflight_status" text,
        ADD COLUMN IF NOT EXISTS "preflight_errors" jsonb DEFAULT '[]'::jsonb;
    `,
  },
];

async function run() {
  for (const m of migrations) {
    console.log(`\n▶ ${m.name}`);
    try {
      // ALTER TYPE ADD VALUE must run outside a transaction
      if (m.addEnumValue) {
        await sql.unsafe(m.addEnumValue);
        console.log(`  ✓ enum value added`);
      }
      await sql.unsafe(m.sql);
      console.log(`  ✓ done`);
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('\n✅ All migrations applied.');
  await sql.end();
}

run();
