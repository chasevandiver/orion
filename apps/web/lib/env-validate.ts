/**
 * Web app environment validator — standalone, no cross-app imports.
 * Called from apps/web/instrumentation.ts at server boot.
 */

const REQUIRED: Array<{ key: string; description: string; hint?: string }> = [
  {
    key: "DATABASE_URL",
    description: "PostgreSQL connection string",
    hint: "Local: postgresql://orion:orion_dev_password@localhost:5432/orion_dev",
  },
  {
    key: "ANTHROPIC_API_KEY",
    description: "Anthropic API key — server-side only, never use NEXT_PUBLIC_ prefix",
    hint: "Get from https://console.anthropic.com",
  },
  {
    key: "NEXTAUTH_SECRET",
    description: "Secret for Auth.js session signing",
    hint: "Generate: openssl rand -base64 32",
  },
  {
    key: "NEXTAUTH_URL",
    description: "Full public URL of this Next.js app",
    hint: "Local: http://localhost:3000",
  },
  {
    key: "TOKEN_ENCRYPTION_KEY",
    description: "64-char hex string for AES-256 OAuth token encryption",
    hint: "Generate: openssl rand -hex 32",
  },
];

export function validateEnv(_target?: string): void {
  const missing = REQUIRED.filter((v) => {
    const val = process.env[v.key];
    return !val || val.trim() === "";
  });

  if (missing.length === 0) return;

  console.error("\n❌ ORION Web: Missing required environment variables:\n");
  for (const v of missing) {
    console.error(`  ${v.key}: ${v.description}`);
    if (v.hint) console.error(`    → ${v.hint}`);
  }
  console.error("\nCopy .env.example to .env.local and fill in the required values.\n");
  process.exit(1);
}
