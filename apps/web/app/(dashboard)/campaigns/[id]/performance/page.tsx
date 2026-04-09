"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Loader2,
  BarChart2,
  Activity,
  Zap,
  ArrowLeft,
  CheckCircle2,
  Info,
  Repeat2,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RepurposeModal } from "@/components/repurpose-modal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  channel: string;
  type: string;
  contentText?: string;
  status: string;
}

interface ChannelPerf {
  channel: string;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  benchmark?: number;
  status?: "above" | "on_track" | "below" | undefined;
}

interface ABResult {
  variantA: { impressions: number; clicks: number; ctr: number };
  variantB: { impressions: number; clicks: number; ctr: number };
  winner?: "a" | "b" | "tie";
}

interface AnalyticsReport {
  topFindings?: string[];
  actionItems?: Array<{ action: string; priority: "high" | "medium" | "low" }>;
}

interface Analytics {
  healthScore?: number;
  letterGrade?: string;
  channelPerformance?: ChannelPerf[];
  abResults?: ABResult;
  analyticsReport?: AnalyticsReport;
  hasData?: boolean;
  hasSimulatedData?: boolean;
}

interface AnalyticsResponse {
  data: Analytics;
}

// ── A/B Statistical Significance (two-proportion z-test) ─────────────────────

function calculateSignificance(
  a: { clicks: number; impressions: number },
  b: { clicks: number; impressions: number },
): { significant: boolean; confidence: number } {
  if (a.impressions === 0 || b.impressions === 0) return { significant: false, confidence: 0 };

  const pA = a.clicks / a.impressions;
  const pB = b.clicks / b.impressions;
  const pPool = (a.clicks + b.clicks) / (a.impressions + b.impressions);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.impressions + 1 / b.impressions));

  if (se === 0) return { significant: false, confidence: 0 };

  const z = Math.abs(pA - pB) / se;

  // Convert z-score to two-tailed p-value using a standard normal CDF approximation
  const pValue = 2 * (1 - stdNormalCdf(z));
  const confidence = Math.min(99.9, Math.round((1 - pValue) * 1000) / 10);

  return { significant: pValue < 0.05, confidence };
}

/** Abramowitz & Stegun approximation for the standard normal CDF */
function stdNormalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

