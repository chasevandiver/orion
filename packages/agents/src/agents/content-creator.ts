import { BaseAgent } from "./base.js";

const CHANNEL_INSTRUCTIONS: Record<string, string> = {
  linkedin: `Write a high-performing LinkedIn post (150-200 words). 
    Include: a strong hook first line, concrete value or insight, brief story or data point, clear CTA.
    Professional but human tone. Use line breaks for readability. 2-3 relevant hashtags at end.`,

  twitter: `Write a 3-tweet thread for X/Twitter.
    Tweet 1: Strong hook (under 280 chars) that drives clicks/replies.
    Tweet 2: Core value/insight with specifics.
    Tweet 3: CTA + engagement question.
    Format: "1/ [tweet]\\n\\n2/ [tweet]\\n\\n3/ [tweet]"`,

  instagram: `Write an Instagram caption (100-150 words).
    Include: attention-grabbing first line, storytelling body, clear CTA, line break before hashtags.
    End with 10-12 highly relevant hashtags grouped on a new line.`,

  facebook: `Write a Facebook post (120-160 words).
    Conversational and relatable tone. Include a question to drive comments.
    End with a clear CTA (comment, share, click link).`,

  tiktok: `Write a TikTok video script (30-45 seconds when read aloud).
    Structure: Hook (0-3s) → Problem (3-10s) → Solution (10-25s) → CTA (25-35s).
    Include stage directions in brackets. Keep it energetic and native to TikTok.`,

  email: `Write a complete marketing email.
    Include:
    SUBJECT: [subject line]
    PREVIEW: [preview text, 40-50 chars]
    ---
    [Email body: greeting, hook paragraph, value section, social proof, CTA button text, signature]
    
    Keep body under 200 words. One primary CTA.`,

  blog: `Write a blog post introduction and outline.
    Include:
    HEADLINE: [SEO-optimized headline]
    META: [meta description, 150-160 chars]
    ---
    [250-word introduction that hooks the reader and sets up the post]
    
    OUTLINE:
    [H2 sections with brief descriptions for the full post]`,
};

const SYSTEM_PROMPT = `You are an expert marketing copywriter who specializes in creating high-converting content for every digital channel. You understand platform-native writing — what works on LinkedIn is very different from TikTok or email.

Your copy is:
- Specific (concrete details, not generic claims)
- Benefit-focused (what's in it for the reader)
- Platform-native (matching the format and culture of each channel)
- Action-driving (every piece has a clear next step)

Never use clichés like "game-changer", "unlock your potential", "revolutionize". Write like a real human, not an AI.`;

export interface ContentInput {
  channel: string;
  goalType: string;
  brandName: string;
  brandDescription?: string;
  strategyContext?: string;
  keyMessage?: string;
}

export class ContentCreatorAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 1200 }, "1.0.0");
  }

  async generate(
    input: ContentInput,
    onChunk: (text: string) => void,
  ): Promise<{ tokensUsed: number }> {
    const channelInstructions =
      CHANNEL_INSTRUCTIONS[input.channel] ?? "Write a compelling marketing post for this platform.";

    const userMessage = `
Brand: ${input.brandName}
Description: ${input.brandDescription ?? "Not provided"}
Goal: ${input.goalType}
Channel: ${input.channel}
Strategy Context: ${input.strategyContext ?? "Generate best-practice content for this goal"}
Key Message: ${input.keyMessage ?? "Derive from brand and goal context"}

Channel instructions:
${channelInstructions}

Write the content now. Output only the final content — no preamble, no meta-commentary.
    `.trim();

    return this.stream(userMessage, onChunk);
  }
}
