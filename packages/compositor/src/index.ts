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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const opentype = require("@shuding/opentype.js");

// ── Types ──────────────────────────────────────────────────────────────────────

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface CompositorParams {
  backgroundImageUrl?: string;
  headlineText: string;
  ctaText: string;
  logoUrl?: string;
  brandName?: string;
  brandPrimaryColor?: string;
  /** Used for the gradient fallback — creates a two-color gradient background */
  brandSecondaryColor?: string;
  channel: string;
  flowType?: "generate" | "user-photo";
  logoPosition?: string;
  /**
   * Whether the background was AI-generated or a brand graphic fallback.
   * Stored on the asset so the review page can show the correct badge.
   */
  imageSource?: "fal" | "pollinations" | "brand-graphic";
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
  /** Raw PNG buffer — use this to upload to cloud storage in production */
  pngBuffer: Buffer;
  /**
   * Which image source was used: "fal" | "pollinations" | "brand-graphic".
   * "brand-graphic" means no AI image was available and a branded gradient was generated.
   */
  imageSource: "fal" | "pollinations" | "brand-graphic";
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHANNEL_DIMS: Record<string, { width: number; height: number }> = {
  instagram:        { width: 1080, height: 1080 },
  linkedin:         { width: 1200, height: 627 },
  twitter:          { width: 1600, height: 900 },
  facebook:         { width: 1200, height: 630 },
  email:            { width: 600,  height: 200 },
  google_business:  { width: 1200, height: 900 },
};

const DEFAULT_PRIMARY = "#10b981";
const LOGO_SIZE = 120;
const LOGO_SHARP_SIZE = 128;

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

// ── Channel text layout config ────────────────────────────────────────────────

interface TextConfig {
  baseFontSize: number;
  minFontSize: number;
  maxLines: number;
  textWidthPct: number;
  padL: number;
  padR: number;
  maxHeightPct: number;
}

const CHANNEL_TEXT_CONFIG: Record<string, TextConfig> = {
  instagram:       { baseFontSize: 80, minFontSize: 44, maxLines: 3, textWidthPct: 1.0,  padL: 64, padR: 64, maxHeightPct: 0.50 },
  linkedin:        { baseFontSize: 52, minFontSize: 30, maxLines: 2, textWidthPct: 0.65, padL: 48, padR: 0,  maxHeightPct: 0.45 },
  facebook:        { baseFontSize: 52, minFontSize: 30, maxLines: 2, textWidthPct: 0.65, padL: 48, padR: 0,  maxHeightPct: 0.45 },
  twitter:         { baseFontSize: 58, minFontSize: 32, maxLines: 2, textWidthPct: 0.60, padL: 56, padR: 0,  maxHeightPct: 0.40 },
  email:           { baseFontSize: 26, minFontSize: 16, maxLines: 2, textWidthPct: 0.58, padL: 32, padR: 0,  maxHeightPct: 0.55 },
  google_business: { baseFontSize: 52, minFontSize: 30, maxLines: 2, textWidthPct: 0.70, padL: 48, padR: 0,  maxHeightPct: 0.45 },
};

const DEFAULT_TEXT_CONFIG: TextConfig = CHANNEL_TEXT_CONFIG["linkedin"]!;

// ── Font loading (module-level cache) ─────────────────────────────────────────

let cachedFont: ArrayBuffer | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedParsedFont: any = null;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getParsedFont(): Promise<any> {
  if (!cachedParsedFont) {
    const buf = await getFont();
    cachedParsedFont = opentype.parse(buf);
  }
  return cachedParsedFont;
}

// ── Text measurement & fitting ────────────────────────────────────────────────

function measureTextWidth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font: any,
  text: string,
  fontSize: number,
): number {
  return font.getAdvanceWidth(text, fontSize);
}

/**
 * Simulate word-wrapping and count how many lines `text` occupies at `fontSize`
 * within `containerWidth` pixels. Returns the line count.
 */
function countWrappedLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font: any,
  text: string,
  fontSize: number,
  containerWidth: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let lines = 1;
  let currentLineWidth = 0;
  const spaceWidth = measureTextWidth(font, " ", fontSize);

  for (const word of words) {
    const wordWidth = measureTextWidth(font, word, fontSize);
    const widthIfAdded = currentLineWidth === 0
      ? wordWidth
      : currentLineWidth + spaceWidth + wordWidth;

    if (widthIfAdded > containerWidth && currentLineWidth > 0) {
      lines++;
      currentLineWidth = wordWidth;
    } else {
      currentLineWidth = widthIfAdded;
    }
  }

  return lines;
}

/**
 * Fit headline text to a container by adaptively scaling font size, then
 * truncating at word boundaries as a last resort.
 *
 * Returns the (possibly truncated) text and the computed font size.
 */
