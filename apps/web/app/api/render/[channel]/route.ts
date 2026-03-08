/**
 * POST /api/render/[channel]
 *
 * Satori-based server-side image compositor. Accepts copy text, a background
 * image URL, logo, and brand colors — returns a composited PNG saved to
 * public/generated/composited/ and the relative URL as JSON.
 *
 * For user-photo flow with a logo, Sharp analyzes corner brightness to place
 * the logo in the darkest (most legible) corner, then composites it before
 * Satori renders the text layer.
 */

import { NextRequest, NextResponse } from "next/server";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface RenderBody {
  backgroundImageUrl: string;
  headlineText: string;
  ctaText: string;
  logoUrl?: string;
  brandPrimaryColor?: string;
  channel: string;
  flowType?: "generate" | "user-photo";
  logoPosition?: string;
}

interface ChannelDims {
  width: number;
  height: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_DIMS: Record<string, ChannelDims> = {
  instagram: { width: 1080, height: 1080 },
  linkedin:  { width: 1200, height: 627 },
  twitter:   { width: 1600, height: 900 },
  facebook:  { width: 1200, height: 630 },
  email:     { width: 600,  height: 200 },
};

const DEFAULT_PRIMARY = "#10b981";
const LOGO_SIZE = 72; // px, rendered inside Satori
const LOGO_SHARP_SIZE = 80; // px for Sharp composite

// ── Font loading (module-level cache) ─────────────────────────────────────────

let cachedFont: ArrayBuffer | null = null;

async function getFont(): Promise<ArrayBuffer> {
  if (!cachedFont) {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
    );
    if (!res.ok) throw new Error("Failed to fetch Inter font");
    cachedFont = await res.arrayBuffer();
  }
  return cachedFont;
}

// ── Image helpers ──────────────────────────────────────────────────────────────

