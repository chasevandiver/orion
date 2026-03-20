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
