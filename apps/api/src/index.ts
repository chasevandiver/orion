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

import "dotenv/config";

// ── Environment validation — must run before any other imports ────────────────
import { validateEnv } from "./lib/env.js";
validateEnv("api");

// ── Rest of imports (unchanged from original) ─────────────────────────────────
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";

import { authRouter } from "./routes/auth/index.js";
import { goalsRouter } from "./routes/goals/index.js";
import { strategiesRouter } from "./routes/strategies/index.js";
import { campaignsRouter } from "./routes/campaigns/index.js";
import { assetsRouter } from "./routes/assets/index.js";
import { analyticsRouter } from "./routes/analytics/index.js";
import { contactsRouter } from "./routes/contacts/index.js";
import { workflowsRouter } from "./routes/workflows/index.js";
import { billingRouter } from "./routes/billing/index.js";
import { webhooksRouter } from "./routes/webhooks/index.js";
import { distributeRouter } from "./routes/distribute/index.js";
import { settingsRouter } from "./routes/settings/index.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-request-id"],
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

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  }),
);

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

app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);
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

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`[api] ORION API running on http://localhost:${PORT}`);
});

export default app;
