/**
 * apps/api/src/index.ts — patch instructions
 *
 * Add these two lines at the very top of the file, BEFORE all other imports:
 *
 *   import { validateEnv } from "./lib/env.js";
 *   validateEnv("api");
 *
 * This ensures environment variables are checked before any module that
 * reads them is initialized (e.g., the DB client throws immediately if
 * DATABASE_URL is missing, but the error message is unhelpful).
 *
 * The full corrected file is below:
 */

import "./env.js";

// ── Environment validation — must run before any other imports ────────────────
import { validateEnv } from "./lib/env.js";
validateEnv("api");

// ── Sentry — initialize before everything else so unhandled errors are caught ─
import { initSentry, sentryRequestHandler, sentryErrorHandler } from "./lib/sentry.js";
initSentry();

// ── Rest of imports ───────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import helmetFn from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import {
  authRateLimiter,
  generalRateLimiter,
} from "./middleware/rate-limit.js";

import { authRouter } from "./routes/auth/index.js";
import { goalsRouter } from "./routes/goals/index.js";
import { strategiesRouter } from "./routes/strategies/index.js";
import { campaignsRouter } from "./routes/campaigns/index.js";
import { assetsRouter } from "./routes/assets/index.js";
import { analyticsRouter } from "./routes/analytics/index.js";
import { contactsRouter, contactsCaptureRouter } from "./routes/contacts/index.js";
import { workflowsRouter } from "./routes/workflows/index.js";
import { billingRouter } from "./routes/billing/index.js";
import { webhooksRouter } from "./routes/webhooks/index.js";
import { distributeRouter } from "./routes/distribute/index.js";
import { settingsRouter } from "./routes/settings/index.js";
import { brandsRouter } from "./routes/brands/index.js";
import { pipelineRouter } from "./routes/pipeline/index.js";
import { organizationsRouter } from "./routes/organizations/index.js";
import { notificationsRouter } from "./routes/notifications/index.js";
import { integrationsRouter } from "./routes/integrations/index.js";
import { landingPagesRouter } from "./routes/landing-pages/index.js";
import { paidAdsRouter } from "./routes/paid-ads/index.js";
import { leadMagnetsRouter } from "./routes/lead-magnets/index.js";
import { emailSequencesRouter } from "./routes/email-sequences/index.js";
import { dashboardRouter } from "./routes/dashboard/index.js";
import { seoRouter } from "./routes/seo/index.js";
import { broadcastsRouter } from "./routes/broadcasts/index.js";
import { healthRouter } from "./routes/health.js";
import { trackRouter } from "./routes/track/index.js";
import { mediaRouter } from "./routes/media/index.js";
import { recommendationsRouter } from "./routes/recommendations/index.js";
import { competitorsRouter } from "./routes/competitors/index.js";
import { serve } from "inngest/express";
import { inngest, allFunctions } from "@orion/queue";

const app = express();
const PORT = process.env.PORT ?? 3001;
const IS_PROD = process.env.NODE_ENV === "production";

// ── INTERNAL_API_SECRET startup check ─────────────────────────────────────────
// Log here in case the module-level check in auth.ts fires before the logger
// is set up (import order matters at startup).  In production, a missing secret
// means every proxy request will be rejected — loudly surface that here too.
if (!process.env.INTERNAL_API_SECRET) {
  if (IS_PROD) {
    logger.error(
      "⚠️  CRITICAL: INTERNAL_API_SECRET is not set. " +
      "All proxy-authenticated API requests will be rejected.",
    );
  } else {
    logger.warn(
      "⚠️  INTERNAL_API_SECRET is not set. " +
      "Proxy-authenticated requests will be rejected until you add " +
      "INTERNAL_API_SECRET=<random-secret> to apps/api/.env.local " +
      "and apps/web/.env.local with the same value.",
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((helmetFn as any)({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Deliberately excludes x-user-id, x-org-id, x-user-role, x-internal-secret:
    // those headers are only ever sent server-to-server by the Next.js proxy and
    // must never be settable by a browser via CORS.
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  }),
);

app.use("/webhooks/stripe", express.raw({ type: "application/json" }));
app.use("/webhooks", express.json());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression() as express.RequestHandler);

app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trimEnd()) },
    skip: (req) => req.url === "/health",
  }),
);

