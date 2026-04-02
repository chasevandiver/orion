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

async function request<T>(path: string, init?: RequestInit, skipContentType?: boolean): Promise<T> {
  const url = path.startsWith("http") ? path : `/api${path}`;

  const headers: Record<string, string> = skipContentType
    ? {}
    : { "Content-Type": "application/json" };
  if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    let body: unknown;
    try {
      body = await response.json();
      const b = body as Record<string, unknown>;
      message = (b.error as string) ?? (b.message as string) ?? message;
    } catch {}
    throw new ApiError(response.status, message, body);
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

  // postForm — sends a FormData body (e.g. file uploads). Do NOT set Content-Type;
  // the browser sets it automatically with the multipart boundary.
  postForm: <T>(path: string, formData: FormData, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: formData }, true),

  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),

  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

export { ApiError };

/**
 * Fetch a file from the API (with session credentials) and trigger a browser download.
 * Works for PDFs, CSVs, and any other binary or text file the API returns.
 */
export async function downloadFileFromApi(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    let message = `Download failed: ${response.status}`;
    try { const b = await response.json() as any; message = b.error ?? b.message ?? message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  // Prefer the filename from Content-Disposition if the server sent one
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";\n]+)"?/i);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
