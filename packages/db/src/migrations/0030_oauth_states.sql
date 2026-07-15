CREATE TABLE IF NOT EXISTS "oauth_states" (
  "state"         text PRIMARY KEY,
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL,
  "channel"       text NOT NULL,
  "code_verifier" text,
  "return_to"     text,
  "expires_at"    timestamp with time zone NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "oauth_states_expires_idx" ON "oauth_states" ("expires_at");
