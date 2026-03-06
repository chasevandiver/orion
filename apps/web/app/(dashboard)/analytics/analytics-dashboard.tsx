"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  change?: number; // percentage change vs previous period
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
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

export function AnalyticsDashboard({
  initialTotals,
  initialRollups,
  initialQuota,
}: {
  initialTotals: Totals;
  initialRollups: Rollup[];
  initialQuota?: Quota;
}) {
  const [totals] = useState(initialTotals);
  const [rollups] = useState(initialRollups);
  const [quota] = useState(initialQuota);
  const [optimizing, setOptimizing] = useState(false);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [reportRaw, setReportRaw] = useState<string | null>(null);

  const ctr =
    totals.impressions > 0
      ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
      : "0.00";

  const convRate =
    totals.clicks > 0
      ? ((totals.conversions / totals.clicks) * 100).toFixed(2)
      : "0.00";

  const roi =
    totals.spend > 0
      ? (((totals.revenue - totals.spend) / totals.spend) * 100).toFixed(1)
      : null;

  const trendData = buildTrendData(rollups);
  const channelData = buildChannelData(rollups);

  async function handleOptimize() {
    setOptimizing(true);
    setReport(null);
    setReportRaw(null);
    try {
      const res = await api.post<{ data: { reportId: string; report: string } }>(
        "/analytics/optimize",
        {},
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
      alert(err.message);
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Impressions"
          value={totals.impressions.toLocaleString()}
          icon={TrendingUp}
          sub="Last 30 days"
        />
        <MetricCard
          label="Clicks"
          value={totals.clicks.toLocaleString()}
          icon={MousePointerClick}
          sub={`${ctr}% CTR`}
        />
        <MetricCard
          label="Conversions"
          value={totals.conversions.toLocaleString()}
          icon={Target}
          sub={`${convRate}% conv. rate`}
        />
        <MetricCard
          label="Engagements"
          value={totals.engagements.toLocaleString()}
          icon={Zap}
        />
        <MetricCard
          label="Spend"
          value={`$${totals.spend.toLocaleString()}`}
          icon={DollarSign}
        />
        <MetricCard
          label="Revenue"
          value={`$${totals.revenue.toLocaleString()}`}
          icon={DollarSign}
          sub={roi ? `${roi}% ROI` : undefined}
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
          <Button onClick={handleOptimize} disabled={optimizing} className="gap-2">
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
          <div className="mt-6 space-y-4">
            {/* Headline + rating */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-semibold">{report.headline}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
              </div>
              <PerformanceBadge rating={report.performanceRating} />
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                { label: "Impressions", value: report.keyMetrics.impressions.toLocaleString() },
                { label: "Clicks", value: report.keyMetrics.clicks.toLocaleString() },
                { label: "CTR", value: `${report.keyMetrics.ctr}%` },
                { label: "Conversions", value: report.keyMetrics.conversions.toLocaleString() },
                { label: "Conv. Rate", value: `${report.keyMetrics.conversionRate}%` },
                { label: "Eng. Rate", value: `${report.keyMetrics.engagementRate}%` },
              ].map((m) => (
                <div key={m.label} className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Channel insights */}
            {report.channelInsights.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Channel Insights</h4>
                <div className="space-y-2">
                  {report.channelInsights.map((ci) => (
                    <div
                      key={ci.channel}
                      className="flex items-start gap-2 rounded-md border border-border/60 p-3 text-sm"
                    >
                      <TrendIcon trend={ci.trend} />
                      <div className="flex-1">
                        <span className="font-medium capitalize">{ci.channel}</span>
                        <span className="mx-1 text-muted-foreground">—</span>
                        {ci.assessment}
                        <p className="mt-0.5 text-xs text-blue-600">{ci.recommendation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action items */}
            {report.actionItems.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Action Items</h4>
                <div className="space-y-2">
                  {report.actionItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-sm"
                    >
                      <PriorityBadge priority={item.priority} />
                      <div className="flex-1">
                        <p>{item.action}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Impact: {item.expectedImpact} · {item.timeframe}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 30-day forecast */}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-blue-800">30-Day Forecast</span>
                <Badge variant="outline" className="ml-auto text-xs capitalize">
                  {report.forecast.confidenceLevel} confidence
                </Badge>
              </div>
              <p className="mt-1 text-blue-700">{report.forecast.thirtyDayOutlook}</p>
              <p className="mt-1 text-xs text-blue-600">
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
