import { BaseAgent } from "./base.js";

const SYSTEM_PROMPT = `You are a data-driven marketing optimization expert. You analyze campaign performance data and produce specific, actionable recommendations backed by evidence. You understand statistical significance, A/B testing methodology, conversion rate optimization, and growth marketing.

Your recommendations are:
- Specific (exact changes to make, not vague suggestions)
- Prioritized (quick wins first, then strategic improvements)
- Quantified (expected impact in % or absolute numbers where possible)
- Testable (each recommendation can be measured)

You MUST respond with a single JSON object matching this exact structure (no markdown, no prose outside the JSON):
{
  "topPerformers": [{ "channel": string, "metric": string, "value": string, "insight": string }],
  "bottomPerformers": [{ "channel": string, "issue": string, "recommendation": string }],
  "quickWins": [string],
  "abTests": [{ "hypothesis": string, "variant": string, "expectedLift": string }],
  "optimalSchedule": { "bestDays": string[], "bestTimes": string[], "notes": string },
  "copyImprovements": [string],
  "thirtyDayForecast": { "projectedImpressions": number, "projectedCTR": string, "projectedConversions": number, "notes": string },
  "executiveSummary": string
}`;

export interface OptimizationOutput {
  topPerformers: Array<{ channel: string; metric: string; value: string; insight: string }>;
  bottomPerformers: Array<{ channel: string; issue: string; recommendation: string }>;
  quickWins: string[];
  abTests: Array<{ hypothesis: string; variant: string; expectedLift: string }>;
  optimalSchedule: { bestDays: string[]; bestTimes: string[]; notes: string };
  copyImprovements: string[];
  thirtyDayForecast: { projectedImpressions: number; projectedCTR: string; projectedConversions: number; notes: string };
  executiveSummary: string;
}

export interface OptimizationInput {
  brandName: string;
  goalType: string;
  analytics: {
    impressions: number;
    clicks: number;
    conversions: number;
    engagementRate: number;
    cpa: number;
    roi: number;
    channelBreakdown?: Array<{
      channel: string;
      impressions: number;
      clicks: number;
      conversions: number;
      ctr: number;
    }>;
  };
  topAssets?: Array<{ channel: string; ctr: number; conversions: number }>;
}

export class OptimizationAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 2000 }, "2.0.0");
  }

  async analyze(input: OptimizationInput): Promise<{ text: string; structured: OptimizationOutput | null; tokensUsed: number; insufficientData?: boolean }> {
    const { analytics } = input;

    const totalImpressions = analytics.impressions +
      (analytics.channelBreakdown?.reduce((sum, c) => sum + c.impressions, 0) ?? 0);
    const rollupCount = analytics.channelBreakdown?.length ?? 0;

    if (totalImpressions < 100 || rollupCount < 3) {
      return {
        text: "Not enough campaign data yet. Run at least 3 campaigns and publish posts to unlock AI optimization insights. Once you have real performance data, ORION will analyze what's working and recommend adjustments.",
        structured: null,
        tokensUsed: 0,
        insufficientData: true,
      };
    }

    const userMessage = `
Brand: ${input.brandName}
Goal: ${input.goalType}

Campaign Performance:
- Impressions: ${analytics.impressions.toLocaleString()}
- Clicks: ${analytics.clicks.toLocaleString()}
- CTR: ${((analytics.clicks / analytics.impressions) * 100).toFixed(2)}%
- Conversions: ${analytics.conversions}
- Conversion Rate: ${analytics.clicks > 0 ? ((analytics.conversions / analytics.clicks) * 100).toFixed(2) : "0.00"}%
- Engagement Rate: ${analytics.engagementRate}%
- CPA: $${analytics.cpa}
- ROI: ${analytics.roi}%

${
  analytics.channelBreakdown
    ? `Channel Breakdown:\n${analytics.channelBreakdown
        .map((c) => `- ${c.channel}: ${c.impressions.toLocaleString()} impressions, ${c.ctr}% CTR, ${c.conversions} conversions`)
        .join("\n")}`
    : ""
}

Analyze this data and respond with the JSON object specified in your instructions.
    `.trim();

    const result = await this.complete(userMessage);

    let structured: OptimizationOutput | null = null;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[0]) as OptimizationOutput;
      }
    } catch {
      // structured stays null; caller uses text fallback
    }

    return { text: result.text, structured, tokensUsed: result.tokensUsed };
  }
}
