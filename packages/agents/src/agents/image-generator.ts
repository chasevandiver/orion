/**
 * ImageGeneratorAgent — LoremFlickr implementation
 *
 * Uses the LoremFlickr API (https://loremflickr.com) — free, no API key required.
 * Returns keyword-matched stock photos from Flickr's Creative Commons pool.
 * Supports redirect-follow to the actual JPEG image.
 *
 * To restore AI image generation:
 *   1. Re-implement using `fal` SDK with `fal-ai/flux/schnell` model.
 *   2. Set FAL_KEY (or use openai SDK with images.generate() + OPENAI_API_KEY).
 *   3. Remove the LoremFlickr fallback below.
 *
 * NOTE: Unsplash Source API (source.unsplash.com) was shut down in January 2024.
 */

export interface ImageInput {
  brandName: string;
  channel: string;
  goalType: string;
  brandDescription?: string;
  primaryColor?: string;
  voiceTone?: string;
  products?: Array<{ name: string; description: string }>;
  brandBrief?: import("./strategist.js").BrandBrief;
}

export interface ImageOutput {
  imageUrl: string | null; // Resolved photo URL (null if all sources failed)
  prompt: string;           // Keywords used for the query
}

// Channel dimensions
const CHANNEL_DIMS: Record<string, { w: number; h: number }> = {
  instagram: { w: 1080, h: 1080 },
  linkedin:  { w: 1200, h: 627 },
  twitter:   { w: 1600, h: 900 },
  facebook:  { w: 1200, h: 630 },
  email:     { w: 600,  h: 200 },
  tiktok:    { w: 1080, h: 1080 },
  blog:      { w: 1200, h: 630 },
};

// Goal-type → photo keywords
const GOAL_KEYWORDS: Record<string, string> = {
  leads:       "business,networking",
  awareness:   "brand,marketing",
  event:       "event,conference",
  product:     "product,design",
  traffic:     "digital,technology",
  social:      "community,people",
  conversions: "success,results",
};

// Channel → complementary keywords
const CHANNEL_KEYWORDS: Record<string, string> = {
  linkedin:  "professional,office",
  twitter:   "technology,innovation",
  instagram: "lifestyle,creative",
  facebook:  "people,together",
  tiktok:    "creative,entertainment",
  email:     "business,communication",
  blog:      "writing,knowledge",
};

export class ImageGeneratorAgent {
  async generate(input: ImageInput): Promise<ImageOutput> {
    const dims = CHANNEL_DIMS[input.channel] ?? { w: 1200, h: 630 };
    const keywords = this.buildKeywords(input);

    // LoremFlickr: /width/height/keyword1,keyword2
    const url = `https://loremflickr.com/${dims.w}/${dims.h}/${encodeURIComponent(keywords)}`;

    console.info(
      `[ImageGeneratorAgent] Fetching LoremFlickr image — keywords: "${keywords}", size: ${dims.w}x${dims.h}, channel: ${input.channel}`,
    );

    const imageUrl = await this.fetchImageUrl(url);
    if (imageUrl) {
      console.info(`[ImageGeneratorAgent] Resolved image URL: ${imageUrl}`);
      return { imageUrl, prompt: keywords };
    }

    // Fallback to generic "business" keyword
    console.warn(`[ImageGeneratorAgent] Primary fetch failed — trying fallback keyword "business"`);
    const fallbackUrl = await this.fetchImageUrl(
      `https://loremflickr.com/${dims.w}/${dims.h}/business`,
    );
    if (fallbackUrl) {
      console.info(`[ImageGeneratorAgent] Fallback image URL: ${fallbackUrl}`);
      return { imageUrl: fallbackUrl, prompt: "business (fallback)" };
    }

    // All sources failed — compositor will use gradient background
    console.error(
      `[ImageGeneratorAgent] All sources failed for channel ${input.channel} — compositor will use gradient background`,
    );
    return { imageUrl: null, prompt: keywords };
  }

  private async fetchImageUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (!res.ok) {
        console.error(`[ImageGeneratorAgent] HTTP ${res.status} for URL: ${url}`);
        return null;
      }
      // After following the redirect, res.url is the actual Flickr CDN image URL
      return res.url ?? null;
    } catch (err) {
      console.error(`[ImageGeneratorAgent] fetch error for ${url}:`, (err as Error).message);
      return null;
    }
  }

  private buildKeywords(input: ImageInput): string {
    const goalKw = GOAL_KEYWORDS[input.goalType] ?? "marketing,business";
    const channelKw = CHANNEL_KEYWORDS[input.channel] ?? "professional";
    // Combine: e.g. "business,networking,professional,office" → pick first 3 unique
    const parts = `${goalKw},${channelKw}`.split(",").filter(Boolean);
    const unique = [...new Set(parts)].slice(0, 3);
    return unique.join(",");
  }
}
