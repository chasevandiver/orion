import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicKeyValidation {
  valid: boolean;
  error?: string;
  model: string;
}

// Validation model — cheapest available, minimises token cost
const VALIDATION_MODEL = "claude-haiku-4-5-20251001";

// Module-level cache — shared across requests in the same process
let _cache: { result: AnthropicKeyValidation; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validates the Anthropic API key by making a minimal 1-token completion.
 * Results are cached for 5 minutes to avoid repeatedly hitting the API.
 *
 * NOTE: Deliberately does NOT import from ./agents/base.ts — base.ts throws
 * at module initialization when the key is missing, which would prevent this
 * function from catching that case gracefully.
 */
export async function validateAnthropicKey(): Promise<AnthropicKeyValidation> {
  if (_cache && Date.now() < _cache.expiresAt) {
    return _cache.result;
  }

  function setCache(result: AnthropicKeyValidation): AnthropicKeyValidation {
    _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return setCache({ valid: false, error: "ANTHROPIC_API_KEY not set", model: VALIDATION_MODEL });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: VALIDATION_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return setCache({ valid: true, model: VALIDATION_MODEL });
  } catch (err: any) {
    const status: number | undefined = err?.status ?? err?.response?.status;
    let error = "API key validation failed";
    if (status === 401) {
      error = "API key is invalid";
    } else if (status === 402) {
      error = "API key has insufficient credits";
    } else if (status === 429) {
      error = "API key is rate limited";
    }
    return setCache({ valid: false, error, model: VALIDATION_MODEL });
  }
}
