import { BaseAgent } from "./base.js";
import { z } from "zod";

// ── Output schema ──────────────────────────────────────────────────────────────

export const StrategyJsonSchema = z.object({
  executiveSummary: z.string(),
  audiences: z.array(z.object({
    name: z.string(),
    description: z.string(),
    painPoint: z.string(),
    size: z.enum(["small", "medium", "large"]),
  })),
  channels: z.array(z.string()),
  kpis: z.record(z.string()),
  messagingThemes: z.array(z.string()),
  keyMessagesByChannel: z.record(z.string()),
  thirtyDayPlan: z.array(z.string()),
  budgetAllocation: z.record(z.string()),
  contentCalendarOutline: z.array(z.object({
    week: z.number(),
    channel: z.string(),
    topic: z.string(),
    format: z.string(),
  })),
});

export type StrategyJson = z.infer<typeof StrategyJsonSchema>;

const SYSTEM_PROMPT = `You are a world-class marketing strategist with 20 years of experience across B2B SaaS, DTC brands, and enterprise companies. You have deep expertise in digital marketing, demand generation, brand building, and growth strategy.

Your job is to produce highly specific, actionable, data-driven marketing strategies. Never give generic advice. Always ground recommendations in the specific brand, goal, audience, and context provided.

CRITICAL OUTPUT RULES:
- Return ONLY a JSON object — no preamble, no markdown fences, no explanation text before or after
- You MUST select channels ONLY from this list: linkedin, twitter, instagram, facebook, tiktok, email, blog. Do not suggest other platforms.
- For each channel, provide one specific numeric KPI target. Use exact numbers, not ranges. E.g. "CTR: 0.8%" not "CTR: 0.5-1%"
- The primary audience segment must align with the persona context provided. Name them specifically (e.g. "VP of Finance at Series B SaaS companies" not "business professionals")

Return ONLY this JSON schema:
{
  "executiveSummary": "2-3 sentence overview of the strategy",
  "audiences": [
    { "name": "string", "description": "string", "painPoint": "string", "size": "small|medium|large" }
  ],
  "channels": ["linkedin", "twitter"],
  "kpis": { "linkedin": "CTR 0.8%", "twitter": "Engagement rate 3%" },
  "messagingThemes": ["theme1", "theme2", "theme3"],
  "keyMessagesByChannel": { "linkedin": "specific message for linkedin", "twitter": "specific message for twitter" },
  "thirtyDayPlan": ["Week 1: ...", "Week 2: ...", "Week 3: ...", "Week 4: ..."],
  "budgetAllocation": { "linkedin": "40%", "twitter": "30%", "email": "30%" },
  "contentCalendarOutline": [{ "week": 1, "channel": "linkedin", "topic": "string", "format": "string" }]
}`;

export interface BrandProfile {
  name: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  primaryColor?: string;
  voiceTone?: string;
  targetAudience?: string;
  products?: Array<{ name: string; description: string }>;
}

export interface StrategyInput {
  goalType: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
  timeline: string;
  budget?: number;
  brand?: BrandProfile;
  personaContext?: string;
  brandBrief?: BrandBrief;
  trendContext?: string;
  competitorContext?: string;
  optimizationContext?: string;
}

export interface BrandBrief {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontPreference?: string;
  logoPosition?: string;
  inspirationImageUrl?: string;
  extractedMood?: string;
  extractedColors?: string[];
  extractedStyle?: string;
}

export interface StrategyOutput {
  /** Raw JSON string from the model */
  text: string;
  /** Parsed and validated JSON strategy — null if parsing failed */
  parsed: StrategyJson | null;
  tokensUsed: number;
}

// ── Safe JSON parser ───────────────────────────────────────────────────────────

function parseJsonSafe(text: string, attempt: number): StrategyJson | null {
  try {
    // Strip any accidental markdown fences (```json ... ``` or ``` ... ```)
    const cleaned = text
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/im, "")
      .trim();
    const raw = JSON.parse(cleaned);
    return StrategyJsonSchema.parse(raw);
  } catch (err) {
    console.error(
      `[MarketingStrategistAgent] JSON parse/validation failed (attempt ${attempt}):`,
      (err as Error).message,
    );
    console.error(`[MarketingStrategistAgent] Raw output (attempt ${attempt}):\n${text}`);
    return null;
  }
}

export class MarketingStrategistAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 4096 }, "2.0.0");
  }

  async generate(input: StrategyInput): Promise<StrategyOutput> {
    const b = input.brand;
    const productList = b?.products?.length
      ? b.products.map((p) => `  - ${p.name}: ${p.description}`).join("\n")
      : null;

    const userMessage = `
Brand: ${b?.name ?? input.brandName}
${b?.tagline ? `Tagline: ${b.tagline}` : ""}
Description: ${b?.description ?? input.brandDescription ?? "Not provided"}
Website: ${b?.websiteUrl ?? "Not provided"}
Voice/Tone: ${b?.voiceTone ?? "professional"}
${productList ? `Products:\n${productList}` : ""}
Goal: ${input.goalType}
Target Audience: ${b?.targetAudience ?? input.targetAudience ?? "Not specified — please define"}
Timeline: ${input.timeline.replace("_", " ")}
Budget: ${input.budget ? `$${input.budget.toLocaleString()}` : "Not specified"}
${input.personaContext ? `\nAudience Personas on file:\n${input.personaContext}\nTailor ALL audience recommendations and messaging to these personas. Name them specifically in the audiences array.` : ""}
${input.trendContext ? `\nCurrent industry trends:\n${input.trendContext}\nWhere relevant, reference these trends in channel recommendations and messaging.` : ""}
${input.competitorContext ? `\nCompetitor intelligence:\n${input.competitorContext}\nUse this to differentiate messaging and avoid competitor-owned claims.` : ""}
${input.optimizationContext ? `\nLearnings from previous campaigns:\n${input.optimizationContext}\nApply these insights to inform channel selection, timing, and content format.` : ""}

Generate a complete marketing strategy. Return ONLY the JSON object — no other text.
    `.trim();

    // Attempt 1
    const result = await this.complete(userMessage);
    let parsed = parseJsonSafe(result.text, 1);

    // Retry once if first attempt fails validation
    if (!parsed) {
      console.warn("[MarketingStrategistAgent] First attempt failed — retrying...");
      const retry = await this.complete(userMessage);
      parsed = parseJsonSafe(retry.text, 2);
      if (!parsed) {
        console.error("[MarketingStrategistAgent] Both attempts failed — returning null parsed");
      }
      return {
        text: retry.text,
        parsed,
        tokensUsed: result.tokensUsed + retry.tokensUsed,
      };
    }

    return {
      text: result.text,
      parsed,
      tokensUsed: result.tokensUsed,
    };
  }
}
