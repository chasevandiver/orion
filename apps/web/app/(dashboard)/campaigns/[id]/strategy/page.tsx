"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Target,
  Users,
  BarChart2,
  Calendar,
  MessageSquare,
  DollarSign,
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { downloadFileFromApi } from "@/lib/api-client";
import Link from "next/link";
import { FirstRunTip } from "@/components/ui/first-run-tip";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyJSON {
  executiveSummary?: string;
  keyMessagesByChannel?: Record<string, string>;
  kpis?: Record<string, string | number>;
  audiences?: Array<{ name: string; description: string; painPoint?: string }>;
  thirtyDayPlan?: Array<string | { week?: string; actions?: string[]; focus?: string }>;
  messagingThemes?: string[];
  budgetAllocation?: Record<string, string | number>;
  informedByReports?: number;
}

interface Strategy {
  id: string;
  title: string;
  contentText?: string;
  contentJson?: StrategyJSON;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  strategy?: Strategy;
}

interface CampaignResponse {
  data: Campaign;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />
  );
}

function SkeletonSection() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadStrategy() {
    if (!id) return;
    setDownloading(true);
    try {
      await downloadFileFromApi(`/campaigns/${id}/strategy/export`, `strategy-${id}.md`);
    } catch {
      // non-critical — user will see browser error
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<CampaignResponse>(`/campaigns/${id}`);
        setCampaign(res.data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-64 mb-1" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6">
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-400">{error ?? "Campaign not found"}</p>
        <Link href="/dashboard/campaigns">
          <Button variant="outline" size="sm">Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  const strategy = campaign.strategy;
  // Try contentJson first; fall back to parsing contentText if it looks like JSON
  let strategyJson: StrategyJSON | null = strategy?.contentJson ?? null;
  if (!strategyJson && strategy?.contentText?.trimStart().startsWith("{")) {
    try { strategyJson = JSON.parse(strategy.contentText) as StrategyJSON; } catch { /* keep null */ }
  }
  // Guard: if contentJson exists but lacks expected fields (e.g. it's a {raw, runId} fallback),
  // treat it as raw text so the prose fallback renders instead of showing empty sections.
  const isValidStrategyJson =
    strategyJson &&
    (strategyJson.executiveSummary ||
      (strategyJson.audiences && strategyJson.audiences.length > 0) ||
      strategyJson.messagingThemes?.length);
  // Raw text to show when structured rendering isn't possible
  const rawFallbackText =
    (strategyJson as any)?.raw ?? strategy?.contentText ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link href={`/dashboard/campaigns/${id}/summary`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Campaign
            </Button>
          </Link>
          {strategy && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadStrategy} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Strategy
            </Button>
          )}
        </div>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Marketing Strategy</p>
      </div>

      {!strategy ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border text-muted-foreground">
          <TrendingUp className="h-10 w-10 mb-3" />
          <p>No strategy has been generated yet.</p>
          <p className="text-sm mt-1">Run the campaign pipeline to generate a strategy.</p>
        </div>
      ) : (strategyJson && isValidStrategyJson) ? (
        <div className="space-y-5">
          {/* Feedback loop indicator */}
          {(strategyJson?.informedByReports ?? 0) > 0 && (
            <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-primary">
                This strategy was informed by{" "}
                <span className="font-semibold">
                  {strategyJson.informedByReports}{" "}
                  {strategyJson.informedByReports === 1 ? "previous campaign analysis" : "previous campaign analyses"}
                </span>
                .
              </p>
            </div>
          )}

          {/* Executive Summary */}
          {strategyJson.executiveSummary && (
            <Section title="Executive Summary" icon={<Target className="h-4 w-4" />}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {strategyJson.executiveSummary}
              </p>
            </Section>
          )}

          {/* Channels + KPIs */}
          {(strategyJson.keyMessagesByChannel || strategyJson.kpis) && (
            <Section title="Channels & KPIs" icon={<BarChart2 className="h-4 w-4" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Channel</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Key Message</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">KPI Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(strategyJson.keyMessagesByChannel ?? {}).map(([channel, message]) => (
                      <tr key={channel} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4">
                          <Badge variant="outline" className="capitalize">{channel}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground max-w-xs">{message}</td>
                        <td className="py-3 text-muted-foreground">
                          {(strategyJson.kpis as any)?.[channel] ??
                            Object.values(strategyJson.kpis ?? {})[0] ??
                            "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Audience Segments */}
          {strategyJson.audiences && strategyJson.audiences.length > 0 && (
            <Section title="Audience Segments" icon={<Users className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {strategyJson.audiences.map((audience, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <p className="font-semibold text-sm mb-1">{audience.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                      {audience.description}
                    </p>
                    {audience.painPoint && (
                      <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                        Pain: {audience.painPoint}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 30-Day Plan */}
          {strategyJson.thirtyDayPlan && strategyJson.thirtyDayPlan.length > 0 && (
            <Section title="30-Day Plan" icon={<Calendar className="h-4 w-4" />}>
              <ol className="space-y-3">
                {strategyJson.thirtyDayPlan.map((item, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {idx + 1}
                    </span>
                    <div className="text-sm text-muted-foreground pt-0.5">
                      {typeof item === "string" ? (
                        item
                      ) : (
                        <div>
                          {item.week && <span className="font-medium text-foreground">{item.week}: </span>}
                          {item.focus && <span>{item.focus}</span>}
                          {item.actions && (
                            <ul className="mt-1 space-y-1 list-disc list-inside">
                              {item.actions.map((action, ai) => (
                                <li key={ai}>{action}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* Messaging Themes */}
          {strategyJson.messagingThemes && strategyJson.messagingThemes.length > 0 && (
            <Section title="Messaging Themes" icon={<MessageSquare className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-2">
                {strategyJson.messagingThemes.map((theme, idx) => (
                  <Badge
                    key={idx}
                    className="bg-primary/10 text-primary border-primary/20 px-3 py-1 text-sm"
                  >
                    {theme}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Budget Allocation */}
          {strategyJson.budgetAllocation &&
            Object.keys(strategyJson.budgetAllocation).length > 0 && (
              <Section title="Budget Allocation" icon={<DollarSign className="h-4 w-4" />}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(strategyJson.budgetAllocation).map(([category, amount]) => (
                      <tr key={category} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 text-muted-foreground capitalize">{category}</td>
                        <td className="py-2.5 text-right font-medium">{String(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}
        </div>
      ) : (
        /* Fallback: readable prose (also handles {raw, runId} contentJson shape) */
        <Section title="Strategy" icon={<Target className="h-4 w-4" />}>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
            {rawFallbackText ?? "No strategy content available."}
          </div>
        </Section>
      )}

      <FirstRunTip
        id="strategy-page"
        title="Your AI campaign strategy"
        body="This page shows your AI-generated marketing strategy. Review the audience insights, messaging themes, and 30-day plan before diving into the content your agents created."
        cta="Got it"
      />
    </div>
  );
}
