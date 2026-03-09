import * as fal from "@fal-ai/serverless-client";
import type { BrandBrief } from "./strategist.js";

export interface ImageInput {
  brandName: string;
  channel: string;
  goalType: string;
  brandDescription?: string;
  primaryColor?: string;
  voiceTone?: string;
  products?: Array<{ name: string; description: string }>;
  brandBrief?: BrandBrief;
}

export interface ImageOutput {
  imageUrl: string;    // Fal.ai CDN URL (original remote URL)
  imageBuffer: Buffer; // raw PNG bytes — caller should upload to persistent storage
  prompt: string;      // prompt sent to the model
}

// Map channel to Fal image_size parameter
const FAL_IMAGE_SIZE: Record<string, string> = {
  instagram: "square_hd",
  linkedin: "landscape_16_9",
  twitter: "landscape_16_9",
  facebook: "landscape_16_9",
  email: "landscape_16_9",
  tiktok: "square_hd",
  blog: "landscape_16_9",
};

const FAL_MODEL = "fal-ai/flux/schnell";

export class ImageGeneratorAgent {
  async generate(input: ImageInput): Promise<ImageOutput> {
    const prompt = this.buildPrompt(input);
    const imageSize = FAL_IMAGE_SIZE[input.channel] ?? "square_hd";

    // Re-configure on every call so late-loaded env vars (e.g. dotenv) are picked up.
    fal.config({ credentials: process.env.FAL_KEY });

    console.info(`[ImageGeneratorAgent] Starting — channel: ${input.channel}, model: ${FAL_MODEL}, size: ${imageSize}`);

    let falImageUrl: string;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Fal.ai timed out after 60s for channel: ${input.channel}`)),
          60_000,
        )
      );

      console.info("Starting Fal image generation for channel:", input.channel);
      const result = await Promise.race([
        fal.subscribe(FAL_MODEL, {
          input: {
            prompt,
            image_size: imageSize,
            num_inference_steps: 4,
            num_images: 1,
          },
        }),
        timeout,
      ]);

      console.info("[fal-response] raw result:", JSON.stringify(result, null, 2));

      // @fal-ai/serverless-client v0.15.x wraps the model output in { data, requestId }.
      // The actual Flux Schnell payload is at result.data.images[0].url.
      const falData = (result as any)?.data ?? result;
      const falResult = falData as { images: Array<{ url: string }> };
      falImageUrl = falResult.images?.[0]?.url ?? "";
      if (!falImageUrl) throw new Error("Fal.ai returned no image URL in response");
    } catch (err) {
      console.error(`[ImageGeneratorAgent] Generation failed for channel ${input.channel}:`, err);
      throw err;
    }

    // Fetch the remote image and convert to Buffer
    const imageRes = await fetch(falImageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to download Fal.ai image: HTTP ${imageRes.status}`);
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    console.info(`[ImageGeneratorAgent] Done — channel: ${input.channel}, model: ${FAL_MODEL}, bytes: ${imageBuffer.byteLength}`);

    return { imageUrl: falImageUrl, imageBuffer, prompt };
  }

  private buildPrompt(input: ImageInput): string {
    const b = input.brandBrief;

    // Strip sentences that look like marketing copy (contain quotes or ALL-CAPS headline patterns)
    function sanitize(text: string): string {
      return text
        .split(/[.!?]+/)
        .filter((sentence) => {
          const s = sentence.trim();
          if (!s) return false;
          if (/["'""'']/.test(s)) return false;
          if (/[A-Z]{3,}\s+[A-Z]{3,}/.test(s)) return false;
          return true;
        })
        .join(". ")
        .trim();
    }

    const brandDesc = input.brandDescription ? sanitize(input.brandDescription) : "";

    const colorLine = (b?.primaryColor ?? input.primaryColor)
      ? `Color palette accent: ${b?.primaryColor ?? input.primaryColor}.`
      : "";

    const toneLine = input.voiceTone
      ? `Visual atmosphere: ${sanitize(input.voiceTone)}.`
      : "";

    const moodLine = b?.extractedMood
      ? `Mood: ${sanitize(b.extractedMood)}.`
      : "";

    const styleLine = b?.extractedStyle
      ? `Visual style: ${sanitize(b.extractedStyle)}.`
      : "";

    return `
Professional marketing photography for ${input.channel} platform.
${brandDesc ? `Brand context: ${brandDesc}` : ""}
Marketing goal: ${input.goalType}.
${colorLine}
${toneLine}
${moodLine}
${styleLine}
Style: Clean, modern, commercial-quality photography or digital art.
High-quality photorealistic scene with beautiful lighting, depth, and composition.
Cinematic quality, suitable for a professional ${input.channel} marketing campaign.
No text, no words, no letters, no typography, no signs, no labels, no captions anywhere in the image.
    `.trim();
  }
}
