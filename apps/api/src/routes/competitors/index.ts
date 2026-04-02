import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { competitorProfiles, goals } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { CompetitorIntelligenceAgent } from "@orion/agents";
import type { CompetitorIntelligenceOutput } from "@orion/agents";

export const competitorsRouter = Router();

const addCompetitorSchema = z.object({
  competitorName: z.string().min(1).max(200),
  websiteUrl: z.string().url().optional(),
});

// GET /competitors — list saved competitor profiles for the org
competitorsRouter.get("/", async (req, res, next) => {
  try {
    const results = await db.query.competitorProfiles.findMany({
      where: eq(competitorProfiles.orgId, req.user.orgId),
      orderBy: desc(competitorProfiles.createdAt),
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /competitors — add a competitor, run analysis, save results
competitorsRouter.post("/", async (req, res, next) => {
  try {
    const body = addCompetitorSchema.parse(req.body);

    // Look up the org's latest goal for brand context
    const latestGoal = await db.query.goals.findFirst({
      where: eq(goals.orgId, req.user.orgId),
      orderBy: desc(goals.createdAt),
    });

    const brandName = latestGoal?.brandName ?? "Our Brand";
    const industry = latestGoal?.targetAudience ?? "general";
    const goalType = latestGoal?.type ?? "awareness";

    // Run the competitor intelligence agent
    const agent = new CompetitorIntelligenceAgent();
    const analysis = await agent.generate({
      brandName,
      industry,
      goalType,
      competitorUrls: body.websiteUrl ? [body.websiteUrl] : [],
    });

    const [profile] = await db
      .insert(competitorProfiles)
      .values({
        orgId: req.user.orgId,
        competitorName: body.competitorName,
        websiteUrl: body.websiteUrl,
        analysisJson: analysis,
        lastAnalyzedAt: new Date(),
      })
      .returning();

    res.status(201).json({ data: profile });
  } catch (err) {
    next(err);
  }
});

// POST /competitors/:id/refresh — re-run analysis for a specific competitor
competitorsRouter.post("/:id/refresh", async (req, res, next) => {
  try {
    const existing = await db.query.competitorProfiles.findFirst({
      where: and(
        eq(competitorProfiles.id, req.params.id!),
        eq(competitorProfiles.orgId, req.user.orgId),
      ),
    });
    if (!existing) throw new AppError(404, "Competitor not found");

    const latestGoal = await db.query.goals.findFirst({
      where: eq(goals.orgId, req.user.orgId),
      orderBy: desc(goals.createdAt),
    });

    const brandName = latestGoal?.brandName ?? "Our Brand";
    const industry = latestGoal?.targetAudience ?? "general";
    const goalType = latestGoal?.type ?? "awareness";

    const agent = new CompetitorIntelligenceAgent();
    const analysis = await agent.generate({
      brandName,
      industry,
      goalType,
      competitorUrls: existing.websiteUrl ? [existing.websiteUrl] : [],
    });

    // Detect changes from previous analysis
    const previousAnalysis = existing.analysisJson as CompetitorIntelligenceOutput | null;
    const changes = detectChanges(previousAnalysis, analysis);

    const [updated] = await db
      .update(competitorProfiles)
      .set({
        analysisJson: analysis,
        competitorChanges: changes,
        lastAnalyzedAt: new Date(),
      })
      .where(eq(competitorProfiles.id, existing.id))
      .returning();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /competitors/:id
competitorsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(competitorProfiles)
      .where(
        and(
          eq(competitorProfiles.id, req.params.id!),
          eq(competitorProfiles.orgId, req.user.orgId),
        ),
      )
      .returning({ id: competitorProfiles.id });

    if (!deleted) throw new AppError(404, "Competitor not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Change detection helper ──────────────────────────────────────────────────

function detectChanges(
  previous: CompetitorIntelligenceOutput | null,
  current: CompetitorIntelligenceOutput,
): { detectedAt: string; changes: Array<{ field: string; previous: string; current: string }> } | null {
  if (!previous) return null;

  const changes: Array<{ field: string; previous: string; current: string }> = [];

  if (previous.recommendedPositioning !== current.recommendedPositioning) {
    changes.push({
      field: "recommendedPositioning",
      previous: previous.recommendedPositioning,
      current: current.recommendedPositioning,
    });
  }

  // Compare each competitor's main claim and pricing strategy
  for (const curr of current.competitors) {
    const prev = previous.competitors.find((p) => p.name === curr.name);
    if (!prev) {
      changes.push({ field: `New competitor: ${curr.name}`, previous: "—", current: curr.mainClaim });
      continue;
    }
    if (prev.mainClaim !== curr.mainClaim) {
      changes.push({ field: `${curr.name} main claim`, previous: prev.mainClaim, current: curr.mainClaim });
    }
    if (prev.pricingStrategy !== curr.pricingStrategy) {
      changes.push({ field: `${curr.name} pricing`, previous: prev.pricingStrategy, current: curr.pricingStrategy });
    }
  }

  // Detect new whitespace opportunities
  const newWhitespace = current.whitespace.filter((w) => !previous.whitespace.includes(w));
  if (newWhitespace.length > 0) {
    changes.push({
      field: "New whitespace opportunities",
      previous: "—",
      current: newWhitespace.join("; "),
    });
  }

  return changes.length > 0
    ? { detectedAt: new Date().toISOString(), changes }
    : null;
}
