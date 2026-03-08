ALTER TABLE "assets" ADD COLUMN "image_url" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "composited_image_url" text;
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "source_photo_url" text;
