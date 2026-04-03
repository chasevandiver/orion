import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton — key is validated at first use, not at module load time.
// This allows Next.js to collect page data at build time without env vars set.
let _anthropic: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set as a server-side environment variable");
  }
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getAnthropic() as any)[prop];
  },
});

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_MAX_TOKENS = 2048;

export interface AgentConfig {
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected promptVersion: string;

  constructor(config: AgentConfig, promptVersion = "1.0.0") {
    this.config = config;
    this.promptVersion = promptVersion;
  }

  get name(): string {
    return this.constructor.name;
  }

  /**
   * Non-streaming completion — returns full text when done.
   */
  protected async complete(userMessage: string): Promise<{ text: string; tokensUsed: number }> {
    const response = await anthropic.messages.create({
      model: this.config.model ?? DEFAULT_MODEL,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: this.config.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const tokensUsed =
      (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

    return { text, tokensUsed };
  }

  /**
   * Streaming completion — calls onChunk with each text delta.
   */
  protected async stream(
    userMessage: string,
    onChunk: (text: string) => void,
  ): Promise<{ tokensUsed: number }> {
    let tokensUsed = 0;

    const stream = await anthropic.messages.create({
      model: this.config.model ?? DEFAULT_MODEL,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: this.config.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onChunk(event.delta.text);
      }
      if (event.type === "message_delta" && event.usage) {
        tokensUsed = event.usage.output_tokens ?? 0;
      }
    }

    return { tokensUsed };
  }
}
