/**
 * ImageGeneratorAgent — Pollinations.ai implementation
 *
 * Uses the Pollinations.ai API (https://image.pollinations.ai) — free, no API
 * key or account required. Generates AI images via the Flux model from a rich
 * text prompt built from brand + goal + channel context.
 *
 * URL format:
 *   https://image.pollinations.ai/prompt/{encoded_prompt}
 *     ?width={w}&height={h}&nologo=true&model=flux&seed={seed}
 *
 * The URL itself is the stable image link — Pollinations caches and serves the
 * result at that URL, so we store it directly in assets.imageUrl.
 *
 * No env vars required. Falls back to a generic prompt if the first attempt
 * fails; compositor gradient background is the final fallback.
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
  imageUrl: string | null; // Pollinations URL (null if all attempts failed)
  prompt: string;          // Text prompt sent to Pollinations
}

// ── Channel dimensions ────────────────────────────────────────────────────────

const CHANNEL_DIMS: Record<string, { w: number; h: number }> = {
  instagram: { w: 1080, h: 1080 },
  linkedin:  { w: 1200, h: 627  },
  twitter:   { w: 1600, h: 900  },
  facebook:  { w: 1200, h: 630  },
  email:     { w: 600,  h: 200  },
  tiktok:    { w: 1080, h: 1920 },
  blog:      { w: 1200, h: 630  },
};

// ── Channel visual style guidance ─────────────────────────────────────────────

const CHANNEL_STYLE: Record<string, string> = {
  linkedin:  "professional corporate photography, clean modern office, business aesthetic, natural lighting",
  twitter:   "bold graphic scene, high contrast, tech-forward, dynamic composition",
  instagram: "lifestyle photography, vibrant colours, aesthetically pleasing, editorial quality, golden hour",
  facebook:  "warm authentic photography, community feel, relatable people, candid moment",
  tiktok:    "dynamic energetic scene, bright saturated colours, youth-oriented, creative visual",
  email:     "clean minimal banner, soft background, professional, uncluttered",
  blog:      "editorial photography, thought leadership, clean desk, books, focused workspace",
};

// ── Goal-type visual direction ────────────────────────────────────────────────

const GOAL_STYLE: Record<string, string> = {
  leads:       "professional handshake, business meeting, networking, confident",
  awareness:   "wide aspirational scene, brand-forward, memorable visual",
  event:       "conference stage, audience, celebration, spotlight",
  product:     "studio product photography, clean white background, sharp detail",
  traffic:     "digital interface, glowing screen, modern technology, code",
  social:      "diverse smiling group, community gathering, authentic connection",
  conversions: "success moment, achievement, upward growth, celebration",
};

// ── Seed: stable integer derived from brand + channel ─────────────────────────
// Keeps the same brand/channel pair consistent across pipeline retries.

function stableSeed(brandName: string, channel: string): number {
  let hash = 0;
  const str = `${brandName}:${channel}`;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1_000_000;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ImageGeneratorAgent {
  async generate(input: ImageInput): Promise<ImageOutput> {
    const dims = CHANNEL_DIMS[input.channel] ?? { w: 1200, h: 630 };
    const prompt = this.buildPrompt(input);
    const seed = stableSeed(input.brandName, input.channel);

    const url = this.pollinationsUrl(prompt, dims, seed);

    console.info(
      `[ImageGeneratorAgent] Pollinations.ai — channel: ${input.channel}, size: ${dims.w}x${dims.h}, seed: ${seed}, prompt: "${prompt.slice(0, 100)}…"`,
    );

    const imageUrl = await this.verify(url);
    if (imageUrl) {
      console.info(`[ImageGeneratorAgent] Image ready: ${imageUrl.slice(0, 80)}…`);
      return { imageUrl, prompt };
    }

    // Fallback: simpler generic prompt
    const fallbackPrompt = `professional marketing visual for ${input.channel}, clean minimal, photorealistic, no text, no logos`;
    const fallbackUrl = this.pollinationsUrl(fallbackPrompt, dims, seed + 1);
    console.warn(`[ImageGeneratorAgent] Primary prompt failed — trying fallback`);

    const fallbackImageUrl = await this.verify(fallbackUrl);
    if (fallbackImageUrl) {
      console.info(`[ImageGeneratorAgent] Fallback image ready: ${fallbackImageUrl.slice(0, 80)}…`);
      return { imageUrl: fallbackImageUrl, prompt: fallbackPrompt };
    }

    // Both failed — compositor will use gradient background
    console.error(`[ImageGeneratorAgent] All attempts failed for ${input.channel} — compositor will use gradient`);
    return { imageUrl: null, prompt };
  }

  private pollinationsUrl(
    prompt: string,
    dims: { w: number; h: number },
    seed: number,
  ): string {
    const params = new URLSearchParams({
      width:   String(dims.w),
      height:  String(dims.h),
      nologo:  "true",
      model:   "flux",
      seed:    String(seed),
    });
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
  }

  /**
   * Verify the Pollinations URL is reachable and returns an image.
   * Returns the URL itself on success (Pollinations caches at that URL),
   * or null if the request failed or timed out.
   */
  private async verify(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000); // 30s

      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[ImageGeneratorAgent] HTTP ${res.status} from Pollinations`);
        return null;
      }

      // Drain the body so the connection is released, then return the URL
      await res.arrayBuffer();
      return url;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.error(`[ImageGeneratorAgent] Pollinations request timed out (30s)`);
      } else {
        console.error(`[ImageGeneratorAgent] fetch error:`, (err as Error).message);
      }
      return null;
    }
  }

  private buildPrompt(input: ImageInput): string {
    const channelStyle = CHANNEL_STYLE[input.channel] ?? "professional marketing visual";
    const goalStyle    = GOAL_STYLE[input.goalType]   ?? "business, marketing, professional";

    // Incorporate brand description if short enough to be useful
    const brandCtx = input.brandDescription
      ? input.brandDescription.slice(0, 120)
      : input.brandName;

    // Append primary colour hint if available
    const colorHint = input.brandBrief?.primaryColor
      ? `, accent colour ${input.brandBrief.primaryColor}`
      : "";

    return [
      brandCtx,
      goalStyle,
      channelStyle,
      "photorealistic, high quality, 4k",
      "no text overlays, no logos, no watermarks",
      colorHint,
    ]
      .filter(Boolean)
      .join(", ");
  }
}
