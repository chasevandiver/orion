import { Router } from "express";
import { db } from "@orion/db";
import { strategies } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { inngest } from "../../lib/inngest.js";

export const strategiesRouter = Router();

// GET /strategies — list all strategies for the org
strategiesRouter.get("/", async (req, res, next) => {
  try {
    const results = await db.query.strategies.findMany({
      where: eq(strategies.orgId, req.user.orgId),
      orderBy: desc(strategies.generatedAt),
      with: {
        goal: { columns: { id: true, type: true, brandName: true } },
      },
      limit: 50,
    });
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// GET /strategies/:id — get a single strategy with its parent goal
strategiesRouter.get("/:id", async (req, res, next) => {
  try {
    const strategy = await db.query.strategies.findFirst({
      where: and(
        eq(strategies.id, req.params.id!),
        eq(strategies.orgId, req.user.orgId),
      ),
      with: { goal: true },
    });

    if (!strategy) throw new AppError(404, "Strategy not found");
    res.json({ data: strategy });
  } catch (err) {
    next(err);
  }
});

// POST /strategies/:id/regenerate — re-queue strategy generation for the parent goal
strategiesRouter.post("/:id/regenerate", async (req, res, next) => {
  try {
    const strategy = await db.query.strategies.findFirst({
      where: and(
        eq(strategies.id, req.params.id!),
        eq(strategies.orgId, req.user.orgId),
      ),
    });

    if (!strategy) throw new AppError(404, "Strategy not found");

    await inngest.send({
      name: "orion/strategy.generate",
      data: { goalId: strategy.goalId, orgId: req.user.orgId, userId: req.user.id },
    });

    res.json({ data: { message: "Strategy regeneration queued", goalId: strategy.goalId } });
  } catch (err) {
    next(err);
  }
});
