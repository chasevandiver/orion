/**
 * AnalyticsAgent — natural-language analytics insights and recommendations.
 *
 * Accepts campaign/org queries, reads rollup data, aggregates results,
 * and produces structured intelligence reports with concrete next steps.
 *
 * Supports multi-turn refinement: operators can ask follow-up questions
 * (e.g., "Why is LinkedIn underperforming?") and the agent retains context.
 */
import { BaseAgent } from "./base.js";
import { db } from "@orion/db";
import { analyticsRollups, campaigns } from "@orion/db/schema";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { z } from "zod";

// ── Output schemas ────────────────────────────────────────────────────────────

export const AnalyticsReportSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  performanceRating: z.enum(["poor", "below_average", "average", "good", "excellent"]),
  keyMetrics: z.object({
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    conversions: z.number(),
    conversionRate: z.number(),
    engagementRate: z.number(),
    roi: z.number().optional(),
  }),
  channelInsights: z.array(z.object({
    channel: z.string(),
    assessment: z.string(),
    trend: z.enum(["improving", "stable", "declining", "insufficient_data"]),
    recommendation: z.string(),
  })),
  topFindings: z.array(z.string()),
  actionItems: z.array(z.object({
    priority: z.enum(["critical", "high", "medium", "low"]),
    action: z.string(),
    expectedImpact: z.string(),
    timeframe: z.string(),
  })),
  forecast: z.object({
    thirtyDayOutlook: z.string(),
    projectedConversions: z.string(),
    confidenceLevel: z.enum(["low", "medium", "high"]),
  }),
});

export type AnalyticsReport = z.infer<typeof AnalyticsReportSchema>;

export interface AnalyticsQueryInput {
  orgId: string;
  campaignId?: string;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  naturalLanguageQuery?: string;
  compareWithPreviousPeriod?: boolean;
}

const SYSTEM_PROMPT = `You are a senior marketing analytics AI for a B2B marketing automation platform. You analyze campaign data and produce precise, data-driven insights.

Your analysis is:
- Grounded in the actual numbers provided (never hallucinate metrics)
- Actionable (every finding has a clear next step)
- Prioritized (critical issues surface first)
- Honest (if data is sparse, say so clearly)

You understand: CTR benchmarks by channel (LinkedIn: 0.4%, Twitter: 0.5-1%, Email: 2-3%, Facebook: 0.9%), conversion funnel math, statistical significance thresholds, and media mix optimization.

Respond with JSON only (no markdown code fences, just raw JSON) matching this exact schema:
{
  "headline": "single impactful headline",
  "summary": "2-3 paragraph executive summary",
  "performanceRating": "poor|below_average|average|good|excellent",
  "keyMetrics": {
    "impressions": number,
    "clicks": number,
    "ctr": number (percentage),
    "conversions": number,
    "conversionRate": number (percentage),
    "engagementRate": number (percentage),
    "roi": number (percentage, optional)
  },
  "channelInsights": [
    {
      "channel": "string",
      "assessment": "1-2 sentence channel assessment",
      "trend": "improving|stable|declining|insufficient_data",
      "recommendation": "specific action to take for this channel"
    }
  ],
  "topFindings": ["3-5 most important findings"],
  "actionItems": [
    {
      "priority": "critical|high|medium|low",
      "action": "specific action",
      "expectedImpact": "quantified or qualified impact",
      "timeframe": "e.g. this week, within 30 days"
    }
  ],
  "forecast": {
    "thirtyDayOutlook": "outlook narrative",
    "projectedConversions": "e.g. 150-200 conversions",
    "confidenceLevel": "low|medium|high"
  }
}`;

// ── Agent class ───────────────────────────────────────────────────────────────

