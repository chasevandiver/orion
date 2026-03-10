import { z } from "zod";
import { BaseAgent } from "./base.js";
import { parseAgentJson } from "../utils/parse-json.js";

export interface LandingPageInput {
  brandName: string;
  brandDescription?: string;
  goalType: string;
  primaryAudience?: string;
  keyMessage?: string;
  leadMagnetTitle?: string;
}

export interface LandingPageOutput {
  headline: string;
  subheadline: string;
  heroSection: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaButtonLabel: string;
  };
  benefitsSections: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  socialProof: Array<{
    quote: string;
    author: string;
    company: string;
    role: string;
  }>;
  faqSection: Array<{
    question: string;
    answer: string;
  }>;
  ctaSection: {
    headline: string;
    subtext: string;
    buttonLabel: string;
    formFields: string[];
  };
  metaTitle: string;
  metaDescription: string;
  slug: string;
}

const HeroSectionSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string(),
  ctaButtonLabel: z.string(),
});

const BenefitSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

const SocialProofSchema = z.object({
  quote: z.string(),
  author: z.string(),
  company: z.string(),
  role: z.string(),
});

const FAQSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const CTASectionSchema = z.object({
  headline: z.string(),
  subtext: z.string(),
  buttonLabel: z.string(),
  formFields: z.array(z.string()),
});

const LandingPageOutputSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  heroSection: HeroSectionSchema,
  benefitsSections: z.array(BenefitSchema),
  socialProof: z.array(SocialProofSchema),
  faqSection: z.array(FAQSchema),
  ctaSection: CTASectionSchema,
  metaTitle: z.string(),
  metaDescription: z.string(),
  slug: z.string().max(50),
});

const SYSTEM_PROMPT =
  "You are a conversion-focused landing page copywriter. You create high-converting landing pages with clear value propositions, social proof, and compelling CTAs. Return ONLY a JSON object matching the requested schema. The slug should be kebab-case derived from the headline (max 50 chars). Social proof should be 2-3 realistic testimonials. Benefits should be 3-4 items. FAQ should be 3-5 questions.";

export class LandingPageAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 3000,
      },
      "1.0.0",
    );
  }

  async generate(input: LandingPageInput): Promise<LandingPageOutput> {
    const descriptionLine = input.brandDescription ? `\nBrand Description: ${input.brandDescription}` : "";
    const audienceLine = input.primaryAudience ? `\nPrimary Audience: ${input.primaryAudience}` : "";
    const messageLine = input.keyMessage ? `\nKey Message: ${input.keyMessage}` : "";
    const leadMagnetLine = input.leadMagnetTitle
      ? `\nLead Magnet Title (reference in CTA): "${input.leadMagnetTitle}"`
      : "";

    const userMessage = `Create a complete, high-converting landing page for the following brand.

Brand Name: ${input.brandName}${descriptionLine}
Goal Type: ${input.goalType}${audienceLine}${messageLine}${leadMagnetLine}

Return a JSON object with this exact shape:
{
  "headline": string,
  "subheadline": string,
  "heroSection": {
    "headline": string,
    "subheadline": string,
    "ctaText": string,
    "ctaButtonLabel": string
  },
  "benefitsSections": [
    { "icon": string, "title": string, "description": string }
  ],
  "socialProof": [
    { "quote": string, "author": string, "company": string, "role": string }
  ],
  "faqSection": [
    { "question": string, "answer": string }
  ],
  "ctaSection": {
    "headline": string,
    "subtext": string,
    "buttonLabel": string,
    "formFields": string[]
  },
  "metaTitle": string,
  "metaDescription": string,
  "slug": string
}

Requirements:
- 3-4 benefit items with relevant emoji icons
- 2-3 realistic testimonials in socialProof
- 3-5 FAQ questions addressing common objections
- slug must be kebab-case, max 50 chars
- formFields should be appropriate for the goal type (e.g. ["First Name", "Email", "Company"])`;

    const { text } = await this.complete(userMessage);

    try {
      const raw = parseAgentJson(text.trim());
      return LandingPageOutputSchema.parse(raw);
    } catch (err) {
      console.warn("[LandingPageAgent] Parse/validation failed, returning fallback.", err);
      return {
        headline: "",
        subheadline: "",
        heroSection: { headline: "", subheadline: "", ctaText: "", ctaButtonLabel: "Get Started" },
        benefitsSections: [],
        socialProof: [],
        faqSection: [],
        ctaSection: { headline: "", subtext: "", buttonLabel: "Get Started", formFields: ["Email"] },
        metaTitle: "",
        metaDescription: "",
        slug: "",
      };
    }
  }
}
