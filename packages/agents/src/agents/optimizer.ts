import { BaseAgent } from "./base.js";

const SYSTEM_PROMPT = `You are a data-driven marketing optimization expert. You analyze campaign performance data and produce specific, actionable recommendations backed by evidence. You understand statistical significance, A/B testing methodology, conversion rate optimization, and growth marketing.

Your recommendations are:
- Specific (exact changes to make, not vague suggestions)
- Prioritized (quick wins first, then strategic improvements)
- Quantified (expected impact in % or absolute numbers where possible)
- Testable (each recommendation can be measured)

Format your output with these sections:
## 🔥 Quick Wins (This Week)
## 🧪 A/B Tests to Run
## ⏰ Optimal Posting Schedule
## ✍️ Headline/Copy Improvements
## 📈 30-Day Forecast`;

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
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 1500 }, "1.0.0");
  }

  async analyze(input: OptimizationInput): Promise<{ text: string; tokensUsed: number; insufficientData?: boolean }> {
    const { analytics } = input;

    const totalImpressions = analytics.impressions +
      (analytics.channelBreakdown?.reduce((sum, c) => sum + c.impressions, 0) ?? 0);
    const rollupCount = analytics.channelBreakdown?.length ?? 0;

    if (totalImpressions < 100 || rollupCount < 3) {
      return {
        text: "Not enough campaign data yet. Run at least 3 campaigns and publish posts to unlock AI optimization insights. Once you have real performance data, ORION will analyze what's working and recommend adjustments.",
        tokensUsed: 0,
        insufficientData: true,
      };
    }

    const userMessage = `
Brand: ${input.brandName}
Goal: ${input.goalType}

Campaign Performance (last 7 days):
- Impressions: ${analytics.impressions.toLocaleString()}
- Clicks: ${analytics.clicks.toLocaleString()}
- CTR: ${((analytics.clicks / analytics.impressions) * 100).toFixed(2)}%
- Conversions: ${analytics.conversions}
- Conversion Rate: ${((analytics.conversions / analytics.clicks) * 100).toFixed(2)}%
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

Analyze this data and provide optimization recommendations. Be specific. Reference the actual numbers in your analysis. Prioritize by impact.
    `.trim();

    return this.complete(userMessage);
  }
}
