/**
 * @orion/compositor — shared image compositing logic.
 *
 * Extracted from apps/web/app/api/render/[channel]/route.tsx so that the
 * Inngest pipeline (packages/queue) can import and call it directly without
 * making an HTTP call across service boundaries.
 *
 * The Next.js /api/render/[channel] route remains as a thin HTTP wrapper that
 * calls compositeImage() — used only for browser-initiated preview renders.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────────────────

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface CompositorParams {
  backgroundImageUrl?: string;
  headlineText: string;
  ctaText: string;
  logoUrl?: string;
  brandName?: string;
  brandPrimaryColor?: string;
  channel: string;
  flowType?: "generate" | "user-photo";
  logoPosition?: string;
  /** Absolute path to save the PNG. Defaults to a temp-safe generated path. */
  outputDir?: string;
  /**
   * Absolute path to the Next.js public directory.
   * Required when backgroundImageUrl or logoUrl is a local path (starts with /).
   * When called from the Inngest pipeline, pass path.resolve(monoRoot, "apps/web/public").
   */
  publicDir?: string;
}

export interface CompositorResult {
  /** Absolute path to the saved PNG file */
  filePath: string;
  /** Relative URL suitable for serving from Next.js public/ directory */
  url: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHANNEL_DIMS: Record<string, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1080 },
  linkedin:  { width: 1200, height: 627 },
  twitter:   { width: 1600, height: 900 },
  facebook:  { width: 1200, height: 630 },
  email:     { width: 600,  height: 200 },
};

const DEFAULT_PRIMARY = "#10b981";
const LOGO_SIZE = 72;
const LOGO_SHARP_SIZE = 80;

// ── Text sanitizers ────────────────────────────────────────────────────────────

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27FF}]/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cap text to N words, appending ellipsis only when words are dropped. */
export function capWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ") + "…";
}

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

