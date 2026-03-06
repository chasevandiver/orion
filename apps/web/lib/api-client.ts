/**
 * Typed API client for the ORION backend.
 * All requests include credentials (session cookie).
 * Never calls Anthropic or any external API directly — always goes through /api routes.
 */

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `/api${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const err = await response.json();
      message = err.error ?? err.message ?? message;
    } catch {}
    throw new ApiError(response.status, message);
  }

  // Handle 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "GET" }),

  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),

  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

export { ApiError };

// SSE streaming helper for agent endpoints that emit text/event-stream.
// Accepts an optional JSON body (needed for POST /assets/generate).
// Returns a cleanup function that aborts the stream.
export function createAgentStream(
  path: string,
  body: Record<string, unknown> | null,
  callbacks: {
    onChunk: (text: string) => void;
    onEvent?: (event: string, data: unknown) => void;
    onDone?: () => void;
    onError?: (message: string) => void;
  },
): () => void {
  const controller = new AbortController();

  fetch(`/api${path}`, {
    method: "POST",
    signal: controller.signal,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
    .then(async (response) => {
      if (!response.ok) {
        const msg = `Stream request failed: ${response.status}`;
        callbacks.onError?.(msg);
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let eventName = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            if (raw === "[DONE]") {
              callbacks.onDone?.();
              continue;
            }
            try {
              const parsed = JSON.parse(raw);
              if (eventName === "chunk" && typeof parsed.text === "string") {
                callbacks.onChunk(parsed.text);
              } else {
                callbacks.onEvent?.(eventName, parsed);
              }
            } catch {
              callbacks.onChunk(raw);
            }
            eventName = "message";
          }
        }
      }
      callbacks.onDone?.();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        console.error("[stream]", err);
        callbacks.onError?.((err as Error).message);
      }
    });

  return () => controller.abort();
}
