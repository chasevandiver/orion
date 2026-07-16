/**
 * Public passthrough for GET /health/integrations.
 *
 * The catch-all /api/[...proxy] route requires a NextAuth session, but this
 * endpoint is needed BEFORE login (the auth pages use it to decide whether to
 * show Google/GitHub sign-in buttons) and it only exposes booleans about which
 * provider env vars are present — no secrets, no org data. Specific routes
 * take precedence over the catch-all, so this handler wins for this path.
 */
import { NextResponse } from "next/server";

const EXPRESS_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${EXPRESS_URL}/health/integrations`, {
      cache: "no-store",
    });
    const body = await upstream.json();
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Integrations health check unavailable" },
      { status: 503 },
    );
  }
}
