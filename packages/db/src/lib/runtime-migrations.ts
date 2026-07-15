/**
 * Runtime migrations — idempotent DDL applied at API startup.
 *
 * Production deploys (Railway) run `tsx apps/api/src/index.ts` with no
 * migrate step, and the drizzle journal doesn't cover hand-written
 * migrations, so schema deltas that must reach production without a
 * terminal are applied here. Everything in this file MUST be idempotent
 * (IF NOT EXISTS / IF EXISTS guards) — it runs on every boot, possibly
 * concurrently from multiple instances.
 */
import { db } from "../index.js";
import { sql } from "drizzle-orm";

/** Mirrors packages/db/src/migrations/0030_oauth_states.sql */
export async function ensureOauthStatesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "oauth_states" (
      "state"         text PRIMARY KEY,
      "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "user_id"       uuid NOT NULL,
      "channel"       text NOT NULL,
      "code_verifier" text,
      "return_to"     text,
      "expires_at"    timestamp with time zone NOT NULL,
      "created_at"    timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "oauth_states_expires_idx" ON "oauth_states" ("expires_at")
  `);
}

/** Run all runtime migrations. Never throws — callers log the result. */
export async function runRuntimeMigrations(): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureOauthStatesTable();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
