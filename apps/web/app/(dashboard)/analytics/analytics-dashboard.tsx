"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, TrendingUp, MousePointerClick, Target, Zap } from "lucide-react";

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
}

function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function AnalyticsDashboard({
  initialTotals,
  initialRollups,
}: {
  initialTotals: Totals;
  initialRollups: Rollup[];
}) {
  const [totals] = useState(initialTotals);
  const [rollups] = useState(initialRollups);
  const [optimizing, setOptimizing] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const ctr =
    totals.impressions > 0
      ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
      : "0.00";

  const convRate =
    totals.clicks > 0
      ? ((totals.conversions / totals.clicks) * 100).toFixed(2)
      : "0.00";

  async function handleOptimize() {
    setOptimizing(true);
    setReport(null);
    try {
      const res = await api.post<{ data: { report: string } }>("/analytics/optimize", {});
      setReport(res.data.report);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setOptimizing(false);
    }
  }

  // Group rollups by channel for breakdown table
  const channelMap = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const r of rollups) {
    const ch = r.channel ?? "unknown";
    const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0 };
    channelMap.set(ch, {
      impressions: prev.impressions + r.impressions,
      clicks: prev.clicks + r.clicks,
      conversions: prev.conversions + r.conversions,
    });
  }
  const channelRows = Array.from(channelMap.entries()).sort(
    (a, b) => b[1].impressions - a[1].impressions,
  );

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
      </div>

      {/* Channel breakdown */}
      {channelRows.length > 0 && (
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
                <th className="px-4 py-2 text-right font-normal">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map(([ch, data]) => (
                <tr key={ch} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 capitalize">{ch}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {data.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {data.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {data.impressions > 0
                      ? ((data.clicks / data.impressions) * 100).toFixed(2)
                      : "0.00"}
                    %
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{data.conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Optimization */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">AI Optimization</h2>
            <p className="text-sm text-muted-foreground">
              Analyze your data and get actionable recommendations from the Optimization Agent.
            </p>
          </div>
          <Button onClick={handleOptimize} disabled={optimizing} className="gap-2">
            {optimizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {optimizing ? "Analyzing…" : "Optimize"}
          </Button>
        </div>

        {report && (
          <div className="mt-4 max-h-96 overflow-y-auto rounded-md bg-muted/40 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{report}</pre>
          </div>
        )}

        {!report && !optimizing && totals.impressions === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            No analytics data yet. Events collected via POST /webhooks/analytics will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
