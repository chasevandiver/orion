import { Router, type Request, type Response } from "express";
import { db } from "@orion/db";
import { recommendations } from "@orion/db/schema";
import { eq, and, gte, ne, desc } from "drizzle-orm";

export const recommendationsRouter = Router();

// GET /recommendations — active (non-expired, non-dismissed) recommendations, ordered by priority
recommendationsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).orgId as string;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();

    const rows = await db
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.orgId, orgId),
          eq(recommendations.status, "pending"),
          gte(recommendations.expiresAt, now),
        ),
      )
      .orderBy(recommendations.priority, desc(recommendations.createdAt))
      .limit(10);

    return res.json({ data: rows });
  } catch (err: any) {
    console.error("[recommendations] GET error:", err);
    return res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// PATCH /recommendations/:id — update status to "acted" or "dismissed"
recommendationsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).orgId as string;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params.id!;
    const { status } = req.body;

    if (!status || !["acted", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "status must be 'acted' or 'dismissed'" });
    }

    const rows = await db
      .update(recommendations)
      .set({ status })
      .where(
        and(
          eq(recommendations.id, id),
          eq(recommendations.orgId, orgId),
        ),
      )
      .returning();

    const updated = rows[0];

    if (!updated) {
      return res.status(404).json({ error: "Recommendation not found" });
    }

    return res.json({ data: updated });
  } catch (err: any) {
    console.error("[recommendations] PATCH error:", err);
    return res.status(500).json({ error: "Failed to update recommendation" });
  }
});
