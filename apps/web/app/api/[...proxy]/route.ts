/**
 * Catch-all API proxy — forwards /api/* requests to the Express backend.
 *
 * This route sits behind /api/auth and /api/inngest (more specific routes
 * always take precedence in Next.js App Router), so those two handlers are
 * never intercepted here.
 *
 * Auth headers (x-user-id, x-org-id, x-user-role) are injected from the
 * current session so Express authMiddleware can trust them without a DB
 * session lookup, matching the pattern already established in middleware.ts.
 *
 * SSE responses (Content-Type: text/event-stream) are streamed back to the
 * browser using the Web Streams API — no buffering.
 */

import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EXPRESS_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

async function handler(
  req: NextRequest,
  { params }: { params: { proxy: string[] } },
): Promise<Response> {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { id: string; orgId?: string; role?: string };
  const path = "/" + (params.proxy?.join("/") ?? "");

  // Forward query string
  const search = req.nextUrl.search;
  const targetUrl = `${EXPRESS_URL}${path}${search}`;

  const headers: Record<string, string> = {
    "x-user-id": user.id ?? "",
    "x-org-id": user.orgId ?? "",
    "x-user-role": user.role ?? "member",
  };

  // Forward content-type and accept headers from browser
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  const accept = req.headers.get("accept");
  if (accept) headers["accept"] = accept;

  const init: RequestInit = { method: req.method, headers };

  // Forward body for non-GET/HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) init.body = body;
  }

  const upstream = await fetch(targetUrl, init);

  // Stream SSE responses directly — do not buffer
  const isSSE = upstream.headers.get("content-type")?.includes("text/event-stream");
  if (isSSE) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // For all other responses, return status + body as-is
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
