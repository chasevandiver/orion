#!/usr/bin/env tsx
/**
 * ORION — Environment Variable Validator
 *
 * Reads .env.local (and falls back to .env) from the project root,
 * then checks every variable the system uses against three tiers:
 *
 *   REQUIRED     — app won't start or core pipeline breaks entirely
 *   RECOMMENDED  — major features disabled without it
 *   OPTIONAL     — nice-to-have; graceful fallback activates automatically
 *
 * Usage:
 *   npm run validate-env
 *   npx tsx scripts/validate-env.ts
 *
 * Exit codes:
 *   0  — OK (including when only optional/recommended vars are missing)
 *   1  — One or more REQUIRED vars are unset
 *
 * Security: this script never prints credential values, only ✅/⚠️/❌ status.
 */

import fs from "fs";
import path from "path";

// ── ANSI colours ─────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
};

const ok    = `${c.green}✅${c.reset}`;
const warn  = `${c.yellow}⚠️ ${c.reset}`;
const fail  = `${c.red}❌${c.reset}`;
const info  = `${c.cyan}ℹ️ ${c.reset}`;

// ── Env file parser ───────────────────────────────────────────────────────────

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

// Load env files (later files don't override earlier ones; process.env wins)
const root = process.cwd();
const envSources = [".env.local", ".env"].map((f) => path.join(root, f));
const fileEnv: Record<string, string> = {};
for (const src of envSources) {
  const parsed = parseEnvFile(src);
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in fileEnv)) fileEnv[k] = v;
  }
}

// Merge: process.env overrides file values (shell exports take precedence)
const env: Record<string, string | undefined> = { ...fileEnv, ...process.env };

// Sentinel values that mean "not actually configured"
const PLACEHOLDER_PATTERNS = [
  /^REPLACE_WITH/i,
  /^sk-ant-\.{3}$/,
  /^sk_test_\.{3}$/,
  /^pk_test_\.{3}$/,
  /^re_\.{3}$/,
  /^whsec_\.{3}$/,
  /^price_\.{3}$/,
];

function isConfigured(key: string): boolean {
  const val = env[key];
  if (!val || val.trim() === "") return false;
  return !PLACEHOLDER_PATTERNS.some((p) => p.test(val.trim()));
}

// ── Variable catalogue ────────────────────────────────────────────────────────

type Tier = "required" | "recommended" | "optional";

interface VarDef {
  key: string;
  impact: string;
}

interface Group {
  name: string;
  tier: Tier;
  vars: VarDef[];
}

