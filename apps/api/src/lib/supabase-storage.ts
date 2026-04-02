import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

function getClient() {
  const url = process.env.SUPABASE_URL;
  // Accept either SUPABASE_SERVICE_KEY or the Supabase-standard SUPABASE_SERVICE_ROLE_KEY
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function hasSupabaseConfig(): boolean {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && key);
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mimeType] ?? "png";
}

/** Save logo to apps/web/public/uploads/{orgId}/logo.{ext} (dev fallback). */
async function uploadLogoLocal(
  orgId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const ext = extFromMime(mimeType);
  const filename = `logo.${ext}`;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // apps/api/src/lib → 4 levels up = monorepo root → apps/web/public/uploads
  const uploadsDir = path.resolve(__dirname, "../../../../apps/web/public/uploads", orgId);
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), fileBuffer);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/uploads/${orgId}/${filename}`;
}

/**
 * Upload an org logo to the `logos` bucket.
 * Path: logos/{orgId}/logo.{ext}
 * Returns the public URL.
 */
export async function uploadLogo(
  orgId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!hasSupabaseConfig()) {
    console.warn("[storage] No Supabase config — falling back to local filesystem for logo upload.");
    return uploadLogoLocal(orgId, fileBuffer, mimeType);
  }

  const supabase = getClient();
  const ext = extFromMime(mimeType);
  const filePath = `${orgId}/logo.${ext}`;

  const { error } = await supabase.storage
    .from("logos")
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Failed to upload logo: ${error.message}`);

  const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
  return data.publicUrl;
}

// ── Image dimension extraction (no external deps) ─────────────────────────────

export function getImageDimensions(
  buf: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png") {
      if (buf.length < 24) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      let i = 2; // skip 0xFF 0xD8
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) break;
        const m = buf[i + 1]!;
        if (m === 0xFF) { i++; continue; }
        const segLen = buf.readUInt16BE(i + 2);
        if (
          (m >= 0xC0 && m <= 0xC3) ||
          (m >= 0xC5 && m <= 0xC7) ||
          (m >= 0xC9 && m <= 0xCB) ||
          (m >= 0xCD && m <= 0xCF)
        ) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + segLen;
      }
      return null;
    }
    if (mimeType === "image/webp") {
      if (buf.length < 30) return null;
      const chunk = buf.slice(12, 16).toString("ascii");
      if (chunk === "VP8X") {
        return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      }
      if (chunk === "VP8L") {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
      }
      if (chunk.startsWith("VP8 ")) {
        const w = (buf.readUInt16LE(26) & 0x3FFF) + 1;
        const h = (buf.readUInt16LE(28) & 0x3FFF) + 1;
        return { width: w, height: h };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Save media to apps/web/public/uploads/{orgId}/media/ (dev fallback). */
async function uploadMediaLocal(
  orgId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const ext = extFromMime(mimeType) || filename.split(".").pop() || "bin";
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const uploadsDir = path.resolve(__dirname, "../../../../apps/web/public/uploads", orgId, "media");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const dest = path.join(uploadsDir, safeName);
  fs.writeFileSync(dest, fileBuffer);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/uploads/${orgId}/media/${safeName}`;
}

/**
 * Upload a media library asset to the `media` Supabase bucket.
 * Path: media/{orgId}/{timestamp}-{filename}
 * Returns the public URL.
 */
export async function uploadMediaAsset(
  orgId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!hasSupabaseConfig()) {
    console.warn("[storage] No Supabase config — falling back to local filesystem for media upload.");
    return uploadMediaLocal(orgId, filename, fileBuffer, mimeType);
  }

  const supabase = getClient();
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = `${orgId}/${safeName}`;

  const { error } = await supabase.storage
    .from("media")
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Failed to upload media asset: ${error.message}`);

  const { data } = supabase.storage.from("media").getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Upload a generated image to the `assets` bucket.
 * Path: assets/{assetId}.png
 * Returns the public URL.
 */
export async function uploadGeneratedImage(
  assetId: string,
  imageBuffer: Buffer,
): Promise<string> {
  const supabase = getClient();
  const filePath = `${assetId}.png`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(filePath, imageBuffer, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Failed to upload generated image: ${error.message}`);

  const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
  return data.publicUrl;
}
