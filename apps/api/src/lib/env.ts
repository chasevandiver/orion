/**
 * Environment variable validation.
 *
 * Call validateEnv() at application startup (before any other imports that
 * consume env vars). If required variables are missing, the process exits
 * immediately with a descriptive error listing exactly what is missing and
 * where to get the values.
 *
 * Usage:
 *   import { validateEnv } from "./lib/env.js";
 *   validateEnv(); // call at top of apps/api/src/index.ts
 */

interface EnvVar {
  key: string;
  description: string;
  howToGet?: string;
  required: boolean;
}

const API_ENV_VARS: EnvVar[] = [
  {
    key: "DATABASE_URL",
    description: "PostgreSQL connection string",
    howToGet: "Local: postgresql://orion:orion_dev_password@localhost:5432/orion_dev",
    required: true,
  },
  {
    key: "ANTHROPIC_API_KEY",
    description: "Anthropic API key for AI agents",
    howToGet: "https://console.anthropic.com",
    required: true,
  },
  {
    key: "TOKEN_ENCRYPTION_KEY",
    description: "64-char hex key for OAuth token encryption",
    howToGet: "Generate: openssl rand -hex 32",
    required: true,
  },
  {
    key: "NEXTAUTH_SECRET",
    description: "Secret for Auth.js JWT signing",
    howToGet: "Generate: openssl rand -base64 32",
    required: true,
  },
  {
    key: "STRIPE_SECRET_KEY",
    description: "Stripe secret key for billing",
    howToGet: "https://dashboard.stripe.com/test/apikeys",
    required: false, // Non-blocking — billing features degrade gracefully
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    description: "Stripe webhook signing secret",
    howToGet: "Stripe dashboard → Webhooks → your endpoint → Signing secret",
    required: false,
  },
  {
    key: "REDIS_URL",
    description: "Redis connection URL for rate limiting and caching",
    howToGet: "Local: redis://:orion_redis_password@localhost:6379",
    required: false, // Falls back to in-memory (not suitable for production)
  },
  {
    key: "INNGEST_EVENT_KEY",
    description: "Inngest event key",
    howToGet: "Local: use 'local'. Production: Inngest dashboard",
    required: false,
  },
];

const WEB_ENV_VARS: EnvVar[] = [
  {
    key: "DATABASE_URL",
    description: "PostgreSQL connection string",
    required: true,
  },
  {
    key: "ANTHROPIC_API_KEY",
    description: "Anthropic API key — SERVER SIDE ONLY, never prefix with NEXT_PUBLIC_",
    required: true,
  },
  {
    key: "NEXTAUTH_SECRET",
    description: "Secret for Auth.js JWT signing",
    howToGet: "Generate: openssl rand -base64 32",
    required: true,
  },
  {
    key: "NEXTAUTH_URL",
    description: "Full URL of the Next.js application",
    howToGet: "Local: http://localhost:3000",
    required: true,
  },
  {
    key: "TOKEN_ENCRYPTION_KEY",
    description: "64-char hex key for OAuth token encryption",
    required: true,
  },
];

export type AppTarget = "api" | "web";

export function validateEnv(target: AppTarget = "api"): void {
  const vars = target === "api" ? API_ENV_VARS : WEB_ENV_VARS;
  const missing: EnvVar[] = [];
  const warnings: EnvVar[] = [];

  for (const v of vars) {
    const value = process.env[v.key];
    if (!value || value.trim() === "") {
      if (v.required) {
        missing.push(v);
      } else {
        warnings.push(v);
      }
    }
  }

  // Print warnings for optional vars
  if (warnings.length > 0) {
    console.warn("\n⚠️  ORION: Optional environment variables not set:");
    for (const v of warnings) {
      console.warn(`   ${v.key} — ${v.description}`);
      if (v.howToGet) console.warn(`     → ${v.howToGet}`);
    }
    console.warn("");
  }

  // Hard fail for required vars
  if (missing.length > 0) {
    console.error("\n❌ ORION: Required environment variables are missing. Cannot start.\n");
    for (const v of missing) {
      console.error(`   MISSING: ${v.key}`);
      console.error(`     ${v.description}`);
      if (v.howToGet) console.error(`     → ${v.howToGet}`);
      console.error("");
    }
    console.error("Copy .env.example to .env.local and fill in the required values.\n");
    process.exit(1);
  }

  // Extra validation for known format requirements
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (tokenKey && tokenKey.length !== 64) {
    console.error(
      `❌ TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
      `Got ${tokenKey.length} characters.\n` +
      `Generate with: openssl rand -hex 32`,
    );
    process.exit(1);
  }
}
