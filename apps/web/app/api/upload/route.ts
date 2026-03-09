// ── Load env vars from monorepo root BEFORE handler runs ─────────────────────
// Next.js only auto-loads .env.local from apps/web/, not the monorepo root.
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

{
  const __filename = fileURLToPath(import.meta.url);
  // apps/web/app/api/upload/route.ts → root is 5 directories up
  const root = path.resolve(path.dirname(__filename), "../../../../../");
  const envResult = config({ path: path.join(root, ".env.local") });
  config({ path: path.join(root, ".env") });

  // Guaranteed fallback: explicitly write into process.env so the vars are
  // available even if module caching caused dotenv to run after other modules loaded.
  if (envResult.parsed?.SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = envResult.parsed.SUPABASE_URL;
  }
  if (envResult.parsed?.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = envResult.parsed.SUPABASE_SERVICE_KEY;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data file upload and stores it in the Supabase
 * Storage "uploads" bucket (must be created with public access in the
 * Supabase dashboard before use).
 *
 * Returns { url: string } — a full HTTPS Supabase public URL suitable for
 * Claude vision and the compositor. Local/relative URLs are NOT returned
 * because Anthropic's API requires public HTTPS URLs.
 *
 * Required env vars:
 *   SUPABASE_URL            — e.g. https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
 *
 * Supabase setup (one-time, manual):
 *   1. Go to Supabase dashboard → Storage → New bucket
 *   2. Name: "uploads", toggle Public: ON
 *   3. Save
 */

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.info(
    `[upload] SUPABASE_URL ${supabaseUrl ? supabaseUrl.slice(0, 30) + "…" : "MISSING"} | SUPABASE_SERVICE_KEY ${serviceKey ? "SET (" + serviceKey.slice(0, 8) + "…)" : "MISSING"}`,
  );

  if (!supabaseUrl || !serviceKey) {
    console.error("[upload] SUPABASE_URL or SUPABASE_SERVICE_KEY not configured");
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const bucket = "uploads";

  const buffer = await file.arrayBuffer();

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${filename}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: buffer,
    },
  );

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    console.error(
      `[upload] Supabase storage error ${uploadRes.status}: ${errBody}`,
    );
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Supabase public URL format — always HTTPS
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;

  console.info(`[upload] Stored user photo: ${publicUrl}`);
  return NextResponse.json({ url: publicUrl });
}
