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
import { createRequire } from "module";
const opentype = createRequire(import.meta.url)("@shuding/opentype.js");

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
  /**
   * Layout variant index (0-based). Determines which visual layout template is used.
   * Computed deterministically from campaignId + channel in the pipeline so the same
   * campaign always renders with the same layout, while different campaigns vary.
   * Defaults to 0 (original layout) for backward compatibility.
   */
  layoutVariant?: number;
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

/**
 * Safety margin applied when measuring text width.
 * Satori's actual glyph rendering can exceed font-metric estimates by ~5-8%.
 * Dividing containerWidth by this factor before comparing means measured text
 * must fit in a slightly smaller box, giving rendered text room to breathe.
 */
const MEASUREMENT_SAFETY_MARGIN = 1.06;

/**
 * Vertical space (px) to reserve below the headline for the CTA block.
 * Subtracted from containerHeightPx when fitting the headline so both blocks
 * can coexist without overlap.
 */
const CTA_RESERVE_HEIGHT: Record<string, number> = {
  instagram: 80,
  linkedin:  50,
  facebook:  50,
  twitter:   50,
  email:     30,
  google_business: 50,
};

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
  const effectiveWidth = containerWidthPx / MEASUREMENT_SAFETY_MARGIN;

  // Try shrinking font from base down to min in 2px steps
  for (let size = baseFontSize; size >= minFontSize; size -= 2) {
    const lines = countWrappedLines(font, text, size, effectiveWidth);
    const totalHeight = lines * size * lineHeight;
    if (lines <= maxLines && totalHeight <= containerHeightPx) {
      return { text, fontSize: size };
    }
  }

  // Text doesn't fit even at minFontSize — render at minimum font size without truncation.
  // The AI is expected to provide short complete headlines; log a warning for tuning.
  console.warn(`[compositor] fitHeadline — text did not fit at minFontSize (${minFontSize}): "${text}"`);
  return { text, fontSize: minFontSize };
}

/**
 * CTA base font sizes, minimums, and max lines per channel.
 * maxLines: 1 = single-line (tight channels); 2 = allow wrapping (spacious channels).
 * The container width used for fitting is the same as the headline container width
 * (textWidthPct * dims.width - padL - padR).
 */
const CTA_FONT_CONFIG: Record<string, { base: number; min: number; maxLines: number }> = {
  instagram:       { base: 32, min: 18, maxLines: 2 },
  linkedin:        { base: 22, min: 14, maxLines: 1 },
  facebook:        { base: 22, min: 14, maxLines: 2 },
  twitter:         { base: 24, min: 14, maxLines: 1 },
  email:           { base: 13, min: 10, maxLines: 1 },
  google_business: { base: 22, min: 14, maxLines: 1 },
};

/**
 * Fit CTA text by shrinking font size, supporting multi-line wrapping for
 * channels with enough vertical space. Never truncates with ellipsis —
 * the AI is expected to provide short, complete CTA phrases (2-4 words).
 */
