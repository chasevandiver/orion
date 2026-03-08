CREATE TYPE "public"."font_preference" AS ENUM('modern', 'serif', 'minimal', 'bold');
--> statement-breakpoint
CREATE TYPE "public"."logo_position" AS ENUM('auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right');
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_primary_color" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_secondary_color" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "font_preference" "font_preference";
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_position" "logo_position" DEFAULT 'auto';
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "inspiration_image_url" text;
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
ALTER TABLE "personas" ADD CONSTRAINT "personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "personas_org_idx" ON "personas" USING btree ("org_id");
