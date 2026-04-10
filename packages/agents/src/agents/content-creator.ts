import { BaseAgent } from "./base.js";
import { anthropic } from "./base.js";

// ── Channel-specific instructions with good/bad examples ──────────────────────

// Overlay field instructions injected at the top of every channel prompt.
// These produce the OVERLAY_HEADLINE and OVERLAY_CTA structured fields used by
// the compositor to render text on the image. They must appear BEFORE body copy.
const OVERLAY_FIELD_INSTRUCTIONS = `OUTPUT FORMAT — start your response with these two lines, then the body copy:
OVERLAY_HEADLINE: [3-7 words — a complete, punchy thought written for the image. NOT a truncated sentence. This is the hero text displayed on the visual.]
OVERLAY_CTA: [2-4 words — an action phrase only, e.g. "Try it free" / "Start today" / "Join the crew"]

OVERLAY rules (critical):
✓ OVERLAY_HEADLINE must be a COMPLETE thought that makes sense on its own
✓ 3-7 words maximum — count them
✓ No ellipsis, no dashes that trail off, no incomplete sentences
✓ OVERLAY_CTA: 2-4 words, action verb first, never a full sentence
✗ NEVER: "Whether you're a fantasy sports..." (incomplete)
✗ NEVER: "Unlock the power of seamless..." (too long + banned phrase)
✗ NEVER: "Try Fairway Picks free — learn more about..." (too long for CTA)

Examples for a golf fantasy app:
OVERLAY_HEADLINE: Your crew. One leaderboard.
OVERLAY_CTA: Try it free

Examples for a B2B SaaS:
OVERLAY_HEADLINE: Close the month in one day.
OVERLAY_CTA: Start today

`;

const CHANNEL_INSTRUCTIONS: Record<string, string> = {
  linkedin: `${OVERLAY_FIELD_INSTRUCTIONS}Write a high-performing LinkedIn post (150-200 words).
    Include: a strong hook first line, concrete value or insight, brief story or data point, clear CTA.
    Professional but human tone. Use line breaks for readability. 2-3 relevant hashtags at end.

    BAD body: "Unlock the power of seamless automation and elevate your workflows to the next level. 🚀"
    GOOD body: "We cut our clients' month-end close from 5 days to 1. Here's exactly how we did it:"`,

  twitter: `${OVERLAY_FIELD_INSTRUCTIONS}Write exactly one standalone tweet for X/Twitter. Hard limit: 280 characters total — count every character including spaces, punctuation, and hashtags before finalizing.
    Strong hook that earns a click or reply. One focused insight or claim. One clear CTA.
    1-2 hashtags maximum, placed at the end.
    Do NOT write a thread. Do NOT use any numbering like "1/3", "2/3", etc.

    BAD body: "Unlock the power of our groundbreaking platform and transform your business today! #Innovation"
    GOOD body: "Most teams waste 3 hours/day on status updates. We fixed that. Here's the before/after:"`,

  instagram: `${OVERLAY_FIELD_INSTRUCTIONS}Write an Instagram caption (max 150 words).
    Visual-first hook on the first line — write as if the caption belongs next to a striking image.
    Do NOT include any URLs in the body text — Instagram does not make links clickable in captions.
    2-4 short paragraphs with storytelling body. Clear CTA in the final line (e.g. "Link in bio").
    End with exactly 3-5 tightly relevant hashtags on a new line after a blank line.

    BAD body: "Elevate your game! Visit our-site.com to learn more. ✨ #marketing #business #growth #success #digital #media #brand"
    GOOD body: "Nobody told me running a business meant becoming a spreadsheet expert.\n\nThen I spent 3 hours building a report nobody read.\n\nThere's a better way — details in bio.\n\n#smallbusiness #productivity #entrepreneurship"`,

  facebook: `${OVERLAY_FIELD_INSTRUCTIONS}Write a Facebook post (120-160 words).
    Conversational and relatable tone. Include a question to drive comments.
    End with a clear CTA (comment, share, click link).

    BAD body: "Revolutionize your workflow with our innovative synergistic platform solution!"
    GOOD body: "Quick question: how long does your team's weekly reporting actually take? We asked 200 teams. The answers were wild:"`,

  tiktok: `Write a TikTok video script (30-45 seconds when read aloud).
    Structure: Hook (0-3s) → Problem (3-10s) → Solution (10-25s) → CTA (25-35s).
    Include stage directions in brackets. Keep it energetic and native to TikTok.`,

  email: `${OVERLAY_FIELD_INSTRUCTIONS}Write a complete marketing email.
    After the OVERLAY fields, include:
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

  google_business: `${OVERLAY_FIELD_INSTRUCTIONS}Write a Google Business Profile post.
    Include a clear call-to-action button text (one of: Learn more, Reserve, Sign up, Call now, Get offer). Keep it conversational and local — this is for customers searching for businesses nearby. 2-3 sentences max.

After the OVERLAY fields, output:
[Post content — 2-3 sentences, max 1500 characters total including the CTA line]

CTA: [one of: Learn more | Reserve | Sign up | Call now | Get offer]

BAD: "We offer world-class services that will revolutionize the way you think about our industry!"
GOOD: "Stop in this weekend — we're running 20% off all services through Sunday. Book your spot before it fills up.\n\nCTA: Reserve"`,

  sms: `Write a concise SMS marketing message. Hard limit: 160 characters total — count every character before finalizing.
    Include a clear, single CTA (e.g. "Reply YES", "Click here", "Shop now").
    No hashtags. No emojis unless the brand voice explicitly uses them.
    End with opt-out language on a new line: "Reply STOP to unsubscribe."
    The opt-out line counts toward the 160-character limit — budget for it.
    Aim for 2-segment max (320 chars) only if the message absolutely requires it.

    BAD: "Hey! We have amazing deals on all our incredible products this weekend only! Check out our website for more info! 🎉🔥 #sale #deals"
    GOOD: "Acme: 20% off all plans through Friday. Use code SAVE20 at checkout: acme.co/upgrade\nReply STOP to unsubscribe."`,
};

// ── Channels that support hashtags ────────────────────────────────────────────

const HASHTAG_CHANNELS = new Set(["instagram", "twitter", "linkedin", "tiktok", "facebook"]);

// ── System prompt with banned phrases ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert marketing copywriter who specializes in creating high-converting content for every digital channel. You understand platform-native writing — what works on LinkedIn is very different from TikTok or email.

Your copy is:
- Specific (concrete details, not generic claims)
- Benefit-focused (what's in it for the reader)
- Platform-native (matching the format and culture of each channel)
- Action-driving (every piece has a clear next step)
- Human (sounds like a real expert, not a chatbot)

BANNED WORDS AND PHRASES — never write any of these under any circumstances:
Unlock, Game-changer, Cutting-edge, Dive into, Elevate, Leverage, Seamless, Transform,
Revolutionize, Empower, Disrupt, Synergy, Navigate, Landscape,
"In today's fast-paced world", "Take your X to the next level", "The future of X",
Best-in-class, World-class, End-to-end solution, Innovative solution,
Thought leader, Holistic approach.
These make content sound AI-generated. They are absolutely forbidden.

Write like a real human expert who has strong opinions and concrete experience.`;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HashtagPerformanceContext {
  /** Top-performing hashtags for this brand — prefer these when relevant */
  highPerforming: Array<{ hashtag: string; avgEngagementRate: number }>;
  /** Low-performing hashtags to avoid */
  lowPerforming: Array<{ hashtag: string; avgEngagementRate: number }>;
}

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
  /** Hashtag performance history — used to guide hashtag selection */
  hashtagContext?: HashtagPerformanceContext;
  /** Hashtags the org has banned — never include these */
  bannedHashtags?: string[];
}

