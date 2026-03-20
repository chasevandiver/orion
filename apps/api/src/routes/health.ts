import { Router } from "express";
import { checkInngestHealth } from "@orion/queue/health";
import { validateAnthropicKey } from "@orion/agents";

export const healthRouter = Router();

// GET /health/system — aggregates all service statuses in one call
healthRouter.get("/system", async (_req, res) => {
  const has = (key: string) => !!process.env[key];

  const [inngestResult, aiResult, dbResult] = await Promise.allSettled([
    checkInngestHealth(),
    validateAnthropicKey(),
    (async () => {
      const { db } = await import("@orion/db");
      await (db as any).execute("SELECT 1");
      return true;
    })(),
  ]);

  const inngest = inngestResult.status === "fulfilled"
    ? inngestResult.value
    : { healthy: false, mode: "dev", error: "Check failed" };
  const ai = aiResult.status === "fulfilled"
    ? aiResult.value
    : { valid: false, error: "Check failed", model: null };
  const dbOk = dbResult.status === "fulfilled" && dbResult.value === true;

  const storageOk =
    (has("SUPABASE_URL") && (has("SUPABASE_SERVICE_KEY") || has("SUPABASE_SERVICE_ROLE_KEY"))) ||
    has("AWS_S3_BUCKET");
  const storageDetail = has("SUPABASE_URL")
    ? "Supabase"
    : has("AWS_S3_BUCKET")
    ? "S3"
    : "Local filesystem (dev only)";

  const imageGenOk = has("FAL_KEY") || has("OPENAI_API_KEY");
  const imageGenDetail = has("FAL_KEY")
    ? "Fal.ai"
    : has("OPENAI_API_KEY")
    ? "OpenAI DALL-E"
    : "Brand graphics fallback (no API key)";

  const services = {
    database:  { ok: dbOk,          label: "Database",            critical: true  },
    inngest:   { ok: inngest.healthy, label: "Inngest (Queue)",    critical: true,  detail: inngest.mode ?? undefined, error: inngest.error ?? undefined },
    ai:        { ok: ai.valid,       label: "AI (Anthropic)",      critical: true,  model: ai.model ?? undefined, error: ai.error ?? undefined },
    imageGen:  { ok: imageGenOk,     label: "Image Generation",    critical: false, detail: imageGenDetail },
    storage:   { ok: storageOk,      label: "Storage",             critical: false, detail: storageDetail },
    stripe:    { ok: has("STRIPE_SECRET_KEY"),  label: "Billing (Stripe)", critical: false },
    email:     { ok: has("RESEND_API_KEY"),     label: "Email (Resend)",   critical: false },
    oauth: {
      ok: has("GOOGLE_CLIENT_ID") || has("GITHUB_CLIENT_ID"),
      label: "OAuth Providers",
      critical: false,
      providers: {
        google:   has("GOOGLE_CLIENT_ID")   && has("GOOGLE_CLIENT_SECRET"),
        github:   has("GITHUB_CLIENT_ID")   && has("GITHUB_CLIENT_SECRET"),
        linkedin: has("LINKEDIN_CLIENT_ID") && has("LINKEDIN_CLIENT_SECRET"),
        twitter:  has("TWITTER_CLIENT_ID")  && has("TWITTER_CLIENT_SECRET"),
        meta:     has("META_APP_ID")        && has("META_APP_SECRET"),
      },
    },
  };

  const criticalDown = Object.values(services).some((s) => s.critical && !s.ok);

  res.status(criticalDown ? 503 : 200).json({
    healthy: !criticalDown,
    services,
  });
});

// GET /health/inngest — no auth required
healthRouter.get("/inngest", async (_req, res) => {
  try {
    const result = await checkInngestHealth();
    res.status(result.healthy ? 200 : 503).json(result);
  } catch {
    res.status(503).json({
      healthy: false,
      mode: "dev",
      error: "Health check failed unexpectedly",
    });
  }
});

// GET /health/integrations — no auth required
// Returns which OAuth/API providers have credentials configured.
// Only checks PRESENCE of env vars — never returns values.
healthRouter.get("/integrations", (_req, res) => {
  const has = (key: string) => !!process.env[key];
  res.json({
    google:   has("GOOGLE_CLIENT_ID")   && has("GOOGLE_CLIENT_SECRET"),
    github:   has("GITHUB_CLIENT_ID")   && has("GITHUB_CLIENT_SECRET"),
    linkedin: has("LINKEDIN_CLIENT_ID") && has("LINKEDIN_CLIENT_SECRET"),
    twitter:  has("TWITTER_CLIENT_ID")  && has("TWITTER_CLIENT_SECRET"),
    meta:     has("META_APP_ID")        && has("META_APP_SECRET"),
    resend:   has("RESEND_API_KEY"),
    stripe:   has("STRIPE_SECRET_KEY"),
  });
});

// GET /health/ai — no auth required
// validateAnthropicKey() caches internally for 5 minutes, so this is cheap.
healthRouter.get("/ai", async (_req, res) => {
  try {
    const result = await validateAnthropicKey();
    res.status(result.valid ? 200 : 503).json({
      valid: result.valid,
      error: result.error,
      model: result.model,
    });
  } catch {
    res.status(503).json({
      valid: false,
      error: "AI health check failed unexpectedly",
      model: null,
    });
  }
});
