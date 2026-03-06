/**
 * Sentry error tracking for the Express API.
 *
 * Initialises Sentry at startup if SENTRY_DSN is set.
 * Provides request handler, tracing, and error handler middlewares.
 *
 * Usage in apps/api/src/index.ts:
 *   import { initSentry, sentryRequestHandler, sentryErrorHandler } from "./lib/sentry.js";
 *   initSentry();
 *   app.use(sentryRequestHandler());
 *   // ... routes ...
 *   app.use(sentryErrorHandler()); // must be BEFORE errorHandler
 *
 * Env vars:
 *   SENTRY_DSN          — required for Sentry to be enabled (optional overall)
 *   SENTRY_ENVIRONMENT  — defaults to NODE_ENV
 *   SENTRY_TRACES_SAMPLE_RATE — 0.0-1.0, defaults to 0.1 (10% in prod)
 */

import type { RequestHandler, ErrorRequestHandler } from "express";

let sentryInitialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.info("[sentry] SENTRY_DSN not set — error tracking disabled");
    return;
  }

  // Dynamic import so the package is optional
  import("@sentry/node")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
        // Don't send PII
        sendDefaultPii: false,
      });
      sentryInitialized = true;
      console.info("[sentry] Sentry initialized for API");
    })
    .catch((err) => {
      console.warn("[sentry] Failed to initialize Sentry:", err.message);
    });
}

/**
 * Express request handler middleware (adds request context to events).
 * Returns a no-op if Sentry is not configured.
 */
export function sentryRequestHandler(): RequestHandler {
  return async (req, res, next) => {
    if (!sentryInitialized) return next();
    try {
      const Sentry = await import("@sentry/node");
      return (Sentry as any).Handlers.requestHandler()(req, res, next);
    } catch {
      return next();
    }
  };
}

/**
 * Express error handler middleware (captures exceptions to Sentry).
 * Must be registered BEFORE your own error handler.
 */
export function sentryErrorHandler(): ErrorRequestHandler {
  return async (err, req, res, next) => {
    if (!sentryInitialized) return next(err);
    try {
      const Sentry = await import("@sentry/node");
      return (Sentry as any).Handlers.errorHandler()(err, req, res, next);
    } catch {
      return next(err);
    }
  };
}

/**
 * Manually capture an exception outside of a request context
 * (e.g., inside an Inngest job handler).
 */
export async function captureException(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!sentryInitialized) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(err);
    });
  } catch {
    // Swallow — Sentry must not crash the application
  }
}
