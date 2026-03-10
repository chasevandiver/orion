/**
 * parseAgentJson — strips markdown fences and parses JSON from agent output.
 *
 * Agent LLM responses occasionally wrap JSON in ```json ... ``` fences even when
 * instructed not to. This utility removes those fences before parsing so that
 * callers never crash on fence-wrapped responses.
 */

export function parseAgentJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  return JSON.parse(cleaned);
}
