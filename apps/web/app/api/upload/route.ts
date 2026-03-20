// ── Load env vars from monorepo root BEFORE handler runs ─────────────────────
// Next.js only auto-loads .env.local from apps/web/, not the monorepo root.
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

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
 * Accepts a multipart/form-data file upload and stores it using the first
 * available storage strategy:
 *
 *   1. Supabase Storage — if SUPABASE_URL + SUPABASE_SERVICE_KEY are set.
 *      Returns a full HTTPS Supabase public URL.
 *
 *   2. (Future) S3 — if AWS_S3_BUCKET + AWS credentials are set.
 *
 *   3. Local filesystem — development fallback when no cloud provider is
 *      configured. Saves to apps/web/public/uploads/{orgId}/{uuid}.{ext},
 *      served by Next.js static file serving as /uploads/{orgId}/{filename}.
 *      NOTE: Local URLs cannot be used by external APIs (e.g. Claude vision)
 *      that require public HTTPS URLs. Configure Supabase for production use.
 *
 * Returns { url: string }.
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "svg"]);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Accepted: jpg, jpeg, png, svg, webp" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── Strategy 1: Supabase Storage ──────────────────────────────────────────
  if (supabaseUrl && serviceKey) {
    console.info(
      `[upload] Using Supabase Storage (${supabaseUrl.slice(0, 30)}…)`,
    );

    const bucket = "uploads";
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
      console.error(`[upload] Supabase error ${uploadRes.status}: ${errBody}`);
      return NextResponse.json(
        { error: `Upload failed: ${uploadRes.status} — check Supabase bucket permissions` },
        { status: 500 },
      );
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
    console.info(`[upload] Stored via Supabase: ${publicUrl}`);
    return NextResponse.json({ url: publicUrl });
  }

  // ── Strategy 2: S3 ────────────────────────────────────────────────────────
  // TODO: add S3 path here when AWS_S3_BUCKET + AWS credentials are available.

  // ── Strategy 3: Local filesystem (development only) ───────────────────────
  // Saves to {cwd}/public/uploads/{orgId}/{uuid}.{ext} and returns a relative
  // URL served by Next.js static file serving.
  //
  // WARNING: process.cwd() in Next.js route handlers is the apps/web directory.
  //
  // NOTE: These relative URLs will NOT work with external APIs (Anthropic vision,
  // image compositor when called from outside localhost, etc.). Set SUPABASE_URL
  // and SUPABASE_SERVICE_KEY to enable cloud storage.
  console.warn(
    "[upload] ⚠️  No cloud storage provider configured — falling back to local filesystem. " +
    "This is not suitable for production.",
  );

  // orgId comes from the middleware-injected x-org-id header (set via NextResponse.next())
  const rawOrgId = req.headers.get("x-org-id") ?? "misc";
  const orgId = rawOrgId.replace(/[^a-zA-Z0-9-]/g, "");
  const uploadsDir = path.join(process.cwd(), "public", "uploads", orgId);

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  } catch (err) {
    console.error("[upload] Local filesystem write failed:", err);
    return NextResponse.json(
      { error: "Upload failed: could not write to local filesystem. Check directory permissions." },
      { status: 500 },
    );
  }

  const url = `/uploads/${orgId}/${filename}`;
  console.info(`[upload] Stored locally: ${url}`);
  return NextResponse.json({ url });
}
