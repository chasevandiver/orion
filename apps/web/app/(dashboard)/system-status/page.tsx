"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";

interface ServiceStatus {
  ok: boolean;
  label: string;
  critical: boolean;
  detail?: string;
  error?: string;
  model?: string;
  providers?: Record<string, boolean>;
}

interface SystemStatus {
  healthy: boolean;
  services: Record<string, ServiceStatus>;
}

const SERVICE_DOCS: Record<string, { url: string; envVars: string[] }> = {
  database:  { url: "https://neon.tech", envVars: ["DATABASE_URL"] },
  inngest:   { url: "https://www.inngest.com/docs/local-development", envVars: ["INNGEST_DEV=1", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] },
  ai:        { url: "https://console.anthropic.com/settings/keys", envVars: ["ANTHROPIC_API_KEY"] },
  imageGen:  { url: "https://fal.ai/dashboard/keys", envVars: ["FAL_KEY"] },
  storage:   { url: "https://supabase.com/dashboard/project/_/storage", envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] },
  stripe:    { url: "https://dashboard.stripe.com/apikeys", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"] },
  email:     { url: "https://resend.com/api-keys", envVars: ["RESEND_API_KEY"] },
  oauth:     { url: "https://console.developers.google.com", envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
};

function StatusIcon({ ok, critical }: { ok: boolean; critical: boolean }) {
  if (ok) return <CheckCircle2 className="h-5 w-5 text-orion-green shrink-0" />;
  if (critical) return <XCircle className="h-5 w-5 text-red-400 shrink-0" />;
  return <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />;
}

function StatusBadge({ ok, critical }: { ok: boolean; critical: boolean }) {
  if (ok) {
    return (
      <span className="rounded-full border border-orion-green/30 bg-orion-green/10 px-2 py-0.5 font-mono text-[10px] text-orion-green">
        OK
      </span>
    );
  }
  if (critical) {
    return (
      <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 font-mono text-[10px] text-red-400">
        DOWN
      </span>
    );
  }
  return (
    <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 font-mono text-[10px] text-yellow-400">
      NOT CONFIGURED
    </span>
  );
}

function ServiceCard({ id, service }: { id: string; service: ServiceStatus }) {
  const docs = SERVICE_DOCS[id];

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        service.ok
          ? "border-border"
          : service.critical
          ? "border-red-400/30 bg-red-400/5"
          : "border-yellow-400/20 bg-yellow-400/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <StatusIcon ok={service.ok} critical={service.critical} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{service.label}</p>
              {service.critical && (
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                  required
                </span>
              )}
            </div>
            {service.detail && (
              <p className="mt-0.5 text-xs text-muted-foreground">{service.detail}</p>
            )}
            {service.model && (
              <p className="mt-0.5 text-xs text-muted-foreground">Model: {service.model}</p>
            )}
            {service.error && !service.ok && (
              <p className="mt-1 text-xs text-red-400">{service.error}</p>
            )}
            {/* OAuth sub-providers */}
            {service.providers && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(service.providers).map(([name, configured]) => (
                  <span
                    key={name}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] capitalize ${
                      configured
                        ? "border-orion-green/30 text-orion-green"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
            {/* Env var hints when not configured */}
            {!service.ok && docs && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Required env vars:</p>
                <div className="flex flex-wrap gap-1">
                  {docs.envVars.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge ok={service.ok} critical={service.critical} />
          {docs && (
            <a
              href={docs.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Docs / Dashboard"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health/system");
      const data = await res.json();
      setStatus(data);
      setLastChecked(new Date());
    } catch {
      setError("Failed to reach the API server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const criticalCount = status
    ? Object.values(status.services).filter((s) => s.critical && !s.ok).length
    : 0;
  const warningCount = status
    ? Object.values(status.services).filter((s) => !s.critical && !s.ok).length
    : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configuration status of all external services and integrations.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overall banner */}
      {status && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            status.healthy
              ? "border-orion-green/30 bg-orion-green/5"
              : "border-red-400/30 bg-red-400/5"
          }`}
        >
          {status.healthy ? (
            <CheckCircle2 className="h-5 w-5 text-orion-green shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-400 shrink-0" />
          )}
          <div>
            <p className={`text-sm font-semibold ${status.healthy ? "text-orion-green" : "text-red-400"}`}>
              {status.healthy ? "All critical services operational" : `${criticalCount} critical service${criticalCount !== 1 ? "s" : ""} down`}
            </p>
            <p className="text-xs text-muted-foreground">
              {warningCount > 0
                ? `${warningCount} optional service${warningCount !== 1 ? "s" : ""} not configured`
                : "All optional services configured"}
              {lastChecked && ` · Last checked ${lastChecked.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3">
          <XCircle className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !status && (
        <div className="grid gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-border animate-pulse bg-muted/30" />
          ))}
        </div>
      )}

      {/* Service cards */}
      {status && (
        <>
          <div>
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Critical Services
            </h2>
            <div className="grid gap-3">
              {Object.entries(status.services)
                .filter(([, s]) => s.critical)
                .map(([id, service]) => (
                  <ServiceCard key={id} id={id} service={service} />
                ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Optional Services
            </h2>
            <div className="grid gap-3">
              {Object.entries(status.services)
                .filter(([, s]) => !s.critical)
                .map(([id, service]) => (
                  <ServiceCard key={id} id={id} service={service} />
                ))}
            </div>
          </div>

          {/* .env.local quickstart */}
          {!status.healthy && (
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold mb-2">Quick Start</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Copy the relevant variables to <code className="text-foreground">apps/api/.env.local</code> and{" "}
                <code className="text-foreground">apps/web/.env.local</code>, then restart the dev server.
              </p>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-orion-green hover:underline"
              >
                View .env.example in the repository
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
