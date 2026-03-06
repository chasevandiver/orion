/**
 * Next.js instrumentation — runs once at server startup.
 *
 * 1. Validates required environment variables (fails fast on missing config).
 * 2. Initializes Sentry for server-side error tracking (if SENTRY_DSN is set).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Validate required env vars
    const { validateEnv } = await import("./lib/env-validate.js");
    validateEnv("web");

    // 2. Initialize Sentry (optional — only if SENTRY_DSN is set)
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.init({
          dsn,
          environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
          tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
          sendDefaultPii: false,
        });
        console.info("[sentry] Sentry initialized for Next.js");
      } catch (err) {
        console.warn("[sentry] Failed to initialize Sentry:", (err as Error).message);
      }
    }
  }
}
