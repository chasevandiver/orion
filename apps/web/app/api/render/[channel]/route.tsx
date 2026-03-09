/**
 * POST /api/render/[channel]
 *
 * Thin HTTP wrapper around @orion/compositor for browser-initiated preview renders.
 * The Inngest pipeline imports compositeImage() directly — no HTTP call needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { compositeImage } from "@orion/compositor";

export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string } },
): Promise<Response> {
  const internalSecret = process.env.INTERNAL_RENDER_SECRET;
  const reqSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || reqSecret !== internalSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      backgroundImageUrl?: string;
      headlineText: string;
      ctaText: string;
      logoUrl?: string;
      brandName?: string;
      brandPrimaryColor?: string;
      flowType?: "generate" | "user-photo";
      logoPosition?: string;
    };

    if (!body.headlineText) {
      return NextResponse.json({ error: "headlineText is required" }, { status: 400 });
    }

    const result = await compositeImage({
      ...body,
      channel: params.channel,
    });

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[render] Compositor error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