async function fitCta(params: {
  text: string;
  channel: string;
  containerWidthPx: number;
}): Promise<{ text: string; fontSize: number }> {
  const { text, channel, containerWidthPx } = params;
  if (!text.trim()) return { text: "", fontSize: CTA_FONT_CONFIG[channel]?.base ?? 22 };

  const cfg = CTA_FONT_CONFIG[channel] ?? { base: 22, min: 14, maxLines: 1 };
  const font = await getParsedFont();
  const effectiveWidth = containerWidthPx / MEASUREMENT_SAFETY_MARGIN;

  if (cfg.maxLines === 1) {
    // Single-line fit: shrink font until text fits on one line
    for (let size = cfg.base; size >= cfg.min; size -= 1) {
      const w = measureTextWidth(font, text, size);
      if (w <= effectiveWidth) return { text, fontSize: size };
    }
    // Still doesn't fit at min size — render at min and let Satori clip gracefully
    // (better than truncating a complete thought mid-word)
    return { text, fontSize: cfg.min };
  }

  // Multi-line fit: allow wrapping up to cfg.maxLines
  const lineHeight = 1.25;
  for (let size = cfg.base; size >= cfg.min; size -= 1) {
    const lines = countWrappedLines(font, text, size, effectiveWidth);
    const totalHeight = lines * size * lineHeight;
    const maxHeight = cfg.maxLines * cfg.base * lineHeight;
    if (lines <= cfg.maxLines && totalHeight <= maxHeight) {
      return { text, fontSize: size };
    }
  }

  // Fits at minimum with wrapping — render as-is
  return { text, fontSize: cfg.min };
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

interface TemplateOpts {
  dims: { width: number; height: number };
  bgDataUrl: string;
  logoDataUrl: string | null;
  brandName: string;
  headlineText: string;
  headlineFontSize: number;
  ctaText: string;
  ctaFontSize: number;
  primaryColor: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (type: string, props: Record<string, unknown>): any => ({ type, props });

const BASE_CONTAINER = { display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "Inter" };
const BG_IMG_STYLE   = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" };

function logoBlock(logoDataUrl: string | null, brandName: string, size = LOGO_SIZE, textSize = 22) {
  if (logoDataUrl) {
    return el("img", { src: logoDataUrl, style: { width: size, height: size, objectFit: "contain" } });
  }
  if (brandName) {
    return el("div", { style: { fontSize: textSize, fontWeight: 700, color: "white", letterSpacing: 1, display: "flex" }, children: brandName });
  }
  return null;
}

// CTA visual styles ──────────────────────────────────────────────────────────

function ctaPill(text: string, fontSize: number, primaryColor: string) {
  return el("div", { style: { marginTop: 28, fontSize, color: "rgba(255,255,255,0.95)", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px", overflowWrap: "break-word", alignSelf: "flex-start" }, children: text });
}

function ctaPillCentered(text: string, fontSize: number, primaryColor: string) {
  return el("div", { style: { marginTop: 28, fontSize, color: "rgba(255,255,255,0.95)", textAlign: "center", fontWeight: 600, background: primaryColor, padding: "12px 32px", borderRadius: "8px", overflowWrap: "break-word" }, children: text });
}

function ctaGhostPill(text: string, fontSize: number) {
  return el("div", { style: { marginTop: 28, fontSize, color: "white", fontWeight: 600, border: "2px solid white", padding: "10px 28px", borderRadius: "8px", overflowWrap: "break-word", alignSelf: "flex-start" }, children: text });
}

function ctaUnderline(text: string, fontSize: number, primaryColor: string) {
  return el("div", { style: { marginTop: 20, fontSize, color: "white", fontWeight: 600, borderBottom: `3px solid ${primaryColor}`, paddingBottom: 4, overflowWrap: "break-word", alignSelf: "flex-start" }, children: text });
}

function ctaArrow(text: string, fontSize: number) {
  return el("div", { style: { marginTop: 20, fontSize, color: "rgba(255,255,255,0.9)", fontWeight: 500, overflowWrap: "break-word" }, children: `${text} →` });
}

function ctaPlain(text: string, fontSize: number) {
  return el("div", { style: { marginTop: 16, fontSize, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflowWrap: "break-word" }, children: text });
}

// Overlay styles ─────────────────────────────────────────────────────────────

function overlayVignette() {
  return el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.45)" } });
}

function overlayVignetteStrong() {
  return el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.60)" } });
}

function overlayLeftGradient() {
  return el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.10) 100%)" } });
}

function overlayBottomGradient() {
  return el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.05) 60%)" } });
}

function overlayBrandTint(primaryColor: string) {
  // Convert hex to rgba — simple approach: trust that primaryColor is a valid hex
  return el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: primaryColor, opacity: 0.35 } });
}

// ── Instagram layouts ────────────────────────────────────────────────────────

/** v0 — Centered: headline + pill CTA vertically centered, logo at bottom */
function buildInstagram_v0(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayVignette(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px", justifyContent: "space-between", alignItems: "center" }, children: [
      el("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? ctaPillCentered(o.ctaText, o.ctaFontSize, o.primaryColor) : null,
      ].filter(Boolean) }),
      logo ? el("div", { style: { display: "flex", justifyContent: "center", width: "100%", flexShrink: 0 }, children: logo }) : el("div", { style: { height: LOGO_SIZE } }),
    ] }),
  ] });
}

