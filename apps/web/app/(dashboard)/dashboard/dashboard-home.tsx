"use client";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

// ── Component ────────────────────────────────────────────────────────────────

export function DashboardHome({ stats }: { stats: DashboardStats }) {
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
