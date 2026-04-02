ALTER TABLE "organizations" ADD COLUMN "report_logo_url" text;
ALTER TABLE "organizations" ADD COLUMN "report_accent_color" text;
ALTER TABLE "organizations" ADD COLUMN "report_sections" jsonb DEFAULT '["cover","executive_summary","key_metrics","channel_breakdown","top_content","recommendations"]';
ALTER TABLE "organizations" ADD COLUMN "report_footer_text" text;
