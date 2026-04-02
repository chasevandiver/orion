"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StelosGem } from "@/components/ui/stelos-gem";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/lib/sidebar-store";
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
  Images,
  Eye,
  X,
  PlusCircle,
  Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NavChild {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  icon: LucideIcon;
  children: NavChild[];
}

// ── Navigation structure ───────────────────────────────────────────────────────

const HOME_HREF = "/dashboard";

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Create",
    icon: PlusCircle,
    children: [
      { href: "/dashboard/goals",     label: "Goals",     icon: Target       },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: GitBranch    },
      { href: "/dashboard/strategy",  label: "Strategy",  icon: Brain        },
      { href: "/dashboard/calendar",  label: "Calendar",  icon: CalendarDays },
    ],
  },
  {
    label: "Content",
    icon: Layers,
    children: [
      { href: "/dashboard/content",       label: "Library",       icon: FileText   },
      { href: "/dashboard/review",        label: "Review",        icon: CheckSquare },
      { href: "/media",                    label: "Media Library", icon: Images     },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: Rocket     },
      { href: "/dashboard/lead-magnets",  label: "Lead Magnets",  icon: Magnet     },
    ],
  },
  {
    label: "Publish",
    icon: Send,
    children: [
      { href: "/dashboard/distribute", label: "Distribute", icon: Send },
      { href: "/dashboard/sequences",  label: "Sequences",  icon: Mail },
      { href: "/dashboard/workflows",  label: "Workflows",  icon: Zap  },
    ],
  },
  {
    label: "Analyze",
    icon: BarChart3,
    children: [
      { href: "/dashboard/analytics",   label: "Analytics",   icon: BarChart3 },
      { href: "/dashboard/competitors", label: "Competitors", icon: Eye       },
      { href: "/dashboard/contacts",    label: "CRM",         icon: Users     },
    ],
  },
];

// Routes shown in the bottom utility strip
const BOTTOM_LINKS = [
  { href: "/dashboard/brands",   label: "Brand Kit", Icon: Palette    },
  { href: "/dashboard/settings", label: "Settings",  Icon: Settings   },
  { href: "/dashboard/billing",  label: "Billing",   Icon: CreditCard },
];

// ── Visited-routes tracking (feature discovery "New" badge) ───────────────────
// Stored in localStorage as a JSON array so the dot disappears after first visit.
// Initialised to null until the client hydrates to avoid SSR mismatch.

const VISITED_KEY = "orion_visited_routes";

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function persistVisited(s: Set<string>) {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify([...s]));
  } catch {}
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
      title={healthy ? "All systems operational" : "One or more services down"}
    />
  );
}

/** Small green dot used as a "New / unvisited" indicator. */
function NewDot({ className }: { className?: string }) {
  return (
    <span
      aria-label="New"
      title="You haven't visited this yet"
      className={cn("h-1.5 w-1.5 rounded-full bg-orion-green shrink-0", className)}
    />
  );
}

function SectionItem({
  section,
  pathname,
  visited,
  onVisit,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  /** null = not yet hydrated; show no dots until localStorage is read */
  visited: Set<string> | null;
  onVisit: (href: string) => void;
  onNavigate?: () => void;
}) {
  const isChildActive = section.children.some((c) => pathname.startsWith(c.href));
  const [expanded, setExpanded] = useState(false);

  // Auto-expand when the user is already inside this section
  useEffect(() => {
    if (isChildActive) setExpanded(true);
  }, [isChildActive]);

  // Propagate a "new" hint on the collapsed header when children are unvisited
  const hasUnvisitedChild =
    visited !== null && section.children.some((c) => !visited.has(c.href));

  return (
    <div>
      {/* Section header toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
          isChildActive
            ? "bg-orion-green/10 text-orion-green"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <section.icon className="h-4 w-4 shrink-0" />
        {section.label}
        {/* Show aggregated new-dot on header only while collapsed */}
        {!expanded && hasUnvisitedChild && (
          <NewDot className="ml-1" />
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Child links */}
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
          {section.children.map((child) => {
            const isActive = pathname.startsWith(child.href);
            const isNew = visited !== null && !visited.has(child.href);

            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => { onVisit(child.href); onNavigate?.(); }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  isActive
                    ? "text-orion-green"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                {child.label}
                {isNew && !isActive && <NewDot className="ml-auto" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar contents (shared by desktop + mobile drawer) ──────────────────────

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  // null = server/first render; populated after hydration to avoid mismatch
  const [visited, setVisited] = useState<Set<string> | null>(null);

  useEffect(() => {
    setVisited(loadVisited());
  }, []);

  // Mark current page visited whenever the route changes
  useEffect(() => {
    if (!pathname) return;
    setVisited((prev) => {
      const base = prev ?? new Set<string>();
      if (base.has(pathname)) return prev;
      const next = new Set(base);
      next.add(pathname);
      persistVisited(next);
      return next;
    });
  }, [pathname]);

  function handleVisit(href: string) {
    setVisited((prev) => {
      const base = prev ?? new Set<string>();
      if (base.has(href)) return prev;
      const next = new Set(base);
      next.add(href);
      persistVisited(next);
      return next;
    });
  }

  const isHome = pathname === HOME_HREF;

  return (
    <>
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <StelosGem size={24} />
        <div className="mx-0.5 h-7 w-px bg-gradient-to-b from-transparent via-violet-500/50 to-transparent shrink-0" />
        <div className="flex items-baseline leading-none">
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "16px", letterSpacing: "-0.5px", background: "linear-gradient(135deg, #ffffff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "16px", letterSpacing: "-0.5px", background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {/* Home — standalone, no children */}
        <Link
          href={HOME_HREF}
          onClick={() => { handleVisit(HOME_HREF); onNavigate?.(); }}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
            isHome
              ? "bg-orion-green/10 text-orion-green"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          Home
          {isHome && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orion-green" />}
        </Link>

        {/* Collapsible sections */}
        {NAV_SECTIONS.map((section) => (
          <SectionItem
            key={section.label}
            section={section}
            pathname={pathname}
            visited={visited}
            onVisit={handleVisit}
            onNavigate={() => onNavigate?.()}
          />
        ))}
      </nav>

      {/* Bottom utility links: Brand Kit, Settings, Billing, System Status */}
      <div className="shrink-0 border-t border-border p-3 space-y-0.5">
        {BOTTOM_LINKS.map(({ href, label, Icon }) => {
          const isActive = pathname.startsWith(href);
          const isNew = visited !== null && !visited.has(href) && !isActive;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => { handleVisit(href); onNavigate?.(); }}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                isActive
                  ? "bg-orion-green/10 text-orion-green"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {isNew && <NewDot className="ml-auto" />}
            </Link>
          );
        })}

        <Link
          href="/system-status"
          onClick={() => { handleVisit("/system-status"); onNavigate?.(); }}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
            pathname.startsWith("/system-status")
              ? "bg-orion-green/10 text-orion-green"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Server className="h-3.5 w-3.5 shrink-0" />
          System Status
          <SystemStatusDot />
        </Link>

        <p className="pt-1 text-center font-mono text-[10px] text-muted-foreground">
          STELOS v0.1.0
        </p>
      </div>
    </>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const { open, setOpen } = useSidebarStore();

  return (
    <>
      {/* Desktop — hidden on mobile */}
      <aside className="hidden md:flex h-full w-56 flex-col border-r border-border bg-orion-dark-2">
        <SidebarContents />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50" aria-modal="true" role="dialog">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-orion-dark-2 shadow-2xl">
            <button
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContents onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
