import { z } from "zod";
import { BaseAgent } from "./base.js";

export interface PaidAdsInput {
  brandName: string;
  brandDescription?: string;
  goalType: string;
  targetAudience?: string;
  keyMessage?: string;
  budget?: number;
  landingPageUrl?: string;
}

export interface PaidAdsOutput {
  googleAds: {
    headlines: string[]; // 15 headlines, max 30 chars each
    descriptions: string[]; // 4 descriptions, max 90 chars each
    displayUrl: string;
  };
  metaAds: {
    primaryTextVariants: string[]; // 5 variants, max 125 chars each
    headline: string; // max 40 chars
    description: string; // max 30 chars
    callToAction: string;
  };
  linkedInAds: {
    introductoryText: string; // max 150 chars
    headline: string; // max 70 chars
    description: string; // max 70 chars
    callToAction: string;
  };
}

const GoogleAdsSchema = z.object({
  headlines: z.array(z.string()),
  descriptions: z.array(z.string()),
  displayUrl: z.string(),
});

const MetaAdsSchema = z.object({
  primaryTextVariants: z.array(z.string()),
  headline: z.string(),
  description: z.string(),
  callToAction: z.string(),
});

const LinkedInAdsSchema = z.object({
  introductoryText: z.string(),
  headline: z.string(),
  description: z.string(),
  callToAction: z.string(),
});

const PaidAdsOutputSchema = z.object({
  googleAds: GoogleAdsSchema,
  metaAds: MetaAdsSchema,
  linkedInAds: LinkedInAdsSchema,
});

const SYSTEM_PROMPT =
  "You are a paid advertising specialist. You write high-converting ad copy for Google, Meta, and LinkedIn. CHARACTER LIMITS ARE ABSOLUTE — verify every field before returning. Google headlines: 30 chars max each. Google descriptions: 90 chars max each. Meta primaryText: 125 chars max. Meta headline: 40 chars max. Meta description: 30 chars max. LinkedIn introText: 150 chars max. LinkedIn headline: 70 chars max. LinkedIn description: 70 chars max. Return ONLY a JSON object matching the requested schema.";

function truncate(value: string, limit: number, label: string): string {
  if (value.length > limit) {
    console.warn(
      `[PaidAdsAgent] "${label}" exceeds ${limit} chars (${value.length}), truncating.`,
    );
    return value.slice(0, limit);
  }
  return value;
}

function validateAndTruncate(output: PaidAdsOutput): PaidAdsOutput {
  return {
    googleAds: {
      headlines: output.googleAds.headlines.map((h, i) =>
        truncate(h, 30, `googleAds.headlines[${i}]`),
      ),
      descriptions: output.googleAds.descriptions.map((d, i) =>
        truncate(d, 90, `googleAds.descriptions[${i}]`),
      ),
      displayUrl: output.googleAds.displayUrl,
    },
    metaAds: {
      primaryTextVariants: output.metaAds.primaryTextVariants.map((v, i) =>
        truncate(v, 125, `metaAds.primaryTextVariants[${i}]`),
      ),
      headline: truncate(output.metaAds.headline, 40, "metaAds.headline"),
      description: truncate(output.metaAds.description, 30, "metaAds.description"),
      callToAction: output.metaAds.callToAction,
    },
    linkedInAds: {
      introductoryText: truncate(output.linkedInAds.introductoryText, 150, "linkedInAds.introductoryText"),
      headline: truncate(output.linkedInAds.headline, 70, "linkedInAds.headline"),
      description: truncate(output.linkedInAds.description, 70, "linkedInAds.description"),
      callToAction: output.linkedInAds.callToAction,
    },
  };
}

export class PaidAdsAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
      },
      "1.0.0",
    );
  }

  async generate(input: PaidAdsInput): Promise<PaidAdsOutput> {
    const descriptionLine = input.brandDescription ? `\nBrand Description: ${input.brandDescription}` : "";
    const audienceLine = input.targetAudience ? `\nTarget Audience: ${input.targetAudience}` : "";
    const messageLine = input.keyMessage ? `\nKey Message: ${input.keyMessage}` : "";
    const budgetLine = input.budget ? `\nMonthly Budget: $${input.budget}` : "";
    const urlLine = input.landingPageUrl ? `\nLanding Page URL: ${input.landingPageUrl}` : "";

    const userMessage = `Create a complete paid advertising package for the following brand.

Brand Name: ${input.brandName}${descriptionLine}
Goal Type: ${input.goalType}${audienceLine}${messageLine}${budgetLine}${urlLine}

Return a JSON object with this exact shape:
{
  "googleAds": {
    "headlines": string[],
    "descriptions": string[],
    "displayUrl": string
  },
  "metaAds": {
    "primaryTextVariants": string[],
    "headline": string,
    "description": string,
    "callToAction": string
  },
  "linkedInAds": {
    "introductoryText": string,
    "headline": string,
    "description": string,
    "callToAction": string
  }
}

HARD CHARACTER LIMITS — COUNT EVERY CHARACTER:
- googleAds.headlines: exactly 15 items, each ≤ 30 chars
- googleAds.descriptions: exactly 4 items, each ≤ 90 chars
- metaAds.primaryTextVariants: exactly 5 items, each ≤ 125 chars
- metaAds.headline: ≤ 40 chars
- metaAds.description: ≤ 30 chars
- linkedInAds.introductoryText: ≤ 150 chars
- linkedInAds.headline: ≤ 70 chars
- linkedInAds.description: ≤ 70 chars`;

    const { text } = await this.complete(userMessage);

    let parsed: PaidAdsOutput;
    try {
      const raw = JSON.parse(text.trim());
      parsed = PaidAdsOutputSchema.parse(raw);
    } catch (err) {
      console.warn("[PaidAdsAgent] Parse/validation failed, returning fallback.", err);
      return {
        googleAds: { headlines: [], descriptions: [], displayUrl: "" },
        metaAds: { primaryTextVariants: [], headline: "", description: "", callToAction: "Learn More" },
        linkedInAds: { introductoryText: "", headline: "", description: "", callToAction: "Learn More" },
      };
    }

    return validateAndTruncate(parsed);
  }
}
