/**
 * ImageGeneratorAgent — Fal.ai (primary) → Pollinations.ai (secondary) fallback
 *
 * Primary:   Fal.ai flux/dev (requires FAL_KEY env var)
 * Secondary: Pollinations.ai (free, no key) — https://image.pollinations.ai
 * Tertiary:  null — compositor will generate a branded gradient+pattern graphic
 *
 * Returns imageUrl (null on full fallback) and imageSource to track which path was used.
 */

import * as fal from "@fal-ai/serverless-client";

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

export type ImageSource = "fal" | "pollinations" | "brand-graphic";

export interface ImageOutput {
  imageUrl: string | null;
  prompt: string;
  imageSource: ImageSource;
}

// ── Channel dimensions ────────────────────────────────────────────────────────

const CHANNEL_DIMS: Record<string, { w: number; h: number }> = {
  instagram: { w: 1080, h: 1080 },
  linkedin:  { w: 1200, h: 627  },
  twitter:   { w: 1600, h: 900  },
  facebook:  { w: 1200, h: 630  },
  email:     { w: 600,  h: 200  },
  tiktok:           { w: 1080, h: 1920 },
  blog:             { w: 1200, h: 630  },
  google_business:  { w: 1200, h: 900  },
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

    // ── Primary: Fal.ai ───────────────────────────────────────────────────────
    if (process.env.FAL_KEY) {
      const falResult = await this.tryFal(prompt, dims, input);
      if (falResult) {
        console.info(`[ImageGeneratorAgent] Fal.ai succeeded for ${input.channel}`);
        return { imageUrl: falResult, prompt, imageSource: "fal" };
      }
      console.warn(`[ImageGeneratorAgent] Fal.ai failed — falling back to stock photo`);
    }

    // ── Secondary: Unsplash (curated category-matched stock photos) ───────────
    const unsplashUrl = this.stockPhotoUrl(input, dims);
    console.info(`[ImageGeneratorAgent] Trying Unsplash stock: ${unsplashUrl}`);
    const unsplashResult = await this.resolveUrl(unsplashUrl);
    if (unsplashResult) {
      console.info(`[ImageGeneratorAgent] Unsplash stock image ready`);
      return { imageUrl: unsplashResult, prompt, imageSource: "pollinations" };
    }

    // ── Tertiary: Picsum (random high-quality photo) ──────────────────────────
    const seed = stableSeed(input.brandName, input.channel);
    const picsumUrl = `https://picsum.photos/seed/${seed}/${dims.w}/${dims.h}`;
    console.info(`[ImageGeneratorAgent] Trying Picsum: ${picsumUrl}`);
    const picsumResult = await this.resolveUrl(picsumUrl);
    if (picsumResult) {
      console.info(`[ImageGeneratorAgent] Picsum image ready`);
      return { imageUrl: picsumResult, prompt, imageSource: "pollinations" };
    }

    // ── Quaternary: compositor will generate branded gradient graphic ──────────
    console.error(
      `[ImageGeneratorAgent] All attempts failed for ${input.channel} — compositor will use brand graphic`,
    );
    return { imageUrl: null, prompt, imageSource: "brand-graphic" };
  }

  // ── Fal.ai ─────────────────────────────────────────────────────────────────

  private async tryFal(
    prompt: string,
    dims: { w: number; h: number },
    input: ImageInput,
  ): Promise<string | null> {
    try {
      fal.config({ credentials: process.env.FAL_KEY });

      // Map channel dims to nearest Fal aspect ratio option
      const ratio = dims.w / dims.h;
      const imageSize =
        ratio > 1.5 ? "landscape_16_9" :
        ratio > 1.1 ? "landscape_4_3" :
        ratio < 0.7 ? "portrait_16_9" :
        "square_hd";

      type FalResult = { images: Array<{ url: string }> };
      const result = await (fal.subscribe("fal-ai/flux/schnell", {
        input: {
          prompt,
          image_size: imageSize,
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
          seed: Math.floor(Math.random() * 1_000_000),
        },
      }) as Promise<FalResult>);

      const url = result?.images?.[0]?.url ?? null;
      if (!url) throw new Error("No image in Fal response");
      return url;
    } catch (err) {
      console.error(`[ImageGeneratorAgent] Fal.ai error:`, (err as Error).message);
      return null;
    }
  }

  // ── Unsplash curated stock photos ──────────────────────────────────────────

  /** Returns a direct Unsplash CDN URL for a curated, brand-relevant photo. */
  private stockPhotoUrl(input: ImageInput, dims: { w: number; h: number }): string {
    const ids = this.stockPhotoIds(input);
    const seed = stableSeed(input.brandName, input.channel);
    const id = ids[seed % ids.length];
    return `https://images.unsplash.com/photo-${id}?w=${dims.w}&h=${dims.h}&fit=crop&auto=format&q=80`;
  }

  /** Curated Unsplash photo IDs keyed by industry/goal category. */
  private stockPhotoIds(input: ImageInput): string[] {
    const INDUSTRY_PHOTOS: Array<{ terms: string[]; ids: string[] }> = [
      {
        terms: ["golf", "golfer", "pga", "fairway", "birdie", "par", "caddie", "putt", "tee", "iron", "wedge", "chip"],
        ids: [
          "1535131749006-b7f58c99034b", // golfer mid-swing on course
          "1593111774240-d529f12cf4bb", // golf course green
          "1508739773434-c26b3d09e071", // golf ball close-up
        ],
      },
      {
        terms: ["football", "nfl", "quarterback", "touchdown", "gridiron"],
        ids: [
          "1566577739112-5180d4bf9390", // football stadium
          "1560272564-d83e3e21d35c", // game day crowd
          "1574629810360-7efbbe195018", // football action
        ],
      },
      {
        terms: ["basketball", "nba", "hoops", "dunk", "court"],
        ids: [
          "1546519638-68e109498ffc", // basketball game
          "1574623452334-1e0ac2b3ccb4", // player dribbling
        ],
      },
      {
        terms: ["baseball", "mlb", "pitcher", "homerun", "batting"],
        ids: [
          "1471295253337-3ceaaedca402", // pitcher wind-up
        ],
      },
      {
        terms: ["soccer", "fifa", "striker", "goal", "pitch"],
        ids: [
          "1553778263-73a83bab9b0c", // soccer stadium
          "1574629810360-7efbbe195018", // sports action
        ],
      },
      {
        terms: ["fantasy", "league", "pickem", "bracket", "draft", "wager", "bet", "compete", "tournament"],
        ids: [
          "1517649763962-0c623066013b", // competitive sports cycling
          "1557804506-669a67965ba0", // scoreboard / competition
        ],
      },
      {
        terms: ["fitness", "gym", "workout", "training", "exercise", "yoga", "wellness"],
        ids: [
          "1571019613454-1cb2f99b2d8b", // gym workout
          "1517836357463-d25dfeac3438", // weightlifting
          "1549060279-7e168fcee0c2", // running track
          "1544367567-0f2fcb009e0b", // yoga
        ],
      },
      {
        terms: ["food", "restaurant", "dining", "cuisine", "chef", "cooking", "recipe"],
        ids: [
          "1414235077428-338989a2e8c0", // fine dining
          "1504674900247-0877df9cc836", // food spread
          "1556909114-f6e7ad7d3136", // chef cooking
        ],
      },
      {
        terms: ["tech", "software", "app", "saas", "startup", "ai", "code", "developer"],
        ids: [
          "1518770660439-4636190af475", // circuit board tech
          "1531297484001-80022131f5a1", // dark laptop coding
          "1461749280684-dccba630e2f6", // code on screen
        ],
      },
      {
        terms: ["real estate", "property", "home", "house", "realty", "mortgage"],
        ids: [
          "1560518883-ce09059eeffa", // modern home exterior
          "1568605114967-8130f3a36994", // luxury house
        ],
      },
      {
        terms: ["fashion", "style", "clothing", "apparel", "wear", "outfit"],
        ids: [
          "1558618666-fcd25c85cd64", // fashion shoot
          "1509631179647-0177331693ae", // clothing display
        ],
      },
      {
        terms: ["travel", "hotel", "vacation", "destination", "tourism", "flight"],
        ids: [
          "1506905925346-21bda4d32df4", // mountain landscape
          "1501854140801-50d01698950b", // scenic hills
          "1476514525535-07fb3b4ae5f1", // travel destination
          "1469474968028-56623f02e42e", // scenic overlook
        ],
      },
      {
        terms: ["finance", "investment", "money", "wealth", "trading", "stock"],
        ids: [
          "1556761175-b413da4baf72", // open office finance
          "1444653614773-995cb1ef9efa", // charts / financial
          "1611974789855-9c2a0a7236a3", // trading screens
        ],
      },
      {
        terms: ["music", "band", "concert", "artist", "album", "studio"],
        ids: [
          "1511671782779-c97d3d27a1d4", // recording studio
          "1493225457124-a3eb161ffa5f", // live performance
        ],
      },
    ];

    const haystack = `${input.brandName} ${input.brandDescription ?? ""}`.toLowerCase();

    for (const { terms, ids } of INDUSTRY_PHOTOS) {
      if (terms.some((t) => haystack.includes(t))) {
        return ids;
      }
    }

    // Generic fallback: goal-type based
    const GOAL_PHOTOS: Record<string, string[]> = {
      leads:       ["1552664730-d307ca884978", "1556761175-b413da4baf72"], // team/office
      awareness:   ["1552664730-d307ca884978", "1517649763962-0c623066013b"],
      event:       ["1515187029135-18ee286d815b", "1540575467063-178a50c2df87"], // conference/event
      product:     ["1491553895911-0055eca6402d", "1560518883-ce09059eeffa"],
      traffic:     ["1518770660439-4636190af475", "1531297484001-80022131f5a1"],
      social:      ["1521737711867-e3b97375f902", "1552664730-d307ca884978"], // community/group
      conversions: ["1552664730-d307ca884978", "1571019613454-1cb2f99b2d8b"],
    };

    return GOAL_PHOTOS[input.goalType] ?? ["1552664730-d307ca884978", "1506905925346-21bda4d32df4"];
  }

  /**
   * Fetch a URL following redirects and return the final resolved URL.
   * The pipeline handles local caching — agents just need to return a fetchable URL.
   */
  private async resolveUrl(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[ImageGeneratorAgent] HTTP ${res.status} from ${url}`);
        return null;
      }

      // Drain body (warms any CDN cache), then return the final URL after redirects
      await res.arrayBuffer();
      return res.url ?? url;
    } catch (err) {
      console.error(`[ImageGeneratorAgent] resolveUrl failed for ${url}:`, (err as Error).message);
      return null;
    }
  }

  private buildPrompt(input: ImageInput): string {
    const channelStyle = CHANNEL_STYLE[input.channel] ?? "professional marketing visual";
    const goalStyle    = GOAL_STYLE[input.goalType]   ?? "business, marketing, professional";

    const brandCtx = input.brandDescription
      ? input.brandDescription.slice(0, 120)
      : input.brandName;

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