/** v1 — Bold Bottom-Left: large headline anchored bottom-left, underline CTA, logo top-left */
function buildInstagram_v1(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 80, 18);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayBottomGradient(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "60px" }, children: [
      logo ? el("div", { style: { display: "flex", flexShrink: 0 }, children: logo }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", marginTop: "auto", width: "85%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.15, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? ctaUnderline(o.ctaText, o.ctaFontSize, o.primaryColor) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

/** v2 — Top Banner: brand-color strip at top with logo, headline in lower-third, ghost pill CTA */
function buildInstagram_v2(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 72, 20);
  const bannerH = 120;
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayBottomGradient(),
    // Top brand banner
    el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: bannerH, background: o.primaryColor, display: "flex", alignItems: "center", padding: "0 48px" }, children: [
      logo ?? el("div", { style: { fontSize: 20, fontWeight: 700, color: "white" }, children: o.brandName }),
    ] }),
    // Lower content
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "60px", paddingTop: `${bannerH + 40}px`, justifyContent: "flex-end" }, children: [
      el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? el("div", { style: { marginTop: 28, fontSize: o.ctaFontSize, color: "white", fontWeight: 600, border: "2px solid white", padding: "10px 28px", borderRadius: "8px", overflowWrap: "break-word" }, children: o.ctaText }) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

/** v3 — Quote Style: typographic quote marks, arrow CTA, strong vignette */
function buildInstagram_v3(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 72, 18);
  const quoteFontSize = Math.round(o.headlineFontSize * 2.2);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayVignetteStrong(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px", justifyContent: "center", alignItems: "center" }, children: [
      el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "90%" }, children: [
        el("div", { style: { fontSize: quoteFontSize, fontWeight: 700, color: o.primaryColor, lineHeight: 0.8, alignSelf: "flex-start" }, children: "\u201C" }),
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.25, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? el("div", { style: { marginTop: 24, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflowWrap: "break-word" }, children: `${o.ctaText} →` }) : null,
      ].filter(Boolean) }),
      logo ? el("div", { style: { position: "absolute", bottom: 56, left: 64, display: "flex" }, children: logo }) : null,
    ].filter(Boolean) }),
  ] });
}

// ── LinkedIn / Facebook layouts ──────────────────────────────────────────────

/** v0 — Bottom-Left (current): 65% text block, logo top-left, left gradient */
function buildLinkedFace_v0(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayLeftGradient(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px" }, children: [
      logo ? el("div", { style: { marginBottom: "auto", display: "flex" }, children: logo }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", marginTop: "auto", width: "65%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? ctaPlain(o.ctaText, o.ctaFontSize) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

/** v1 — Dark Left Panel: solid primaryColor left panel (~42%), photo fills right */
function buildLinkedFace_v1(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 80, 18);
  const panelW = "42%";
  return el("div", { style: BASE_CONTAINER, children: [
    // Right photo area
    el("div", { style: { position: "absolute", right: 0, top: 0, width: "62%", height: "100%", overflow: "hidden", display: "flex" }, children: [
      el("img", { src: o.bgDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } }),
      el("div", { style: { position: "absolute", top: 0, left: 0, width: "40%", height: "100%", backgroundImage: `linear-gradient(to right, ${o.primaryColor}, transparent)` } }),
    ] }),
    // Left color panel
    el("div", { style: { position: "absolute", left: 0, top: 0, width: panelW, height: "100%", background: o.primaryColor, display: "flex", flexDirection: "column", justifyContent: "center", padding: "44px 40px" }, children: [
      logo ? el("div", { style: { marginBottom: 24, display: "flex", flexShrink: 0 }, children: logo }) : null,
      el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
      o.ctaText ? el("div", { style: { marginTop: 20, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.9)", fontWeight: 600, border: "2px solid rgba(255,255,255,0.6)", padding: "8px 20px", borderRadius: "6px", overflowWrap: "break-word", alignSelf: "flex-start" }, children: o.ctaText }) : null,
    ].filter(Boolean) }),
  ] });
}

/** v2 — Bottom Band: full-width primaryColor strip across bottom ~35%, headline + logo inside */
function buildLinkedFace_v2(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 72, 18);
  const bandH = Math.round(o.dims.height * 0.38);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    // Bottom band
    el("div", { style: { position: "absolute", bottom: 0, left: 0, width: "100%", height: bandH, background: o.primaryColor, display: "flex", alignItems: "center", padding: "0 48px", justifyContent: "space-between" }, children: [
      el("div", { style: { display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? el("div", { style: { marginTop: 10, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflowWrap: "break-word" }, children: `${o.ctaText} →` }) : null,
      ].filter(Boolean) }),
      logo ? el("div", { style: { flexShrink: 0, display: "flex" }, children: logo }) : null,
    ].filter(Boolean) }),
  ] });
}

