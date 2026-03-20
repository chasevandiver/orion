"use client";

import { useState, useEffect } from "react";
import { XCircle } from "lucide-react";
import { api } from "@/lib/api-client";

export function AiHealthAlert() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    api.get<{ valid: boolean }>("/health/ai")
      .then((r) => { if (!r.valid) setShow(true); })
      .catch(() => {}); // never throw — best-effort check
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-start gap-3">
      <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
      <p className="text-sm text-red-200 leading-relaxed">
        <span className="font-semibold">AI service is not configured.</span>{" "}
        Add your Anthropic API key to{" "}
        <code className="font-mono text-xs text-red-300">.env.local</code>{" "}
        to enable campaign generation.{" "}
        <span className="text-red-300/70">
          Set <code className="font-mono text-xs">ANTHROPIC_API_KEY=sk-ant-...</code>
        </span>
      </p>
    </div>
  );
}
