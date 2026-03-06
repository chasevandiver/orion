import { Router } from "express";
import { db } from "@orion/db";
import { sessions, users } from "@orion/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { logger } from "../../lib/logger.js";

export const authRouter = Router();

// GET /auth/me — return the currently authenticated user
// Works with both Next.js header injection and Bearer token
authRouter.get("/me", async (req, res, next) => {
  try {
    const userIdHeader = req.headers["x-user-id"] as string | undefined;
    const orgIdHeader = req.headers["x-org-id"] as string | undefined;
    const roleHeader = req.headers["x-user-role"] as string | undefined;

    if (userIdHeader && orgIdHeader) {
      return res.json({
        data: { id: userIdHeader, orgId: orgIdHeader, role: roleHeader ?? "member" },
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Unauthorized");
    }

    const token = authHeader.slice(7);
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.sessionToken, token), gt(sessions.expires, new Date())),
      with: { user: true },
    });

    if (!session) throw new AppError(401, "Invalid or expired session");

    res.json({
      data: {
        id: session.user.id,
        orgId: session.user.orgId,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — invalidate the current Bearer session token
authRouter.post("/logout", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(204).send();
    }

    const token = authHeader.slice(7);
    await db.delete(sessions).where(eq(sessions.sessionToken, token));
    logger.info({ token: token.slice(0, 8) + "…" }, "Session invalidated");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