/** v3 — Centered Bold: headline centered, strong vignette, logo top-right, underline CTA */
function buildLinkedFace_v3(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 80, 18);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayVignetteStrong(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px", justifyContent: "center", alignItems: "center" }, children: [
      logo ? el("div", { style: { position: "absolute", top: 44, right: 44, display: "flex" }, children: logo }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "75%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? el("div", { style: { marginTop: 20, fontSize: o.ctaFontSize, color: "white", fontWeight: 600, borderBottom: `3px solid ${o.primaryColor}`, paddingBottom: 4, overflowWrap: "break-word" }, children: o.ctaText }) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

// ── Twitter layouts ──────────────────────────────────────────────────────────

/** v0 — Bottom-Left (current): 60% text, logo top-right */
function buildTwitter_v0(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 80, 20);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayLeftGradient(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px" }, children: [
      logo ? el("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "auto" }, children: logo }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", width: "60%", marginTop: "auto" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? ctaPlain(o.ctaText, o.ctaFontSize) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

/** v1 — Center Stage: headline centered, stronger vignette, logo bottom-left */
function buildTwitter_v1(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 80, 20);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayVignetteStrong(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px", justifyContent: "center", alignItems: "center" }, children: [
      el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "70%" }, children: [
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? el("div", { style: { marginTop: 20, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.9)", fontWeight: 600, background: o.primaryColor, padding: "10px 28px", borderRadius: "6px", overflowWrap: "break-word" }, children: o.ctaText }) : null,
      ].filter(Boolean) }),
      logo ? el("div", { style: { position: "absolute", bottom: 52, left: 52, display: "flex" }, children: logo }) : null,
    ].filter(Boolean) }),
  ] });
}

/** v2 — Headline + Rule: thin brand-color rule above headline, plain-text CTA */
function buildTwitter_v2(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 72, 18);
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayBottomGradient(),
    el("div", { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px" }, children: [
      logo ? el("div", { style: { marginBottom: "auto", display: "flex" }, children: logo }) : null,
      el("div", { style: { display: "flex", flexDirection: "column", width: "65%", marginTop: "auto" }, children: [
        el("div", { style: { width: 60, height: 5, background: o.primaryColor, marginBottom: 16, borderRadius: 2 } }),
        el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
        o.ctaText ? ctaArrow(o.ctaText, o.ctaFontSize) : null,
      ].filter(Boolean) }),
    ].filter(Boolean) }),
  ] });
}

// ── Email layouts ────────────────────────────────────────────────────────────

/** v0 — Left Panel (current): primaryColor left 58%, photo right */
function buildEmail_v0(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 56, 18);
  return el("div", { style: BASE_CONTAINER, children: [
    el("div", { style: { display: "flex", position: "absolute", right: 0, top: 0, width: "45%", height: "100%", overflow: "hidden" }, children: [
      el("img", { src: o.bgDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } }),
      el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: `linear-gradient(to right, ${o.primaryColor} 0%, transparent 80%)` } }),
    ] }),
    el("div", { style: { position: "absolute", left: 0, top: 0, width: "58%", height: "100%", background: o.primaryColor, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 32px" }, children: [
      logo ? el("div", { style: { marginBottom: 12, display: "flex", flexShrink: 0 }, children: logo }) : null,
      el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "100%", overflowWrap: "break-word" }, children: o.headlineText }),
      o.ctaText ? el("div", { style: { marginTop: 8, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflowWrap: "break-word" }, children: o.ctaText }) : null,
    ].filter(Boolean) }),
  ] });
}

