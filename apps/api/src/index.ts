import "dotenv/config";
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

// Route imports
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

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Security ──────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Handled by Next.js
  }),
);

app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-org-id"],
  }),
);

// ── Webhooks: raw body required for Stripe signature ──
app.use("/webhooks/stripe", express.raw({ type: "application/json" }));
app.use("/webhooks", express.json());

// ── Body parsing ──────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression() as express.RequestHandler);

// ── Logging ───────────────────────────────────────────
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trimEnd()) },
    skip: (req) => req.url === "/health",
  }),
);

// ── Global rate limit ─────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  }),
);

// ── Health check ──────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// ── Public routes ─────────────────────────────────────
app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);

// ── Protected routes (require valid session) ──────────
app.use(authMiddleware);
app.use("/goals", goalsRouter);
app.use("/strategies", strategiesRouter);
app.use("/campaigns", campaignsRouter);
app.use("/assets", assetsRouter);
app.use("/analytics", analyticsRouter);
app.use("/contacts", contactsRouter);
app.use("/workflows", workflowsRouter);
app.use("/billing", billingRouter);

// ── 404 ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Error handler ─────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`[api] ORION API running on http://localhost:${PORT}`);
});

export default app;
