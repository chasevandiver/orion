/**
 * Next.js environment validation.
 *
 * Next.js 14 supports `instrumentation.ts` at the app root, which runs
 * once when the server boots. This is the correct place to call validateEnv()
 * so missing vars are caught at startup rather than at first request.
 *
 * File location: apps/web/instrumentation.ts
 */
export async function register() {
  // Only validate on the server side (not in the browser bundle)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env-validate.js");
    validateEnv("web");
  }
}
