/**
 * Inngest serve endpoint for Next.js.
 *
 * This route must exist for Inngest to:
 *   1. Discover registered functions during local development (via the dev server at :8288)
 *   2. Deliver event payloads to job functions in production (via HTTPS webhook)
 *
 * Without this file, no background jobs will run in any environment.
 */
import { serve } from "inngest/next";
import { inngest, allFunctions } from "@orion/queue";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
});
