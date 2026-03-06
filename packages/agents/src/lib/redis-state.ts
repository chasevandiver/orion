/**
 * Redis-backed conversation state for multi-turn agent sessions.
 *
 * Agents that support follow-up questions (AnalyticsAgent, CRMIntelligenceAgent)
 * can store and retrieve conversation history here so each HTTP request doesn't
 * need to re-send the full history in the request body.
 *
 * TTL: 2 hours — conversations expire if idle for more than 2 hours.
 *
 * Keys: orion:agent-state:<sessionId>
 */

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface AgentConversationState {
  sessionId: string;
  agentName: string;
  orgId: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  /** Agent-specific metadata (e.g. which campaignId the conversation is about) */
  meta?: Record<string, unknown>;
}

// ── Redis connection ──────────────────────────────────────────────────────────

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

let _redis: RedisLike | null = null;

async function getRedis(): Promise<RedisLike | null> {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) return null; // Graceful degradation — state won't be persisted

  try {
    // Dynamic import so this module can be loaded in environments without ioredis
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await client.connect();

    // Wrap ioredis to match our RedisLike interface
    _redis = {
      get: (key) => client.get(key),
      set: (key, value, opts) =>
        opts?.ex ? client.set(key, value, "EX", opts.ex) : client.set(key, value),
      del: (key) => client.del(key),
    };
    return _redis;
  } catch {
    console.warn("[redis-state] Redis unavailable — agent conversation state will not be persisted");
    return null;
  }
}

const STATE_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const KEY_PREFIX = "orion:agent-state:";

function stateKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load an existing conversation session.
 * Returns null if not found or Redis is unavailable.
 */
export async function loadConversation(sessionId: string): Promise<AgentConversationState | null> {
  const redis = await getRedis();
  if (!redis) return null;

  const raw = await redis.get(stateKey(sessionId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AgentConversationState;
  } catch {
    return null;
  }
}

/**
 * Append a new message to a session and reset its TTL.
 * Creates the session if it doesn't exist.
 */
export async function appendMessage(
  sessionId: string,
  agentName: string,
  orgId: string,
  message: Omit<ConversationMessage, "timestamp">,
  meta?: Record<string, unknown>,
): Promise<AgentConversationState | null> {
  const redis = await getRedis();
  if (!redis) return null;

  const existing = await loadConversation(sessionId);
  const now = new Date().toISOString();

  const state: AgentConversationState = existing ?? {
    sessionId,
    agentName,
    orgId,
    messages: [],
    createdAt: now,
    updatedAt: now,
    meta,
  };

  state.messages.push({ ...message, timestamp: now });
  state.updatedAt = now;
  if (meta) state.meta = { ...state.meta, ...meta };

  await redis.set(stateKey(sessionId), JSON.stringify(state), { ex: STATE_TTL_SECONDS });
  return state;
}

/**
 * Delete a conversation session (e.g. when the user starts a fresh chat).
 */
export async function clearConversation(sessionId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(stateKey(sessionId));
}

/**
 * Retrieve the full message history for a session as Anthropic-compatible
 * `messages` array (role + content only).
 */
export async function getMessageHistory(
  sessionId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const state = await loadConversation(sessionId);
  if (!state) return [];
  return state.messages.map(({ role, content }) => ({ role, content }));
}
