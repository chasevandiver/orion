import { z } from "zod";
import { BaseAgent } from "./base.js";

export interface CompetitorInput {
  brandName: string;
  industry: string;
  goalType: string;
  competitorUrls?: string[];
}

export interface CompetitorIntelligenceOutput {
  competitors: Array<{
    name: string;
    headline: string;
    mainClaim: string;
    pricingStrategy: string;
    contentAngles: string[];
  }>;
  whitespace: string[];
  differentiators: string[];
  messagingWarnings: string[];
  recommendedPositioning: string;
}

const CompetitorSchema = z.object({
  name: z.string(),
  headline: z.string(),
  mainClaim: z.string(),
  pricingStrategy: z.string(),
  contentAngles: z.array(z.string()),
});

const CompetitorIntelligenceOutputSchema = z.object({
  competitors: z.array(CompetitorSchema),
  whitespace: z.array(z.string()),
  differentiators: z.array(z.string()),
  messagingWarnings: z.array(z.string()),
  recommendedPositioning: z.string(),
});

const SYSTEM_PROMPT =
  "You are a competitive intelligence specialist. You analyze competitor positioning, messaging, and market gaps to help brands differentiate effectively. Return ONLY a JSON object matching the requested schema — no preamble or explanation. Be specific with competitor names and claims based on your knowledge of the industry.";

export class CompetitorIntelligenceAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
      },
      "1.0.0",
    );
  }

  async generate(input: CompetitorInput): Promise<CompetitorIntelligenceOutput> {
    const urlsSection =
      input.competitorUrls && input.competitorUrls.length > 0
        ? `\nKnown competitor URLs to consider: ${input.competitorUrls.join(", ")}`
        : "";

    const userMessage = `Analyze the competitive landscape for the following brand and produce a competitive intelligence report.

Brand Name: ${input.brandName}
Industry: ${input.industry}
Goal Type: ${input.goalType}${urlsSection}

Return a JSON object with this exact shape:
{
  "competitors": [
    {
      "name": string,
      "headline": string,
      "mainClaim": string,
      "pricingStrategy": string,
      "contentAngles": string[]
    }
  ],
  "whitespace": string[],
  "differentiators": string[],
  "messagingWarnings": string[],
  "recommendedPositioning": string
}

Include 3-5 real competitors. "whitespace" should list underserved market gaps. "differentiators" should list angles ${input.brandName} can own. "messagingWarnings" should flag overused claims to avoid.`;

    const { text } = await this.complete(userMessage);

    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      const raw = JSON.parse(cleaned);
      return CompetitorIntelligenceOutputSchema.parse(raw);
    } catch (err) {
      console.warn("[CompetitorIntelligenceAgent] Parse/validation failed, returning fallback.", err);
      return {
        competitors: [],
        whitespace: [],
        differentiators: [],
        messagingWarnings: ["Could not parse competitive intelligence response."],
        recommendedPositioning: "",
      };
    }
  }
}
