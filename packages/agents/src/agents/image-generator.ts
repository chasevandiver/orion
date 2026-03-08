import OpenAI from "openai";
import fs from "fs";
import path from "path";
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
  imageUrl: string; // local path e.g. /generated/abc123.png
  prompt: string;   // prompt sent to the model
}

// Landscape for Twitter/LinkedIn, square for Instagram/Facebook/TikTok
const DALL_E_SIZE: Record<string, "1024x1024" | "1792x1024"> = {
  linkedin: "1792x1024",
  twitter: "1792x1024",
  instagram: "1024x1024",
  facebook: "1024x1024",
  tiktok: "1024x1024",
  email: "1792x1024",
  blog: "1792x1024",
};

// gpt-image-1 uses different size values (no 1792x1024)
const GPT_IMAGE_SIZE: Record<string, "1024x1024" | "1536x1024"> = {
  linkedin: "1536x1024",
  twitter: "1536x1024",
  instagram: "1024x1024",
  facebook: "1024x1024",
  tiktok: "1024x1024",
  email: "1536x1024",
  blog: "1536x1024",
};

export class ImageGeneratorAgent {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY must be set for image generation");
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generate(input: ImageInput): Promise<ImageOutput> {
    const prompt = this.buildPrompt(input);
    let buffer: Buffer;
    let revisedPrompt = prompt;

    // Try gpt-image-1 first, fall back to dall-e-3
    try {
      const size = GPT_IMAGE_SIZE[input.channel] ?? "1024x1024";
      const response = await this.openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size,
      } as any);

      const b64 = (response.data[0] as any)?.b64_json as string | undefined;
      if (!b64) throw new Error("gpt-image-1 returned no image data");
      buffer = Buffer.from(b64, "base64");
    } catch {
      // Fallback to dall-e-3
      const size = DALL_E_SIZE[input.channel] ?? "1024x1024";
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
        quality: "standard",
        response_format: "url",
      } as any);

      const url = (response.data[0] as any)?.url as string | undefined;
      if (!url) throw new Error("DALL-E returned no image URL");
      revisedPrompt = (response.data[0] as any)?.revised_prompt ?? prompt;

      const imageRes = await fetch(url);
      if (!imageRes.ok) throw new Error(`Failed to download generated image: ${imageRes.status}`);
      buffer = Buffer.from(await imageRes.arrayBuffer());
    }

    // Write to Next.js public/generated/ — served as static assets
    // NOTE: For production deployments (Vercel etc.), replace with S3/R2 upload
    const dir = path.join(process.cwd(), "public", "generated");
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    fs.writeFileSync(path.join(dir, filename), buffer);

    return { imageUrl: `/generated/${filename}`, prompt: revisedPrompt };
  }

  private buildPrompt(input: ImageInput): string {
    const b = input.brandBrief;
    const productLine = input.products?.length
      ? `Products: ${input.products.map((p) => p.name).join(", ")}.`
      : "";

    const colorLine = (b?.primaryColor ?? input.primaryColor)
      ? `Brand color accent: ${b?.primaryColor ?? input.primaryColor}.`
      : "";

    const toneLine = input.voiceTone
      ? `Visual tone: ${input.voiceTone}.`
      : "";

    const moodLine = b?.extractedMood
      ? `Mood: ${b.extractedMood}.`
      : "";

    const styleLine = b?.extractedStyle
      ? `Visual style: ${b.extractedStyle}.`
      : "";

    return `
Professional marketing visual for ${input.brandName}.
${input.brandDescription ? `Brand: ${input.brandDescription}` : ""}
${productLine}
Marketing goal: ${input.goalType}.
Channel: ${input.channel} — optimized for this platform's visual style.
${colorLine}
${toneLine}
${moodLine}
${styleLine}
Style: Clean, modern, commercial-quality marketing graphic. No text overlays.
No logos, no words, no watermarks in the image.
High-quality photorealistic or professional digital art style.
Suitable for a professional ${input.channel} marketing campaign.
    `.trim();
  }
}
