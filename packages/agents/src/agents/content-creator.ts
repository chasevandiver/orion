import { BaseAgent } from "./base.js";
import { anthropic } from "./base.js";

// ── Channel-specific instructions with good/bad examples ──────────────────────

const CHANNEL_INSTRUCTIONS: Record<string, string> = {
  linkedin: `Write a high-performing LinkedIn post (150-200 words).
    Include: a strong hook first line, concrete value or insight, brief story or data point, clear CTA.
    Professional but human tone. Use line breaks for readability. 2-3 relevant hashtags at end.

    BAD: "Unlock the power of seamless automation and elevate your workflows to the next level. 🚀"
    GOOD: "We cut our clients' month-end close from 5 days to 1. Here's exactly how we did it:"`,

  twitter: `Write a single tweet (NOT a thread) for X/Twitter.
    Maximum 270 characters — count every character before finalizing.
    Strong hook that drives clicks or replies. One core insight. One clear CTA.
    Do NOT write a thread. Do NOT use "1/ 2/ 3/" format.

    BAD: "Unlock the power of our groundbreaking platform and transform your business today! #Innovation"
    GOOD: "Most teams waste 3 hours/day on status updates. We fixed that. Here's the before/after:"`,

  instagram: `Write an Instagram caption (100-150 words).
    Include: attention-grabbing first line, storytelling body, clear CTA, line break before hashtags.
    End with 10-12 highly relevant hashtags grouped on a new line.

    BAD: "Elevate your game with our cutting-edge solution! Transform your life today. ✨"
    GOOD: "Nobody told me running a business meant becoming a spreadsheet expert. Until I found a better way:"`,

  facebook: `Write a Facebook post (120-160 words).
    Conversational and relatable tone. Include a question to drive comments.
    End with a clear CTA (comment, share, click link).

    BAD: "Revolutionize your workflow with our innovative synergistic platform solution!"
    GOOD: "Quick question: how long does your team's weekly reporting actually take? We asked 200 teams. The answers were wild:"`,

  tiktok: `Write a TikTok video script (30-45 seconds when read aloud).
    Structure: Hook (0-3s) → Problem (3-10s) → Solution (10-25s) → CTA (25-35s).
    Include stage directions in brackets. Keep it energetic and native to TikTok.`,

  email: `Write a complete marketing email.
    Include:
    SUBJECT: [subject line — use a specific number or question, not generic hype]
    PREVIEW: [preview text, 40-50 chars]
    ---
    [Email body: greeting, hook paragraph, value section, social proof, CTA button text, signature]

    Keep body under 200 words. One primary CTA.
    BAD subject: "Unlock Exciting New Possibilities with Our Innovative Solution!"
    GOOD subject: "How [Company] cut onboarding time by 60% in 30 days"`,

  blog: `Write a blog post introduction and outline.
    Include:
    HEADLINE: [SEO-optimized headline — specific, keyword-rich, not clickbait]
    META: [meta description, 150-160 chars, includes target keyword + CTA]
    ---
    [250-word introduction that hooks the reader with a real problem or counterintuitive insight]

    OUTLINE:
    [H2 sections with brief descriptions for the full post]`,
};

// ── System prompt with banned phrases ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert marketing copywriter who specializes in creating high-converting content for every digital channel. You understand platform-native writing — what works on LinkedIn is very different from TikTok or email.

Your copy is:
- Specific (concrete details, not generic claims)
- Benefit-focused (what's in it for the reader)
- Platform-native (matching the format and culture of each channel)
- Action-driving (every piece has a clear next step)
- Human (sounds like a real expert, not a chatbot)

BANNED WORDS AND PHRASES — never use any of these under any circumstances:
Unlock, Game-changer, Cutting-edge, Dive into, Elevate, Leverage, Seamless, Transform,
Revolutionize, "In today's fast-paced world", Groundbreaking, Innovative solution,
Best-in-class, Robust, Synergy, Scalable, Streamline, Empower, Supercharge, Holistic.
These make content sound AI-generated. They are absolutely forbidden.

Write like a real human expert who has strong opinions and concrete experience.`;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContentInput {
  channel: string;
  goalType: string;
  brandName: string;
  brandDescription?: string;
  strategyContext?: string;
  keyMessage?: string;
  voiceTone?: string;
  products?: Array<{ name: string; description: string }>;
  personaContext?: string;
  photoContext?: string;
  brandVoiceProfile?: string;
  variantInstruction?: string;
}

export class ContentCreatorAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 2048 }, "2.0.0");
  }

  async generate(
    input: ContentInput,
    onChunk: (text: string) => void,
  ): Promise<{ tokensUsed: number }> {
    const channelInstructions =
      CHANNEL_INSTRUCTIONS[input.channel] ?? "Write a compelling marketing post for this platform.";

    const productList = input.products?.length
      ? input.products.map((p) => `  - ${p.name}: ${p.description}`).join("\n")
      : null;

    const userMessage = `
${input.brandVoiceProfile ? `Brand voice guide: ${input.brandVoiceProfile}. Follow this style guide strictly.\n\n` : ""}Brand: ${input.brandName}
Description: ${input.brandDescription ?? "Not provided"}
Voice/Tone: ${input.voiceTone ?? "professional"}
${productList ? `Products:\n${productList}` : ""}
Goal: ${input.goalType}
Channel: ${input.channel}
Strategy Context: ${input.strategyContext ?? "Generate best-practice content for this goal"}
Key Message for this channel: ${input.keyMessage ?? "Derive from brand and goal context"}

Channel instructions:
${channelInstructions}
${input.personaContext ? `\nWrite this content speaking directly to this persona: ${input.personaContext}` : ""}
${input.photoContext ? `\n${input.photoContext}` : ""}
${input.variantInstruction ? `\nStyle direction: ${input.variantInstruction}` : ""}
Write the content now. Output only the final content — no preamble, no meta-commentary.
    `.trim();

    const result = await this.stream(userMessage, onChunk);

    return result;
  }

  /**
   * Rewrite content that is too long for the channel.
   * Used specifically for Twitter 280-char enforcement.
   */
  async rewrite(prompt: string): Promise<string> {
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: this.config.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });
    return result.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
}