// ── Health grade colors ───────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case "A": return "text-green-400";
    case "B": return "text-blue-400";
    case "C": return "text-yellow-400";
    case "D": return "text-orange-400";
    default:  return "text-red-400";
  }
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ── Channel status badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string | undefined }) {
  if (!status) return null;
  const cfg = {
    above:    { label: "Above Benchmark", cls: "bg-green-500/10 text-green-400 border-green-500/20", icon: TrendingUp },
    on_track: { label: "On Track",        cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: Minus },
    below:    { label: "Below Benchmark", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: TrendingDown },
  };
  const c = cfg[status as keyof typeof cfg];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <Badge className={`border text-xs gap-1 ${c.cls}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low:    "bg-green-500/10 text-green-400 border-green-500/20",
};

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼", twitter: "🐦", instagram: "📸",
  facebook: "📘", email: "📧", blog: "✍️",
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [repurposeAsset, setRepurposeAsset] = useState<Asset | null>(null);
  const [attribution, setAttribution] = useState<{
    revenue: number;
    customerCount: number;
    roi: number | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [analyticsRes, assetsRes, attrRes] = await Promise.allSettled([
          api.get<AnalyticsResponse>(`/analytics/campaigns/${id}`),
          api.get<{ data: Asset[] }>(`/assets?campaignId=${id}`),
          api.get<{ data: { revenueByCampaign: Array<{ campaignId: string; revenue: number; customerCount: number; roi: number | null }> } }>("/analytics/attribution"),
        ]);
        if (analyticsRes.status === "fulfilled") {
          setAnalytics(analyticsRes.value.data);
        } else {
          const err = analyticsRes.reason as any;
          if (err?.status === 404) setAnalytics({ hasData: false });
          else setError(err?.message ?? "Failed to load analytics");
        }
        if (assetsRes.status === "fulfilled") {
          // Only show copy assets (not graphic_prompt), take up to 6
          setAssets(
            assetsRes.value.data
              .filter((a) => a.type !== "graphic_prompt" && a.contentText)
              .slice(0, 6),
          );
        }
        if (attrRes.status === "fulfilled") {
          const match = attrRes.value.data.revenueByCampaign.find((r) => r.campaignId === id);
          if (match) setAttribution(match);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading performance data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-400">{error}</p>
        <Link href={`/dashboard/campaigns/${id}/summary`}>
          <Button variant="outline" size="sm">Back to Summary</Button>
        </Link>
      </div>
    );
  }

  const score = analytics?.healthScore ?? 0;
  const grade = analytics?.letterGrade ?? scoreToGrade(score);
  const hasData = analytics?.hasData !== false && (score > 0 || (analytics?.channelPerformance?.length ?? 0) > 0);
  const channelPerf = analytics?.channelPerformance ?? [];
  const abResults = analytics?.abResults;
  const report = analytics?.analyticsReport;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground mb-2"
          onClick={() => router.push(`/dashboard/campaigns/${id}/summary`)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Campaign
        </Button>
        <h1 className="text-2xl font-bold">Campaign Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analytics and insights for this campaign.
        </p>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Analytics Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Analytics will appear here once your posts are published and start receiving engagement.
              Check back after your campaign goes live.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 animate-pulse text-blue-400" />
              <span>30-day trend tracking will activate automatically</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Simulated-data banner */}
          {analytics?.hasSimulatedData && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                These metrics include projected estimates from simulated publishes.{" "}
                <a href="/settings" className="underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-300 transition-colors">
                  Connect your social accounts
                </a>{" "}
                in Settings to track real campaign performance.
              </span>
            </div>
          )}

          {/* Health Score */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold">Campaign Health Score</h2>
              {analytics?.hasSimulatedData && (
                <span className="text-xs font-medium text-amber-500/90">(projected)</span>
              )}
            </div>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-6xl font-black text-foreground">{score}</div>
                <div className="text-sm text-muted-foreground mt-1">out of 100</div>
              </div>
              <div className="text-center">
                <div className={`text-6xl font-black ${gradeColor(grade)}`}>{grade}</div>
                <div className="text-sm text-muted-foreground mt-1">Letter Grade</div>
              </div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {score >= 80
                    ? "Your campaign is performing excellently."
                    : score >= 60
                    ? "Your campaign is performing adequately with room to improve."
                    : "Your campaign needs attention."}
                </p>
              </div>
            </div>
          </div>

          {/* Channel Performance Table */}
          {channelPerf.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <BarChart2 className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-base font-semibold">Channel Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left font-medium text-muted-foreground">Channel</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">Impressions</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">Clicks</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">CTR</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">Benchmark</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelPerf.map((ch) => (
                      <tr key={ch.channel} className="border-b border-border/50 last:border-0">
                        <td className="py-3">
                          <span className="flex items-center gap-2">
                            <span>{CHANNEL_ICONS[ch.channel] ?? "📄"}</span>
                            <span className="capitalize">{ch.channel}</span>
                          </span>
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {ch.impressions?.toLocaleString() ?? "—"}
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {ch.clicks?.toLocaleString() ?? "—"}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {ch.ctr != null ? `${(ch.ctr * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {ch.benchmark != null ? `${(ch.benchmark * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="py-3 text-right">
                          <StatusBadge status={ch.status ?? undefined} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 30-Day Trend */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold">30-Day Trend</h2>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 border border-border px-4 py-3 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 text-blue-400 animate-pulse shrink-0" />
              Analytics will appear here once posts are published and collecting data.
            </div>
          </div>

          {/* Analytics Report */}
          {report && (
            <div className="space-y-4">
              {report.topFindings && report.topFindings.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-base font-semibold mb-4">Top Findings</h2>
                  <div className="space-y-3">
                    {report.topFindings.map((finding, idx) => (
                      <div key={idx} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">{finding}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.actionItems && report.actionItems.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-base font-semibold mb-4">Recommended Actions</h2>
                  <div className="space-y-3">
                    {report.actionItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Badge className={`border text-xs shrink-0 mt-0.5 ${PRIORITY_COLORS[item.priority] ?? ""}`}>
                          {item.priority}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{item.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* A/B Results */}
          {abResults && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold mb-4">A/B Test Results</h2>
              <div className="grid grid-cols-2 gap-4">
                {(["a", "b"] as const).map((variant) => {
                  const data = variant === "a" ? abResults.variantA : abResults.variantB;
                  const isWinner = abResults.winner === variant;
                  return (
                    <div
                      key={variant}
                      className={`rounded-lg border p-4 ${
                        isWinner
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-bold text-sm">Variant {variant.toUpperCase()}</span>
                        {isWinner && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/20 text-xs">
                            Winner
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Impressions</span>
                          <span className="font-medium text-foreground">{data.impressions.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Clicks</span>
                          <span className="font-medium text-foreground">{data.clicks.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>CTR</span>
                          <span className="font-medium text-foreground">{(data.ctr * 100).toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Statistical significance */}
              {(() => {
                const sig = calculateSignificance(abResults.variantA, abResults.variantB);
                return (
                  <div className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                    sig.significant
                      ? "border-green-500/20 bg-green-500/5 text-green-400"
                      : "border-border bg-muted/20 text-muted-foreground"
                  }`}>
                    {sig.significant ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 shrink-0" />
                    )}
                    {sig.confidence > 0 ? (
                      sig.significant ? (
                        <span><span className="font-semibold">{sig.confidence.toFixed(1)}% confidence</span> — statistically significant result.</span>
                      ) : (
                        <span><span className="font-semibold">{sig.confidence.toFixed(1)}% confidence</span> — not yet significant. More data needed to declare a winner.</span>
                      )
                    ) : (
                      <span>Not enough data to compute significance yet.</span>
                    )}
                  </div>
                );
              })()}
              {abResults.winner === "tie" && (
                <p className="text-sm text-muted-foreground text-center mt-3">
                  Both variants are performing equally — no clear winner yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attributed Revenue */}
      {attribution && attribution.revenue > 0 && (
        <div className="rounded-xl border border-orion-green/20 bg-orion-green/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orion-green/10">
              <DollarSign className="h-4 w-4 text-orion-green" />
            </div>
            <h2 className="text-base font-semibold">Attributed Revenue</h2>
          </div>
          <div className="flex items-center gap-8">
            <div>
              <p className="text-3xl font-bold tabular-nums text-orion-green">
                ${attribution.revenue.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                from {attribution.customerCount} converted customer{attribution.customerCount !== 1 ? "s" : ""}
              </p>
            </div>
            {attribution.roi != null && (
              <div>
                <p className={`text-3xl font-bold tabular-nums ${attribution.roi >= 0 ? "text-orion-green" : "text-red-400"}`}>
                  {attribution.roi >= 0 ? "+" : ""}{attribution.roi}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">ROI</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top assets — repurpose panel */}
      {assets.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Repeat2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold">Campaign Assets</h2>
            <span className="text-xs text-muted-foreground ml-auto">Repurpose top-performing content to new channels</span>
          </div>
          <div className="space-y-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <span className="text-base">{CHANNEL_ICONS[asset.channel] ?? "📄"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium capitalize">{asset.channel}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {asset.contentText?.slice(0, 100)}…
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => setRepurposeAsset(asset)}
                >
                  <Repeat2 className="h-3.5 w-3.5" />
                  Repurpose
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {repurposeAsset && (
        <RepurposeModal
          assetId={repurposeAsset.id}
          sourceChannel={repurposeAsset.channel}
          contentPreview={repurposeAsset.contentText ?? ""}
          open={!!repurposeAsset}
          onOpenChange={(open) => { if (!open) setRepurposeAsset(null); }}
        />
      )}
    </div>
  );
}
