"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      { href: "/dashboard/review", label: "Review", icon: CheckSquare },
    ],
  },
  {
    group: "Distribution",
    items: [
      { href: "/dashboard/distribute", label: "Distribute", icon: Send },
      { href: "/dashboard/workflows", label: "Workflows", icon: Zap },
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
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
      <div className="border-t border-border p-3">
        <p className="text-center font-mono text-[10px] text-muted-foreground">
          ORION v0.1.0
        </p>
      </div>
    </aside>
  );
}