const GROUPS: Group[] = [
  {
    name: "Database",
    tier: "required",
    vars: [
      { key: "DATABASE_URL",          impact: "App won't start — DB connection fails at boot" },
    ],
  },
  {
    name: "Auth & Internal Secrets",
    tier: "required",
    vars: [
      { key: "NEXTAUTH_SECRET",        impact: "Sessions cannot be signed — all logins fail" },
      { key: "NEXTAUTH_URL",           impact: "OAuth redirects break; use http://localhost:3000 for dev" },
      { key: "INTERNAL_API_SECRET",    impact: "Next.js → Express proxy auth fails; all API calls return 401" },
      { key: "INTERNAL_RENDER_SECRET", impact: "Compositor endpoint rejects pipeline calls; image generation fails" },
      { key: "TOKEN_ENCRYPTION_KEY",   impact: "OAuth tokens cannot be stored or decrypted; social publishing breaks" },
    ],
  },
  {
    name: "AI (Anthropic)",
    tier: "required",
    vars: [
      { key: "ANTHROPIC_API_KEY",      impact: "Pipeline cannot run — all agent calls fail (strategy, content, optimization, CRM)" },
    ],
  },
  {
    name: "Inngest (Background Jobs)",
    tier: "required",
    vars: [
      { key: "INNGEST_DEV",            impact: "⚠ CRITICAL FOR LOCAL DEV: without INNGEST_DEV=1, pipeline events route to Inngest Cloud and never execute locally" },
    ],
  },
  {
    name: "App URLs",
    tier: "required",
    vars: [
      { key: "NEXT_PUBLIC_APP_URL",    impact: "OAuth redirect URIs, share links, and email links use wrong base URL" },
      { key: "INTERNAL_API_URL",       impact: "Next.js server components cannot call the Express API" },
    ],
  },
  // ── Recommended ─────────────────────────────────────────────────────────────
  {
    name: "Storage (Supabase)",
    tier: "recommended",
    vars: [
      { key: "SUPABASE_URL",           impact: "Org logo uploads fail; pipeline images can't be saved to cloud storage" },
      { key: "SUPABASE_SERVICE_KEY",   impact: "Same as above (SUPABASE_URL must also be set)" },
    ],
  },
  {
    name: "Billing (Stripe)",
    tier: "recommended",
    vars: [
      { key: "STRIPE_SECRET_KEY",              impact: "Billing page broken; no upgrade path; free tier only" },
      { key: "STRIPE_WEBHOOK_SECRET",          impact: "Stripe webhooks ignored; subscription changes not applied" },
      { key: "STRIPE_PRICE_PRO_MONTHLY",       impact: "Pro plan checkout session creation fails" },
      { key: "STRIPE_PRICE_PRO_YEARLY",        impact: "Yearly Pro plan unavailable" },
      { key: "STRIPE_PRICE_ENTERPRISE_MONTHLY",impact: "Enterprise plan checkout unavailable" },
    ],
  },
  // ── Optional ─────────────────────────────────────────────────────────────────
  {
    name: "Image Generation (Fal.ai)",
    tier: "optional",
    vars: [
      { key: "FAL_KEY",                impact: "Falls back to Pollinations.ai (free); then to branded gradient backgrounds" },
    ],
  },
  {
    name: "Redis / Caching",
    tier: "optional",
    vars: [
      { key: "REDIS_URL",              impact: "In-memory fallback used; AI conversation state lost on restart" },
      { key: "UPSTASH_REDIS_REST_URL", impact: "Serverless Redis unavailable; REDIS_URL must cover this" },
    ],
  },
  {
    name: "Email (Resend)",
    tier: "optional",
    vars: [
      { key: "RESEND_API_KEY",         impact: "Email channel posts are simulated; campaign digest email skipped" },
    ],
  },
  {
    name: "OAuth — Login Providers",
    tier: "optional",
    vars: [
      { key: "GOOGLE_CLIENT_ID",       impact: "Google login disabled; email/password login still works" },
      { key: "GITHUB_CLIENT_ID",       impact: "GitHub login disabled; email/password login still works" },
    ],
  },
  {
    name: "OAuth — Social Publishing",
    tier: "optional",
    vars: [
      { key: "LINKEDIN_CLIENT_ID",     impact: "LinkedIn publishing simulated; content generated but not posted" },
      { key: "TWITTER_CLIENT_ID",      impact: "Twitter/X publishing simulated; content generated but not posted" },
      { key: "META_APP_ID",            impact: "Facebook/Instagram publishing simulated" },
    ],
  },
  {
    name: "AI Research (Brave Search)",
    tier: "optional",
    vars: [
      { key: "BRAVE_SEARCH_API_KEY",   impact: "Strategy agent skips web research; relies on model training data only" },
    ],
  },
  {
    name: "Monitoring (Sentry)",
    tier: "optional",
    vars: [
      { key: "SENTRY_DSN",             impact: "Server errors logged to stdout only; no alerting or issue grouping" },
      { key: "NEXT_PUBLIC_SENTRY_DSN", impact: "Browser errors not captured" },
    ],
  },
  {
    name: "Analytics (PostHog)",
    tier: "optional",
    vars: [
      { key: "NEXT_PUBLIC_POSTHOG_KEY",impact: "No product analytics or feature flag support" },
    ],
  },
  {
    name: "Inngest Production",
    tier: "optional",
    vars: [
      { key: "INNGEST_SIGNING_KEY",    impact: "Inngest webhook signature not verified (only needed in production)" },
    ],
  },
  {
    name: "Webhooks",
    tier: "optional",
    vars: [
      { key: "ORION_WEBHOOK_SECRET",   impact: "POST /contacts/capture header check skipped (insecure in production)" },
    ],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<Tier, string> = {
  required:    `${c.bold}${c.red}[REQUIRED]${c.reset}    `,
  recommended: `${c.bold}${c.yellow}[RECOMMENDED]${c.reset} `,
  optional:    `${c.bold}${c.cyan}[OPTIONAL]${c.reset}    `,
};

const TIER_ORDER: Tier[] = ["required", "recommended", "optional"];

const envFilesFound = envSources.filter((f) => fs.existsSync(f));

console.log(`\n${c.bold}ORION — Environment Variable Validator${c.reset}`);
console.log(`${"─".repeat(60)}`);

if (envFilesFound.length === 0) {
  console.log(`${warn} No .env.local or .env file found at project root.`);
  console.log(`${info} Run: ${c.cyan}cp .env.example .env.local${c.reset} to get started.\n`);
} else {
  const loaded = envFilesFound.map((f) => path.basename(f)).join(", ");
  console.log(`${info} Loaded: ${c.dim}${loaded}${c.reset} + shell environment\n`);
}

// Track counts per tier
const counts: Record<Tier, { ok: number; missing: number }> = {
  required:    { ok: 0, missing: 0 },
  recommended: { ok: 0, missing: 0 },
  optional:    { ok: 0, missing: 0 },
};

for (const tier of TIER_ORDER) {
  const groups = GROUPS.filter((g) => g.tier === tier);
  console.log(`${c.bold}${"─".repeat(60)}${c.reset}`);
  console.log(`${c.bold}${TIER_ORDER.indexOf(tier) + 1}. ${tier.toUpperCase()} VARIABLES${c.reset}\n`);

  for (const group of groups) {
    console.log(`  ${c.dim}${group.name}${c.reset}`);
    for (const v of group.vars) {
      const configured = isConfigured(v.key);
      counts[tier][configured ? "ok" : "missing"]++;

      if (configured) {
        console.log(`    ${ok} ${c.white}${v.key}${c.reset}: ${c.green}configured${c.reset}`);
      } else {
        const icon = tier === "required" ? fail : warn;
        const label = tier === "required" ? `${c.red}not set` : `${c.yellow}not set`;
        console.log(`    ${icon} ${c.white}${v.key}${c.reset}: ${label}${c.reset}`);
        console.log(`       ${c.dim}↳ ${v.impact}${c.reset}`);
      }
    }
    console.log();
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`${"─".repeat(60)}`);
console.log(`${c.bold}Summary${c.reset}\n`);

const reqMissing   = counts.required.missing;
const recMissing   = counts.recommended.missing;
const optMissing   = counts.optional.missing;
const reqOk        = counts.required.ok;
const recOk        = counts.recommended.ok;
const optOk        = counts.optional.ok;

console.log(`  ${ok}  Required:    ${reqOk} configured${reqMissing > 0 ? `, ${c.red}${c.bold}${reqMissing} MISSING${c.reset}` : ""}`);
console.log(`  ${warn}  Recommended: ${recOk} configured${recMissing > 0 ? `, ${c.yellow}${recMissing} missing${c.reset}` : ""}`);
console.log(`  ${info}  Optional:    ${optOk} configured${optMissing > 0 ? `, ${c.dim}${optMissing} not set${c.reset}` : ""}`);
console.log();

if (reqMissing > 0) {
  console.log(`${c.red}${c.bold}🚨 ${reqMissing} REQUIRED variable${reqMissing === 1 ? "" : "s"} missing — app will not function correctly.${c.reset}`);
  console.log(`   See .env.example for setup instructions.\n`);
  process.exit(1);
} else if (recMissing > 0) {
  console.log(`${c.yellow}⚠  ${recMissing} recommended variable${recMissing === 1 ? "" : "s"} missing — some features will be limited.${c.reset}\n`);
  process.exit(0);
} else {
  console.log(`${c.green}${c.bold}✨ All required variables are configured. You're good to go!${c.reset}\n`);
  process.exit(0);
}
