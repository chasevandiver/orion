/**
 * Catch-all API proxy — forwards /api/* requests to the Express backend.
 *
 * This route sits behind /api/auth and /api/inngest (more specific routes
 * always take precedence in Next.js App Router), so those two handlers are
 * never intercepted here.
 *
 * Security model:
 * - Session is verified via NextAuth before ANY request is forwarded.
 * - Auth headers (x-user-id, x-org-id, x-user-role) come EXCLUSIVELY from the
 *   verified session — never forwarded from the incoming client request.
 * - Every forwarded request carries x-internal-secret so Express authMiddleware
 *   can confirm it originated from this trusted proxy and not an external caller.
 * - x-internal-secret is required; requests fail with 500 when it is not set
 *   rather than sending an empty value that Express would reject with 401.
 *
 * SSE responses (Content-Type: text/event-stream) are streamed back to the
 * browser using the Web Streams API — no buffering.
 */

import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EXPRESS_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

// ── Headers that must never be forwarded from the client ─────────────────────
// These are the exact headers the Express authMiddleware trusts. Forwarding
// them from the browser would allow any logged-in user to impersonate another.
const BLOCKED_CLIENT_HEADERS = new Set([
  "x-user-id",
  "x-org-id",
  "x-user-role",
  "x-internal-secret",
]);

async function handler(
  req: NextRequest,
  { params }: { params: { proxy: string[] } },
): Promise<Response> {
  // ── 1. Verify session ──────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Require INTERNAL_API_SECRET ────────────────────────────────────────
  // Fail with 500 so the misconfiguration is immediately visible in logs.
  // An empty value would silently propagate to Express which would return 401,
  // making the root cause harder to diagnose.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error(
      "[proxy] INTERNAL_API_SECRET is not set — refusing to forward request. " +
      "Add INTERNAL_API_SECRET to apps/web/.env.local.",
    );
    return NextResponse.json(
      { error: "Server misconfiguration: proxy secret not configured." },
      { status: 500 },
    );
  }

  // ── 3. Build forwarded URL ─────────────────────────────────────────────────
  const user = session.user as { id: string; orgId?: string; role?: string };
  const path = "/" + (params.proxy?.join("/") ?? "");
  const search = req.nextUrl.search;
  const targetUrl = `${EXPRESS_URL}${path}${search}`;

  // ── 4. Build forwarded headers — session values only, never client-supplied ─
  // Starting from an empty object guarantees none of the BLOCKED_CLIENT_HEADERS
  // can leak through even if the caller sends them.
  const headers: Record<string, string> = {
    "x-user-id":        user.id ?? "",
    "x-org-id":         user.orgId ?? "",
    "x-user-role":      user.role ?? "member",
    "x-internal-secret": internalSecret,
  };

  // Forward safe, non-auth headers from the original request.
  // We iterate explicitly rather than spreading req.headers to ensure the
  // blocklist is always enforced regardless of future changes to this file.
  for (const name of ["content-type", "accept", "x-request-id"]) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }

  // ── 5. Forward body ────────────────────────────────────────────────────────
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  const upstream = await fetch(targetUrl, init);

  // ── 6. Stream SSE responses ────────────────────────────────────────────────
  const isSSE = upstream.headers.get("content-type")?.includes("text/event-stream");
  if (isSSE) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "Connection":        "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── 7. Return all other responses as-is ───────────────────────────────────
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as DELETE,
};
