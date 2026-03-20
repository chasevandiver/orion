"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api-client";

export function InngestHealthAlert() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    api.get<{ healthy: boolean }>("/health/inngest")
      .then((r) => { if (!r.healthy) setShow(true); })
      .catch(() => {}); // never throw — best-effort check
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
      <p className="flex-1 text-sm text-yellow-200 leading-relaxed">
        <span className="font-semibold">Inngest dev server is not running.</span>{" "}
        The pipeline, auto-publishing, and analytics rollup will not function until it is started.
        Run{" "}
        <code className="font-mono text-xs text-yellow-300">npx inngest-cli@latest dev</code>{" "}
        in your terminal.
      </p>
      <button
        onClick={() => setShow(false)}
        className="shrink-0 text-yellow-400/60 hover:text-yellow-400 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