async function fitHeadline(params: {
  text: string;
  baseFontSize: number;
  minFontSize: number;
  containerWidthPx: number;
  maxLines: number;
  lineHeight: number;
  containerHeightPx: number;
}): Promise<{ text: string; fontSize: number }> {
  const { text, baseFontSize, minFontSize, containerWidthPx, maxLines, lineHeight, containerHeightPx } = params;

  if (!text.trim()) return { text: "", fontSize: baseFontSize };

  const font = await getParsedFont();

  // Try shrinking font from base down to min in 2px steps
  for (let size = baseFontSize; size >= minFontSize; size -= 2) {
    const lines = countWrappedLines(font, text, size, containerWidthPx);
    const totalHeight = lines * size * lineHeight;
    if (lines <= maxLines && totalHeight <= containerHeightPx) {
      return { text, fontSize: size };
    }
  }

  // Text doesn't fit even at minFontSize — truncate at word boundary
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= 1; n--) {
    const truncated = words.slice(0, n).join(" ") + "…";
    const lines = countWrappedLines(font, truncated, minFontSize, containerWidthPx);
    const totalHeight = lines * minFontSize * lineHeight;
    if (lines <= maxLines && totalHeight <= containerHeightPx) {
      return { text: truncated, fontSize: minFontSize };
    }
  }

  // Absolute fallback: first word truncated
  return { text: words[0]!.slice(0, 15) + "…", fontSize: minFontSize };
}

// ── Image helpers ──────────────────────────────────────────────────────────────

/** Detect actual image MIME type from magic bytes, ignoring unreliable Content-Type headers. */
function detectMime(buf: Buffer): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  // SVG
  if (buf.slice(0, 5).toString("ascii") === "<svg ") return "image/svg+xml";
  return "image/jpeg";
}

