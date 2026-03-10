import { z } from "zod";
import { BaseAgent } from "./base.js";
import { parseAgentJson } from "../utils/parse-json.js";

export interface BrandVoiceEdit {
  originalText: string;
  editedText: string;
  channel: string;
}

export interface BrandVoiceInput {
  edits: BrandVoiceEdit[];
  orgName?: string;
}

export interface BrandVoiceProfile {
  tone: string;
  vocabulary: string[];
  bannedPhrases: string[];
  sentenceLengthPreference: "short" | "medium" | "long";
  ctaStyle: string;
  formality: "casual" | "professional" | "technical";
  emojiUsage: "none" | "minimal" | "frequent";
  exampleGoodCopy: string;
}

const BrandVoiceProfileSchema = z.object({
  tone: z.string(),
  vocabulary: z.array(z.string()),
  bannedPhrases: z.array(z.string()),
  sentenceLengthPreference: z.enum(["short", "medium", "long"]),
  ctaStyle: z.string(),
  formality: z.enum(["casual", "professional", "technical"]),
  emojiUsage: z.enum(["none", "minimal", "frequent"]),
  exampleGoodCopy: z.string(),
});

const SYSTEM_PROMPT =
  "You are a brand voice analyst. You analyze before/after copy edits to extract patterns about a brand's voice, style, and preferences. Return ONLY a JSON object matching the requested schema. Base your analysis strictly on the edit patterns provided — if you see words consistently removed, add them to bannedPhrases. If edits consistently shorten sentences, set sentenceLengthPreference to short.";

export class BrandVoiceAgent extends BaseAgent {
  constructor() {
    super(
      {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
      },
      "1.0.0",
    );
  }

  async generate(input: BrandVoiceInput): Promise<BrandVoiceProfile> {
    const orgLine = input.orgName ? `\nOrganization: ${input.orgName}` : "";

    const editsText = input.edits
      .map(
        (edit, i) =>
          `Edit ${i + 1} (${edit.channel}):\nORIGINAL: ${edit.originalText}\nEDITED: ${edit.editedText}`,
      )
      .join("\n\n");

    const userMessage = `Analyze the following before/after copy edits and extract a brand voice profile.${orgLine}

Number of edits provided: ${input.edits.length}

--- EDITS ---
${editsText}
--- END EDITS ---

Return a JSON object with this exact shape:
{
  "tone": string,
  "vocabulary": string[],
  "bannedPhrases": string[],
  "sentenceLengthPreference": "short" | "medium" | "long",
  "ctaStyle": string,
  "formality": "casual" | "professional" | "technical",
  "emojiUsage": "none" | "minimal" | "frequent",
  "exampleGoodCopy": string
}

Requirements:
- tone: describe the voice in 1-2 sentences (e.g. "Confident and direct, with a focus on outcomes over process")
- vocabulary: list 5-10 words or short phrases that consistently appear in edits (preferred terms)
- bannedPhrases: list words/phrases that were consistently removed or replaced in edits
- sentenceLengthPreference: derive from whether edits shorten, lengthen, or keep sentence length
- ctaStyle: describe how CTAs are written (e.g. "Action-first verbs, first person, low friction")
- formality: derive from overall register of the edited copy
- emojiUsage: derive from whether emojis were added, kept, or removed across edits
- exampleGoodCopy: copy the single best edited example verbatim from the edits provided`;

    const { text } = await this.complete(userMessage);

    try {
      const raw = parseAgentJson(text.trim());
      return BrandVoiceProfileSchema.parse(raw);
    } catch (err) {
      console.warn("[BrandVoiceAgent] Parse/validation failed, returning fallback.", err);
      return {
        tone: "Could not parse brand voice profile.",
        vocabulary: [],
        bannedPhrases: [],
        sentenceLengthPreference: "medium",
        ctaStyle: "",
        formality: "professional",
        emojiUsage: "none",
        exampleGoodCopy: "",
      };
    }
  }
}
