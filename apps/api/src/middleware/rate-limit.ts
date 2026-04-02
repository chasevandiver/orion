import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

// In development, apply 10× higher limits so automated tests and rapid manual
// iteration aren't blocked.  All other environments use the production limits.
const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_MULTIPLIER = IS_DEV ? 10 : 1;

/**
 * Build a standard 429 handler that sets the Retry-After header (seconds) and
 * returns a JSON body consistent with the rest of the API's error format.
 */
function make429Handler(windowMs: number) {
  // Use the full window as a safe, conservative Retry-After value.
  const retryAfterSecs = Math.ceil(windowMs / 1000);
  return (_req: Request, res: Response) => {
    res
      .status(429)
      .setHeader("Retry-After", retryAfterSecs)
      .json({ error: "Too many requests", retryAfter: retryAfterSecs });
  };
}

// ── Auth endpoints — 5 req / 1 min per IP ────────────────────────────────────
// Covers login, register, forgot-password, and any future credential routes
// mounted under /auth.  Keyed by IP (no authenticated user yet at this point).
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5 * DEV_MULTIPLIER,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? "unknown",
  skip: (req: Request) => req.method === "OPTIONS",
  handler: make429Handler(60 * 1000),
});

// ── API key generation — 3 req / 1 hour per user ─────────────────────────────
// Applied to any route that creates or rotates org-level API / integration keys.
// Keyed by authenticated user ID when available, falls back to IP.
export const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3 * DEV_MULTIPLIER,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    return userId ?? req.ip ?? "unknown";
  },
  skip: (req: Request) => req.method === "OPTIONS",
  handler: make429Handler(60 * 60 * 1000),
});

// ── General API — 100 req / 1 min per user ───────────────────────────────────
// Broad protection across all authenticated endpoints.  Keyed by user ID so
// one user cannot starve others; falls back to IP for unauthenticated routes.
// AI/pipeline endpoints have additional per-request quota checks via
// requireTokenQuota, so this acts as a coarse first gate.
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100 * DEV_MULTIPLIER,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    return userId ?? req.ip ?? "unknown";
  },
  skip: (req: Request) => req.method === "OPTIONS",
  handler: make429Handler(60 * 1000),
});
