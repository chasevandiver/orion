"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Check, Zap, CheckCircle2, XCircle, BarChart2,
  UserCheck, AlertTriangle, CreditCard, Info, ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  read: boolean;
  createdAt: Date | string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

interface NotificationConfig {
  icon: React.ReactNode;
  color: string;
  label: string;
}

const NOTIFICATION_CONFIG: Record<string, NotificationConfig> = {
  pipeline_complete: { icon: <Zap className="h-4 w-4" />,          color: "text-orion-green",          label: "Pipeline" },
  pipeline_error:   { icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-400",              label: "Pipeline" },
  publish_success:  { icon: <CheckCircle2 className="h-4 w-4" />,  color: "text-orion-green",          label: "Publishing" },
  publish_failed:   { icon: <XCircle className="h-4 w-4" />,       color: "text-red-400",              label: "Publishing" },
  optimization_ready: { icon: <BarChart2 className="h-4 w-4" />,   color: "text-blue-400",             label: "Analytics" },
  crm_scored:       { icon: <UserCheck className="h-4 w-4" />,     color: "text-purple-400",           label: "CRM" },
  contact_scored:   { icon: <UserCheck className="h-4 w-4" />,     color: "text-purple-400",           label: "CRM" },
  plan_limit:       { icon: <CreditCard className="h-4 w-4" />,    color: "text-amber-400",            label: "Billing" },
  quota_warning:    { icon: <CreditCard className="h-4 w-4" />,    color: "text-amber-400",            label: "Billing" },
  quota_exceeded:   { icon: <CreditCard className="h-4 w-4" />,    color: "text-red-400",              label: "Billing" },
  info:             { icon: <Info className="h-4 w-4" />,           color: "text-muted-foreground",     label: "Info" },
};

const DEFAULT_CONFIG: NotificationConfig = {
  icon: <Bell className="h-4 w-4" />,
  color: "text-muted-foreground",
  label: "System",
};

function getConfig(type: string) {
  return NOTIFICATION_CONFIG[type] ?? DEFAULT_CONFIG;
}

function getResourceHref(n: Notification): string | null {
  switch (n.resourceType) {
    case "campaign":      return n.resourceId ? `/dashboard/campaigns/${n.resourceId}/summary` : "/dashboard/campaigns";
    case "goal":          return n.resourceId ? `/dashboard/campaigns/war-room?goalId=${n.resourceId}` : "/dashboard";
    case "scheduled_post": return "/dashboard/distribute";
    case "billing":       return "/dashboard/billing";
    case "contact":       return n.resourceId ? `/dashboard/contacts/${n.resourceId}` : "/dashboard/contacts";
    default:              return null;
  }
}

function formatDate(dateStr: Date | string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  if (hrs < 48)    return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await api.get<{ data: Notification[] }>("/notifications?limit=100");
      setNotifications(res.data ?? []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }

  function handleClick(n: Notification) {
    markRead(n.id);
    const href = getResourceHref(n);
    if (href) router.push(href);
  }

  const visible = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={markAllRead}>
              <Check className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {(["all", "unread"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Bell className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === "unread"
              ? "You're all caught up."
              : "Notifications about your campaigns and publishing will appear here."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {visible.map((n) => {
            const config = getConfig(n.type);
            const href = getResourceHref(n);

            return (
              <button
                key={n.id}
                className={`w-full flex items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-accent/30 ${
                  !n.read ? "bg-orion-green/5" : ""
                } ${href ? "cursor-pointer" : "cursor-default"}`}
                onClick={() => handleClick(n)}
              >
                {/* Icon bubble */}
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted ${config.color}`}
                >
                  {config.icon}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                      {n.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {config.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDate(n.createdAt)}
                      </span>
                    </div>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {n.body}
                    </p>
                  )}
                  {href && (
                    <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-primary/70 hover:text-primary">
                      View details <ArrowRight className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orion-green" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
