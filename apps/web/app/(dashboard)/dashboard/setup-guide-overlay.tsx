"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Server, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

interface ServiceStatus {
  ok: boolean;
  label: string;
  critical: boolean;
}

interface SystemStatus {
  healthy: boolean;
  services: Record<string, ServiceStatus>;
}

const DISMISS_KEY = "orion_setup_guide_dismissed";

export function SetupGuideOverlay() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    fetch("/api/health/system")
      .then((r) => r.json())
      .then((data: SystemStatus) => {
        if (!data.healthy) {
          setStatus(data);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!visible || !status) return null;

  const criticalServices = Object.entries(status.services ?? {})
    .filter(([, s]) => s.critical)
    .map(([id, s]) => ({ id, ...s }));

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-orion-dark-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orion-green/10 text-orion-green">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Finish Setting Up STELOS</h2>
              <p className="text-xs text-muted-foreground">Configure required services to launch campaigns</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Service checklist */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">Critical services — required for pipelines to run:</p>
          {criticalServices.map((service) => (
            <div key={service.id} className="flex items-center gap-3">
              {service.ok ? (
                <CheckCircle2 className="h-4 w-4 text-orion-green shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              )}
              <span className={`text-sm ${service.ok ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {service.label}
              </span>
              {!service.ok && (
                <span className="ml-auto rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 font-mono text-[10px] text-red-400 shrink-0">
                  DOWN
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border p-5">
          <Link
            href="/system-status"
            onClick={dismiss}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orion-green px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            View Setup Guide
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={dismiss}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
