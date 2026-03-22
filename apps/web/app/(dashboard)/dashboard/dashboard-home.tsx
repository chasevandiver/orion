"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  CheckSquare,
  Send,
  Target,
  Plus,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart2,
  UserCheck,
  CreditCard,
  Info,
  Bell,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeCampaigns: number;
  pendingReview: number;
  publishedThisWeek: number;
  totalGoals: number;
  recentGoals: Array<{
    id: string;
    brandName: string;
    type: string;
    createdAt: string;
    pipelineStage: number | null;
    campaignId: string | null;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    read: boolean;
  }>;
}

// ── Notification icon map ────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  pipeline_complete: { icon: <Zap className="h-3.5 w-3.5" />, color: "text-orion-green" },
  pipeline_error: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "text-red-400" },
  publish_success: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-orion-green" },
  publish_failed: { icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-400" },
  optimization_ready: { icon: <BarChart2 className="h-3.5 w-3.5" />, color: "text-blue-400" },
  crm_scored: { icon: <UserCheck className="h-3.5 w-3.5" />, color: "text-purple-400" },
  contact_scored: { icon: <UserCheck className="h-3.5 w-3.5" />, color: "text-purple-400" },
  plan_limit: { icon: <CreditCard className="h-3.5 w-3.5" />, color: "text-amber-400" },
  quota_warning: { icon: <CreditCard className="h-3.5 w-3.5" />, color: "text-amber-400" },
  quota_exceeded: { icon: <CreditCard className="h-3.5 w-3.5" />, color: "text-red-400" },
  info: { icon: <Info className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
};

const GOAL_TYPE_COLORS: Record<string, string> = {
  leads: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awareness: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  conversions: "bg-green-500/10 text-green-400 border-green-500/20",
  traffic: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  social: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  product: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  event: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const STAGE_LABELS = ["Queued", "Strategy", "Content", "Images", "Compositing", "Complete"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Goal type inference from natural language ────────────────────────────────

const GOAL_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: "leads", keywords: ["lead", "leads", "customers", "sign up", "signup", "subscribe", "subscribers", "capture", "funnel", "pipeline"] },
  { type: "conversions", keywords: ["convert", "conversion", "buy", "purchase", "checkout", "sale", "sales", "revenue", "roi"] },
  { type: "traffic", keywords: ["traffic", "website", "visits", "visitors", "blog", "seo", "search", "organic"] },
  { type: "social", keywords: ["followers", "following", "engagement", "community", "social", "grow audience", "likes"] },
  { type: "product", keywords: ["product", "launch", "release", "feature", "announce", "new product"] },
  { type: "event", keywords: ["event", "conference", "webinar", "workshop", "meetup", "seminar"] },
  { type: "awareness", keywords: ["awareness", "brand", "visibility", "exposure", "reach", "presence", "know about", "word out"] },
];

const QUICK_CHANNELS: Record<string, string[]> = {
  leads: ["linkedin", "email"],
  awareness: ["instagram", "facebook", "twitter"],
  event: ["linkedin", "instagram", "email"],
  product: ["instagram", "facebook", "linkedin"],
  traffic: ["twitter", "blog", "facebook"],
  social: ["instagram", "tiktok", "twitter"],
  conversions: ["email", "linkedin", "facebook"],
};

function inferGoalType(text: string): string {
  const lower = text.toLowerCase();
  let bestType = "awareness";
  let bestScore = 0;
  for (const { type, keywords } of GOAL_KEYWORDS) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

// ── Quick Campaign ───────────────────────────────────────────────────────────

function QuickCampaign({ brandName }: { brandName: string }) {
  const router = useRouter();
  const toast = useAppToast();
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);

  async function handleLaunch() {
    const text = prompt.trim();
    if (!text || !brandName) return;

    setLaunching(true);
    const goalType = inferGoalType(text);
    const channels = QUICK_CHANNELS[goalType] ?? ["instagram", "facebook", "twitter"];

    try {
      const res = await api.post<{ data: { id: string } }>("/goals", {
        type: goalType,
        brandName,
        brandDescription: text,
        timeline: "1_month",
        channels,
        abTesting: false,
      });
      router.push(`/dashboard/campaigns/war-room?goalId=${res.data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to launch campaign");
      setLaunching(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-orion-green/20 bg-gradient-to-br from-orion-green/5 via-transparent to-orion-blue/5 p-6">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orion-green/5 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-orion-green" />
          <h2 className="text-lg font-semibold">Quick Campaign</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Describe what you want to achieve and ORION will pick the best goal type, channels, and strategy automatically.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
                e.preventDefault();
                handleLaunch();
              }
            }}
            placeholder='e.g. "Get more customers for my bakery this month"'
            disabled={launching}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-orion-green/50 focus:outline-none focus:ring-1 focus:ring-orion-green/30 disabled:opacity-50"
          />
          <Button
            onClick={handleLaunch}
            disabled={launching || !prompt.trim()}
            className="bg-orion-green text-black hover:bg-orion-green-dim gap-2 px-5"
          >
            {launching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {launching ? "Launching..." : "Launch"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "Get more leads from LinkedIn",
            "Grow my Instagram following",
            "Promote our upcoming webinar",
            "Drive traffic to our new blog",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setPrompt(suggestion)}
              disabled={launching}
              className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground hover:border-orion-green/30 hover:text-foreground transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Smart Suggestions ────────────────────────────────────────────────────────

interface Suggestion {
  id: string;
  text: string;
  action: string;
  href: string;
  priority: number;
}

function computeSuggestions(stats: DashboardStats): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (stats.pendingReview > 0) {
    suggestions.push({
      id: "pending-review",
      text: `You have ${stats.pendingReview} asset${stats.pendingReview !== 1 ? "s" : ""} awaiting review. Approve them to start publishing.`,
      action: "Review Now",
      href: "/dashboard/review",
      priority: 1,
    });
  }

  if (stats.activeCampaigns > 0 && stats.publishedThisWeek === 0) {
    suggestions.push({
      id: "no-publishes",
      text: "You have active campaigns but haven't published this week. Schedule some posts to stay consistent.",
      action: "Go to Distribute",
      href: "/dashboard/distribute",
      priority: 2,
    });
  }

  if (stats.activeCampaigns === 0 && stats.totalGoals > 0) {
    suggestions.push({
      id: "no-active",
      text: "No active campaigns right now. Launch a new one to keep your marketing momentum.",
      action: "Create Campaign",
      href: "/dashboard?newGoal=1",
      priority: 3,
    });
  }

  if (stats.totalGoals >= 3 && stats.publishedThisWeek > 0) {
    suggestions.push({
      id: "check-analytics",
      text: "You're publishing consistently. Check your analytics to see what's performing best.",
      action: "View Analytics",
      href: "/dashboard/analytics",
      priority: 4,
    });
  }

  if (stats.totalGoals > 0 && stats.activeCampaigns > 0) {
    suggestions.push({
      id: "check-contacts",
      text: "Review your CRM to see if any new leads need follow-up.",
      action: "View Contacts",
      href: "/dashboard/contacts",
      priority: 5,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function SmartSuggestions({ stats }: { stats: DashboardStats }) {
  const router = useRouter();
  const suggestions = computeSuggestions(stats);

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-orion-green" />
        <h2 className="text-sm font-semibold">Suggested Next Steps</h2>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            onClick={() => router.push(s.href)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50 group"
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-orion-green" />
            <span className="flex-1 text-sm text-muted-foreground group-hover:text-foreground">
              {s.text}
            </span>
            <span className="shrink-0 text-xs font-medium text-orion-green opacity-0 group-hover:opacity-100 transition-opacity">
              {s.action}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function DashboardHome({ stats, brandName }: { stats: DashboardStats; brandName?: string }) {
  const router = useRouter();

  const metrics = [
    { label: "Active Campaigns", value: stats.activeCampaigns, icon: GitBranch, href: "/dashboard/campaigns" },
    { label: "Pending Review", value: stats.pendingReview, icon: CheckSquare, href: "/dashboard/review" },
    { label: "Published This Week", value: stats.publishedThisWeek, icon: Send, href: "/dashboard/distribute" },
    { label: "Total Goals", value: stats.totalGoals, icon: Target, href: "/dashboard" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-sm text-muted-foreground">
            Your marketing operations at a glance.
          </p>
        </div>
        <Button
          onClick={() => router.push("/dashboard?newGoal=1")}
          className="bg-orion-green text-black hover:bg-orion-green-dim"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Goal
        </Button>
      </div>

      {/* Quick Campaign */}
      {brandName && <QuickCampaign brandName={brandName} />}

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.label}
            onClick={() => router.push(m.href)}
            className="group rounded-lg border border-border bg-card p-4 text-left transition-all duration-200 hover:border-orion-green/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orion-green/5"
          >
            <div className="flex items-center justify-between">
              <m.icon className="h-4 w-4 text-muted-foreground group-hover:text-orion-green transition-colors" />
              <span className="text-2xl font-bold text-orion-green tabular-nums">{m.value}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{m.label}</p>
          </button>
        ))}
      </div>

      {/* Smart Suggestions */}
      <SmartSuggestions stats={stats} />

      {/* Two-column: Recent Pipelines + Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Pipeline Runs */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Pipelines</h2>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orion-green transition-colors"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {stats.recentGoals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No goals yet. Create one to get started.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentGoals.map((goal) => {
                const stage = goal.pipelineStage ?? 0;
                const isComplete = stage >= 5;
                return (
                  <button
                    key={goal.id}
                    onClick={() =>
                      goal.campaignId && isComplete
                        ? router.push(`/dashboard/campaigns/${goal.campaignId}/summary`)
                        : goal.campaignId
                        ? router.push(`/dashboard/campaigns/war-room?goalId=${goal.id}`)
                        : null
                    }
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    {/* Stage indicator */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      isComplete
                        ? "border-orion-green bg-orion-green/10 text-orion-green"
                        : "border-border bg-muted text-muted-foreground"
                    }`}>
                      {isComplete ? "✓" : stage}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{goal.brandName}</p>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${GOAL_TYPE_COLORS[goal.type] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {goal.type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {isComplete ? "Complete" : STAGE_LABELS[stage] ?? `Stage ${stage}`}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(goal.createdAt)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
            <button
              onClick={() => router.push("/dashboard/notifications")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orion-green transition-colors"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {stats.recentNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="mb-2 h-7 w-7 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.recentNotifications.map((n) => {
                const config = NOTIF_ICON[n.type] ?? { icon: <Bell className="h-3.5 w-3.5" />, color: "text-muted-foreground" };
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 rounded-md px-2 py-2 ${!n.read ? "bg-orion-green/5" : ""}`}
                  >
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted ${config.color}`}>
                      {config.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{n.body}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
