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

// ── Text sanitizers ────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")   // bold
    .replace(/\*(.+?)\*/gs, "$1")        // italic *
    .replace(/__(.+?)__/gs, "$1")        // bold __
    .replace(/_(.+?)_/gs, "$1")          // italic _
    .replace(/#{1,6}\s*/g, "")           // headings
    .replace(/`{1,3}[^`]*`{1,3}/g, "")  // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^\s*[-*+]\s+/gm, "")       // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "")       // ordered list markers
    .replace(/#\w+/g, "")                // hashtags (#PGATour, #FantasyGolf, etc.)
    .replace(/\s+/g, " ")
    .trim();
}

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27FF}]/gu, "")
    .replace(/\uFE0F/g, "")   // variation selector-16
    .replace(/\u200D/g, "")   // zero-width joiner
    .replace(/\s+/g, " ")
    .trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface RenderBody {
  backgroundImageUrl: string;
  headlineText: string;
  ctaText: string;
  logoUrl?: string;
  brandName?: string;
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
    brandName,
    headlineText,
    ctaText,
    primaryColor,
  }: {
    dims: ChannelDims;
    bgDataUrl: string;
    logoDataUrl: string | null;
    brandName: string;
    headlineText: string;
    ctaText: string;
    primaryColor: string;
  },
): React.ReactNode {
  const { width, height } = dims;
  const isSquare = width === height;
  const headlineLen = headlineText.length;
  const headlineFontScale = headlineLen > 80 ? 0.65 : headlineLen > 50 ? 0.8 : 1.0;

  // Render logo image if available; otherwise fall back to brand name text
  const logoOrBrandName = (sizeOverride?: number, textSizeOverride?: number) => {
    const size = sizeOverride ?? LOGO_SIZE;
    if (logoDataUrl) {
      return (
        <img src={logoDataUrl} style={{ width: size, height: size, objectFit: "contain" }} />
      );
    }
    if (brandName) {
      return (
        <div style={{ fontSize: textSizeOverride ?? 22, fontWeight: 700, color: "white", letterSpacing: 1, textShadow: "0 1px 4px rgba(0,0,0,0.5)", display: "flex" }}>
          {brandName}
        </div>
      );
    }
    return null;
  };

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
          <div style={{ fontSize: Math.round(80 * headlineFontScale), fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.15, maxWidth: "90%", wordBreak: "break-word", overflow: "hidden", display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
            {headlineText.slice(0, 100)}
          </div>
          {ctaText && (
            <div style={{ marginTop: 32, fontSize: 36, color: "rgba(255,255,255,0.9)", textAlign: "center", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px" }}>
              {ctaText.slice(0, 50)}
            </div>
          )}
          {(logoDataUrl || brandName) && (
            <div style={{ position: "absolute", bottom: 48, display: "flex", justifyContent: "center" }}>
              {logoOrBrandName()}
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
          {(logoDataUrl || brandName) && (
            <div style={{ marginBottom: "auto", display: "flex" }}>{logoOrBrandName()}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", maxWidth: "65%" }}>
            <div style={{ fontSize: Math.round(52 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.15, wordBreak: "break-word", overflow: "hidden" }}>
              {headlineText.slice(0, 100)}
            </div>
            {ctaText && (
              <div style={{ marginTop: 20, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500, wordBreak: "break-word", overflow: "hidden" }}>
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
          {(logoDataUrl || brandName) && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "auto" }}>
              {logoOrBrandName(48, 18)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: "60%", marginTop: "auto" }}>
            <div style={{ fontSize: Math.round(58 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.15, wordBreak: "break-word", overflow: "hidden" }}>
              {headlineText.slice(0, 100)}
            </div>
            {ctaText && (
              <div style={{ marginTop: 20, fontSize: 26, color: "rgba(255,255,255,0.85)", fontWeight: 500, wordBreak: "break-word", overflow: "hidden" }}>
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
        <div style={{ display: "flex", position: "absolute", right: 0, top: 0, width: "45%", height: "100%", overflow: "hidden" }}>
          <img src={bgDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(to right, " + primaryColor + " 0%, transparent 80%)" }} />
        </div>
        {/* Left half: brand color */}
        <div style={{ position: "absolute", left: 0, top: 0, width: "58%", height: "100%", background: primaryColor, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 32px" }}>
          {(logoDataUrl || brandName) && (
            <div style={{ marginBottom: 12, display: "flex" }}>{logoOrBrandName(40, 16)}</div>
          )}
          <div style={{ fontSize: Math.round(26 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.2, wordBreak: "break-word", overflow: "hidden" }}>
            {headlineText.slice(0, 80)}
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

  // Default fallback (same as linkedin layout)
  return (
    <div style={baseContainer}>
      <img src={bgDataUrl} style={bgImgStyle} />
      <div style={overlayDivStyle} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }}>
        {(logoDataUrl || brandName) && (
          <div style={{ marginBottom: "auto", display: "flex" }}>{logoOrBrandName()}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", maxWidth: "70%" }}>
          <div style={{ fontSize: Math.round(52 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.15, wordBreak: "break-word", overflow: "hidden" }}>
            {headlineText.slice(0, 100)}
          </div>
          {ctaText && (
            <div style={{ marginTop: 16, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
              {ctaText.slice(0, 60)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string } },
): Promise<Response> {
  // ── Internal auth ──────────────────────────────────────────────────────────
  // This route is called server-to-server by the Inngest pipeline, not by
  // browser clients. The middleware bypasses session auth for /api/render, so
  // we validate requests here with a shared secret instead.
  const internalSecret = process.env.INTERNAL_RENDER_SECRET;
  const reqSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || reqSecret !== internalSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as RenderBody;
    const { backgroundImageUrl, logoUrl, brandName = "", brandPrimaryColor, flowType, logoPosition } = body;
    const headlineText = stripMarkdown(stripEmoji(body.headlineText ?? ""));
    const ctaText = stripMarkdown(stripEmoji(body.ctaText ?? ""));
    const channel = params.channel;

    if (!headlineText) {
      return NextResponse.json({ error: "headlineText is required" }, { status: 400 });
    }
    // backgroundImageUrl is optional — compositor falls back to brand-color gradient

    const dims = CHANNEL_DIMS[channel] ?? CHANNEL_DIMS.linkedin;
    const primaryColor = brandPrimaryColor ?? DEFAULT_PRIMARY;

    // ── Fetch background image ───────────────────────────────────────────────

    let bgDataUrl: string;
    let bgBuffer: Buffer;

    const buildGradientFallback = () => {
      const svg = `<svg width="${dims.width}" height="${dims.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primaryColor}"/><stop offset="100%" stop-color="${primaryColor}88"/></linearGradient></defs><rect width="${dims.width}" height="${dims.height}" fill="url(#g)"/><rect width="${dims.width}" height="${dims.height}" fill="rgba(0,0,0,0.15)"/></svg>`;
      const b64 = Buffer.from(svg).toString("base64");
      return { dataUrl: `data:image/svg+xml;base64,${b64}`, buffer: Buffer.from(svg) };
    };

    if (!backgroundImageUrl) {
      // No background image provided (Unsplash fetch failed upstream) — use gradient
      console.info(`[render] No backgroundImageUrl — using brand-color gradient`);
      const { dataUrl, buffer } = buildGradientFallback();
      bgDataUrl = dataUrl;
      bgBuffer = buffer;
    } else {
      try {
        console.info(`[render] Fetching background image: ${backgroundImageUrl}`);
        const { b64: bgB64, mime: bgMime } = await fetchAsBase64(backgroundImageUrl);
        bgDataUrl = toDataUrl(bgB64, bgMime);
        bgBuffer = Buffer.from(bgB64, "base64");
        console.info(`[render] Background image fetched OK — ${bgBuffer.byteLength} bytes`);
      } catch (bgErr) {
        console.error(`[render] Background image fetch FAILED for ${backgroundImageUrl}:`, (bgErr as Error).message);
        const { dataUrl, buffer } = buildGradientFallback();
        bgDataUrl = dataUrl;
        bgBuffer = buffer;
      }
    }

    // ── Sharp logo compositing for user-photo flow ───────────────────────────

    let logoDataUrl: string | null = null;

    if (logoUrl) {
      console.info(`[render] Fetching logo: ${logoUrl}`);
      try {
        const { b64: logoBuf64, mime: logoMime } = await fetchAsBase64(logoUrl);
        const logoBuffer = Buffer.from(logoBuf64, "base64");
        console.info(`[render] Logo fetched OK — ${logoBuffer.byteLength} bytes`);

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
          console.info(`[render] Logo ready for Satori — dataUrl length: ${logoDataUrl.length}`);
        }
      } catch (logoErr) {
        console.error(`[render] Logo fetch FAILED for ${logoUrl}:`, (logoErr as Error).message);
        console.info(`[render] Rendering without logo`);
        logoDataUrl = null;
      }
    } else {
      console.info(`[render] No logoUrl provided — rendering without logo`);
    }

    // ── Load font ────────────────────────────────────────────────────────────

    const fontData = await getFont();

    // ── Render with Satori ───────────────────────────────────────────────────

    const template = buildTemplate(channel, {
      dims,
      bgDataUrl,
      logoDataUrl,
      brandName,
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
