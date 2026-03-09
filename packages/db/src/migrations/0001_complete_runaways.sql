CREATE TYPE "public"."font_preference" AS ENUM('modern', 'serif', 'minimal', 'bold');--> statement-breakpoint
CREATE TYPE "public"."logo_position" AS ENUM('auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right');--> statement-breakpoint
CREATE TYPE "public"."variant" AS ENUM('a', 'b');--> statement-breakpoint
ALTER TYPE "public"."analytics_event_type" ADD VALUE 'publish_success';--> statement-breakpoint
CREATE TABLE "brand_voice_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"original_text" text NOT NULL,
	"edited_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"logo_url" text,
	"website_url" text,
	"primary_color" text DEFAULT '#10b981',
	"voice_tone" text DEFAULT 'professional',
	"target_audience" text,
	"products" jsonb DEFAULT '[]',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"demographics" text,
	"psychographics" text,
	"pain_points" text,
	"preferred_channels" jsonb DEFAULT '[]',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "composited_image_url" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "variant" "variant" DEFAULT 'a' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "variant_group_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "source_photo_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_primary_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_secondary_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "font_preference" "font_preference";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_position" "logo_position" DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "inspiration_image_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_voice_profile" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_voice_edits" ADD CONSTRAINT "brand_voice_edits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_voice_edits_org_idx" ON "brand_voice_edits" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "brands_org_idx" ON "brands" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("org_id","read");--> statement-breakpoint
CREATE INDEX "personas_org_idx" ON "personas" USING btree ("org_id");