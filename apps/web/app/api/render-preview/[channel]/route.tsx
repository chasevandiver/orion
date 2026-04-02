/**
 * POST /api/render-preview/[channel]
 *
 * Browser-accessible compositor endpoint for the image editor UI.
 * Unlike /api/render/[channel] (which requires INTERNAL_RENDER_SECRET for
 * pipeline-to-pipeline calls), this route is meant to be called directly from
 * the client and relies on the session cookie for auth context.
 */

import { NextRequest, NextResponse } from "next/server";
import { compositeImage } from "@orion/compositor";

export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string } },
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      backgroundImageUrl?: string;
      headlineText: string;
      ctaText: string;
      logoUrl?: string;
      brandName?: string;
      brandPrimaryColor?: string;
      brandSecondaryColor?: string;
      flowType?: "generate" | "user-photo";
      logoPosition?: string;
      imageSource?: "fal" | "pollinations" | "brand-graphic";
    };

    if (!body.headlineText?.trim()) {
      return NextResponse.json({ error: "headlineText is required" }, { status: 400 });
    }

    const result = await compositeImage({
      ...body,
      channel: params.channel,
    });

    return NextResponse.json({ url: result.url, imageSource: result.imageSource });
  } catch (err) {
    console.error("[render-preview] Compositor error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
