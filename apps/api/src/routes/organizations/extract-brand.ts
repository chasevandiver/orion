/**
 * POST /organizations/extract-brand
 *
 * Fetches a website, extracts metadata + visible text, then calls Claude to
 * infer brand name, tagline, description, tone, personas, products, and colors.
 */
import { Router, type Request, type Response } from "express";
import { anthropic, DEFAULT_MODEL } from "@orion/agents";

export const extractBrandRouter = Router();

// ── HTML fetching ────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OrionBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ── HTML parsing (no external deps — regex-based) ────────────────────────────

function extractMeta(html: string): {
  title: string;
  metaDescription: string;
  ogImage: string;
  favicon: string;
  themeColor: string;
  headings: string[];
  bodyText: string;
} {
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? "";

  // Meta description
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
  ) ?? html.match(
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i,
  );
  const metaDescription = descMatch?.[1]?.trim() ?? "";

  // og:image
  const ogMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i,
  ) ?? html.match(
    /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i,
  );
  const ogImage = ogMatch?.[1]?.trim() ?? "";

  // Favicon
  const faviconMatch = html.match(
    /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']*)["']/i,
  );
  const favicon = faviconMatch?.[1]?.trim() ?? "";

  // Theme color
  const themeColorMatch = html.match(
    /<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']*)["']/i,
  );
  const themeColor = themeColorMatch?.[1]?.trim() ?? "";

  // Headings (h1-h3)
  const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const headings: string[] = [];
  let headingMatch;
  while ((headingMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
    const text = headingMatch[1]!.replace(/<[^>]*>/g, "").trim();
    if (text) headings.push(text);
  }

  // Body text: strip tags, collapse whitespace
  let bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  bodyText = bodyText.slice(0, 2000);

  return { title, metaDescription, ogImage, favicon, themeColor, headings, bodyText };
}

// ── CSS color extraction ─────────────────────────────────────────────────────

function extractColors(html: string, themeColor: string): { primary: string | null; secondary: string | null } {
  // Look for hex colors in inline styles and CSS blocks
  const colorRegex = /#([0-9a-fA-F]{6})\b/g;
  const counts = new Map<string, number>();
  let match;

  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
  const inlineStyles = html.match(/style=["'][^"']*["']/gi) ?? [];
  const searchText = [...styleBlocks, ...inlineStyles].join(" ");

  while ((match = colorRegex.exec(searchText)) !== null) {
    const hex = `#${match[1]!.toLowerCase()}`;
    // Skip near-white, near-black, and common gray colors
    if (
      hex === "#ffffff" || hex === "#000000" || hex === "#f8f9fa" ||
      hex === "#e9ecef" || hex === "#dee2e6" || hex === "#ced4da" ||
      hex === "#adb5bd" || hex === "#6c757d" || hex === "#495057" ||
      hex === "#343a40" || hex === "#212529" || hex === "#f5f5f5" ||
      hex === "#333333" || hex === "#666666" || hex === "#999999" ||
      hex === "#cccccc" || hex === "#eeeeee"
    ) {
      continue;
    }
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // Prefer theme-color meta as primary if valid
  let primary: string | null = null;
  let secondary: string | null = null;
  if (themeColor && /^#[0-9a-fA-F]{3,8}$/.test(themeColor)) {
    primary = themeColor;
    secondary = sorted[0]?.[0] ?? null;
  } else {
    primary = sorted[0]?.[0] ?? null;
    secondary = sorted[1]?.[0] ?? null;
  }

  return { primary, secondary };
}

// ── Resolve relative URLs ────────────────────────────────────────────────────

function resolveUrl(base: string, path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  try {
    return new URL(path, base).href;
  } catch {
    return "";
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

extractBrandRouter.post("/extract-brand", async (req: Request, res: Response) => {
  const orgId = req.user?.orgId;
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });

  let { websiteUrl } = req.body as { websiteUrl?: string };
  if (!websiteUrl?.trim()) {
    return res.status(400).json({ error: "websiteUrl is required" });
  }

  // Ensure protocol
  websiteUrl = websiteUrl.trim();
  if (!websiteUrl.startsWith("http")) {
    websiteUrl = `https://${websiteUrl}`;
  }

  try {
    // 1. Fetch HTML
    let html: string;
    try {
      html = await fetchHtml(websiteUrl);
    } catch (fetchErr: any) {
      return res.status(422).json({
        error: "Could not fetch website",
        detail: fetchErr.message,
      });
    }

    // 2. Extract metadata
    const meta = extractMeta(html);
    const { primary: extractedColor, secondary: extractedSecondary } = extractColors(html, meta.themeColor);

    // 3. Build prompt for Claude
    const prompt = `Analyze this website and extract brand information. Return ONLY valid JSON with no markdown formatting.

Website URL: ${websiteUrl}
Page title: ${meta.title}
Meta description: ${meta.metaDescription}
Key headings: ${meta.headings.slice(0, 8).join(" | ")}

Page content (first 2000 chars):
${meta.bodyText}

Return this exact JSON structure:
{
  "brandName": "the brand/company name",
  "tagline": "their tagline or slogan (if identifiable)",
  "description": "2-3 sentence description of what this business does",
  "voiceTone": "professional" or "casual" or "playful" or "bold" or "authoritative",
  "personas": [
    { "name": "Persona Name", "description": "Who they are and what they care about", "preferredChannels": ["linkedin", "instagram"] }
  ],
  "products": ["product or service 1", "product or service 2", "product or service 3"]
}

Guidelines:
- Extract 2-3 personas based on who this business likely serves
- For preferredChannels, choose from: linkedin, twitter, instagram, facebook, tiktok, email, blog
- For products, list 2-4 key products or services
- voiceTone should match the website's actual writing style
- If something is unclear, make your best inference from context`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
    } catch {
      return res.status(422).json({
        error: "Failed to parse AI response",
        fallback: true,
      });
    }

    // 4. Resolve logo URL (prefer og:image, then favicon)
    const logoUrl = resolveUrl(websiteUrl, meta.ogImage) ||
      resolveUrl(websiteUrl, meta.favicon) ||
      "";

    return res.json({
      data: {
        brandName: parsed.brandName ?? meta.title ?? "",
        tagline: parsed.tagline ?? "",
        description: parsed.description ?? meta.metaDescription ?? "",
        primaryColor: extractedColor ?? "#10b981",
        secondaryColor: extractedSecondary ?? null,
        voiceTone: parsed.voiceTone ?? "professional",
        personas: Array.isArray(parsed.personas)
          ? parsed.personas.slice(0, 3).map((p: any) => ({
              name: p.name ?? "",
              description: p.description ?? "",
              preferredChannels: Array.isArray(p.preferredChannels) ? p.preferredChannels : [],
            }))
          : [],
        products: Array.isArray(parsed.products) ? parsed.products.slice(0, 5) : [],
        logoUrl,
        websiteUrl,
      },
    });
  } catch (err: any) {
    console.error("[extract-brand] Error:", err.message);
    return res.status(500).json({
      error: "Brand extraction failed",
      fallback: true,
    });
  }
});
