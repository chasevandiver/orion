import { z } from "zod";
import { BaseAgent } from "./base.js";

export interface SEOInput {
  brandName: string;
  industry: string;
  goalType: string;
  channel: string; // "blog"
  contentTopic?: string;
  targetAudience?: string;
}

export interface SEOOutput {
  targetKeyword: string;
  secondaryKeywords: string[];
  metaTitle: string; // max 60 chars
  metaDescription: string; // max 155 chars
  suggestedHeadings: string[];
  wordCountTarget: number;
  internalLinkingOpportunities: string[];
  schemaMarkupType: string;
  contentBrief: string; // full SEO brief for ContentCreatorAgent
}

const SEOOutputSchema = z.object({
  targetKeyword: z.string(),
  secondaryKeywords: z.array(z.string()),
  metaTitle: z.string().max(60),
  metaDescription: z.string().max(155),
  suggestedHeadings: z.array(z.string()),
  wordCountTarget: z.number().int().positive(),
  internalLinkingOpportunities: z.array(z.string()),
  schemaMarkupType: z.string(),
  contentBrief: z.string(),
});

const SYSTEM_PROMPT =
  "You are an expert SEO strategist. You produce precise, actionable SEO briefs that help content rank on page 1. Return ONLY a JSON object matching the requested schema. MetaTitle must be 60 chars or fewer. MetaDescription must be 155 chars or fewer. ContentBrief should be 200-400 words of specific guidance.";

export class SEOAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
      },
      "1.0.0",
    );
  }

  async generate(input: SEOInput): Promise<SEOOutput> {
    const topicLine = input.contentTopic ? `\nContent Topic: ${input.contentTopic}` : "";
    const audienceLine = input.targetAudience ? `\nTarget Audience: ${input.targetAudience}` : "";

    const userMessage = `Create a comprehensive SEO brief for the following content.

Brand Name: ${input.brandName}
Industry: ${input.industry}
Goal Type: ${input.goalType}
Channel: ${input.channel}${topicLine}${audienceLine}

Return a JSON object with this exact shape:
{
  "targetKeyword": string,
  "secondaryKeywords": string[],
  "metaTitle": string,
  "metaDescription": string,
  "suggestedHeadings": string[],
  "wordCountTarget": number,
  "internalLinkingOpportunities": string[],
  "schemaMarkupType": string,
  "contentBrief": string
}

CRITICAL: metaTitle must be 60 characters or fewer. metaDescription must be 155 characters or fewer. Include 5-7 suggestedHeadings. wordCountTarget should be appropriate for the content type. contentBrief must be 200-400 words of specific, actionable guidance for the content writer.`;

    const { text } = await this.complete(userMessage);

    try {
      const raw = JSON.parse(text.trim());
      return SEOOutputSchema.parse(raw);
    } catch (err) {
      console.warn("[SEOAgent] Parse/validation failed, returning fallback.", err);
      return {
        targetKeyword: "",
        secondaryKeywords: [],
        metaTitle: "",
        metaDescription: "",
        suggestedHeadings: [],
        wordCountTarget: 1000,
        internalLinkingOpportunities: [],
        schemaMarkupType: "Article",
        contentBrief: "Could not parse SEO brief response.",
      };
    }
  }
}
