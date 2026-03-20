ALTER TABLE "campaigns" ADD COLUMN "pipeline_error" text;
ALTER TABLE "campaigns" ADD COLUMN "pipeline_error_at" timestamp with time zone;
ALTER TABLE "campaigns" ADD COLUMN "pipeline_stage" varchar(50);
