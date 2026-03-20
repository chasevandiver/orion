"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Sparkles,
  TrendingUp,
  MousePointerClick,
  Target,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Check,
  BookmarkCheck,
  Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
}

interface Totals {
  impressions: number;
  clicks: number;
  conversions: number;
  engagements: number;
  spend: number;
  revenue: number;
}

interface Rollup {
  id: string;
  date: string;
  channel?: string;
  campaignId?: string;
  impressions: number;
  clicks: number;
  conversions: number;
  engagements: number;
  spend: number;
  revenue: number;
  isSimulated?: boolean;
}

interface Quota {
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  postsPublished: number;
  postsLimit: number;
  postsRemaining: number;
  month: string;
}

interface AnalyticsReport {
  headline: string;
  summary: string;
  performanceRating: string;
  keyMetrics: {
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
    conversionRate: number;
    engagementRate: number;
    roi?: number;
  };
  channelInsights: Array<{
    channel: string;
    assessment: string;
    trend: string;
    recommendation: string;
  }>;
  topFindings: string[];
  actionItems: Array<{
    priority: string;
    action: string;
    expectedImpact: string;
    timeframe: string;
  }>;
  forecast: {
    thirtyDayOutlook: string;
    projectedConversions: string;
    confidenceLevel: string;
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
  change,
  projected,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  change?: number; // percentage change vs previous period
  projected?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {projected && (
          <span className="text-[10px] font-medium text-amber-500/90 leading-none">(est.)</span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        {change !== undefined && (
          <span
            className={`flex items-center text-xs font-medium ${
              change > 0
                ? "text-green-600"
                : change < 0
                  ? "text-red-500"
                  : "text-muted-foreground"
            }`}
          >
            {change > 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : change < 0 ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function PerformanceBadge({ rating }: { rating: string }) {
  const colorMap: Record<string, string> = {
    excellent: "bg-green-100 text-green-800",
    good: "bg-blue-100 text-blue-800",
    average: "bg-yellow-100 text-yellow-800",
    below_average: "bg-orange-100 text-orange-800",
    poor: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colorMap[rating] ?? "bg-muted text-muted-foreground"}`}
    >
      {rating.replace("_", " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorMap[priority] ?? "bg-muted"}`}
    >
      {priority}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <ArrowUp className="h-3 w-3 text-green-500" />;
  if (trend === "declining") return <ArrowDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function QuotaMeter({ quota }: { quota: Quota }) {
  const tokenPct =
    quota.tokensLimit === Infinity
      ? 0
      : Math.min(100, Math.round((quota.tokensUsed / quota.tokensLimit) * 100));

  const fmtLimit = (n: number) =>
    n === Infinity ? "∞" : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toString();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Monthly Usage</h3>
        <Badge variant="outline" className="capitalize">
          {quota.plan}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>AI Tokens</span>
            <span>
              {quota.tokensUsed.toLocaleString()} / {fmtLimit(quota.tokensLimit)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full ${tokenPct >= 90 ? "bg-red-500" : tokenPct >= 70 ? "bg-yellow-500" : "bg-blue-500"}`}
              style={{ width: `${tokenPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Posts Published</span>
            <span>
              {quota.postsPublished} / {fmtLimit(quota.postsLimit)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-green-500"
              style={{
                width:
                  quota.postsLimit === Infinity
                    ? "0%"
                    : `${Math.min(100, (quota.postsPublished / quota.postsLimit) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
      {quota.plan === "free" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Upgrade to Pro for 10× more tokens and 50× more posts.
        </p>
      )}
    </div>
  );
}

// ── Daily trend chart data builder ────────────────────────────────────────────

function buildTrendData(rollups: Rollup[]) {
  const byDate = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const r of rollups) {
    const day = r.date.slice(0, 10);
    const prev = byDate.get(day) ?? { impressions: 0, clicks: 0, conversions: 0 };
    byDate.set(day, {
      impressions: prev.impressions + r.impressions,
      clicks: prev.clicks + r.clicks,
      conversions: prev.conversions + r.conversions,
    });
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date: date.slice(5), ...data })); // "MM-DD"
}

function buildChannelData(rollups: Rollup[]) {
  const byChannel = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const r of rollups) {
    const ch = r.channel ?? "unknown";
    const prev = byChannel.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0 };
    byChannel.set(ch, {
      impressions: prev.impressions + r.impressions,
      clicks: prev.clicks + r.clicks,
      conversions: prev.conversions + r.conversions,
    });
  }
  return Array.from(byChannel.entries())
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .map(([channel, data]) => ({
      channel,
      ...data,
      ctr: data.impressions > 0 ? +((data.clicks / data.impressions) * 100).toFixed(2) : 0,
    }));
}

// ── Main dashboard component ──────────────────────────────────────────────────

const EMPTY_TOTALS: Totals = { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 };

type DataFilter = "all" | "real" | "simulated";

export function AnalyticsDashboard({
  initialTotals,
  initialRollups,
  initialQuota,
  initialRealMetrics,
  initialSimulatedMetrics,
}: {
  initialTotals: Totals;
  initialRollups: Rollup[];
  initialQuota?: Quota;
  initialRealMetrics?: Totals;
  initialSimulatedMetrics?: Totals;
}) {
  const router = useRouter();
  const toast = useAppToast();
  const [totals, setTotals] = useState(initialTotals);
  const [rollups, setRollups] = useState(initialRollups);
  const [realMetrics, setRealMetrics] = useState<Totals>(initialRealMetrics ?? initialTotals);
  const [simulatedMetrics, setSimulatedMetrics] = useState<Totals>(initialSimulatedMetrics ?? EMPTY_TOTALS);
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [quota] = useState(initialQuota);
  const [optimizing, setOptimizing] = useState(false);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [reportRaw, setReportRaw] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [savedReport, setSavedReport] = useState(false);
  const isFirstRender = useRef(true);

  // Reset "Saved" state whenever a new report is generated
  useEffect(() => { setSavedReport(false); }, [report]);

  const hasData = totals.impressions > 0 || rollups.length > 0;
  const hasSimulatedData = simulatedMetrics.impressions > 0 || simulatedMetrics.clicks > 0;

  // Fetch campaign list once on mount
  useEffect(() => {
    api.get<{ data: Campaign[] }>("/campaigns")
      .then((res) => setCampaigns(res.data))
      .catch(() => {}); // non-critical
  }, []);

  // Re-fetch overview whenever campaign selection changes (skip initial mount — SSR data is fresh)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setLoadingOverview(true);
    setReport(null);
    setReportRaw(null);
    const qs = selectedCampaignId ? `?campaignId=${selectedCampaignId}` : "";
    api.get<{ data: { totals: Totals; rollups: Rollup[]; realMetrics?: Totals; simulatedMetrics?: Totals } }>(`/analytics/overview${qs}`)
      .then((res) => {
        setTotals(res.data.totals);
        setRollups(res.data.rollups);
        setRealMetrics(res.data.realMetrics ?? res.data.totals);
        setSimulatedMetrics(res.data.simulatedMetrics ?? EMPTY_TOTALS);
      })
      .catch(() => {})
      .finally(() => setLoadingOverview(false));
  }, [selectedCampaignId]);

  // Which totals to display based on the active filter
  const displayTotals =
    dataFilter === "real" ? realMetrics :
    dataFilter === "simulated" ? simulatedMetrics :
    totals;

  // Whether displayed values include estimates (simulated data)
  const isProjected = dataFilter !== "real" && hasSimulatedData;

  const ctr =
    displayTotals.impressions > 0
      ? ((displayTotals.clicks / displayTotals.impressions) * 100).toFixed(2)
      : "0.00";

  const convRate =
    displayTotals.clicks > 0
      ? ((displayTotals.conversions / displayTotals.clicks) * 100).toFixed(2)
      : "0.00";

  const roi =
    displayTotals.spend > 0
      ? (((displayTotals.revenue - displayTotals.spend) / displayTotals.spend) * 100).toFixed(1)
      : null;

  // Filter rollup rows to match the selected data view
  const filteredRollups =
    dataFilter === "real" ? rollups.filter((r) => !r.isSimulated) :
    dataFilter === "simulated" ? rollups.filter((r) => r.isSimulated) :
    rollups;

  const trendData = buildTrendData(filteredRollups);
  const channelData = buildChannelData(filteredRollups);

  async function handleOptimize() {
    setOptimizing(true);
    setReport(null);
    setReportRaw(null);
    try {
      const res = await api.post<{ data: { reportId: string; report: string } }>(
        "/analytics/optimize",
        selectedCampaignId ? { campaignId: selectedCampaignId } : {},
      );
      const raw = res.data.report;
      setReportRaw(raw);
      // Try to parse as structured JSON report
      const jsonMatch = raw.match(/\{[\s\S]*\}/s);
      if (jsonMatch) {
        try {
          setReport(JSON.parse(jsonMatch[0]) as AnalyticsReport);
        } catch {
          // Fall back to raw text display
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to run optimization");
    } finally {
      setOptimizing(false);
    }
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="text-lg font-semibold">No analytics data yet</h3>
        <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
          Publish your first campaign to start tracking performance. Impressions, clicks,
          and conversions will appear here automatically.
        </p>
        <Button className="mt-6" onClick={() => router.push("/dashboard")}>
          Create Campaign
        </Button>
      </div>
    );
  }

  async function handleSaveReport() {
    if (!report) return;
    try {
      await api.post("/analytics/reports", {
        ...(selectedCampaignId ? { campaignId: selectedCampaignId } : {}),
        reportJson: report as unknown as Record<string, unknown>,
        reportText: reportRaw ?? "",
      });
      setSavedReport(true);
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    }
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="space-y-6">
      {/* Campaign selector + data filter toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Show filter only when simulated data exists */}
        {hasSimulatedData && (
          <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
            {(["all", "real", "simulated"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDataFilter(f)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  dataFilter === f
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "real" ? "Real Only" : "Simulated Only"}
              </button>
            ))}
          </div>
        )}

        {loadingOverview && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {selectedCampaign && (
          <p className="text-sm text-muted-foreground">
            Showing data for: <span className="font-medium text-foreground">{selectedCampaign.name}</span>
          </p>
        )}
      </div>

      {/* Simulated-data banner */}
      {hasSimulatedData && dataFilter !== "real" && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Some metrics are projected estimates from simulated publishes.{" "}
            <a href="/settings" className="underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-300 transition-colors">
              Connect your social accounts
            </a>{" "}
            in Settings to see real performance data.
          </span>
        </div>
      )}

      {/* Early-data banner */}
      {rollups.length < 3 && rollups.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Early data — publish more posts for meaningful AI analysis.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Impressions"
          value={displayTotals.impressions.toLocaleString()}
          icon={TrendingUp}
          sub="Last 30 days"
          projected={isProjected}
        />
        <MetricCard
          label="Clicks"
          value={displayTotals.clicks.toLocaleString()}
          icon={MousePointerClick}
          sub={`${ctr}% CTR`}
          projected={isProjected}
        />
        <MetricCard
          label="Conversions"
          value={displayTotals.conversions.toLocaleString()}
          icon={Target}
          sub={`${convRate}% conv. rate`}
          projected={isProjected}
        />
        <MetricCard
          label="Engagements"
          value={displayTotals.engagements.toLocaleString()}
          icon={Zap}
          projected={isProjected}
        />
        <MetricCard
          label="Spend"
          value={`$${displayTotals.spend.toLocaleString()}`}
          icon={DollarSign}
          projected={isProjected}
        />
        <MetricCard
          label="Revenue"
          value={`$${displayTotals.revenue.toLocaleString()}`}
          icon={DollarSign}
          sub={roi ? `${roi}% ROI` : undefined}
          projected={isProjected}
        />
      </div>

      {/* Trend chart */}
      {trendData.length > 1 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold">Daily Performance Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="impressions"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="conversions"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Channel breakdown bar chart */}
      {channelData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Channel comparison table */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Channel Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-normal">Channel</th>
                  <th className="px-4 py-2 text-right font-normal">Impressions</th>
                  <th className="px-4 py-2 text-right font-normal">Clicks</th>
                  <th className="px-4 py-2 text-right font-normal">CTR</th>
                  <th className="px-4 py-2 text-right font-normal">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map((ch) => (
                  <tr key={ch.channel} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 capitalize">{ch.channel}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {ch.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {ch.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{ch.ctr}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{ch.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Channel CTR bar chart */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">CTR by Channel</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={channelData}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="channel"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="ctr" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="CTR %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quota meter */}
      {quota && <QuotaMeter quota={quota} />}

      {/* AI Optimization + structured report */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">AI Optimization Report</h2>
            <p className="text-sm text-muted-foreground">
              Deep analysis with period-over-period comparison and 30-day forecast.
            </p>
          </div>
          <Button
            onClick={handleOptimize}
            disabled={!hasData || optimizing}
            title={!hasData ? "Publish at least one post to enable AI analysis" : undefined}
            className="gap-2"
          >
            {optimizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {optimizing ? "Analyzing…" : "Run Analysis"}
          </Button>
        </div>

        {/* Structured report display */}
        {report && (
          <div className="mt-6 space-y-6 border-t border-border pt-6">
            {/* Headline + rating + save */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-bold leading-tight">{report.headline}</h3>
                  <PerformanceBadge rating={report.performanceRating} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveReport}
                disabled={savedReport}
                className="shrink-0 gap-2"
              >
                {savedReport ? (
                  <><Check className="h-3.5 w-3.5 text-green-500" />Saved</>
                ) : (
                  <><BookmarkCheck className="h-3.5 w-3.5" />Save Report</>
                )}
              </Button>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                { label: "Impressions", value: report.keyMetrics.impressions.toLocaleString() },
                { label: "Clicks",      value: report.keyMetrics.clicks.toLocaleString() },
                { label: "CTR",         value: `${report.keyMetrics.ctr}%` },
                { label: "Conversions", value: report.keyMetrics.conversions.toLocaleString() },
                { label: "Conv. Rate",  value: `${report.keyMetrics.conversionRate}%` },
                { label: "Eng. Rate",   value: `${report.keyMetrics.engagementRate}%` },
              ].map((m) => (
                <div key={m.label} className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Top Findings */}
            {report.topFindings.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold">Top Findings</h4>
                <ol className="space-y-2">
                  {report.topFindings.map((finding, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-foreground leading-relaxed">{finding}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Action Items — sorted critical → high → medium → low */}
            {report.actionItems.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold">Action Items</h4>
                <div className="space-y-2">
                  {[...report.actionItems]
                    .sort((a, b) => {
                      const order = ["critical", "high", "medium", "low"];
                      return (order.indexOf(a.priority) ?? 99) - (order.indexOf(b.priority) ?? 99);
                    })
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                      >
                        <PriorityBadge priority={item.priority} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug">{item.action}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Impact: {item.expectedImpact} · {item.timeframe}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Channel Insights — horizontal scrolling row */}
            {report.channelInsights.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold">Channel Insights</h4>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {report.channelInsights.map((ci) => (
                    <div
                      key={ci.channel}
                      className="flex-none w-52 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{ci.channel}</span>
                        <TrendIcon trend={ci.trend} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {ci.assessment}
                      </p>
                      {ci.recommendation && (
                        <p className="text-xs text-primary leading-relaxed line-clamp-2">
                          {ci.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 30-Day Forecast */}
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">30-Day Forecast</span>
                <Badge variant="outline" className="ml-auto text-xs capitalize">
                  {report.forecast.confidenceLevel} confidence
                </Badge>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {report.forecast.thirtyDayOutlook}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Projected conversions: {report.forecast.projectedConversions}
              </p>
            </div>
          </div>
        )}

        {/* Raw text fallback when JSON parse fails */}
        {reportRaw && !report && (
          <div className="mt-4 max-h-96 overflow-y-auto rounded-md bg-muted/40 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{reportRaw}</pre>
          </div>
        )}

        {!report && !reportRaw && !optimizing && totals.impressions === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            No analytics data yet. Events collected via POST /webhooks/analytics will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
