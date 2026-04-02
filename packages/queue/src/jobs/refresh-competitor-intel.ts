/**
 * refresh-competitor-intel.ts
 *
 * Inngest cron job that runs every Monday at 06:00 UTC.
 * For each org with saved competitor profiles, re-runs the
 * CompetitorIntelligenceAgent and updates the analysis.
 * Compares with the previous analysis and flags changes.
 */
import { inngest } from "../client.js";
import { db } from "@orion/db";
import { competitorProfiles, goals, organizations } from "@orion/db/schema";
import { eq, desc, isNotNull } from "drizzle-orm";
import { CompetitorIntelligenceAgent } from "@orion/agents";
import type { CompetitorIntelligenceOutput } from "@orion/agents";

export const refreshCompetitorIntel = inngest.createFunction(
  {
    id: "refresh-competitor-intel",
    name: "Weekly Competitor Intelligence Refresh",
    retries: 2,
  },
  { cron: "0 6 * * 1" }, // Every Monday at 06:00 UTC
  async ({ step }) => {
    // Step 1: Gather all orgs that have competitor profiles
    const orgIds = await step.run("gather-orgs", async () => {
      const rows = await db
        .selectDistinct({ orgId: competitorProfiles.orgId })
        .from(competitorProfiles);
      return rows.map((r) => r.orgId);
    });

    if (orgIds.length === 0) return { refreshed: 0 };

    let totalRefreshed = 0;

    // Step 2: Process each org
    for (const orgId of orgIds) {
      await step.run(`refresh-org-${orgId}`, async () => {
        // Get brand context from latest goal
        const latestGoal = await db.query.goals.findFirst({
          where: eq(goals.orgId, orgId),
          orderBy: desc(goals.createdAt),
        });

        const brandName = latestGoal?.brandName ?? "Our Brand";
        const industry = latestGoal?.targetAudience ?? "general";
        const goalType = latestGoal?.type ?? "awareness";

        // Get all competitor profiles for this org
        const profiles = await db.query.competitorProfiles.findMany({
          where: eq(competitorProfiles.orgId, orgId),
        });

        const agent = new CompetitorIntelligenceAgent();

        for (const profile of profiles) {
          try {
            const analysis = await agent.generate({
              brandName,
              industry,
              goalType,
              competitorUrls: profile.websiteUrl ? [profile.websiteUrl] : [],
            });

            const previousAnalysis = profile.analysisJson as CompetitorIntelligenceOutput | null;
            const changes = detectChanges(previousAnalysis, analysis);

            await db
              .update(competitorProfiles)
              .set({
                analysisJson: analysis,
                competitorChanges: changes,
                lastAnalyzedAt: new Date(),
              })
              .where(eq(competitorProfiles.id, profile.id));

            totalRefreshed++;
          } catch (err) {
            console.error(`[refresh-competitor-intel] Failed for profile ${profile.id}:`, (err as Error).message);
          }
        }
      });
    }

    return { refreshed: totalRefreshed, orgs: orgIds.length };
  },
);

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
