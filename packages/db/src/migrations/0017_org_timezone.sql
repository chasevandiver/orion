ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "timezone" varchar(50) NOT NULL DEFAULT 'America/Chicago';
