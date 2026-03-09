import { z } from "zod";
import { BaseAgent } from "./base.js";

export type LeadMagnetType =
  | "benchmark_report"
  | "roi_calculator"
  | "checklist"
  | "swipe_file"
  | "mini_guide";

export interface LeadMagnetInput {
  brandName: string;
  industry: string;
  goalType: string;
  targetAudience?: string;
  preferredType?: LeadMagnetType;
}

export interface LeadMagnetOutput {
  type: LeadMagnetType;
  title: string;
  subtitle: string;
  description: string;
  sections: Array<{
    title: string;
    content: string;
    keyPoints?: string[];
  }>;
  coverImagePrompt: string;
  downloadFileName: string;
}

const LeadMagnetTypeSchema = z.enum([
  "benchmark_report",
  "roi_calculator",
  "checklist",
  "swipe_file",
  "mini_guide",
]);

const SectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  keyPoints: z.array(z.string()).optional(),
});

const LeadMagnetOutputSchema = z.object({
  type: LeadMagnetTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  sections: z.array(SectionSchema),
  coverImagePrompt: z.string(),
  downloadFileName: z.string(),
});

const SYSTEM_PROMPT =
  "You are a content marketing specialist who creates high-value lead magnets. Generate a complete, detailed lead magnet that provides real value to the target audience. Return ONLY a JSON object matching the requested schema. The content should be substantive — sections should have real, actionable content, not placeholder text.";

export class LeadMagnetAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 3000,
      },
      "1.0.0",
    );
  }

  async generate(input: LeadMagnetInput): Promise<LeadMagnetOutput> {
    const audienceLine = input.targetAudience ? `\nTarget Audience: ${input.targetAudience}` : "";
    const preferredTypeLine = input.preferredType
      ? `\nPreferred Lead Magnet Type: ${input.preferredType} (use this type unless it's a poor fit)`
      : "";

    const userMessage = `Create a complete, high-value lead magnet for the following brand.

Brand Name: ${input.brandName}
Industry: ${input.industry}
Goal Type: ${input.goalType}${audienceLine}${preferredTypeLine}

Available lead magnet types: benchmark_report, roi_calculator, checklist, swipe_file, mini_guide

Return a JSON object with this exact shape:
{
  "type": string,
  "title": string,
  "subtitle": string,
  "description": string,
  "sections": [
    {
      "title": string,
      "content": string,
      "keyPoints": string[]
    }
  ],
  "coverImagePrompt": string,
  "downloadFileName": string
}

Requirements:
- type must be one of the available types above
- title should be compelling and specific (include a number if relevant)
- description should clearly communicate what the reader will get (2-3 sentences)
- sections should contain REAL, substantive content — 4-6 sections minimum
- keyPoints within each section should be specific and actionable (3-5 per section where applicable)
- coverImagePrompt should describe a professional cover image for the lead magnet
- downloadFileName should be kebab-case ending in .pdf (e.g. "2024-saas-benchmark-report.pdf")`;

    const { text } = await this.complete(userMessage);

    try {
      const raw = JSON.parse(text.trim());
      return LeadMagnetOutputSchema.parse(raw);
    } catch (err) {
      console.warn("[LeadMagnetAgent] Parse/validation failed, returning fallback.", err);
      return {
        type: "mini_guide",
        title: "",
        subtitle: "",
        description: "Could not parse lead magnet response.",
        sections: [],
        coverImagePrompt: "",
        downloadFileName: "lead-magnet.pdf",
      };
    }
  }
}