/** v1 — Top Bar: full photo background, primaryColor top bar with logo, headline bottom-left */
function buildEmail_v1(o: TemplateOpts) {
  const logo = logoBlock(o.logoDataUrl, o.brandName, 44, 15);
  const barH = 52;
  return el("div", { style: BASE_CONTAINER, children: [
    el("img", { src: o.bgDataUrl, style: BG_IMG_STYLE }),
    overlayBottomGradient(),
    // Top bar
    el("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: barH, background: o.primaryColor, display: "flex", alignItems: "center", padding: "0 24px" }, children: [
      logo ?? el("div", { style: { fontSize: 15, fontWeight: 700, color: "white" }, children: o.brandName }),
    ] }),
    // Bottom content
    el("div", { style: { position: "absolute", bottom: 0, left: 0, width: "100%", padding: "0 28px 18px", display: "flex", flexDirection: "column" }, children: [
      el("div", { style: { fontSize: o.headlineFontSize, fontWeight: 700, color: "white", lineHeight: 1.2, width: "70%", overflowWrap: "break-word" }, children: o.headlineText }),
      o.ctaText ? el("div", { style: { marginTop: 6, fontSize: o.ctaFontSize, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflowWrap: "break-word" }, children: `${o.ctaText} →` }) : null,
    ].filter(Boolean) }),
  ] });
}

// ── Template dispatcher ──────────────────────────────────────────────────────

/**
 * Number of layout variants available per channel group.
 * Used externally to compute layoutVariant = hash % count.
 */
export const LAYOUT_VARIANT_COUNTS: Record<string, number> = {
  instagram:       4,
  linkedin:        4,
  facebook:        4,
  twitter:         3,
  email:           2,
  google_business: 4, // reuse linkedin layouts
};

function buildTemplate(
  channel: string,
  variant: number,
  opts: TemplateOpts,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (channel === "instagram") {
    const v = variant % 4;
    if (v === 1) return buildInstagram_v1(opts);
    if (v === 2) return buildInstagram_v2(opts);
    if (v === 3) return buildInstagram_v3(opts);
    return buildInstagram_v0(opts);
  }

  if (channel === "linkedin" || channel === "facebook" || channel === "google_business") {
    const v = variant % 4;
    if (v === 1) return buildLinkedFace_v1(opts);
    if (v === 2) return buildLinkedFace_v2(opts);
    if (v === 3) return buildLinkedFace_v3(opts);
    return buildLinkedFace_v0(opts);
  }

  if (channel === "twitter") {
    const v = variant % 3;
    if (v === 1) return buildTwitter_v1(opts);
    if (v === 2) return buildTwitter_v2(opts);
    return buildTwitter_v0(opts);
  }

  if (channel === "email") {
    const v = variant % 2;
    if (v === 1) return buildEmail_v1(opts);
    return buildEmail_v0(opts);
  }

  // Default fallback: linkedin v0
  return buildLinkedFace_v0(opts);
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
  const layoutVariant = params.layoutVariant ?? 0;

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
  // Reserve vertical space for the CTA block so headline + CTA don't overlap
  const ctaReserve = CTA_RESERVE_HEIGHT[channel] ?? 50;
  const containerHeightPx = dims.height * textCfg.maxHeightPct - ctaReserve;

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

  const fittedCta = await fitCta({ text: ctaText, channel, containerWidthPx });
  console.log(`[compositor] fitCta — channel: ${channel}, fontSize: ${fittedCta.fontSize}, text: "${fittedCta.text}"`);

  // ── Satori render ────────────────────────────────────────────────────────────

  const fontData = await getFont();
  console.log(`[compositor] buildTemplate — channel: ${channel}, variant: ${layoutVariant}`);
  const template = buildTemplate(channel, layoutVariant, { dims, bgDataUrl, logoDataUrl, brandName, headlineText: fitted.text, headlineFontSize: fitted.fontSize, ctaText: fittedCta.text, ctaFontSize: fittedCta.fontSize, primaryColor });

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
