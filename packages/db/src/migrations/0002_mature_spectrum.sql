CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
ALTER TYPE "public"."post_status" ADD VALUE 'preflight_failed';--> statement-breakpoint
CREATE TABLE "email_sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"content_text" text NOT NULL,
	"content_html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"goal_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text DEFAULT 'signup' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"goal_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content_json" jsonb DEFAULT '{}' NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"share_token" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_magnets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"goal_id" uuid,
	"magnet_type" text NOT NULL,
	"title" text NOT NULL,
	"content_json" jsonb DEFAULT '{}' NOT NULL,
	"share_token" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"data_json" jsonb DEFAULT '{}',
	"period" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paid_ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"platform" text NOT NULL,
	"ad_type" text NOT NULL,
	"content_json" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"budget" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"channel" text,
	"destination_url" text DEFAULT '/' NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_links_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
DROP INDEX "analytics_rollups_unique_idx";--> statement-breakpoint
ALTER TABLE "analytics_rollups" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "metadata" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pipeline_error" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pipeline_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pipeline_stage" varchar(50);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_publish_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_publish_threshold" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "preflight_status" text;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "preflight_errors" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "email_sequence_steps" ADD CONSTRAINT "email_sequence_steps_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_magnets" ADD CONSTRAINT "lead_magnets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_magnets" ADD CONSTRAINT "lead_magnets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_magnets" ADD CONSTRAINT "lead_magnets_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_insights" ADD CONSTRAINT "org_insights_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_insights" ADD CONSTRAINT "org_insights_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paid_ad_sets" ADD CONSTRAINT "paid_ad_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paid_ad_sets" ADD CONSTRAINT "paid_ad_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_seq_steps_seq_step_idx" ON "email_sequence_steps" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE INDEX "email_sequences_org_idx" ON "email_sequences" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_org_email_idx" ON "invitations" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "invitations_org_status_idx" ON "invitations" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_org_slug_idx" ON "landing_pages" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "landing_pages_share_token_idx" ON "landing_pages" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "lead_magnets_org_idx" ON "lead_magnets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_magnets_share_token_idx" ON "lead_magnets" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "org_insights_org_idx" ON "org_insights" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_insights_period_idx" ON "org_insights" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "paid_ad_sets_org_idx" ON "paid_ad_sets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_links_tracking_id_idx" ON "tracking_links" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "tracking_links_org_idx" ON "tracking_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tracking_links_campaign_idx" ON "tracking_links" USING btree ("campaign_id");