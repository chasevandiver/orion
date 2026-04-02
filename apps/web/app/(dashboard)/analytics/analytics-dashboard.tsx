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
import { api, downloadFileFromApi } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  Hash,
  X,
  Plus,
  Download,
  ChevronDown,
  ChevronUp,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Mail,
  FileText,
  MessageSquare,
  MapPin,
  Rocket,
  RefreshCw,
  Clock,
  Wallet,
  PencilLine,
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

interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  priority: number;
  status: string;
}

interface HashtagRow {
  id: string;
  hashtag: string;
  channel: string;
  timesUsed: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number;
  lastUsedAt: string;
}

// ── Channel helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHANNEL_ICONS: Record<string, React.ComponentType<any>> = {
  linkedin: Linkedin,
  twitter: Twitter,
  instagram: Instagram,
  facebook: Facebook,
  email: Mail,
  blog: FileText,
  sms: MessageSquare,
  google_business: MapPin,
  tiktok: Zap,
};

const CHANNEL_BENCHMARKS: Record<string, { metric: string; value: number; label: string }> = {
  linkedin: { metric: "CTR", value: 0.4, label: "0.4% industry avg" },
  twitter: { metric: "CTR", value: 0.75, label: "0.5-1% industry avg" },
  instagram: { metric: "Eng. Rate", value: 2.0, label: "1-3% industry avg" },
  facebook: { metric: "CTR", value: 0.9, label: "0.9% industry avg" },
  email: { metric: "CTR", value: 2.5, label: "2-3% industry avg" },
};

// ── Revenue Tab ──────────────────────────────────────────────────────────────

interface AttributionData {
  totalRevenueThisMonth: number;
  totalRevenue: number;
  totalCustomers: number;
  avgDealSize: number;
  revenueByCampaign: Array<{
    campaignId: string;
    campaignName: string;
    revenue: number;
    customerCount: number;
    budget: number | null;
    costPerAcquisition: number | null;
    roi: number | null;
  }>;
  revenueByChannel: Array<{
    channel: string;
    revenue: number;
    customerCount: number;
  }>;
  pipelineValue: number;
  pipelineLeadCount: number;
}