// General rate limiter: 100 req/min per user (IP fallback for unauthenticated).
// Auth endpoints get a tighter per-IP limiter applied directly below.
app.use(generalRateLimiter);

app.get("/health", async (_req, res) => {
  // Basic DB connectivity check (Phase 2G will add Redis check)
  let dbStatus: "ok" | "error" = "ok";
  try {
    const { db } = await import("@orion/db");
    await db.execute("SELECT 1" as any);
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
    services: { database: dbStatus },
  });
});

// Sentry request handler — must come before any route handlers
app.use(sentryRequestHandler());

// Auth rate limiter: 5 req/min per IP — brute-force protection for credential
// endpoints (login, register, forgot-password, session validation).
app.use("/auth", authRateLimiter);
app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);
app.use("/contacts", contactsCaptureRouter); // PUBLIC — webhook capture, no session auth
app.use("/health", healthRouter);            // PUBLIC — internal health checks, no auth
app.use("/t", trackRouter);                  // PUBLIC — tracking link redirects, no auth
// Inngest serve handler — PUBLIC, authenticated by Inngest signing key (not session auth)
app.use("/api/inngest", serve({ client: inngest, functions: allFunctions }));
app.use(authMiddleware);
app.use("/goals", goalsRouter);
app.use("/strategies", strategiesRouter);
app.use("/campaigns", campaignsRouter);
app.use("/assets", assetsRouter);
app.use("/analytics", analyticsRouter);
app.use("/contacts", contactsRouter);
app.use("/workflows", workflowsRouter);
app.use("/billing", billingRouter);
app.use("/distribute", distributeRouter);
app.use("/settings", settingsRouter);
app.use("/brands", brandsRouter);
app.use("/pipeline", pipelineRouter);
app.use("/organizations", organizationsRouter);
app.use("/notifications", notificationsRouter);
app.use("/integrations", integrationsRouter);
app.use("/landing-pages", landingPagesRouter);
app.use("/paid-ads", paidAdsRouter);
app.use("/lead-magnets", leadMagnetsRouter);
app.use("/email-sequences", emailSequencesRouter);
app.use("/dashboard", dashboardRouter);
app.use("/seo", seoRouter);
app.use("/broadcasts", broadcastsRouter);
app.use("/media", mediaRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/competitors", competitorsRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
// Sentry error handler — must be BEFORE the custom error handler
app.use(sentryErrorHandler());
app.use(errorHandler);

// In development, bind to loopback only so the port is not reachable from the
// network — external requests cannot forge x-user-id/x-org-id headers.
// In production the API runs behind a reverse proxy (e.g. nginx / Railway) that
// is responsible for stripping those headers from inbound external requests.
const BIND_HOST = IS_PROD ? "0.0.0.0" : "127.0.0.1";

app.listen(Number(PORT), BIND_HOST, () => {
  logger.info(`[api] ORION API running on http://${BIND_HOST}:${PORT}`);

  // Warn if no cloud storage is configured — logo uploads will use local filesystem
  const hasSupabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));
  const hasS3 = !!(process.env.AWS_S3_BUCKET);
  if (!hasSupabase && !hasS3) {
    logger.warn(
      "⚠️  No storage provider configured (SUPABASE_URL or S3). Logo uploads will use local filesystem at /public/uploads/. This is not suitable for production.",
    );
  }

  // Non-blocking Inngest health check — warn loudly if the dev server is missing
  import("@orion/queue/health").then(({ checkInngestHealth }) => {
    checkInngestHealth().then((result) => {
      if (!result.healthy) {
        logger.warn(
          "⚠️  INNGEST DEV SERVER NOT DETECTED — pipeline, publishing, and analytics will not function. Run: npx inngest-cli@latest dev",
        );
        if (result.error) logger.warn(`    Reason: ${result.error}`);
      } else {
        logger.info(`[api] Inngest: ${result.mode} mode — healthy`);
      }
    }).catch(() => {
      // Non-critical — never block startup
    });
  }).catch(() => {});
});

export default app;
