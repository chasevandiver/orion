"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import type { User } from "next-auth";
import { Bell, LogOut, User as UserIcon, Check } from "lucide-react";
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

const NOTIFICATION_ICONS: Record<string, string> = {
  pipeline_complete: "⚡",
  publish_success:   "✅",
  publish_failed:    "❌",
  optimization_ready: "📊",
  crm_scored:        "👤",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ data: Notification[] }>("/notifications");
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
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch {}
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }

  function getResourceHref(n: Notification): string | null {
    if (n.resourceType === "campaign" && n.resourceId) return `/dashboard/campaigns/${n.resourceId}/summary`;
    return null;
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-orion-dark-2 px-6">
      <div className="flex items-center gap-2">
        {/* Breadcrumb injected by child pages */}
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
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Check className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                notifications.slice(0, 10).map((n) => {
                  const href = getResourceHref(n);
                  const content = (
                    <div
                      className={`flex gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer ${!n.read ? "bg-orion-green/5" : ""}`}
                      onClick={() => markRead(n.id)}
                    >
                      <span className="shrink-0 text-lg">{NOTIFICATION_ICONS[n.type] ?? "🔔"}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.read ? "font-medium" : ""}`}>{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <span className="shrink-0 mt-1.5 h-2 w-2 rounded-full bg-orion-green" />
                      )}
                    </div>
                  );

                  return href ? (
                    <a key={n.id} href={href} className="block">
                      {content}
                    </a>
                  ) : (
                    <div key={n.id}>{content}</div>
                  );
                })
              )}
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
