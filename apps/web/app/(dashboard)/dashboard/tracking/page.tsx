"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Link2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  MousePointerClick,
} from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TrackingLink {
  id: string;
  trackingId: string;
  channel: string | null;
  destinationUrl: string;
  clickCount: number;
  createdAt: string;
  campaign?: { id: string; name: string } | null;
}

// ── Channel badge ─────────────────────────────────────────────────────────────

const CHANNEL_STYLES: Record<string, string> = {
  instagram: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  linkedin:  "bg-sky-500/10 text-sky-400 border-sky-500/20",
  twitter:   "bg-blue-400/10 text-blue-400 border-blue-400/20",
  facebook:  "bg-blue-600/10 text-blue-500 border-blue-600/20",
  email:     "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  blog:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function ChannelBadge({ channel }: { channel: string | null }) {
  const label = channel ?? "unknown";
  const cls = CHANNEL_STYLES[label] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label="Copy tracking URL"
    >
      {copied ? (
        <><Check className="h-3 w-3 text-orion-green" /> Copied</>
      ) : (
        <><Copy className="h-3 w-3" /> Copy</>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ data: TrackingLink[] }>("/tracking-links");
        setLinks(res.data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load tracking links");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tracking Links</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Short links auto-created with each campaign. Clicks are recorded and linked back to the campaign.
          </p>
        </div>
        {links.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2">
            <MousePointerClick className="h-4 w-4 text-orion-green" />
            <span className="text-sm font-semibold">{totalClicks.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">total clicks</span>
          </div>
        )}
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No tracking links yet"
          description="Tracking links are auto-created when campaigns run. Run a campaign to get started."
          actions={[{ label: "Create a Campaign", href: "/dashboard" }]}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destination</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Campaign</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Clicks</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Copy URL</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link, idx) => {
                const trackingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/t/${link.trackingId}`;
                return (
                  <tr
                    key={link.id}
                    className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/5"}`}
                  >
                    <td className="px-4 py-3">
                      <ChannelBadge channel={link.channel} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 max-w-xs">
                        <span className="truncate text-xs text-muted-foreground" title={link.destinationUrl}>
                          {link.destinationUrl}
                        </span>
                        <a
                          href={link.destinationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Open destination URL"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {link.campaign ? (
                        <Link
                          href={`/dashboard/campaigns/${link.campaign.id}/summary`}
                          className="flex items-center gap-1 text-xs text-orion-green hover:underline"
                        >
                          {link.campaign.name}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold tabular-nums ${link.clickCount > 0 ? "text-orion-green" : "text-muted-foreground"}`}>
                        {link.clickCount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CopyButton text={trackingUrl} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