async function fetchAsBase64(urlOrPath: string, publicDir?: string): Promise<{ b64: string; mime: string }> {
  if (urlOrPath.startsWith("/")) {
    // Resolve against the provided publicDir first, then fall back to process.cwd()/public.
    // When called from the Inngest pipeline (packages/queue), process.cwd() is NOT apps/web,
    // so the pipeline must always pass publicDir explicitly.
    const base = publicDir ?? path.join(process.cwd(), "public");
    const filePath = path.join(base, urlOrPath);
    console.log(`[compositor] Reading local file: ${filePath}`);
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
  const R = 120;
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
  const PILL_W = LOGO_SHARP_SIZE + PADDING * 2;
  const PILL_H = LOGO_SHARP_SIZE + PADDING * 2;
  const MARGIN = 20;

  const cornerPositions: Record<CornerKey, { left: number; top: number }> = {
    "top-left":     { left: MARGIN,                        top: MARGIN },
    "top-right":    { left: canvasWidth - PILL_W - MARGIN,  top: MARGIN },
    "bottom-left":  { left: MARGIN,                        top: canvasHeight - PILL_H - MARGIN },
    "bottom-right": { left: canvasWidth - PILL_W - MARGIN,  top: canvasHeight - PILL_H - MARGIN },
  };

  const { left: pillLeft, top: pillTop } = cornerPositions[corner];

  const pillSvg = `<svg width="${PILL_W}" height="${PILL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${PILL_W}" height="${PILL_H}" rx="6" ry="6" fill="rgba(0,0,0,0.5)"/>
  </svg>`;
  const pillBuf = Buffer.from(pillSvg);

  const resizedLogo = await sharp(logoBuffer)
    .resize(LOGO_SHARP_SIZE, LOGO_SHARP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
  opts: {
    dims: { width: number; height: number };
    bgDataUrl: string;
    logoDataUrl: string | null;
    brandName: string;
    headlineText: string;
    ctaText: string;
    primaryColor: string;
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { dims, bgDataUrl, logoDataUrl, brandName, headlineText: rawHeadline, ctaText: rawCta, primaryColor } = opts;
  const { width, height } = dims;
  const isSquare = width === height;

  // Cap all channels uniformly: headline ≤ 7 words, CTA ≤ 4 words
  const headlineText = capWords(rawHeadline, 7);
  const ctaText = capWords(rawCta, 4);

  const headlineLen = headlineText.length;
  const headlineFontScale = headlineLen > 60 ? 0.65 : headlineLen > 40 ? 0.8 : 1.0;

  const logoOrBrandName = (sizeOverride?: number, textSizeOverride?: number) => {
    const size = sizeOverride ?? LOGO_SIZE;
    if (logoDataUrl) {
      return { type: "img", props: { src: logoDataUrl, style: { width: size, height: size, objectFit: "contain" } } };
    }
    if (brandName) {
      return {
        type: "div",
        props: {
          style: { fontSize: textSizeOverride ?? 22, fontWeight: 700, color: "white", letterSpacing: 1, textShadow: "0 1px 4px rgba(0,0,0,0.5)", display: "flex" },
          children: brandName,
        },
      };
    }
    return null;
  };

  const overlayStyle = isSquare
    ? { background: "rgba(0,0,0,0.45)" }
    : { backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 100%)" };

  const baseContainer = { display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "Inter" };
  const bgImgStyle = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" };
  const overlayDivStyle = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", ...overlayStyle };

  const el = (type: string, props: Record<string, unknown>) => ({ type, props });

  if (channel === "instagram") {
    return el("div", { style: baseContainer, children: [
      el("img", { src: bgDataUrl, style: bgImgStyle }),
      el("div", { style: overlayDivStyle }),
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px", justifyContent: "center", alignItems: "center" }, children: [
        el("div", { style: { fontSize: Math.round(80 * headlineFontScale), fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "88%", wordBreak: "break-word" }, children: headlineText }),
        ctaText ? el("div", { style: { marginTop: 32, fontSize: 32, color: "rgba(255,255,255,0.9)", textAlign: "center", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px", wordBreak: "break-word" }, children: ctaText }) : null,
        logoOrBrandName() ? el("div", { style: { position: "absolute", bottom: 48, display: "flex", justifyContent: "center" }, children: logoOrBrandName() }) : null,
      ].filter(Boolean) }),
    ] });
  }

  if (channel === "linkedin" || channel === "facebook") {
    return el("div", { style: baseContainer, children: [
      el("img", { src: bgDataUrl, style: bgImgStyle }),
      el("div", { style: overlayDivStyle }),
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }, children: [
        logoOrBrandName() ? el("div", { style: { marginBottom: "auto", display: "flex" }, children: logoOrBrandName() }) : null,
        el("div", { style: { display: "flex", flexDirection: "column", marginTop: "auto", width: "65%" }, children: [
          el("div", { style: { fontSize: Math.round(52 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", wordBreak: "break-word" }, children: headlineText }),
          ctaText ? el("div", { style: { marginTop: 20, fontSize: 22, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", wordBreak: "break-word" }, children: ctaText }) : null,
        ].filter(Boolean) }),
      ].filter(Boolean) }),
    ] });
  }

  if (channel === "twitter") {
    return el("div", { style: baseContainer, children: [
      el("img", { src: bgDataUrl, style: bgImgStyle }),
      el("div", { style: overlayDivStyle }),
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px" }, children: [
        logoOrBrandName() ? el("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "auto" }, children: logoOrBrandName(48, 18) }) : null,
        el("div", { style: { display: "flex", flexDirection: "column", width: "60%", marginTop: "auto" }, children: [
          el("div", { style: { fontSize: Math.round(58 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", wordBreak: "break-word" }, children: headlineText }),
          ctaText ? el("div", { style: { marginTop: 20, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", wordBreak: "break-word" }, children: ctaText }) : null,
        ].filter(Boolean) }),
      ].filter(Boolean) }),
    ] });
  }

  if (channel === "email") {
    return el("div", { style: baseContainer, children: [
      el("div", { style: { display: "flex", position: "absolute", right: 0, top: 0, width: "45%", height: "100%", overflow: "hidden" }, children: [
        el("img", { src: bgDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } }),
        el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: `linear-gradient(to right, ${primaryColor} 0%, transparent 80%)` } }),
      ] }),
      el("div", { style: { position: "absolute", left: 0, top: 0, width: "58%", height: "100%", background: primaryColor, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 32px" }, children: [
        logoOrBrandName() ? el("div", { style: { marginBottom: 12, display: "flex", flexShrink: 0 }, children: logoOrBrandName(40, 16) }) : null,
        el("div", { style: { fontSize: Math.round(26 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", wordBreak: "break-word" }, children: headlineText }),
        ctaText ? el("div", { style: { marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", wordBreak: "break-word" }, children: ctaText }) : null,
      ].filter(Boolean) }),
    ] });
  }

  // Default fallback (linkedin layout)
  return el("div", { style: baseContainer, children: [
    el("img", { src: bgDataUrl, style: bgImgStyle }),
    el("div", { style: overlayDivStyle }),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }, children: [
      logoOrBrandName() ? el("div", { style: { marginBottom: "auto", display: "flex" }, children: logoOrBrandName() }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", marginTop: "auto", width: "70%" }, children: [
        el("div", { style: { fontSize: Math.round(52 * headlineFontScale), fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", wordBreak: "break-word" }, children: headlineText }),
        ctaText ? el("div", { style: { marginTop: 16, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", wordBreak: "break-word" }, children: ctaText }) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Compose a branded image for the given channel.
 * Returns the saved file path and a relative URL for serving.
 *
 * When called from the Inngest pipeline, pass `outputDir` pointing to the
 * Next.js public/generated/composited directory so the URL can be served.
 */
export async function compositeImage(params: CompositorParams): Promise<CompositorResult> {
  const {
    backgroundImageUrl,
    logoUrl,
    brandName = "",
    brandPrimaryColor,
    flowType,
    logoPosition,
    outputDir,
    publicDir,
  } = params;

  // Trace key params for debugging — especially important for user-photo flow
  console.log(`[compositor] compositeImage called — channel: ${params.channel}, flowType: ${flowType ?? "generate"}, logoUrl: ${logoUrl ?? "(none)"}, backgroundImageUrl: ${backgroundImageUrl ?? "(none)"}, logoPosition: ${logoPosition ?? "auto"}`);

  const headlineText = stripMarkdown(stripEmoji(params.headlineText ?? ""));
  const ctaText = stripMarkdown(stripEmoji(params.ctaText ?? ""));
  const channel = params.channel;

  const dims = CHANNEL_DIMS[channel] ?? CHANNEL_DIMS["linkedin"] ?? { width: 1200, height: 627 };
  const primaryColor = brandPrimaryColor ?? DEFAULT_PRIMARY;

  // ── Background image ─────────────────────────────────────────────────────────

  let bgDataUrl: string;
  let bgBuffer: Buffer;

  const buildGradientFallback = () => {
    const svg = `<svg width="${dims.width}" height="${dims.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primaryColor}"/><stop offset="100%" stop-color="${primaryColor}88"/></linearGradient></defs><rect width="${dims.width}" height="${dims.height}" fill="url(#g)"/><rect width="${dims.width}" height="${dims.height}" fill="rgba(0,0,0,0.15)"/></svg>`;
    const b64 = Buffer.from(svg).toString("base64");
    return { dataUrl: `data:image/svg+xml;base64,${b64}`, buffer: Buffer.from(svg) };
  };

  if (!backgroundImageUrl) {
    const { dataUrl, buffer } = buildGradientFallback();
    bgDataUrl = dataUrl;
    bgBuffer = buffer;
  } else {
    try {
      const { b64, mime } = await fetchAsBase64(backgroundImageUrl, publicDir);
      bgDataUrl = toDataUrl(b64, mime);
      bgBuffer = Buffer.from(b64, "base64");
    } catch (err) {
      console.error(`[compositor] Background fetch failed for ${backgroundImageUrl}:`, (err as Error).message);
      const { dataUrl, buffer } = buildGradientFallback();
      bgDataUrl = dataUrl;
      bgBuffer = buffer;
    }
  }

  // ── Logo compositing ─────────────────────────────────────────────────────────

  let logoDataUrl: string | null = null;

  if (logoUrl) {
    try {
      const { b64: logoBuf64, mime: logoMime } = await fetchAsBase64(logoUrl, publicDir);
      const logoBuffer = Buffer.from(logoBuf64, "base64");

      if (flowType === "user-photo") {
        let corner: CornerKey;
        if (logoPosition && logoPosition !== "auto") {
          corner = logoPosition as CornerKey;
          console.log(`[compositor] user-photo flow — using explicit logoPosition: ${corner}`);
        } else {
          corner = await findDarkestCorner(bgBuffer, dims.width, dims.height);
          console.log(`[compositor] user-photo flow — auto-detected darkest corner: ${corner}`);
        }
        console.log(`[compositor] user-photo flow — compositing logo onto background at corner: ${corner}`);
        bgBuffer = await compositeLogoOnBackground(bgBuffer, logoBuffer, corner, dims.width, dims.height);
        bgDataUrl = toDataUrl(bgBuffer.toString("base64"), "image/png");
        logoDataUrl = null;
      } else {
        console.log(`[compositor] generate flow — logo will be rendered as overlay in Satori template`);
        logoDataUrl = toDataUrl(logoBuf64, logoMime);
      }
    } catch (err) {
      console.error(`[compositor] Logo fetch failed for ${logoUrl}:`, (err as Error).message);
      logoDataUrl = null;
    }
  }

  // ── Satori render ────────────────────────────────────────────────────────────

  const fontData = await getFont();
  const template = buildTemplate(channel, { dims, bgDataUrl, logoDataUrl, brandName, headlineText, ctaText, primaryColor });

  const svg = await satori(template, {
    width: dims.width,
    height: dims.height,
    fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }],
  });

  // ── PNG conversion + save ────────────────────────────────────────────────────

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: dims.width } });
  const pngBuffer = resvg.render().asPng();

  const dir = outputDir ?? path.join(process.cwd(), "public", "generated", "composited");
  fs.mkdirSync(dir, { recursive: true });

  const filename = `composited-${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, pngBuffer);

  return {
    filePath,
    url: `/generated/composited/${filename}`,
  };
}
