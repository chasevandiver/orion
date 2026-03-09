import { createClient } from "@supabase/supabase-js";

function getClient() {
  const url = process.env.SUPABASE_URL;
  // Accept either SUPABASE_SERVICE_KEY or the Supabase-standard SUPABASE_SERVICE_ROLE_KEY
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return map[mimeType] ?? "png";
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
