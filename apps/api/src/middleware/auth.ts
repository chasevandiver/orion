import type { Request, Response, NextFunction } from "express";
import { db } from "@orion/db";
import { sessions, users } from "@orion/db/schema";
import { eq, and, gt } from "drizzle-orm";

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

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Next.js middleware injects these headers for co-located Next.js API calls
    const userIdHeader = req.headers["x-user-id"] as string | undefined;
    const orgIdHeader = req.headers["x-org-id"] as string | undefined;
    const roleHeader = req.headers["x-user-role"] as string | undefined;

    if (userIdHeader) {
      const internalSecret = req.headers["x-internal-secret"] as string | undefined;
      const expectedSecret = process.env.INTERNAL_API_SECRET;
      if (expectedSecret && internalSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!orgIdHeader || orgIdHeader === "" || orgIdHeader === "undefined") {
        // User authenticated but org ID is missing or unresolved (incomplete signup / onboarding).
        return res.status(403).json({ error: "Account setup incomplete. Please refresh the page and try again." });
      }
      req.user = {
        id: userIdHeader,
        orgId: orgIdHeader,
        email: "",
        role: roleHeader ?? "member",
      };
      return next();
    }

    // Fallback: validate Bearer token (for API access)
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

// Role-based access control middleware factory
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