async function fetchAsBase64(urlOrPath: string): Promise<{ b64: string; mime: string }> {
  if (urlOrPath.startsWith("/")) {
    // Relative path — read directly from the Next.js public directory
    const filePath = path.join(process.cwd(), "public", urlOrPath);
    const buf = fs.readFileSync(filePath);
    return { b64: buf.toString("base64"), mime: "image/png" };
  }
  const res = await fetch(urlOrPath);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${urlOrPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return { b64: buf.toString("base64"), mime };
}

function toDataUrl(b64: string, mime: string): string {
  return `data:${mime};base64,${b64}`;
}

// ── Sharp: find darkest corner ─────────────────────────────────────────────────

async function findDarkestCorner(
  imgBuffer: Buffer,
  imgWidth: number,
  imgHeight: number,
): Promise<CornerKey> {
  const R = 120; // region size in px

  const corners: Array<{ key: CornerKey; left: number; top: number }> = [
    { key: "top-left",     left: 0,            top: 0 },
    { key: "top-right",    left: imgWidth - R,  top: 0 },
    { key: "bottom-left",  left: 0,            top: imgHeight - R },
    { key: "bottom-right", left: imgWidth - R,  top: imgHeight - R },
  ];

  let darkest: CornerKey = "bottom-right";
  let lowestBrightness = Infinity;

  for (const { key, left, top } of corners) {
    const stats = await sharp(imgBuffer)
      .extract({ left, top, width: R, height: R })
      .stats();
    const avg = stats.channels.reduce((s, ch) => s + ch.mean, 0) / stats.channels.length;
    if (avg < lowestBrightness) {
      lowestBrightness = avg;
      darkest = key;
    }
  }

  return darkest;
}

// ── Sharp: composite logo onto background ──────────────────────────────────────

async function compositeLogoOnBackground(
  bgBuffer: Buffer,
  logoBuffer: Buffer,
  corner: CornerKey,
  canvasWidth: number,
  canvasHeight: number,
): Promise<Buffer> {
  const PADDING = 16;
  const LOGO_W = LOGO_SHARP_SIZE;
  const LOGO_H = LOGO_SHARP_SIZE;
  const PILL_W = LOGO_W + PADDING * 2;
  const PILL_H = LOGO_H + PADDING * 2;
  const MARGIN = 20;

  const cornerPositions: Record<CornerKey, { left: number; top: number }> = {
    "top-left":     { left: MARGIN,                   top: MARGIN },
    "top-right":    { left: canvasWidth - PILL_W - MARGIN,  top: MARGIN },
    "bottom-left":  { left: MARGIN,                   top: canvasHeight - PILL_H - MARGIN },
    "bottom-right": { left: canvasWidth - PILL_W - MARGIN,  top: canvasHeight - PILL_H - MARGIN },
  };

  const { left: pillLeft, top: pillTop } = cornerPositions[corner];

  // Create semi-transparent pill background as SVG
  const pillSvg = `<svg width="${PILL_W}" height="${PILL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${PILL_W}" height="${PILL_H}" rx="6" ry="6" fill="rgba(0,0,0,0.5)"/>
  </svg>`;
  const pillBuf = Buffer.from(pillSvg);

  // Resize logo to fit within the pill
  const resizedLogo = await sharp(logoBuffer)
    .resize(LOGO_W, LOGO_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(bgBuffer)
    .composite([
      { input: pillBuf,     left: pillLeft,          top: pillTop },
      { input: resizedLogo, left: pillLeft + PADDING, top: pillTop + PADDING },
    ])
    .png()
    .toBuffer();
}

// ── Satori JSX templates ───────────────────────────────────────────────────────

function buildTemplate(
  channel: string,
  {
    dims,
    bgDataUrl,
    logoDataUrl,
    headlineText,
    ctaText,
    primaryColor,
  }: {
    dims: ChannelDims;
    bgDataUrl: string;
    logoDataUrl: string | null;
    headlineText: string;
    ctaText: string;
    primaryColor: string;
  },
): React.ReactNode {
  const { width, height } = dims;
  const isSquare = width === height;

  const overlayStyle: React.CSSProperties = isSquare
    ? { background: "rgba(0,0,0,0.45)" }
    : { backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 100%)" };

  const baseContainer: React.CSSProperties = {
    display: "flex",
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    fontFamily: "Inter",
  };

  const bgImgStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  const overlayDivStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    ...overlayStyle,
  };

  if (channel === "instagram") {
    // Bold centered headline, logo bottom-center
    return (
      <div style={baseContainer}>
        <img src={bgDataUrl} style={bgImgStyle} />
        <div style={overlayDivStyle} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px", justifyContent: "center", alignItems: "center" }}>
          <div style={{ fontSize: 80, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.1, maxWidth: "90%" }}>
            {headlineText.slice(0, 80)}
          </div>
          {ctaText && (
            <div style={{ marginTop: 32, fontSize: 36, color: "rgba(255,255,255,0.9)", textAlign: "center", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px" }}>
              {ctaText.slice(0, 50)}
            </div>
          )}
          {logoDataUrl && (
            <div style={{ position: "absolute", bottom: 48, display: "flex", justifyContent: "center" }}>
              <img src={logoDataUrl} style={{ width: LOGO_SIZE, height: LOGO_SIZE, objectFit: "contain" }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (channel === "linkedin" || channel === "facebook") {
    // Logo top-left, headline left-aligned middle
    return (
      <div style={baseContainer}>
        <img src={bgDataUrl} style={bgImgStyle} />
        <div style={overlayDivStyle} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }}>
          {logoDataUrl && (
            <img src={logoDataUrl} style={{ width: LOGO_SIZE, height: LOGO_SIZE, objectFit: "contain", marginBottom: "auto" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", maxWidth: "65%" }}>
            <div style={{ fontSize: 52, fontWeight: 700, color: "white", lineHeight: 1.15 }}>
              {headlineText.slice(0, 80)}
            </div>
            {ctaText && (
              <div style={{ marginTop: 20, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                {ctaText.slice(0, 60)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (channel === "twitter") {
    // Minimal — headline center-left, logo small top-right
    return (
      <div style={baseContainer}>
        <img src={bgDataUrl} style={bgImgStyle} />
        <div style={overlayDivStyle} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px" }}>
          {logoDataUrl && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "auto" }}>
              <img src={logoDataUrl} style={{ width: 48, height: 48, objectFit: "contain" }} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: "60%", marginTop: "auto" }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: "white", lineHeight: 1.15 }}>
              {headlineText.slice(0, 80)}
            </div>
            {ctaText && (
              <div style={{ marginTop: 20, fontSize: 26, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                {ctaText.slice(0, 60)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (channel === "email") {
    // Brand color left half, background image right half as accent, headline over left
    return (
      <div style={baseContainer}>
        {/* Right half: background image */}
        <div style={{ position: "absolute", right: 0, top: 0, width: "45%", height: "100%", overflow: "hidden" }}>
          <img src={bgDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(to right, " + primaryColor + " 0%, transparent 80%)" }} />
        </div>
        {/* Left half: brand color */}
        <div style={{ position: "absolute", left: 0, top: 0, width: "58%", height: "100%", background: primaryColor, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 32px" }}>
          {logoDataUrl && (
            <img src={logoDataUrl} style={{ width: 40, height: 40, objectFit: "contain", marginBottom: 12 }} />
          )}
          <div style={{ fontSize: 26, fontWeight: 700, color: "white", lineHeight: 1.2 }}>
            {headlineText.slice(0, 60)}
          </div>
          {ctaText && (
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
              {ctaText.slice(0, 50)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default fallback (same as linkedin)
  return (
    <div style={baseContainer}>
      <img src={bgDataUrl} style={bgImgStyle} />
      <div style={overlayDivStyle} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 52, fontWeight: 700, color: "white", lineHeight: 1.15, maxWidth: "70%" }}>
          {headlineText.slice(0, 80)}
        </div>
        {ctaText && (
          <div style={{ marginTop: 16, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
            {ctaText.slice(0, 60)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string } },
): Promise<Response> {
  try {
    const body = (await req.json()) as RenderBody;
    const { backgroundImageUrl, headlineText, ctaText, logoUrl, brandPrimaryColor, flowType, logoPosition } = body;
    const channel = params.channel;

    if (!backgroundImageUrl || !headlineText) {
      return NextResponse.json({ error: "backgroundImageUrl and headlineText are required" }, { status: 400 });
    }

    const dims = CHANNEL_DIMS[channel] ?? CHANNEL_DIMS.linkedin;
    const primaryColor = brandPrimaryColor ?? DEFAULT_PRIMARY;

    // ── Fetch background image ───────────────────────────────────────────────

    const { b64: bgB64, mime: bgMime } = await fetchAsBase64(backgroundImageUrl);
    let bgDataUrl = toDataUrl(bgB64, bgMime);
    let bgBuffer = Buffer.from(bgB64, "base64");

    // ── Sharp logo compositing for user-photo flow ───────────────────────────

    let logoDataUrl: string | null = null;

    if (logoUrl) {
      const { b64: logoBuf64, mime: logoMime } = await fetchAsBase64(logoUrl);
      const logoBuffer = Buffer.from(logoBuf64, "base64");

      if (flowType === "user-photo") {
        // Determine logo corner from preference or brightness analysis
        let corner: CornerKey;
        if (logoPosition && logoPosition !== "auto") {
          corner = logoPosition as CornerKey;
        } else {
          corner = await findDarkestCorner(bgBuffer, dims.width, dims.height);
        }

        // Composite logo onto background using Sharp — result becomes new bg
        bgBuffer = await compositeLogoOnBackground(bgBuffer, logoBuffer, corner, dims.width, dims.height);
        bgDataUrl = toDataUrl(bgBuffer.toString("base64"), "image/png");
        // Logo is now baked into bg; don't render it again in Satori
        logoDataUrl = null;
      } else {
        // Generate flow: let Satori template handle logo placement
        logoDataUrl = toDataUrl(logoBuf64, logoMime);
      }
    }

    // ── Load font ────────────────────────────────────────────────────────────

    const fontData = await getFont();

    // ── Render with Satori ───────────────────────────────────────────────────

    const template = buildTemplate(channel, {
      dims,
      bgDataUrl,
      logoDataUrl,
      headlineText,
      ctaText,
      primaryColor,
    });

    const svg = await satori(template as any, {
      width: dims.width,
      height: dims.height,
      fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }],
    });

    // ── Convert SVG → PNG ────────────────────────────────────────────────────

    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: dims.width } });
    const pngBuffer = resvg.render().asPng();

    // ── Save to public/generated/composited/ ─────────────────────────────────

    const dir = path.join(process.cwd(), "public", "generated", "composited");
    fs.mkdirSync(dir, { recursive: true });

    const filename = `composited-${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    fs.writeFileSync(path.join(dir, filename), pngBuffer);

    return NextResponse.json({ url: `/generated/composited/${filename}` });
  } catch (err) {
    console.error("[render] Compositor error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
