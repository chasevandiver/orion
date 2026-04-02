"use client";

import { useState, useEffect } from "react";
import { X, Lightbulb } from "lucide-react";

interface FirstRunTipProps {
  id: string;
  title: string;
  body: string;
  cta?: string;
}

/**
 * A floating first-run tip card shown in the bottom-right corner.
 * Dismissed state is persisted to localStorage under `stelos_tip_{id}`.
 * Never shown again once dismissed.
 */
export function FirstRunTip({ id, title, body, cta }: FirstRunTipProps) {
  const storageKey = `stelos_tip_${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(storageKey)) {
      // Small delay so the tip doesn't pop up instantly on page load
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-72 rounded-xl border border-border bg-card shadow-2xl transition-all duration-300"
      style={{ animation: "slide-up 0.3s ease" }}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0" />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={dismiss}
            aria-label="Dismiss tip"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
        {cta && (
          <button
            className="text-xs text-primary font-medium hover:underline"
            onClick={dismiss}
          >
            {cta} →
          </button>
        )}
      </div>
    </div>
  );
}
