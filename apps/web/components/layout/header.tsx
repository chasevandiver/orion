"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { User } from "next-auth";
import {
  Bell, LogOut, User as UserIcon, Check,
  Zap, CheckCircle2, XCircle, BarChart2, UserCheck,
  AlertTriangle, CreditCard, Info, ArrowRight, Search,
} from "lucide-react";
import { useCommandStore } from "@/lib/command-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  createdAt: string;
}

// ── Notification type config ───────────────────────────────────────────────────

interface NotificationConfig {
  icon: React.ReactNode;
  /** Tailwind text-color class for the icon container */
  color: string;
}

const NOTIFICATION_CONFIG: Record<string, NotificationConfig> = {
  pipeline_complete: {
    icon: <Zap className="h-3.5 w-3.5" />,
    color: "text-orion-green",
  },
  pipeline_error: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: "text-red-400",
  },
  publish_success: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "text-orion-green",
  },
  publish_failed: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: "text-red-400",
  },
  optimization_ready: {
    icon: <BarChart2 className="h-3.5 w-3.5" />,
    color: "text-blue-400",
  },
  crm_scored: {
    icon: <UserCheck className="h-3.5 w-3.5" />,
    color: "text-purple-400",
  },
  contact_scored: {
    icon: <UserCheck className="h-3.5 w-3.5" />,
    color: "text-purple-400",
  },
  plan_limit: {
    icon: <CreditCard className="h-3.5 w-3.5" />,
    color: "text-amber-400",
  },
  quota_warning: {
    icon: <CreditCard className="h-3.5 w-3.5" />,
    color: "text-amber-400",
  },
  quota_exceeded: {
    icon: <CreditCard className="h-3.5 w-3.5" />,
    color: "text-red-400",
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    color: "text-muted-foreground",
  },
};

const DEFAULT_CONFIG: NotificationConfig = {
  icon: <Bell className="h-3.5 w-3.5" />,
  color: "text-muted-foreground",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getNotificationConfig(type: string): NotificationConfig {
  return NOTIFICATION_CONFIG[type] ?? DEFAULT_CONFIG;
}

/**
 * Map resourceType + resourceId → internal app URL.
 * Returns null for notification types that have no dedicated page.
 */
function getResourceHref(n: Notification): string | null {
  const { resourceType, resourceId } = n;

  switch (resourceType) {
    case "campaign":
      return resourceId ? `/dashboard/campaigns/${resourceId}/summary` : "/dashboard/campaigns";
    case "goal":
      return resourceId ? `/dashboard/campaigns/war-room?goalId=${resourceId}` : "/dashboard";
    case "scheduled_post":
      return "/dashboard/distribute";
    case "billing":
      return "/dashboard/billing";
    case "contact":
      return resourceId ? `/dashboard/contacts/${resourceId}` : "/dashboard/contacts";
    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const toggleCommand = useCommandStore((s) => s.toggle);

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ data: Notification[] }>("/notifications?limit=10");
      setNotifications(res.data ?? []);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 30_000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

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

  function handleNotificationClick(n: Notification) {
    markRead(n.id);
    const href = getResourceHref(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-orion-dark-2 px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleCommand}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search className="h-3 w-3" />
          <span>Search...</span>
          <kbd className="ml-2 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            {/* Header row */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bell className="mb-2 h-7 w-7 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 10).map((n) => {
                  const config = getNotificationConfig(n.type);
                  const hasLink = !!getResourceHref(n);

                  return (
                    <button
                      key={n.id}
                      className={`w-full flex gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 ${
                        !n.read ? "bg-orion-green/5" : ""
                      } ${hasLink ? "cursor-pointer" : "cursor-default"}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      {/* Icon */}
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted ${config.color}`}
                      >
                        {config.icon}
                      </span>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                      </div>

                      {/* Unread dot */}
                      {!n.read && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orion-green" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer — "View all" link */}
            <div className="border-t border-border">
              <button
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setOpen(false); router.push("/dashboard/notifications"); }}
              >
                View all notifications
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                <AvatarFallback className="bg-orion-green/20 text-orion-green text-xs">
                  {initials ?? "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
