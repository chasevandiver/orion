"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Target,
  Brain,
  FileText,
  Send,
  BarChart3,
  Users,
  Zap,
  GitBranch,
  Settings,
  CreditCard,
  Palette,
  CheckSquare,
  CalendarDays,
  Rocket,
  Magnet,
  Mail,
  Server,
  ChevronDown,
  Home,
  Megaphone,
  LayoutDashboard,
  Search,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  {
    href: "/dashboard/campaigns",
    label: "Campaigns",
    icon: Megaphone,
    children: [
      { href: "/dashboard", label: "Goals", icon: Target },
      { href: "/dashboard/strategy", label: "Strategy", icon: Brain },
      { href: "/dashboard/content", label: "Content", icon: FileText },
      { href: "/dashboard/campaigns", label: "All Campaigns", icon: GitBranch },
      { href: "/dashboard/review", label: "Review", icon: CheckSquare },
      { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/dashboard/seo", label: "SEO", icon: Search },
    ],
  },
  {
    href: "/dashboard/distribute",
    label: "Publish",
    icon: Send,
    children: [
      { href: "/dashboard/distribute", label: "Distribute", icon: Send },
      { href: "/dashboard/workflows", label: "Workflows", icon: Zap },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: Rocket },
      { href: "/dashboard/lead-magnets", label: "Lead Magnets", icon: Magnet },
      { href: "/dashboard/sequences", label: "Sequences", icon: Mail },
      { href: "/dashboard/broadcasts", label: "Broadcasts", icon: Send },
    ],
  },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/contacts", label: "CRM", icon: Users },
  { href: "/dashboard/brands", label: "Brand Kit", icon: Palette },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function SystemStatusDot() {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health/system")
      .then((r) => r.json())
      .then((d) => setHealthy(d.healthy === true))
      .catch(() => setHealthy(false));
  }, []);

  if (healthy === null) return null;
  return (
    <span
      className={`ml-auto h-2 w-2 rounded-full shrink-0 ${
        healthy ? "bg-orion-green" : "bg-red-400 animate-pulse"
      }`}
      title={healthy ? "All systems operational" : "One or more critical services down"}
    />
  );
}

function NavItemLink({
  item,
  pathname,
  depth = 0,
}: {
  item: NavItem;
  pathname: string;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasChildren = item.children && item.children.length > 0;

  // Determine if this item or any child is active
  const isDirectActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);

  const isChildActive =
    hasChildren &&
    item.children!.some((child) =>
      child.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(child.href),
    );

  const isActive = depth === 0 ? (hasChildren ? isChildActive : isDirectActive) : isDirectActive;

  // Auto-expand if a child is active
  useEffect(() => {
    if (isChildActive) setExpanded(true);
  }, [isChildActive]);

  if (hasChildren && depth === 0) {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isChildActive
              ? "bg-orion-green/10 text-orion-green"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
            {item.children!.map((child) => (
              <NavItemLink key={child.href + child.label} item={child} pathname={pathname} depth={1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // For the top-level "Home" link, only match exact /dashboard
  const linkHref = item.href;

  return (
    <Link
      href={linkHref}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        depth === 0 ? "py-2" : "py-1.5 text-xs",
        isActive
          ? depth === 0
            ? "bg-orion-green/10 text-orion-green"
            : "text-orion-green"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <item.icon className={cn("shrink-0", depth === 0 ? "h-4 w-4" : "h-3.5 w-3.5")} />
      {item.label}
      {isActive && depth === 0 && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orion-green" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-orion-dark-2">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orion-green to-orion-blue text-sm font-bold text-black">
          ⚡
        </div>
        <span className="font-mono text-base font-bold tracking-tight text-white">ORION</span>
        <span className="rounded border border-orion-green/30 px-1.5 py-0.5 font-mono text-[10px] text-orion-green">
          AI OS
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavItemLink key={item.href + item.label} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        <Link
          href="/dashboard/billing"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
            pathname.startsWith("/dashboard/billing")
              ? "bg-orion-green/10 text-orion-green"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <CreditCard className="h-3.5 w-3.5 shrink-0" />
          Billing
        </Link>
        <Link
          href="/dashboard/system-status"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
            pathname.startsWith("/dashboard/system-status")
              ? "bg-orion-green/10 text-orion-green"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Server className="h-3.5 w-3.5 shrink-0" />
          System Status
          <SystemStatusDot />
        </Link>
        <p className="text-center font-mono text-[10px] text-muted-foreground">ORION v0.1.0</p>
      </div>
    </aside>
  );
}
