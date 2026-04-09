"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoogleAds {
  headlines: string[];
  descriptions: string[];
  displayUrl: string;
}

interface MetaAds {
  primaryTextVariants: string[];
  headline: string;
  description: string;
  callToAction: string;
}

interface LinkedInAds {
  introductoryText: string;
  headline: string;
  description: string;
  callToAction: string;
}

interface AdSet {
  id: string;
  platform: "google" | "meta" | "linkedin";
  adType: string;
  status: "draft" | "submitted" | "active" | "paused";
  budget?: number | null;
  contentJson: GoogleAds | MetaAds | LinkedInAds | Record<string, unknown>;
  createdAt: string;
  campaign?: { id: string; name: string } | null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PLATFORM_STYLES: Record<string, { label: string; className: string }> = {
  google:   { label: "Google",   className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  meta:     { label: "Meta",     className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  linkedin: { label: "LinkedIn", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
};

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground border-border",
  submitted: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  active:    "bg-orion-green/10 text-orion-green border-orion-green/20",
  paused:    "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ── Ad content renderer ───────────────────────────────────────────────────────

function GoogleAdsDetail({ content }: { content: GoogleAds }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Headlines ({content.headlines.length})</p>
        <div className="flex flex-wrap gap-2">
          {content.headlines.map((h, i) => (
            <span key={i} className="rounded border border-border bg-muted px-2 py-1 text-xs">{h}</span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Descriptions</p>
        <ul className="space-y-1">
          {content.descriptions.map((d, i) => (
            <li key={i} className="text-sm text-muted-foreground">• {d}</li>
          ))}
        </ul>
      </div>
      {content.displayUrl && (
        <p className="text-xs text-muted-foreground">Display URL: <span className="text-blue-400">{content.displayUrl}</span></p>
      )}
    </div>
  );
}

function MetaAdsDetail({ content }: { content: MetaAds }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Headline</p>
        <p className="text-sm font-medium">{content.headline}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm text-muted-foreground">{content.description}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Primary Text Variants ({content.primaryTextVariants.length})</p>
        <ul className="space-y-2">
          {content.primaryTextVariants.map((v, i) => (
            <li key={i} className="rounded border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{v}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">CTA: <span className="font-medium text-foreground">{content.callToAction}</span></p>
    </div>
  );
}

function LinkedInAdsDetail({ content }: { content: LinkedInAds }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Headline</p>
        <p className="text-sm font-medium">{content.headline}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm text-muted-foreground">{content.description}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Introductory Text</p>
        <p className="text-sm text-muted-foreground">{content.introductoryText}</p>
      </div>
      <p className="text-xs text-muted-foreground">CTA: <span className="font-medium text-foreground">{content.callToAction}</span></p>
    </div>
  );
}

function AdContent({ adSet }: { adSet: AdSet }) {
  const c = adSet.contentJson as any;
  if (adSet.platform === "google") return <GoogleAdsDetail content={c} />;
  if (adSet.platform === "meta") return <MetaAdsDetail content={c} />;
  if (adSet.platform === "linkedin") return <LinkedInAdsDetail content={c} />;
  return <pre className="text-xs text-muted-foreground overflow-auto">{JSON.stringify(c, null, 2)}</pre>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PaidAdsPage() {
  const toast = useAppToast();
  const [adSets, setAdSets] = useState<AdSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ data: AdSet[] }>("/paid-ads");
        setAdSets(res.data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load ad sets");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleStatus(adSet: AdSet) {
    const nextStatus = adSet.status === "active" ? "paused" : "active";
    setUpdatingStatus(adSet.id);
    try {
      await api.patch(`/paid-ads/${adSet.id}`, { status: nextStatus });
      setAdSets((prev) =>
        prev.map((a) => (a.id === adSet.id ? { ...a, status: nextStatus } : a)),
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  // Group by platform
  const grouped: Record<string, AdSet[]> = {};
  for (const ad of adSets) {
    if (!grouped[ad.platform]) grouped[ad.platform] = [];
    grouped[ad.platform]!.push(ad);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Paid Ads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated ad copy for Google, Meta, and LinkedIn — auto-created with each campaign.
        </p>
      </div>

      {adSets.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No ad sets yet"
          description="Paid ad copy is automatically generated when you run a campaign pipeline. Run a campaign to get started."
          actions={[{ label: "Create a Campaign", href: "/dashboard" }]}
        />
      ) : (
        <div className="space-y-8">
          {(["google", "meta", "linkedin"] as const).map((platform) => {
            const ads = grouped[platform];
            if (!ads || ads.length === 0) return null;
            const p = PLATFORM_STYLES[platform]!;
            return (
              <section key={platform}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold ${p.className}`}>
                    {p.label}
                  </span>
                  <span className="text-sm text-muted-foreground">{ads.length} ad {ads.length === 1 ? "set" : "sets"}</span>
                </div>
                <div className="space-y-3">
                  {ads.map((adSet) => {
                    const isOpen = expanded.has(adSet.id);
                    const statusStyle = STATUS_STYLES[adSet.status] ?? STATUS_STYLES.draft!;
                    return (
                      <div key={adSet.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Row header */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${statusStyle}`}>
                            {adSet.status}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">{adSet.adType}</span>
                          {adSet.budget && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground ml-1">
                              <DollarSign className="h-3 w-3" />{adSet.budget.toLocaleString()}
                            </span>
                          )}
                          {adSet.campaign && (
                            <Link
                              href={`/dashboard/campaigns/${adSet.campaign.id}/summary`}
                              className="ml-auto flex items-center gap-1 text-xs text-orion-green hover:underline"
                            >
                              {adSet.campaign.name}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                          <div className="flex items-center gap-2 ml-auto">
                            {/* Status toggle */}
                            {(adSet.status === "active" || adSet.status === "paused" || adSet.status === "draft") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={updatingStatus === adSet.id}
                                onClick={() => toggleStatus(adSet)}
                                aria-label={adSet.status === "active" ? "Pause ad set" : "Activate ad set"}
                              >
                                {updatingStatus === adSet.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : adSet.status === "active" ? "Pause" : "Activate"}
                              </Button>
                            )}
                            {/* Expand toggle */}
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => toggleExpand(adSet.id)}
                              aria-label={isOpen ? "Collapse ad details" : "Expand ad details"}
                            >
                              {isOpen ? (
                                <><ChevronUp className="h-4 w-4" /> Hide</>
                              ) : (
                                <><ChevronDown className="h-4 w-4" /> View copy</>
                              )}
                            </button>
                          </div>
                        </div>
                        {/* Expanded content */}
                        {isOpen && (
                          <div className="border-t border-border px-4 py-4">
                            <AdContent adSet={adSet} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