export class AnalyticsAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 2048 }, "1.0.0");
  }

  private parseJsonSafe<T>(text: string, schema: z.ZodType<T>): T | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/s);
    if (!jsonMatch) return null;
    try {
      return schema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      return null;
    }
  }

  /**
   * Fetch and aggregate rollup data for the requested date range.
   */
  private async fetchRollupData(input: AnalyticsQueryInput) {
    const end = input.dateRangeEnd ?? new Date();
    const start = input.dateRangeStart ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const conditions = [
      eq(analyticsRollups.orgId, input.orgId),
      gte(analyticsRollups.date, start),
      lt(analyticsRollups.date, end),
    ];
    if (input.campaignId) {
      conditions.push(eq(analyticsRollups.campaignId, input.campaignId));
    }

    const rollups = await db.query.analyticsRollups.findMany({
      where: and(...conditions),
      orderBy: desc(analyticsRollups.date),
      limit: 500,
    });

    // Aggregate totals
    const totals = rollups.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        conversions: acc.conversions + r.conversions,
        engagements: acc.engagements + r.engagements,
        spend: acc.spend + r.spend,
        revenue: acc.revenue + r.revenue,
      }),
      { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 },
    );

    // Per-channel breakdown
    const channelMap = new Map<string, {
      impressions: number; clicks: number; conversions: number; engagements: number;
    }>();
    for (const r of rollups) {
      const ch = r.channel ?? "unknown";
      const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0, engagements: 0 };
      channelMap.set(ch, {
        impressions: prev.impressions + r.impressions,
        clicks: prev.clicks + r.clicks,
        conversions: prev.conversions + r.conversions,
        engagements: prev.engagements + r.engagements,
      });
    }

    const channelBreakdown = Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      ...data,
      ctr: data.impressions > 0 ? +((data.clicks / data.impressions) * 100).toFixed(3) : 0,
      convRate: data.clicks > 0 ? +((data.conversions / data.clicks) * 100).toFixed(3) : 0,
    }));

    // Optional: previous period for comparison
    let previousTotals = null;
    if (input.compareWithPreviousPeriod) {
      const periodMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime());
      const prevStart = new Date(start.getTime() - periodMs);

      const prevRollups = await db.query.analyticsRollups.findMany({
        where: and(
          eq(analyticsRollups.orgId, input.orgId),
          gte(analyticsRollups.date, prevStart),
          lt(analyticsRollups.date, prevEnd),
          input.campaignId ? eq(analyticsRollups.campaignId, input.campaignId) : undefined,
        ),
        limit: 500,
      });

      previousTotals = prevRollups.reduce(
        (acc, r) => ({
          impressions: acc.impressions + r.impressions,
          clicks: acc.clicks + r.clicks,
          conversions: acc.conversions + r.conversions,
          engagements: acc.engagements + r.engagements,
        }),
        { impressions: 0, clicks: 0, conversions: 0, engagements: 0 },
      );
    }

    return { totals, channelBreakdown, start, end, previousTotals, rollupCount: rollups.length };
  }

  /**
   * Run the full analytics intelligence pipeline:
   * 1. Fetch rollup data from DB
   * 2. Build structured context for the AI
   * 3. Generate insights with the AI
   * 4. Parse and validate the structured output
   */
  async analyze(input: AnalyticsQueryInput): Promise<{
    report: AnalyticsReport;
    rawText: string;
    tokensUsed: number;
  }> {
    const data = await this.fetchRollupData(input);
    const { totals, channelBreakdown, start, end, previousTotals } = data;

    const ctr = totals.impressions > 0
      ? +((totals.clicks / totals.impressions) * 100).toFixed(3) : 0;
    const convRate = totals.clicks > 0
      ? +((totals.conversions / totals.clicks) * 100).toFixed(3) : 0;
    const engRate = totals.impressions > 0
      ? +((totals.engagements / totals.impressions) * 100).toFixed(3) : 0;
    const roi = totals.spend > 0
      ? +(((totals.revenue - totals.spend) / totals.spend) * 100).toFixed(1) : undefined;

    let campaignContext = "";
    if (input.campaignId) {
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, input.campaignId),
        with: { goal: { columns: { type: true, brandName: true, timeline: true } } },
      });
      if (campaign) {
        campaignContext = `
Campaign: "${campaign.name}" (${campaign.status})
Brand: ${(campaign as any).goal?.brandName ?? "Unknown"}
Goal: ${(campaign as any).goal?.type ?? "Unknown"}
`;
      }
    }

    const previousPeriodContext = previousTotals
      ? `
Previous Period Comparison:
- Impressions: ${previousTotals.impressions.toLocaleString()} (${totals.impressions > previousTotals.impressions ? "▲" : "▼"} ${Math.abs(((totals.impressions - previousTotals.impressions) / Math.max(previousTotals.impressions, 1)) * 100).toFixed(1)}%)
- Clicks: ${previousTotals.clicks.toLocaleString()} (${totals.clicks > previousTotals.clicks ? "▲" : "▼"} ${Math.abs(((totals.clicks - previousTotals.clicks) / Math.max(previousTotals.clicks, 1)) * 100).toFixed(1)}%)
- Conversions: ${previousTotals.conversions.toLocaleString()}
`
      : "";

    const userMessage = `
Analytics Period: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}
Data Points: ${data.rollupCount} daily rollups
${campaignContext}
Aggregate Performance:
- Impressions: ${totals.impressions.toLocaleString()}
- Clicks: ${totals.clicks.toLocaleString()}
- CTR: ${ctr}%
- Conversions: ${totals.conversions.toLocaleString()}
- Conversion Rate: ${convRate}%
- Engagement Rate: ${engRate}%
- Spend: $${totals.spend.toLocaleString()}
- Revenue: $${totals.revenue.toLocaleString()}
${roi !== undefined ? `- ROI: ${roi}%` : ""}

Channel Breakdown:
${channelBreakdown.length > 0
  ? channelBreakdown
    .sort((a, b) => b.impressions - a.impressions)
    .map(
      (c) =>
        `- ${c.channel}: ${c.impressions.toLocaleString()} impressions, ${c.ctr}% CTR, ${c.conversions} conversions, ${c.convRate}% conv. rate`,
    )
    .join("\n")
  : "- No channel data available (no analytics events recorded yet)"}
${previousPeriodContext}
${input.naturalLanguageQuery ? `\nUser Question: "${input.naturalLanguageQuery}"` : ""}

Analyze this data and return a complete JSON report.
`.trim();

    const { text, tokensUsed } = await this.complete(userMessage);

    const report = this.parseJsonSafe(text, AnalyticsReportSchema);

    if (!report) {
      // Return a minimal valid report if parsing fails
      const fallback: AnalyticsReport = {
        headline: "Analytics Report",
        summary: text.slice(0, 500),
        performanceRating: "average",
        keyMetrics: {
          impressions: totals.impressions,
          clicks: totals.clicks,
          ctr,
          conversions: totals.conversions,
          conversionRate: convRate,
          engagementRate: engRate,
          roi,
        },
        channelInsights: channelBreakdown.map((c) => ({
          channel: c.channel,
          assessment: `${c.impressions.toLocaleString()} impressions, ${c.ctr}% CTR`,
          trend: "stable" as const,
          recommendation: "Continue monitoring",
        })),
        topFindings: ["Report parsing failed — view raw text for details"],
        actionItems: [],
        forecast: {
          thirtyDayOutlook: "Insufficient data for forecast",
          projectedConversions: "Unknown",
          confidenceLevel: "low",
        },
      };
      return { report: fallback, rawText: text, tokensUsed };
    }

    return { report, rawText: text, tokensUsed };
  }

  /**
   * Quick natural-language answer to a specific analytics question.
   * Lighter than analyze() — suitable for chat-style interactions.
   */
  async query(orgId: string, question: string, campaignId?: string): Promise<{
    answer: string;
    tokensUsed: number;
  }> {
    const data = await this.fetchRollupData({ orgId, campaignId });
    const { totals, channelBreakdown } = data;

    const ctr = totals.impressions > 0
      ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0";

    const context = `
30-Day Performance Summary:
- ${totals.impressions.toLocaleString()} impressions, ${totals.clicks.toLocaleString()} clicks, ${ctr}% CTR
- ${totals.conversions} conversions, $${totals.spend.toLocaleString()} spend

Channels: ${channelBreakdown.map((c) => `${c.channel} (${c.ctr}% CTR)`).join(", ") || "none"}

Question: ${question}

Answer the question concisely and accurately using only the data above. If data is insufficient, say so.
`.trim();

    const { text, tokensUsed } = await this.complete(context);
    return { answer: text, tokensUsed };
  }
}
