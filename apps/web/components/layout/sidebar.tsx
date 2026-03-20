"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
  Activity,
  CalendarDays,
  Rocket,
  Magnet,
  Mail,
  Server,
} from "lucide-react";

const navItems = [
  {
    group: "Campaign",
    items: [
      { href: "/dashboard/brands", label: "Brand Kit", icon: Palette },
      { href: "/dashboard", label: "Goals", icon: Target },
      { href: "/dashboard/strategy", label: "Strategy", icon: Brain },
      { href: "/dashboard/content", label: "Content", icon: FileText },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: GitBranch },
      { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/dashboard/review", label: "Review", icon: CheckSquare },
      { href: "/dashboard/pipeline", label: "Pipeline", icon: Activity },
    ],
  },
  {
    group: "Distribution",
    items: [
      { href: "/dashboard/distribute", label: "Distribute", icon: Send },
      { href: "/dashboard/workflows", label: "Workflows", icon: Zap },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: Rocket },
      { href: "/dashboard/lead-magnets", label: "Lead Magnets", icon: Magnet },
      { href: "/dashboard/sequences", label: "Sequences", icon: Mail },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/contacts", label: "CRM", icon: Users },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    ],
  },
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
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navItems.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {group.group}
            </p>
            {group.items.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : item.href === "/dashboard/pipeline"
                  ? pathname.startsWith("/dashboard/pipeline")
                  : pathname.startsWith(item.href);
              // Pipeline links to Goals page (pipelines are launched from there)
              const linkHref = item.href === "/dashboard/pipeline" ? "/dashboard" : item.href;
              return (
                <Link
                  key={item.label}
                  href={linkHref}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-orion-green/10 text-orion-green"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orion-green" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
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
        <p className="text-center font-mono text-[10px] text-muted-foreground">
          ORION v0.1.0
        </p>
      </div>
    </aside>
  );
}
