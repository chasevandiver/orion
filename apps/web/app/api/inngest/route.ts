/**
 * Inngest serve endpoint for Next.js.
 *
 * This route must exist for Inngest to:
 *   1. Discover registered functions during local development (via the dev server at :8288)
 *   2. Deliver event payloads to job functions in production (via HTTPS webhook)
 *
 * Without this file, no background jobs will run in any environment.
 */

// ── Load env vars from monorepo root BEFORE importing @orion/queue ────────────
// Next.js only auto-loads .env.local from apps/web/, not the monorepo root.
// We resolve the root via import.meta.url so the path is always correct
// regardless of the process working directory (Turbo changes CWD).
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
// apps/web/app/api/inngest/route.ts → root is 5 directories up
const root = path.resolve(path.dirname(__filename), "../../../../../");
const envResult = config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

// Guaranteed fallback: explicitly set FAL_KEY from the parsed dotenv result so
// it is available even if import order or module caching caused the config()
// call to run after @orion/queue modules were already loaded.
if (envResult.parsed?.FAL_KEY && !process.env.FAL_KEY) {
  process.env.FAL_KEY = envResult.parsed.FAL_KEY;
}
if (envResult.parsed?.SUPABASE_URL && !process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = envResult.parsed.SUPABASE_URL;
}
if (envResult.parsed?.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = envResult.parsed.SUPABASE_SERVICE_KEY;
}

console.info(
  `[inngest-route] env loaded — FAL_KEY ${process.env.FAL_KEY ? "SET" : "MISSING"} | SUPABASE_URL ${process.env.SUPABASE_URL ? "SET" : "MISSING"} | SUPABASE_SERVICE_KEY ${process.env.SUPABASE_SERVICE_KEY ? "SET" : "MISSING"}`,
);

import { serve } from "inngest/next";
import { inngest, allFunctions } from "@orion/queue";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
});
