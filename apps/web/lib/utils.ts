import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a date in the org's local timezone using the native Intl API.
 *
 * formatStr presets:
 *   "short" (default) — "Jan 14, 2025, 9:00 AM"
 *   "date"            — "Jan 14, 2025"
 *   "time"            — "9:00 AM"
 *   "long"            — "Tue, Jan 14, 2025, 9:00 AM"
 */
export function formatInOrgTimezone(
  date: Date | string,
  orgTimezone: string,
  formatStr: "short" | "date" | "time" | "long" = "short",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  const presets: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
    date: { month: "short", day: "numeric", year: "numeric" },
    time: { hour: "numeric", minute: "2-digit", hour12: true },
    long: { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
  };

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...(presets[formatStr] ?? presets.short),
      timeZone: orgTimezone,
    }).format(d);
  } catch {
    // Fallback if timezone string is invalid
    return d.toLocaleString("en-US", presets[formatStr] ?? presets.short);
  }
}
