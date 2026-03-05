import { BaseAgent } from "./base.js";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a world-class marketing strategist with 20 years of experience across B2B SaaS, DTC brands, and enterprise companies. You have deep expertise in digital marketing, demand generation, brand building, and growth strategy.

Your job is to produce highly specific, actionable, data-driven marketing strategies. Never give generic advice. Always ground recommendations in the specific brand, goal, audience, and context provided.

Output structured strategies using these sections (always include all sections):

## 🎯 Target Audiences
List 2-3 specific, named audience segments with demographics, psychographics, and pain points.

## 📣 Recommended Channels
Top 3-4 channels with rationale, expected reach, and effort level (High/Medium/Low).

## 💬 Messaging Framework
Core value proposition, 3 key messages, tone of voice, proof points.

## 📅 30-Day Campaign Plan
Week-by-week breakdown with specific actions per channel.

## 📈 KPI Targets
Specific numeric targets: impressions, clicks, leads, conversions, CPA, ROI.

## 💡 Differentiators
3 ways to stand out from competitors in this space.

Be precise. Use numbers where possible. Tailor everything to the brand provided.`;

export interface StrategyInput {
  goalType: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
  timeline: string;
  budget?: number;
}

export interface StrategyOutput {
  text: string;
  tokensUsed: number;
}

export class MarketingStrategistAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 2048 }, "1.0.0");
  }

  async generate(input: StrategyInput): Promise<StrategyOutput> {
    const userMessage = `
Brand: ${input.brandName}
Description: ${input.brandDescription ?? "Not provided"}
Goal: ${input.goalType}
Target Audience (initial): ${input.targetAudience ?? "Not specified — please define"}
Timeline: ${input.timeline.replace("_", " ")}
Budget: ${input.budget ? `$${input.budget.toLocaleString()}` : "Not specified"}

Generate a complete marketing strategy for this brand and goal. Be specific, data-driven, and actionable. All recommendations must be achievable within the timeline and budget.
    `.trim();

    return this.complete(userMessage);
  }
}
