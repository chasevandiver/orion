import type { Request, Response, NextFunction } from "express";
import { db } from "@orion/db";
import { sessions } from "@orion/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        orgId: string;
        email: string;
        role: string;
      };
    }
  }
}

// ── Startup warning ────────────────────────────────────────────────────────────
// Emit once at module-load time so it's visible even if no request ever arrives.
if (!process.env.INTERNAL_API_SECRET) {
  logger.error(
    "⚠️  CRITICAL: INTERNAL_API_SECRET is not set. " +
    "All proxy-authenticated requests (x-user-id header) will be rejected. " +
    "Set INTERNAL_API_SECRET in your .env.local file.",
  );
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Next.js proxy injects these headers — ONLY accepted when the request also
    // carries a valid x-internal-secret that matches INTERNAL_API_SECRET.
    const userIdHeader  = req.headers["x-user-id"]       as string | undefined;
    const orgIdHeader   = req.headers["x-org-id"]        as string | undefined;
    const roleHeader    = req.headers["x-user-role"]     as string | undefined;
    const internalSecret = req.headers["x-internal-secret"] as string | undefined;

    if (userIdHeader) {
      const expectedSecret = process.env.INTERNAL_API_SECRET;

      // SECURITY: reject if INTERNAL_API_SECRET is unset OR if the provided
      // secret does not match.  The old check `if (expectedSecret && ...)`
      // accidentally allowed any request through when the env var was missing.
      if (!expectedSecret || internalSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!orgIdHeader || orgIdHeader === "" || orgIdHeader === "undefined") {
        // Authenticated but org not yet assigned (incomplete signup / onboarding).
        return res.status(403).json({
          error: "Account setup incomplete. Please refresh the page and try again.",
        });
      }

      req.user = {
        id: userIdHeader,
        orgId: orgIdHeader,
        email: "",
        role: roleHeader ?? "member",
      };
      return next();
    }

    // ── Fallback: Bearer token for direct API access ─────────────────────────

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice(7);
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.sessionToken, token),
        gt(sessions.expires, new Date()),
      ),
      with: { user: true },
    });

    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    req.user = {
      id: session.user.id,
      orgId: session.user.orgId ?? "",
      email: session.user.email ?? "",
      role: session.user.role ?? "member",
    };

    next();
  } catch (err) {
    next(err);
  }
}

// ── Role-based access control middleware factory ───────────────────────────────

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