function RevenueTab() {
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: AttributionData }>("/analytics/attribution")
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || (data.totalCustomers === 0 && data.pipelineLeadCount === 0)) {
    return (
      <EmptyState
        icon={DollarSign}
        title="No revenue data yet"
        description="Revenue attribution starts when contacts convert to customers. Update a contact's status to 'customer' and optionally enter a deal value."
      />
    );
  }

  const maxChannelRevenue = Math.max(...data.revenueByChannel.map((c) => c.revenue), 1);

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Revenue This Month</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orion-green">
            ${data.totalRevenueThisMonth.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            ${data.totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pipeline Value</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-400">
            ${data.pipelineValue.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{data.pipelineLeadCount} active leads</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Avg Deal Size</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            ${data.avgDealSize.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{data.totalCustomers} customers</p>
        </div>
      </div>

      {/* Revenue by Campaign */}
      {data.revenueByCampaign.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold mb-3">Which Campaigns Make Money</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-normal">Campaign</th>
                <th className="px-3 py-2 text-right font-normal">Revenue</th>
                <th className="px-3 py-2 text-right font-normal">Customers</th>
                <th className="px-3 py-2 text-right font-normal">CPA</th>
                <th className="px-3 py-2 text-right font-normal">ROI</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByCampaign.map((row) => (
                <tr key={row.campaignId} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2.5 font-medium">{row.campaignName}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-orion-green">
                    ${row.revenue.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.customerCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.costPerAcquisition != null ? `$${row.costPerAcquisition}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.roi != null ? (
                      <span className={row.roi >= 0 ? "text-orion-green" : "text-red-400"}>
                        {row.roi >= 0 ? "+" : ""}{row.roi}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue by Channel */}
      {data.revenueByChannel.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold mb-3">Revenue by Channel</h3>
          <div className="space-y-2.5">
            {data.revenueByChannel.map((ch) => (
              <div key={ch.channel} className="flex items-center gap-3">
                <span className="w-24 text-sm capitalize truncate">{ch.channel}</span>
                <div className="flex-1 h-6 rounded bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded bg-orion-green/70 transition-all"
                    style={{ width: `${(ch.revenue / maxChannelRevenue) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm tabular-nums font-medium">
                  ${ch.revenue.toLocaleString()}
                </span>
                <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                  {ch.customerCount} cust.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hashtags Tab ──────────────────────────────────────────────────────────────

function HashtagsTab({ orgBannedHashtags }: { orgBannedHashtags: string[] }) {
  const toast = useAppToast();
  const [rows, setRows] = useState<HashtagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState("");
  const [banned, setBanned] = useState<string[]>(orgBannedHashtags);
  const [newBan, setNewBan] = useState("");
  const [savingBan, setSavingBan] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs = channelFilter ? `?channel=${channelFilter}` : "";
    api.get<{ data: HashtagRow[] }>(`/analytics/hashtags${qs}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelFilter]);

  async function addBan() {
    let tag = newBan.trim().toLowerCase();
    if (!tag) return;
    if (!tag.startsWith("#")) tag = `#${tag}`;
    if (!/^#\w+$/.test(tag)) { toast.error("Invalid hashtag format"); return; }
    if (banned.includes(tag)) { toast.error("Already banned"); return; }
    const next = [...banned, tag];
    setSavingBan(true);
    try {
      await api.patch("/settings/org", { bannedHashtags: next });
      setBanned(next);
      setNewBan("");
      toast.success(`${tag} added to ban list`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSavingBan(false);
    }
  }

  async function removeBan(tag: string) {
    const next = banned.filter((b) => b !== tag);
    try {
      await api.patch("/settings/org", { bannedHashtags: next });
      setBanned(next);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove");
    }
  }

  const CHANNELS = ["instagram", "twitter", "linkedin", "tiktok", "facebook"];
  const topHashtags = [...rows].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate).slice(0, 20);
  const trendingHashtags = [...rows]
    .sort((a, b) => b.timesUsed - a.timesUsed)
    .filter((r) => !banned.includes(r.hashtag))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Channel filter */}
      <div className="flex items-center gap-3">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All channels</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Top performing hashtags */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Top Performing Hashtags</h2>
        </div>
        {topHashtags.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No hashtag data yet. Publish campaigns with social content to start tracking."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-normal">Hashtag</th>
                <th className="px-4 py-2 text-left font-normal">Channel</th>
                <th className="px-4 py-2 text-right font-normal">Times Used</th>
                <th className="px-4 py-2 text-right font-normal">Impressions</th>
                <th className="px-4 py-2 text-right font-normal">Avg Eng. Rate</th>
              </tr>
            </thead>
            <tbody>
              {topHashtags.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-primary">{row.hashtag}</td>
                  <td className="px-4 py-2.5 capitalize text-muted-foreground">{row.channel}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.timesUsed}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.totalImpressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={`font-medium ${
                      row.avgEngagementRate >= 0.05 ? "text-green-500"
                      : row.avgEngagementRate >= 0.02 ? "text-yellow-500"
                      : "text-muted-foreground"
                    }`}>
                      {(row.avgEngagementRate * 100).toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trending hashtags to try */}
      {trendingHashtags.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Most Used (Trending)</h2>
          <div className="flex flex-wrap gap-2">
            {trendingHashtags.map((row) => (
              <Badge
                key={row.id}
                variant="outline"
                className="gap-1 text-xs border-primary/30 text-primary"
              >
                {row.hashtag}
                <span className="text-muted-foreground">×{row.timesUsed}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Banned hashtags */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Banned Hashtags</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            These hashtags will never be used by the AI when generating content.
          </p>
        </div>

        {banned.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {banned.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400"
              >
                {tag}
                <button
                  onClick={() => removeBan(tag)}
                  className="ml-0.5 hover:text-red-300 transition-colors"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="#hashtag"
            value={newBan}
            onChange={(e) => setNewBan(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addBan(); }}
            className="w-44 h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={addBan} disabled={savingBan || !newBan.trim()} className="gap-1.5 h-8">
            {savingBan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ban
          </Button>
        </div>
      </div>
    </div>
  );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  sub?: string | undefined;
  change?: number | undefined;
  projected?: boolean | undefined;
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
    critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    low: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
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
    .map(([date, data]) => ({ date: date.slice(5), ...data }));
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

// ── Action routing helper ────────────────────────────────────────────────────

function getActionRoute(actionType: string, actionPayload?: Record<string, unknown>): string {
  switch (actionType) {
    case "create_campaign":
      return "/dashboard";
    case "repurpose":
      return actionPayload?.campaignId
        ? `/dashboard/campaigns/${actionPayload.campaignId}/summary`
        : "/content";
    case "adjust_schedule":
      return "/dashboard/calendar";
    case "review_content":
      return actionPayload?.campaignId
        ? `/campaigns/${actionPayload.campaignId}/review`
        : "/content";
    default:
      return "/dashboard";
  }
}

function getActionLabel(actionType: string): string {
  switch (actionType) {
    case "create_campaign": return "Create Campaign";
    case "repurpose": return "Repurpose Content";
    case "adjust_schedule": return "Adjust Schedule";
    case "review_content": return "Review Content";
    default: return "Take Action";
  }
}

// Map recommendation priority (1-5 int) to label
function recPriorityLabel(p: number): string {
  if (p <= 1) return "critical";
  if (p === 2) return "high";
  if (p === 3) return "medium";
  return "low";
}

// ── Section 1: "What to do next" ────────────────────────────────────────────

function WhatToDoNext({
  recommendations,
  reportActionItems,
  onDismiss,
}: {
  recommendations: Recommendation[];
  reportActionItems: AnalyticsReport["actionItems"];
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();

  // Merge: recommendations first (from DB), then report action items
  type ActionItem = {
    id: string;
    priority: string;
    action: string;
    expectedImpact: string;
    route: string;
    buttonLabel: string;
    source: "recommendation" | "report";
  };

  const items: ActionItem[] = [];

  // Add DB recommendations
  for (const rec of recommendations) {
    items.push({
      id: rec.id,
      priority: recPriorityLabel(rec.priority),
      action: rec.title + (rec.description ? ` — ${rec.description}` : ""),
      expectedImpact: rec.description,
      route: getActionRoute(rec.actionType, rec.actionPayload as Record<string, unknown>),
      buttonLabel: getActionLabel(rec.actionType),
      source: "recommendation",
    });
  }

  // Add report action items (deduplicate by checking action text similarity)
  for (const item of reportActionItems) {
    const isDuplicate = items.some(
      (existing) =>
        existing.action.toLowerCase().includes(item.action.toLowerCase().slice(0, 30)) ||
        item.action.toLowerCase().includes(existing.action.toLowerCase().slice(0, 30)),
    );
    if (!isDuplicate) {
      items.push({
        id: `report-${item.action.slice(0, 20)}`,
        priority: item.priority,
        action: item.action,
        expectedImpact: item.expectedImpact,
        route: "/dashboard",
        buttonLabel: "Fix This",
        source: "report",
      });
    }
  }

  // Sort by priority, take top 3
  const priorityOrder = ["critical", "high", "medium", "low"];
  const sorted = items
    .sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))
    .slice(0, 3);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No action items right now. Run an analysis to get AI-powered recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <PriorityBadge priority={item.priority} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{item.action}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Expected impact: {item.expectedImpact}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.source === "recommendation" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onDismiss(item.id)}
              >
                Dismiss
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => router.push(item.route)}
            >
              {item.buttonLabel}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section 2: "How you're doing" ────────────────────────────────────────────

function HowYoureDoing({
  totals,
  previousTotals,
  channelData,
}: {
  totals: Totals;
  previousTotals: Totals | undefined;
  channelData: Array<{ channel: string; impressions: number; clicks: number; conversions: number; ctr: number }>;
}) {
  // Calculate period-over-period change
  let changeText = "";
  if (previousTotals && previousTotals.impressions > 0) {
    const pctChange = ((totals.impressions - previousTotals.impressions) / previousTotals.impressions) * 100;
    const direction = pctChange >= 0 ? "better" : "worse";
    changeText = ` That's ${Math.abs(pctChange).toFixed(0)}% ${direction} than last month.`;
  }

  return (
    <div className="space-y-4">
      {/* Plain-English summary */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm leading-relaxed text-foreground">
          Your marketing reached{" "}
          <span className="font-semibold tabular-nums">{totals.impressions.toLocaleString()}</span>{" "}
          people this month, generating{" "}
          <span className="font-semibold tabular-nums">{totals.clicks.toLocaleString()}</span> clicks
          and{" "}
          <span className="font-semibold tabular-nums">{totals.conversions.toLocaleString()}</span>{" "}
          conversions.{changeText}
        </p>
      </div>

      {/* Per-channel cards */}
      {channelData.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channelData.map((ch) => {
            const ChannelIcon = CHANNEL_ICONS[ch.channel] ?? Zap;
            const benchmark = CHANNEL_BENCHMARKS[ch.channel];
            const isAboveBenchmark = benchmark ? ch.ctr > benchmark.value : undefined;

            return (
              <div
                key={ch.channel}
                className="rounded-lg border border-border bg-card p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{ch.channel}</span>
                  {ch.impressions > 0 && (
                    <span className="ml-auto">
                      {ch.ctr > 0 ? (
                        <ArrowUp className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{ch.ctr}% CTR</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {ch.impressions.toLocaleString()} impressions · {ch.conversions} conversions
                  </p>
                </div>
                {benchmark && (
                  <p className={`text-xs font-medium ${isAboveBenchmark ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {isAboveBenchmark ? "Above" : "Below"} {benchmark.label}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Section 3: "The details" (expandable) ────────────────────────────────────

function TheDetails({
  trendData,
  channelData,
  report,
  reportRaw,
  quota,
}: {
  trendData: Array<{ date: string; impressions: number; clicks: number; conversions: number }>;
  channelData: Array<{ channel: string; impressions: number; clicks: number; conversions: number; ctr: number }>;
  report: AnalyticsReport | null;
  reportRaw: string | null;
  quota: Quota | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">The details</span>
          <span className="text-xs text-muted-foreground">Charts, breakdowns & full report</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-5 space-y-6">
          {/* Trend chart */}
          {trendData.length > 1 && (
            <div className="pt-4">
              <h3 className="mb-4 text-sm font-semibold">Daily Performance Trend</h3>
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
                  <Line type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="conversions" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Channel breakdown */}
          {channelData.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/10">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold">Channel Breakdown</h3>
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
                        <td className="px-4 py-2 text-right tabular-nums">{ch.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{ch.clicks.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{ch.ctr}%</td>
                        <td className="px-4 py-2 text-right tabular-nums">{ch.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-border bg-muted/10 p-4">
                <h3 className="mb-4 text-sm font-semibold">CTR by Channel</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={channelData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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

          {/* Full AI report details (channel insights, findings, forecast) */}
          {report && (
            <div className="space-y-5 border-t border-border pt-5">
              {/* Headline */}
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold leading-tight">{report.headline}</h3>
                  <PerformanceBadge rating={report.performanceRating} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
              </div>

              {/* Key metrics row */}
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

              {/* Channel Insights */}
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

          {/* Raw text fallback */}
          {reportRaw && !report && (
            <div className="max-h-96 overflow-y-auto rounded-md bg-muted/40 p-4">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{reportRaw}</pre>
            </div>
          )}

          {/* Quota */}
          {quota && <QuotaMeter quota={quota} />}
        </div>
      )}
    </div>
  );
}

// ── Section: Best time to post ────────────────────────────────────────────────

interface BestPostingTime {
  channel: string;
  dayOfWeek: number;  // 0=Sun … 6=Sat
  hourUtc: number;    // 0–23 UTC
  engagementRate: number;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHourUtc(hourUtc: number): string {
  const ampm = hourUtc < 12 ? "AM" : "PM";
  const h = hourUtc % 12 === 0 ? 12 : hourUtc % 12;
  return `${h} ${ampm} UTC`;
}

function BestTimeToPost({ times }: { times: BestPostingTime[] }) {
  if (times.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Clock className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Best time to post</h2>
        <span className="text-xs text-muted-foreground ml-1">Based on your last 60 days of engagement</span>
      </div>
      <div className="flex flex-wrap gap-4 px-5 py-4">
        {times.map((t) => {
          const ChannelIcon = CHANNEL_ICONS[t.channel] ?? Zap;
          const engPct = (t.engagementRate * 100).toFixed(1);
          return (
            <div
              key={t.channel}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 min-w-[180px]"
            >
              <ChannelIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground capitalize">{t.channel}</p>
                <p className="text-sm font-semibold">
                  {DOW_LABELS[t.dayOfWeek]} · {formatHourUtc(t.hourUtc)}
                </p>
                <p className="text-xs text-muted-foreground">{engPct}% eng. rate</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insufficient data message ────────────────────────────────────────────────

function InsufficientDataMessage({ current }: { current: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
      <Rocket className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <h3 className="text-lg font-semibold">Keep publishing!</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        STELOS needs about 100 impressions across your channels before it can provide meaningful
        insights. You're at{" "}
        <span className="font-semibold text-foreground tabular-nums">{current.toLocaleString()}</span>{" "}
        so far.
      </p>
      <div className="pt-1">
        <div className="mx-auto h-2 w-48 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (current / 100) * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{current} / 100 impressions</p>
      </div>
    </div>
  );
}

// ── Budget Tab ────────────────────────────────────────────────────────────────

interface BudgetData {
  monthlyBudget: number | null;
  totalSpendThisMonth: number;
  projectedMonthlySpend: number;
  budgetUtilizationPct: number | null;
  spendByCampaign: Array<{
    campaignId: string;
    campaignName: string;
    budgetAllocated: number | null;
    actualSpend: number;
    leads: number;
    costPerLead: number | null;
    spendByChannel: Record<string, number>;
  }>;
  spendByChannel: Array<{ channel: string; spend: number }>;
  costPerLead: number | null;
  costPerConversion: number | null;
}

interface LogSpendModalProps {
  campaignId: string;
  campaignName: string;
  currentSpend: number;
  currentByChannel: Record<string, number>;
  onSave: (spend: number, byChannel: Record<string, number>) => void;
  onClose: () => void;
}

const AD_CHANNELS = ["google_ads", "meta", "linkedin_ads", "tiktok_ads", "twitter_ads", "other"];
const AD_CHANNEL_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta: "Meta (Facebook/Instagram)",
  linkedin_ads: "LinkedIn Ads",
  tiktok_ads: "TikTok Ads",
  twitter_ads: "Twitter/X Ads",
  other: "Other",
};

function LogSpendModal({ campaignId, campaignName, currentSpend, currentByChannel, onSave, onClose }: LogSpendModalProps) {
  const toast = useAppToast();
  const [saving, setSaving] = useState(false);
  const [byChannel, setByChannel] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const ch of AD_CHANNELS) {
      init[ch] = currentByChannel[ch] != null ? String(currentByChannel[ch]) : "";
    }
    return init;
  });

  const total = AD_CHANNELS.reduce((sum, ch) => {
    const v = parseFloat(byChannel[ch] || "0");
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  async function handleSave() {
    setSaving(true);
    try {
      const channelNums: Record<string, number> = {};
      for (const ch of AD_CHANNELS) {
        const v = parseFloat(byChannel[ch] || "0");
        if (!isNaN(v) && v > 0) channelNums[ch] = v;
      }
      const res = await api.patch<{ data: { actualSpend: number; spendByChannel: Record<string, number> } }>(
        `/campaigns/${campaignId}`,
        { actualSpend: total, spendByChannel: channelNums },
      );
      onSave(res.data.actualSpend, res.data.spendByChannel ?? {});
      toast.success("Ad spend logged");
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <PencilLine className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Log Ad Spend</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          <span className="font-medium text-foreground">{campaignName}</span> — Enter spend from external ad platforms.
        </p>
        <div className="space-y-3">
          {AD_CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center gap-3">
              <label className="w-40 text-xs text-muted-foreground shrink-0">{AD_CHANNEL_LABELS[ch]}</label>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={byChannel[ch]}
                  onChange={(e) => setByChannel((prev) => ({ ...prev, [ch]: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background pl-6 pr-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-semibold">
            Total: <span className="text-primary tabular-nums">${total.toFixed(2)}</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || total <= 0}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetTab() {
  const toast = useAppToast();
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [logSpendFor, setLogSpendFor] = useState<BudgetData["spendByCampaign"][0] | null>(null);

  useEffect(() => {
    api.get<{ data: BudgetData }>("/analytics/budget")
      .then((res) => {
        setData(res.data);
        if (res.data.monthlyBudget != null) {
          setMonthlyBudgetInput(String(res.data.monthlyBudget));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveBudget() {
    const val = parseFloat(monthlyBudgetInput);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid budget"); return; }
    setSavingBudget(true);
    try {
      await api.patch("/settings/org", { monthlyMarketingBudget: val });
      setData((prev) => prev ? { ...prev, monthlyBudget: val } : prev);
      toast.success("Monthly budget saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSavingBudget(false);
    }
  }

  function handleSpendSaved(campaignId: string, spend: number, byChannel: Record<string, number>) {
    setData((prev) => {
      if (!prev) return prev;
      const newCampaigns = prev.spendByCampaign.map((c) =>
        c.campaignId === campaignId ? { ...c, actualSpend: spend, spendByChannel: byChannel } : c,
      );
      // Recalculate total & channel aggregates
      const totalSpend = newCampaigns.reduce((s, c) => s + c.actualSpend, 0);
      const channelMap = new Map<string, number>();
      for (const c of newCampaigns) {
        for (const [ch, amt] of Object.entries(c.spendByChannel ?? {})) {
          channelMap.set(ch, (channelMap.get(ch) ?? 0) + amt);
        }
      }
      const spendByChannel = Array.from(channelMap.entries())
        .map(([channel, spend]) => ({ channel, spend }))
        .sort((a, b) => b.spend - a.spend);
      return {
        ...prev,
        spendByCampaign: newCampaigns,
        totalSpendThisMonth: totalSpend,
        spendByChannel,
        budgetUtilizationPct: prev.monthlyBudget && prev.monthlyBudget > 0
          ? Number(((totalSpend / prev.monthlyBudget) * 100).toFixed(1))
          : null,
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const spend = data?.totalSpendThisMonth ?? 0;
  const budget = data?.monthlyBudget ?? null;
  const utilPct = data?.budgetUtilizationPct ?? (budget && budget > 0 ? (spend / budget) * 100 : null);
  const barColor = utilPct == null ? "bg-primary" : utilPct < 80 ? "bg-green-500" : utilPct <= 100 ? "bg-yellow-500" : "bg-red-500";
  const maxSpend = Math.max(budget ?? 0, spend, 1);

  return (
    <div className="space-y-6">
      {logSpendFor && (
        <LogSpendModal
          campaignId={logSpendFor.campaignId}
          campaignName={logSpendFor.campaignName}
          currentSpend={logSpendFor.actualSpend}
          currentByChannel={logSpendFor.spendByChannel}
          onSave={(s, ch) => handleSpendSaved(logSpendFor.campaignId, s, ch)}
          onClose={() => setLogSpendFor(null)}
        />
      )}

      {/* Monthly Budget Setting */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Monthly Marketing Budget
        </h3>
        <div className="flex items-center gap-3">
          <div className="relative w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="e.g. 5000"
              value={monthlyBudgetInput}
              onChange={(e) => setMonthlyBudgetInput(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleSaveBudget}
            disabled={savingBudget}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingBudget ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          {data?.projectedMonthlySpend != null && budget != null && (
            <p className="text-xs text-muted-foreground ml-2">
              Projected end-of-month:{" "}
              <span className={`font-semibold tabular-nums ${data.projectedMonthlySpend > budget ? "text-red-400" : "text-foreground"}`}>
                ${data.projectedMonthlySpend.toLocaleString()}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Budget utilization bar */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Budget Utilization — This Month</h3>
          {utilPct != null && (
            <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${
              utilPct < 80 ? "bg-green-500/15 text-green-400"
              : utilPct <= 100 ? "bg-yellow-500/15 text-yellow-400"
              : "bg-red-500/15 text-red-400"
            }`}>
              {utilPct.toFixed(1)}% used
            </span>
          )}
        </div>
        <div className="h-5 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(100, budget ? (spend / budget) * 100 : 0)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
          <span>Spent: <span className="font-medium text-foreground">${spend.toLocaleString()}</span></span>
          {budget != null ? (
            <span>Budget: <span className="font-medium text-foreground">${budget.toLocaleString()}</span></span>
          ) : (
            <span className="italic">Set a monthly budget above</span>
          )}
        </div>
        {utilPct != null && utilPct > 100 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            You&apos;ve exceeded your monthly budget by ${(spend - (budget ?? 0)).toLocaleString()}.
          </div>
        )}
        {utilPct != null && utilPct >= 80 && utilPct <= 100 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            You&apos;re approaching your monthly budget limit.
          </div>
        )}
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Spend</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">${spend.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${budget != null && budget - spend < 0 ? "text-red-400" : "text-orion-green"}`}>
            {budget != null ? `$${(budget - spend).toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Cost per Lead</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {data?.costPerLead != null ? `$${data.costPerLead.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Proj. Month-End</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${budget && (data?.projectedMonthlySpend ?? 0) > budget ? "text-red-400" : ""}`}>
            {data?.projectedMonthlySpend != null ? `$${data.projectedMonthlySpend.toLocaleString()}` : "—"}
          </p>
        </div>
      </div>

      {/* Per-campaign spend table */}
      {(data?.spendByCampaign.length ?? 0) > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="font-semibold text-sm">Campaign Spend Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-normal">Campaign</th>
                <th className="px-4 py-2.5 text-right font-normal">Allocated</th>
                <th className="px-4 py-2.5 text-right font-normal">Actual Spend</th>
                <th className="px-4 py-2.5 text-right font-normal">Leads</th>
                <th className="px-4 py-2.5 text-right font-normal">Cost/Lead</th>
                <th className="px-4 py-2.5 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {data?.spendByCampaign.map((row) => (
                <tr key={row.campaignId} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{row.campaignName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {row.budgetAllocated != null ? `$${row.budgetAllocated.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {row.actualSpend > 0 ? `$${row.actualSpend.toLocaleString()}` : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.leads}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.costPerLead != null ? `$${row.costPerLead.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setLogSpendFor(row)}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors ml-auto"
                    >
                      <PencilLine className="h-3 w-3" />
                      Log Spend
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Campaigns with no spend logged */}
      {(data?.spendByCampaign.length ?? 0) === 0 && (
        <EmptyState
          icon={Wallet}
          title="No ad spend logged yet"
          description="Use the Log Spend button on a campaign to manually enter external ad platform costs (Google Ads, Meta, LinkedIn, etc.)."
        />
      )}

      {/* Per-channel spend breakdown */}
      {(data?.spendByChannel.length ?? 0) > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4">Spend by Ad Platform</h3>
          <div className="space-y-2.5">
            {data?.spendByChannel.map((ch) => {
              const maxChSpend = Math.max(...(data.spendByChannel.map((c) => c.spend)), 1);
              return (
                <div key={ch.channel} className="flex items-center gap-3">
                  <span className="w-36 text-xs capitalize truncate text-muted-foreground">
                    {AD_CHANNEL_LABELS[ch.channel] ?? ch.channel}
                  </span>
                  <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${(ch.spend / maxChSpend) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs tabular-nums font-medium">
                    ${ch.spend.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
  initialBannedHashtags,
}: {
  initialTotals: Totals;
  initialRollups: Rollup[];
  initialQuota?: Quota;
  initialRealMetrics?: Totals;
  initialSimulatedMetrics?: Totals;
  initialBannedHashtags?: string[];
}) {
  const router = useRouter();
  const toast = useAppToast();
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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
  const [activeTab, setActiveTab] = useState<"overview" | "hashtags" | "revenue" | "budget">("overview");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [previousTotals, setPreviousTotals] = useState<Totals | undefined>();
  const [bestPostingTimes, setBestPostingTimes] = useState<BestPostingTime[]>([]);
  const isFirstRender = useRef(true);

  // Reset "Saved" state whenever a new report is generated
  useEffect(() => { setSavedReport(false); }, [report]);

  const hasData = totals.impressions > 0 || rollups.length > 0;
  const hasSimulatedData = simulatedMetrics.impressions > 0 || simulatedMetrics.clicks > 0;
  const insufficientData = totals.impressions > 0 && totals.impressions < 100;

  // Fetch campaign list, recommendations, and best posting times on mount
  useEffect(() => {
    api.get<{ data: Campaign[] }>("/campaigns")
      .then((res) => setCampaigns(res.data))
      .catch(() => {});

    api.get<{ data: Recommendation[] }>("/recommendations")
      .then((res) => setRecommendations(res.data))
      .catch(() => {});

    api.get<{ data: BestPostingTime[] }>("/analytics/posting-times")
      .then((res) => setBestPostingTimes(res.data))
      .catch(() => {});
  }, []);

  // Re-fetch overview whenever campaign selection changes
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

  async function handleDismissRecommendation(id: string) {
    try {
      await api.patch(`/recommendations/${id}`, { status: "dismissed" });
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to dismiss");
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    try {
      const qs = selectedCampaignId ? `?campaignId=${selectedCampaignId}` : "";
      await downloadFileFromApi(`/analytics/export${qs}`, "analytics-export.csv");
    } catch (err: any) {
      toast.error(err.message ?? "Export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleExportMonthlyPdf() {
    setExportingPdf(true);
    try {
      await downloadFileFromApi("/analytics/monthly-report", "monthly-report.pdf");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download monthly report");
    } finally {
      setExportingPdf(false);
    }
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

  // No data at all — empty state
  if (!hasData && activeTab === "overview") {
    return (
      <div className="space-y-6">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 w-fit">
          {(["overview", "revenue", "budget", "hashtags"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "hashtags" && <Hash className="h-3 w-3" />}
              {tab === "revenue" && <DollarSign className="h-3 w-3" />}
              {tab === "budget" && <Wallet className="h-3 w-3" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Publish your first campaign to start tracking performance. Impressions, clicks, and conversions will appear here automatically."
          actions={[{ label: "Create Campaign", onClick: () => router.push("/dashboard") }]}
        />
      </div>
    );
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 w-fit">
        {(["overview", "revenue", "budget", "hashtags"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "hashtags" && <Hash className="h-3 w-3" />}
            {tab === "revenue" && <DollarSign className="h-3 w-3" />}
            {tab === "budget" && <Wallet className="h-3 w-3" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Hashtags tab */}
      {activeTab === "hashtags" && (
        <HashtagsTab orgBannedHashtags={initialBannedHashtags ?? []} />
      )}

      {/* Revenue tab */}
      {activeTab === "revenue" && <RevenueTab />}

      {/* Budget tab */}
      {activeTab === "budget" && <BudgetTab />}

      {/* Overview tab — redesigned insights-first layout */}
      {activeTab === "overview" && <>

      {/* Controls bar */}
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

        <div className="ml-auto flex items-center gap-2">
          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveReport}
              disabled={savedReport}
              className="gap-1.5"
            >
              {savedReport ? (
                <><Check className="h-3.5 w-3.5 text-green-500" />Saved</>
              ) : (
                <><BookmarkCheck className="h-3.5 w-3.5" />Save Report</>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportMonthlyPdf}
            disabled={exportingPdf}
          >
            {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Monthly Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={handleOptimize}
            disabled={!hasData || optimizing}
            className="gap-1.5"
          >
            {optimizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {optimizing ? "Analyzing…" : "Generate Fresh Analysis"}
          </Button>
        </div>
      </div>

      {selectedCampaign && (
        <p className="text-sm text-muted-foreground -mt-3">
          Showing data for: <span className="font-medium text-foreground">{selectedCampaign.name}</span>
        </p>
      )}

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

      {/* Insufficient data message */}
      {insufficientData ? (
        <InsufficientDataMessage current={totals.impressions} />
      ) : (
        <>
          {/* ─── Section 1: What to do next ─── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">What to do next</h2>
            </div>
            <WhatToDoNext
              recommendations={recommendations}
              reportActionItems={report?.actionItems ?? []}
              onDismiss={handleDismissRecommendation}
            />
          </section>

          {/* ─── Section 2: How you're doing ─── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">How you&apos;re doing</h2>
            </div>
            <HowYoureDoing
              totals={displayTotals}
              previousTotals={previousTotals}
              channelData={channelData}
            />
          </section>

          {/* ─── Best time to post ─── */}
          {bestPostingTimes.length > 0 && (
            <BestTimeToPost times={bestPostingTimes} />
          )}

          {/* KPI cards (compact row) */}
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

          {/* ─── Section 3: The details (collapsible) ─── */}
          <section>
            <TheDetails
              trendData={trendData}
              channelData={channelData}
              report={report}
              reportRaw={reportRaw}
              quota={quota}
            />
          </section>
        </>
      )}

      </>} {/* end overview tab */}
    </div>
  );
}