async function fetchAsBase64(urlOrPath: string, publicDir?: string): Promise<{ b64: string; mime: string }> {
  if (urlOrPath.startsWith("/")) {
    // Resolve against the provided publicDir first, then fall back to process.cwd()/public.
    // When called from the Inngest pipeline (packages/queue), process.cwd() is NOT apps/web,
    // so the pipeline must always pass publicDir explicitly.
    const base = publicDir ?? path.join(process.cwd(), "public");
    const filePath = path.join(base, urlOrPath);
    console.log(`[compositor] Reading local file: ${filePath}`);
    const buf = fs.readFileSync(filePath);
    return { b64: buf.toString("base64"), mime: detectMime(buf) };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(urlOrPath, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${urlOrPath}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Always detect MIME from actual bytes — CDNs often return wrong Content-Type headers
    return { b64: buf.toString("base64"), mime: detectMime(buf) };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
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

// ── Brand graphic helpers ──────────────────────────────────────────────────────

/** Darken a hex color by mixing it with black at `amount` (0–1). */
function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const r = Math.round(parseInt(full.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(full.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(full.slice(4, 6), 16) * (1 - amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Build a branded SVG background — gradient + geometric dot grid + large watermark text.
 * Used when no AI image is available. The result is embedded as a data URL in the
 * Satori template, which then overlays the headline/CTA on top as usual.
 */
function buildBrandGraphicSvg(
  w: number,
  h: number,
  primary: string,
  secondary: string,
  title: string,
): string {
  // Dot grid: spacing scales with canvas size
  const spacing = Math.round(Math.min(w, h) / 18);
  const dotR = Math.max(1.5, spacing * 0.12);
  const cols = Math.ceil(w / spacing) + 1;
  const rows = Math.ceil(h / spacing) + 1;

  let dots = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Offset every other row for a more organic pattern
      const offset = row % 2 === 0 ? 0 : spacing / 2;
      dots += `<circle cx="${col * spacing + offset}" cy="${row * spacing}" r="${dotR}" fill="rgba(255,255,255,0.12)"/>`;
    }
  }

  // Large diagonal accent circles (top-right and bottom-left)
  const circleR = Math.round(Math.min(w, h) * 0.55);

  // Font size for the watermark background text
  const titleFontSize = Math.round(Math.min(w, h) * 0.12);
  // Escape XML special chars
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${secondary}"/>
    </linearGradient>
  </defs>

  <!-- Base gradient -->
  <rect width="${w}" height="${h}" fill="url(#bg)"/>

  <!-- Accent circles for depth -->
  <circle cx="${w * 1.1}" cy="${-h * 0.1}" r="${circleR}" fill="rgba(255,255,255,0.06)"/>
  <circle cx="${-w * 0.1}" cy="${h * 1.1}" r="${circleR}" fill="rgba(255,255,255,0.06)"/>

  <!-- Dot grid pattern -->
  ${dots}

  <!-- Dark vignette overlay for text legibility -->
  <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.18)"/>

  <!-- Faint watermark text -->
  ${safeTitle ? `<text
    x="${w / 2}" y="${h * 0.62}"
    text-anchor="middle"
    font-size="${titleFontSize}"
    font-weight="900"
    letter-spacing="${Math.round(titleFontSize * 0.06)}"
    fill="rgba(255,255,255,0.06)"
    font-family="system-ui, sans-serif"
  >${safeTitle.toUpperCase()}</text>` : ""}
</svg>`;
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
    headlineFontSize: number;
    ctaText: string;
    primaryColor: string;
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { dims, bgDataUrl, logoDataUrl, brandName, headlineText, ctaText, primaryColor, headlineFontSize } = opts;
  const { width, height } = dims;
  const isSquare = width === height;

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
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px", justifyContent: "space-between", alignItems: "center" }, children: [
        el("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%" }, children: [
          el("div", { style: { fontSize: headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: headlineText }),
          ctaText ? el("div", { style: { marginTop: 32, fontSize: 32, color: "rgba(255,255,255,0.9)", textAlign: "center", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px", overflowWrap: "break-word" }, children: ctaText }) : null,
        ].filter(Boolean) }),
        logoOrBrandName() ? el("div", { style: { display: "flex", justifyContent: "center", width: "100%", flexShrink: 0 }, children: logoOrBrandName() }) : el("div", { style: { height: LOGO_SIZE } }),
      ] }),
    ] });
  }

  if (channel === "linkedin" || channel === "facebook") {
    return el("div", { style: baseContainer, children: [
      el("img", { src: bgDataUrl, style: bgImgStyle }),
      el("div", { style: overlayDivStyle }),
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }, children: [
        logoOrBrandName() ? el("div", { style: { marginBottom: "auto", display: "flex" }, children: logoOrBrandName() }) : null,
        el("div", { style: { display: "flex", flexDirection: "column", marginTop: "auto", width: "65%" }, children: [
          el("div", { style: { fontSize: headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: headlineText }),
          ctaText ? el("div", { style: { marginTop: 20, fontSize: 22, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", overflowWrap: "break-word" }, children: ctaText }) : null,
        ].filter(Boolean) }),
      ].filter(Boolean) }),
    ] });
  }

  if (channel === "twitter") {
    return el("div", { style: baseContainer, children: [
      el("img", { src: bgDataUrl, style: bgImgStyle }),
      el("div", { style: overlayDivStyle }),
      el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px" }, children: [
        logoOrBrandName() ? el("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "auto" }, children: logoOrBrandName(80, 20) }) : null,
        el("div", { style: { display: "flex", flexDirection: "column", width: "60%", marginTop: "auto" }, children: [
          el("div", { style: { fontSize: headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: headlineText }),
          ctaText ? el("div", { style: { marginTop: 20, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", overflowWrap: "break-word" }, children: ctaText }) : null,
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
        logoOrBrandName() ? el("div", { style: { marginBottom: 12, display: "flex", flexShrink: 0 }, children: logoOrBrandName(56, 18) }) : null,
        el("div", { style: { fontSize: headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: headlineText }),
        ctaText ? el("div", { style: { marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", overflowWrap: "break-word" }, children: ctaText }) : null,
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
        el("div", { style: { fontSize: headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: headlineText }),
        ctaText ? el("div", { style: { marginTop: 16, fontSize: 24, color: "rgba(255,255,255,0.85)", fontWeight: 500, width: "100%", overflowWrap: "break-word" }, children: ctaText }) : null,
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

  // Track which image source was used for this composite
  let resolvedImageSource: CompositorResult["imageSource"] = params.imageSource ?? (backgroundImageUrl ? "pollinations" : "brand-graphic");

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
    // Use secondary color for the gradient end-stop; darken primary if no secondary
    const secondary = params.brandSecondaryColor ?? darkenHex(primaryColor, 0.45);
    const title = params.headlineText ? capWords(stripMarkdown(stripEmoji(params.headlineText)), 5) : (params.brandName ?? "");
    const svg = buildBrandGraphicSvg(dims.width, dims.height, primaryColor, secondary, title);
    const b64 = Buffer.from(svg).toString("base64");
    return { dataUrl: `data:image/svg+xml;base64,${b64}`, buffer: Buffer.from(svg) };
  };

  if (!backgroundImageUrl) {
    resolvedImageSource = "brand-graphic";
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
      resolvedImageSource = "brand-graphic";
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

  // ── Text fitting ─────────────────────────────────────────────────────────────

  const textCfg = CHANNEL_TEXT_CONFIG[channel] ?? DEFAULT_TEXT_CONFIG;
  const containerWidthPx = dims.width * textCfg.textWidthPct - textCfg.padL - textCfg.padR;
  const containerHeightPx = dims.height * textCfg.maxHeightPct;

  const fitted = await fitHeadline({
    text: headlineText,
    baseFontSize: textCfg.baseFontSize,
    minFontSize: textCfg.minFontSize,
    containerWidthPx,
    maxLines: textCfg.maxLines,
    lineHeight: 1.2,
    containerHeightPx,
  });

  console.log(`[compositor] fitHeadline — channel: ${channel}, fontSize: ${fitted.fontSize}/${textCfg.baseFontSize}, text: "${fitted.text}"`);

  // ── Satori render ────────────────────────────────────────────────────────────

  const fontData = await getFont();
  const template = buildTemplate(channel, { dims, bgDataUrl, logoDataUrl, brandName, headlineText: fitted.text, headlineFontSize: fitted.fontSize, ctaText, primaryColor });

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
    pngBuffer: Buffer.from(pngBuffer),
    imageSource: resolvedImageSource,
  };
}