// ── Hashtag extractor ─────────────────────────────────────────────────────────

/**
 * Extracts all hashtags (e.g. "#productivity") from generated content.
 * Only meaningful for social channels; returns [] for email/blog/sms.
 */
export function extractHashtags(text: string, channel: string): string[] {
  if (!HASHTAG_CHANNELS.has(channel)) return [];
  const matches = text.match(/#[\w]+/g);
  if (!matches) return [];
  // Normalise to lowercase, deduplicate
  return [...new Set(matches.map((h) => h.toLowerCase()))];
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

    // ── Hashtag performance guidance (social channels only) ───────────────────
    let hashtagGuidance = "";
    if (HASHTAG_CHANNELS.has(input.channel)) {
      const parts: string[] = [];

      if (input.hashtagContext?.highPerforming?.length) {
        const list = input.hashtagContext.highPerforming
          .slice(0, 8)
          .map((h) => `${h.hashtag} (${(h.avgEngagementRate * 100).toFixed(1)}% eng.)`)
          .join(", ");
        parts.push(`Previously high-performing hashtags for this brand: ${list}. Prefer these when relevant.`);
      }

      if (input.hashtagContext?.lowPerforming?.length) {
        const list = input.hashtagContext.lowPerforming
          .slice(0, 5)
          .map((h) => h.hashtag)
          .join(", ");
        parts.push(`Previously low-performing hashtags to avoid: ${list}.`);
      }

      if (input.bannedHashtags?.length) {
        const list = input.bannedHashtags.join(", ");
        parts.push(`BANNED hashtags — never use under any circumstances: ${list}.`);
      }

      if (parts.length > 0) {
        hashtagGuidance = `\nHashtag guidance:\n${parts.join("\n")}\n`;
      }
    }

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
${hashtagGuidance}${input.personaContext ? `\nWrite this content speaking directly to this persona: ${input.personaContext}` : ""}
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
