"use client";

/**
 * ConnectionHealthBanner — warns when a channel connection is inactive or its
 * OAuth token expires within 7 days. Expired tokens are the most common cause
 * of silent publish failures, so surface them everywhere, not just Settings.
 *
 * Dismissal is per-session (sessionStorage) so the warning returns on the
 * next visit until the connection is actually fixed.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api-client";

interface Connection {
  channel: string;
  accountName?: string;
  isActive: boolean;
  tokenExpiresAt?: string;
}

const DISMISS_KEY = "orion-connection-banner-dismissed";
const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function ConnectionHealthBanner() {
  const [issues, setIssues] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(true); // start hidden until checked

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    api
      .get<{ data: Connection[] }>("/settings/integrations")
      .then((res) => {
        const now = Date.now();
        const found: string[] = [];
        for (const c of res.data ?? []) {
          const label = c.accountName ? `${c.channel} (${c.accountName})` : c.channel;
          if (!c.isActive) {
            found.push(`${label} is disconnected`);
          } else if (c.tokenExpiresAt) {
            const expires = new Date(c.tokenExpiresAt).getTime();
            if (expires < now) {
              found.push(`${label} token has expired`);
            } else if (expires - now < EXPIRY_WINDOW_MS) {
              const days = Math.max(1, Math.ceil((expires - now) / (24 * 60 * 60 * 1000)));
              found.push(`${label} token expires in ${days} day${days === 1 ? "" : "s"}`);
            }
          }
        }
        setIssues(found);
      })
      .catch(() => {}); // non-critical — banner just doesn't render
  }, []);

  if (dismissed || issues.length === 0) return null;

  return (
    <div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <span className="font-medium">Channel connection issue{issues.length > 1 ? "s" : ""}:</span>{" "}
        {issues.slice(0, 3).join(" · ")}
        {issues.length > 3 && ` · +${issues.length - 3} more`}
        {" — "}
        <Link
          href="/dashboard/settings"
          className="underline underline-offset-2 hover:text-amber-500 dark:hover:text-amber-300"
        >
          reconnect in Settings
        </Link>{" "}
        to keep publishing.
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
        onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
