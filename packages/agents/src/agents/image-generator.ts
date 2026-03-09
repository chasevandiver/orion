/**
 * ImageGeneratorAgent — Unsplash Source API implementation
 *
 * TEMPORARY SOLUTION: Uses the Unsplash Source API (free, no API key required)
 * as a replacement for Fal.ai Flux Schnell image generation.
 *
 * To restore AI image generation:
 *   1. Re-implement using `fal` SDK with `fal-ai/flux/schnell` model.
 *   2. Set FAL_KEY (or use openai SDK with images.generate() + OPENAI_API_KEY).
 *   3. Remove the Unsplash fallback below.
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
  imageUrl: string | null; // Resolved Unsplash photo URL (null if all sources failed)
  prompt: string;           // keyword(s) used for Unsplash query
}

// Maps goal type + channel to relevant Unsplash search keywords
const GOAL_KEYWORDS: Record<string, string> = {
  leads:       "business networking professional",
  awareness:   "brand marketing creative",
  event:       "event conference people",
  product:     "product design modern",
  traffic:     "digital technology growth",
  social:      "social media community",
  conversions: "success achievement results",
};

const CHANNEL_KEYWORDS: Record<string, string> = {
  linkedin:  "business professional office",
  twitter:   "technology innovation digital",
  instagram: "lifestyle creative aesthetic",
  facebook:  "community people together",
  tiktok:    "creative video entertainment",
  email:     "business communication professional",
  blog:      "writing content knowledge",
};

// Unsplash Source dimensions per channel
const CHANNEL_DIMS: Record<string, string> = {
  instagram: "1080x1080",
  linkedin:  "1200x627",
  twitter:   "1600x900",
  facebook:  "1200x630",
  email:     "600x200",
  tiktok:    "1080x1080",
  blog:      "1200x630",
};

export class ImageGeneratorAgent {
  async generate(input: ImageInput): Promise<ImageOutput> {
    const keyword = this.buildKeyword(input);
    const dims = CHANNEL_DIMS[input.channel] ?? "1200x630";
    const url = `https://source.unsplash.com/${dims}/?${encodeURIComponent(keyword)}`;

    console.info(`[ImageGeneratorAgent] Fetching Unsplash image — keyword: "${keyword}", channel: ${input.channel}`);

    // Try primary keyword
    const imageUrl = await this.fetchUnsplashUrl(url);
    if (imageUrl) {
      console.info(`[ImageGeneratorAgent] Resolved Unsplash URL: ${imageUrl}`);
      return { imageUrl, prompt: keyword };
    }

    // Fallback to generic "abstract"
    console.warn(`[ImageGeneratorAgent] Primary Unsplash fetch failed, trying fallback`);
    const fallbackUrl = await this.fetchUnsplashUrl(`https://source.unsplash.com/${dims}/?abstract`);
    if (fallbackUrl) {
      console.info(`[ImageGeneratorAgent] Fallback Unsplash URL: ${fallbackUrl}`);
      return { imageUrl: fallbackUrl, prompt: "abstract (fallback)" };
    }

    // All sources failed — return null; compositor handles gracefully
    console.error(`[ImageGeneratorAgent] All Unsplash sources failed for channel ${input.channel}`);
    return { imageUrl: null, prompt: keyword };
  }

  private async fetchUnsplashUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (!res.ok) return null;
      // The final redirected URL is the actual Unsplash photo
      return res.url ?? null;
    } catch (err) {
      console.error(`[ImageGeneratorAgent] fetch error:`, (err as Error).message);
      return null;
    }
  }

  private buildKeyword(input: ImageInput): string {
    const goalKw = GOAL_KEYWORDS[input.goalType] ?? "marketing business";
    const channelKw = CHANNEL_KEYWORDS[input.channel] ?? "professional";
    // Combine goal + channel keywords, take first 2 unique words
    const words = `${goalKw} ${channelKw}`.split(" ").slice(0, 3).join(" ");
    return words;
  }
}
