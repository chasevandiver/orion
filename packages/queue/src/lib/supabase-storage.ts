import { createClient } from "@supabase/supabase-js";

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Upload a pipeline-generated image to the `assets` Supabase bucket.
 * Path: {assetId}.png
 * Returns the public URL.
 */
export async function uploadGeneratedImage(
  assetId: string,
  imageBuffer: Buffer,
): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.info(
    `[supabase-storage] uploadGeneratedImage — SUPABASE_URL ${url ? url.slice(0, 30) + "…" : "MISSING"} | SUPABASE_SERVICE_KEY ${key ? "SET (" + key.slice(0, 8) + "…)" : "MISSING"}`,
  );

  const supabase = getClient();
  const filePath = `${assetId}.png`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(filePath, imageBuffer, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Failed to upload generated image: ${error.message}`);

  const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
  return data.publicUrl;
}
