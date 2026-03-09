# Image Generation

## Current Implementation: Unsplash Source API (Temporary)

**Status:** Active temporary solution. No API key required.

The `ImageGeneratorAgent` (`packages/agents/src/agents/image-generator.ts`) currently uses the
[Unsplash Source API](https://source.unsplash.com/) to fetch stock photos for campaign assets.

### How it works

1. Keywords are derived from the campaign goal type and channel (e.g., `"business networking professional"` for LinkedIn leads campaigns).
2. A URL is constructed: `https://source.unsplash.com/{width}x{height}/?{keyword}`
3. The redirect is followed to get the final Unsplash photo URL.
4. The URL is stored as `imageUrl` on the asset record.
5. If the primary Unsplash fetch fails, `https://source.unsplash.com/{dims}/?abstract` is used as fallback.
6. If all sources fail, `imageUrl` is set to `null` — the Satori compositor renders a brand-color gradient in this case.

### Attribution

Per Unsplash's free tier terms, a "Photo: Unsplash" attribution label is shown wherever composited images are displayed in the UI (review screen, calendar, etc.).

### Limitations

- No control over exact image content — Unsplash returns relevant but not campaign-specific images.
- Rate limited by Unsplash (unknown limits for Source API).
- Images may change on each fetch (not cached by default).

---

## Restoring AI Image Generation (DALL-E / Fal.ai)

### Option A: Restore Fal.ai Flux Schnell (recommended)

1. In `packages/agents/src/agents/image-generator.ts`, restore the Fal.ai implementation:
   ```typescript
   import * as fal from "@fal-ai/serverless-client";
   // ... use fal.subscribe("fal-ai/flux/schnell", { input: { prompt, image_size } })
   ```
2. Add `FAL_KEY` to environment variables.
3. Remove the Unsplash logic.
4. The `imageBuffer` is no longer needed — store just the `imageUrl` from Fal CDN.

### Option B: OpenAI DALL-E 3

1. In `packages/agents/src/agents/image-generator.ts`, use the `openai` SDK:
   ```typescript
   import OpenAI from "openai";
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
   const response = await openai.images.generate({ model: "dall-e-3", prompt, size: "1024x1024" });
   const imageUrl = response.data[0].url;
   ```
2. Add `OPENAI_API_KEY` to environment variables (requires paid plan for image generation).
3. Update `ImageOutput` to use `imageUrl: string | null` (no `imageBuffer`).
4. Note: `gpt-image-1` (Images API) requires organization verification for free tier access.

---

_Last updated: 2026-03-08_
