/**
 * Server-side fetch helper for Next.js Server Components.
 *
 * Calls the Express API directly (internal network) with the session user's
 * org context headers, bypassing the browser/proxy layer entirely.
 * Only usable in Server Components, Route Handlers, and Server Actions.
 */
import { auth } from "@/lib/auth";

const EXPRESS_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export class ServerApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ServerApiError";
  }
}

async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  if (!session?.user) throw new ServerApiError(401, "Unauthorized");

  const user = session.user as { id: string; orgId?: string; role?: string };

  const response = await fetch(`${EXPRESS_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user.id ?? "",
      "x-org-id": user.orgId ?? "",
      "x-user-role": user.role ?? "member",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const err = await response.json();
      message = err.error ?? err.message ?? message;
    } catch {}
    throw new ServerApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const serverApi = {
  get: <T>(path: string) => serverRequest<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    serverRequest<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
