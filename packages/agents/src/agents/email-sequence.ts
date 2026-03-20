import { BaseAgent } from "./base.js";

export interface EmailSequenceInput {
  sequenceName: string;
  triggerType: string;
  stepNumber: number;
  totalSteps: number;
  brandName: string;
  brandDescription?: string;
  delayDays: number;
  previousSubjects?: string[];
}

export interface EmailSequenceOutput {
  subject: string;
  body: string;
  tokensUsed: number;
}

const TRIGGER_CONTEXT: Record<string, string> = {
  welcome:        "a new user who just signed up",
  trial_ending:   "a trial user whose trial ends soon",
  re_engagement:  "a user who has gone quiet and needs re-engaging",
  manual:         "a contact in a custom nurture sequence",
  signup:         "a new user who just signed up",
  download:       "someone who just downloaded a resource or lead magnet",
  purchase:       "a new customer who just made their first purchase",
};

export class EmailSequenceAgent extends BaseAgent {
  constructor() {
    super({
      systemPrompt: `You are an expert email copywriter specializing in lifecycle and nurture sequences.

Write high-converting emails that feel human — not generic marketing blasts.

Rules:
- Conversational, direct tone. No buzzwords, jargon, or hype.
- One focused goal per email, one clear CTA.
- Subject lines: specific, curiosity-driven, not clickbait. Max 60 chars.
- Body: 150-250 words. Short paragraphs separated by blank lines.
- Vary tone and approach across the sequence to avoid repetition.

Output format (EXACTLY — output nothing else):
SUBJECT: [subject line]
---
[Email body with blank lines between paragraphs]`,
      maxTokens: 800,
    });
  }

  async generate(input: EmailSequenceInput): Promise<EmailSequenceOutput> {
    const context =
      TRIGGER_CONTEXT[input.triggerType] ?? "a contact in a nurture sequence";

    const prevContext =
      input.previousSubjects?.length
        ? `\n\nPrevious email subjects in this sequence (avoid repeating these themes):\n${input.previousSubjects.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
        : "";

    const delayText =
      input.delayDays === 0
        ? "immediately (day 0)"
        : `${input.delayDays} day(s) after the previous email`;

    const prompt = `Write email ${input.stepNumber} of ${input.totalSteps} in the "${input.sequenceName}" sequence.

Brand: ${input.brandName}${input.brandDescription ? `\nDescription: ${input.brandDescription}` : ""}
Recipient: ${context}
Send timing: ${delayText}
Step: ${input.stepNumber} of ${input.totalSteps}${prevContext}

Follow the output format exactly.`;

    const { text, tokensUsed } = await this.complete(prompt);

    const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
    const dividerIdx = text.indexOf("---");
    const subject = subjectMatch?.[1]?.trim() ?? `Follow-up #${input.stepNumber}`;
    const body = dividerIdx > -1 ? text.slice(dividerIdx + 3).trim() : text.trim();

    return { subject, body, tokensUsed };
  }
}
