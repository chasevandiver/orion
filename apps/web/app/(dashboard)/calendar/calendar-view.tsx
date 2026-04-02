"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatInOrgTimezone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Copy,
  Check,
  LayoutGrid,
  Columns,
  CheckCircle2,
  X,
  ArrowRight,
  Zap,
  BarChart2,
  Plus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FirstRunTip } from "@/components/ui/first-run-tip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEntry {
  id: string;
  assetId: string | null;
  channel: string;
  status: "scheduled" | "published" | "failed" | "draft" | string;
  isSimulated: boolean;
  scheduledFor: string | null;
  publishedAt: string | null;
  contentPreview: string;
  compositedImageUrl: string | null;
  campaignName: string | null;
  retryCount: number;
  errorMessage: string | null;
}

interface CalendarData {
  days: Record<string, CalendarEntry[]>;
  stats: { scheduled: number; published: number; failed: number; draft: number };
  year: number;
  month: number;
}

type ViewMode = "month" | "week";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "Twitter/X" },
  instagram: { emoji: "📸", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  email:     { emoji: "📧", label: "Email" },
  blog:      { emoji: "✍️", label: "Blog" },
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-500",
  published: "bg-green-500",
  failed:    "bg-red-500",
  draft:     "bg-gray-400",
  cancelled: "bg-gray-300",
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
  draft:     "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_NAMES_SHORT = ["S","M","T","W","T","F","S"];

// Week view: 6 AM to 10 PM
const WEEK_HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

const MANUAL_CHANNELS = new Set(["tiktok", "blog"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHourInTimezone(isoDate: string, tz: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(new Date(isoDate));
    const h = parseInt(formatted, 10);
    return isNaN(h) ? 12 : h === 24 ? 0 : h;
  } catch {
    return new Date(isoDate).getHours();
  }
}

/** Build the ISO datetime for a target date at the original entry's time (UTC). */
function buildNewScheduledFor(targetDate: string, originalScheduledFor: string | null): string {
  if (!originalScheduledFor) {
    // Draft — schedule for noon UTC on the target date
    return `${targetDate}T12:00:00.000Z`;
  }
  // Keep original time-of-day from the UTC string
  const timePart = originalScheduledFor.slice(10); // "T14:30:00.000Z"
  return `${targetDate}${timePart}`;
}

/** Return the Monday of the week containing `date` (ISO week starts Mon). */
function weekStartMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m!, 10)}/${parseInt(d!, 10)}`;
}

// ── Post pill ─────────────────────────────────────────────────────────────────

function PostPill({
  entry,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  entry: CalendarEntry;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, entry: CalendarEntry) => void;
  onDragEnd: () => void;
}) {
  const meta = CHANNEL_META[entry.channel] ?? { emoji: "📄", label: entry.channel };
  const isManual = MANUAL_CHANNELS.has(entry.channel);
  const dotClass = isManual
    ? "bg-orange-400"
    : entry.isSimulated
    ? "bg-amber-500"
    : (STATUS_DOT[entry.status] ?? "bg-gray-400");

  return (
    <button
      draggable
      onDragStart={(e) => onDragStart(e, entry)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group w-full rounded px-1.5 py-1 text-left text-[10px] hover:bg-accent transition-colors flex items-center gap-1 min-w-0 cursor-grab active:cursor-grabbing active:opacity-60"
    >
      <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="shrink-0">{meta.emoji}</span>
      <span className="truncate text-muted-foreground group-hover:text-foreground">
        {entry.contentPreview || "(no preview)"}
      </span>
      {isManual && <span className="shrink-0 text-orange-400/70">✎</span>}
    </button>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

function PostPanel({
  entry,
  orgTimezone,
  onClose,
}: {
  entry: CalendarEntry;
  orgTimezone: string;
  onClose: () => void;
}) {
  const toast = useAppToast();
  const meta = CHANNEL_META[entry.channel] ?? { emoji: "📄", label: entry.channel };
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const isManual = MANUAL_CHANNELS.has(entry.channel);

  async function handlePublishNow() {
    if (!entry.id || entry.id.startsWith("draft-")) return;
    setPublishing(true);
    try {
      await api.post(`/distribute/${entry.id}/publish`, {});
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error & { message: string }).message ?? "Failed to publish post");
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(entry.contentPreview);
    } catch {
      const el = document.createElement("textarea");
      el.value = entry.contentPreview;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 border-l border-border bg-card shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <span className="font-semibold">{meta.label}</span>
          {isManual ? (
            <Badge className="text-[10px] border bg-orange-400/10 text-orange-400 border-orange-400/20">
              Manual publish
            </Badge>
          ) : entry.isSimulated ? (
            <Badge className="text-[10px] border bg-amber-500/10 text-amber-400 border-amber-500/20">
              Pending integration
            </Badge>
          ) : (
            <Badge className={`text-[10px] border ${STATUS_BADGE[entry.status] ?? ""}`}>
              {entry.status}
            </Badge>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entry.compositedImageUrl && (
          <img
            src={entry.compositedImageUrl}
            alt="composited"
            className="w-full rounded-lg object-cover"
          />
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Content Preview</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{entry.contentPreview}</p>
        </div>

        {entry.campaignName && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Campaign</p>
            <p className="text-sm">{entry.campaignName}</p>
          </div>
        )}

        {entry.scheduledFor && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Scheduled For</p>
            <p className="text-sm">{formatInOrgTimezone(entry.scheduledFor, orgTimezone, "long")}</p>
          </div>
        )}

        {entry.publishedAt && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Published At</p>
            <p className="text-sm text-green-400">{formatInOrgTimezone(entry.publishedAt, orgTimezone, "long")}</p>
          </div>
        )}

        {entry.errorMessage && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Error</p>
            <p className="text-xs text-red-400 font-mono">{entry.errorMessage}</p>
            {entry.retryCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Retry count: {entry.retryCount}/3</p>
            )}
          </div>
        )}
      </div>

      {isManual && (
        <div className="px-4 pb-0 pt-3">
          <p className="rounded-lg border border-orange-400/20 bg-orange-400/5 px-3 py-2 text-[11px] text-orange-400/90 leading-relaxed">
            {entry.channel === "tiktok"
              ? "TikTok content must be published manually — copy the script and post via the TikTok app or Creator Studio."
              : "Blog content must be published manually to your CMS (WordPress, Notion, etc.)."}
          </p>
        </div>
      )}

      <div className="border-t border-border p-4 flex gap-2">
        {isManual ? (
          <Button size="sm" onClick={handleCopy} className="flex-1 gap-2">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied!" : "Copy Content"}
          </Button>
        ) : (
          (entry.status === "scheduled" || entry.status === "failed") &&
          !entry.id.startsWith("draft-") && (
            <Button size="sm" onClick={handlePublishNow} disabled={publishing} className="flex-1 gap-2">
              {publishing && <Loader2 className="h-3 w-3 animate-spin" />}
              Publish Now
            </Button>
          )
        )}
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );
}

// ── Month grid ────────────────────────────────────────────────────────────────

function MonthGrid({
  cells,
  todayStr,
  data,
  dragOverDate,
  onDragOver,
  onDragLeave,
  onDrop,
  onPillClick,
  onPillDragStart,
  onPillDragEnd,
}: {
  cells: Array<{ date: string | null; day: number | null }>;
  todayStr: string;
  data: CalendarData | null;
  dragOverDate: string | null;
  onDragOver: (e: React.DragEvent, date: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, date: string) => void;
  onPillClick: (entry: CalendarEntry) => void;
  onPillDragStart: (e: React.DragEvent, entry: CalendarEntry) => void;
  onPillDragEnd: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {cells.map((cell, idx) => {
          const entries = cell.date ? (data?.days[cell.date] ?? []) : [];
          const isToday = cell.date === todayStr;
          const isOver = cell.date !== null && dragOverDate === cell.date;
          return (
            <div
              key={idx}
              className={`min-h-24 bg-card p-1 flex flex-col transition-colors ${
                !cell.date ? "opacity-30" : ""
              } ${isOver ? "bg-orion-green/10 ring-1 ring-inset ring-orion-green/40" : ""}`}
              onDragOver={cell.date ? (e) => onDragOver(e, cell.date!) : undefined}
              onDragLeave={cell.date ? onDragLeave : undefined}
              onDrop={cell.date ? (e) => onDrop(e, cell.date!) : undefined}
            >
              {cell.day && (
                <span
                  className={`mb-1 flex h-6 w-6 items-center justify-center self-end rounded-full text-xs font-medium ${
                    isToday ? "bg-orion-green text-black" : "text-muted-foreground"
                  }`}
                >
                  {cell.day}
                </span>
              )}
              <div className="flex flex-col gap-0.5">
                {entries.slice(0, 3).map((entry) => (
                  <PostPill
                    key={entry.id}
                    entry={entry}
                    onClick={() => onPillClick(entry)}
                    onDragStart={onPillDragStart}
                    onDragEnd={onPillDragEnd}
                  />
                ))}
                {entries.length > 3 && (
                  <span className="px-1.5 text-[10px] text-muted-foreground">
                    +{entries.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week grid ─────────────────────────────────────────────────────────────────

function WeekGrid({
  weekDates,
  todayStr,
  data,
  orgTimezone,
  dragOverSlot,
  onDragOver,
  onDragLeave,
  onDrop,
  onPillClick,
  onPillDragStart,
  onPillDragEnd,
}: {
  weekDates: string[];        // 7 date strings Mon–Sun
  todayStr: string;
  data: CalendarData | null;
  orgTimezone: string;
  dragOverSlot: string | null; // "YYYY-MM-DD:HH"
  onDragOver: (e: React.DragEvent, date: string, hour: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, date: string, hour?: number) => void;
  onPillClick: (entry: CalendarEntry) => void;
  onPillDragStart: (e: React.DragEvent, entry: CalendarEntry) => void;
  onPillDragEnd: () => void;
}) {
  // Bucket entries per date per hour
  function entriesAt(date: string, hour: number): CalendarEntry[] {
    return (data?.days[date] ?? []).filter((e) => {
      if (!e.scheduledFor) return false;
      return getHourInTimezone(e.scheduledFor, orgTimezone) === hour;
    });
  }

  // Drafts (no scheduledFor) shown in a top "Unscheduled" band per day
  function draftsFor(date: string): CalendarEntry[] {
    return (data?.days[date] ?? []).filter((e) => e.status === "draft" && !e.scheduledFor);
  }

  const COL_W = "flex-1 min-w-0";

  return (
    <div className="flex-1 overflow-auto border border-border rounded-lg">
      {/* Day header row */}
      <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] bg-card border-b border-border">
        <div className="border-r border-border" />
        {weekDates.map((date) => {
          const isToday = date === todayStr;
          const [, m, d] = date.split("-");
          const dayIdx = new Date(date).getDay();
          return (
            <div
              key={date}
              className={`py-2 text-center border-r border-border last:border-r-0 ${isToday ? "bg-orion-green/5" : ""}`}
            >
              <div className="text-xs text-muted-foreground">{DAY_NAMES[dayIdx]}</div>
              <div
                className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-orion-green text-black" : ""
                }`}
              >
                {parseInt(d!, 10)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled drafts band */}
      {weekDates.some((d) => draftsFor(d).length > 0) && (
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/20">
          <div className="border-r border-border px-1 py-1 flex items-center justify-end">
            <span className="text-[9px] text-muted-foreground leading-tight text-right">
              Draft
            </span>
          </div>
          {weekDates.map((date) => {
            const isOver = dragOverSlot === `${date}:draft`;
            return (
              <div
                key={date}
                className={`border-r border-border last:border-r-0 p-0.5 min-h-[32px] transition-colors ${
                  isOver ? "bg-orion-green/10 ring-1 ring-inset ring-orion-green/40" : ""
                }`}
                onDragOver={(e) => onDragOver(e, date, -1)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, date)}
              >
                {draftsFor(date).map((entry) => (
                  <PostPill
                    key={entry.id}
                    entry={entry}
                    onClick={() => onPillClick(entry)}
                    onDragStart={onPillDragStart}
                    onDragEnd={onPillDragEnd}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time slot rows */}
      {WEEK_HOURS.map((hour) => (
        <div key={hour} className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border last:border-b-0">
          <div className="border-r border-border px-2 py-1 flex items-start justify-end">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </span>
          </div>
          {weekDates.map((date) => {
            const slotKey = `${date}:${hour}`;
            const isOver = dragOverSlot === slotKey;
            const isToday = date === todayStr;
            const entries = entriesAt(date, hour);
            return (
              <div
                key={date}
                className={`border-r border-border last:border-r-0 min-h-[48px] p-0.5 transition-colors ${
                  isToday ? "bg-orion-green/[0.03]" : ""
                } ${isOver ? "bg-orion-green/10 ring-1 ring-inset ring-orion-green/40" : ""}`}
                onDragOver={(e) => onDragOver(e, date, hour)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, date, hour)}
              >
                {entries.map((entry) => (
                  <PostPill
                    key={entry.id}
                    entry={entry}
                    onClick={() => onPillClick(entry)}
                    onDragStart={onPillDragStart}
                    onDragEnd={onPillDragEnd}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Mobile list view ─────────────────────────────────────────────────────────

function MobileListView({
  data,
  orgTimezone,
  onPillClick,
}: {
  data: CalendarData | null;
  orgTimezone: string;
  onPillClick: (entry: CalendarEntry) => void;
}) {
  if (!data) return null;

  const sortedDates = Object.keys(data.days).sort();

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <CalendarDays className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-sm">No posts this month.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => {
        const entries = data.days[date] ?? [];
        const [year, m, d] = date.split("-");
        const dateObj = new Date(`${date}T12:00:00Z`);
        const label = dateObj.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

        return (
          <div key={date}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <div className="space-y-1.5">
              {entries.map((entry) => {
                const meta = CHANNEL_META[entry.channel] ?? { emoji: "📄", label: entry.channel };
                const isManual = MANUAL_CHANNELS.has(entry.channel);
                const dotClass = isManual
                  ? "bg-orange-400"
                  : entry.isSimulated
                  ? "bg-amber-500"
                  : (STATUS_DOT[entry.status] ?? "bg-gray-400");
                const timeStr = entry.scheduledFor
                  ? formatInOrgTimezone(entry.scheduledFor, orgTimezone, "short")
                  : "Unscheduled";

                return (
                  <button
                    key={entry.id}
                    onClick={() => onPillClick(entry)}
                    className="w-full flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                  >
                    <span className="mt-0.5 text-base shrink-0">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                        <span className="text-xs font-medium">{meta.label}</span>
                        {isManual && (
                          <span className="text-[10px] text-orange-400">✎ Manual</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.contentPreview || "(no preview)"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeStr}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main calendar view ────────────────────────────────────────────────────────

export function CalendarView({ orgTimezone = "America/Chicago" }: { orgTimezone?: string }) {
  const toast = useAppToast();
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";
  const [showNextSteps, setShowNextSteps] = useState(fromReview);
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(now));
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);

  // Drag state — use a ref for the source entry (no re-render needed) and state
  // for the drag-over target (triggers highlight re-render).
  const draggingRef = useRef<{ entry: CalendarEntry; fromDate: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);   // month view
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);   // week view

  // ── Data loading ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: CalendarData }>(
        `/pipeline/calendar?year=${year}&month=${month}`,
      );
      setData(res.data);
    } catch (err: unknown) {
      setError((err as Error & { message?: string }).message ?? "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevPeriod() {
    if (viewMode === "month") {
      if (month === 0) { setYear((y) => y - 1); setMonth(11); }
      else setMonth((m) => m - 1);
    } else {
      const newStart = addDays(weekStart, -7);
      setWeekStart(newStart);
      setYear(newStart.getFullYear());
      setMonth(newStart.getMonth());
    }
  }

  function nextPeriod() {
    if (viewMode === "month") {
      if (month === 11) { setYear((y) => y + 1); setMonth(0); }
      else setMonth((m) => m + 1);
    } else {
      const newStart = addDays(weekStart, 7);
      setWeekStart(newStart);
      setYear(newStart.getFullYear());
      setMonth(newStart.getMonth());
    }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  function handlePillDragStart(e: React.DragEvent, entry: CalendarEntry) {
    // Find which date this entry lives under
    const fromDate = entry.scheduledFor
      ? entry.scheduledFor.slice(0, 10)
      : Object.entries(data?.days ?? {}).find(([, entries]) =>
          entries.some((en) => en.id === entry.id),
        )?.[0] ?? "";

    draggingRef.current = { entry, fromDate };
    e.dataTransfer.effectAllowed = "move";
    // Store entry id so the drop handler can identify it
    e.dataTransfer.setData("text/plain", entry.id);
  }

  function handlePillDragEnd() {
    draggingRef.current = null;
    setDragOverDate(null);
    setDragOverSlot(null);
  }

  function handleDragOver(e: React.DragEvent, date: string, hour?: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (viewMode === "month") {
      setDragOverDate(date);
    } else {
      const key = hour === undefined || hour === -1 ? `${date}:draft` : `${date}:${hour}`;
      setDragOverSlot(key);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when leaving the cell (not entering a child element)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
      setDragOverDate(null);
      setDragOverSlot(null);
    }
  }

  async function handleDrop(e: React.DragEvent, targetDate: string, targetHour?: number) {
    e.preventDefault();
    setDragOverDate(null);
    setDragOverSlot(null);

    const dragging = draggingRef.current;
    if (!dragging) return;

    const { entry, fromDate } = dragging;
    draggingRef.current = null;

    // No-op: same date + same hour slot
    if (targetDate === fromDate) {
      if (viewMode === "week") {
        const currentHour = entry.scheduledFor
          ? getHourInTimezone(entry.scheduledFor, orgTimezone)
          : -1;
        if (targetHour === currentHour || targetHour === undefined) return;
      } else {
        return;
      }
    }

    // Build the new scheduledFor
    let newScheduledFor: string;
    if (targetHour !== undefined && targetHour >= 0) {
      // Week view drop on a time slot — use that exact hour (UTC approximation)
      newScheduledFor = `${targetDate}T${String(targetHour).padStart(2, "0")}:00:00.000Z`;
    } else {
      newScheduledFor = buildNewScheduledFor(targetDate, entry.scheduledFor);
    }

    const isDraft = entry.id.startsWith("draft-");

    // ── Optimistic update ────────────────────────────────────────────────────
    const prevData = data;
    setData((d) => {
      if (!d) return d;
      const days = { ...d.days };

      // Remove from old date
      if (days[fromDate]) {
        days[fromDate] = days[fromDate].filter((en) => en.id !== entry.id);
        if (days[fromDate].length === 0) delete days[fromDate];
      }

      // Add to new date with updated scheduledFor
      const updatedEntry: CalendarEntry = {
        ...entry,
        scheduledFor: newScheduledFor,
        status: isDraft ? "scheduled" : entry.status,
        id: isDraft ? `optimistic-${entry.id}` : entry.id,
      };
      days[targetDate] = [...(days[targetDate] ?? []), updatedEntry];

      return { ...d, days };
    });

    // ── API call ─────────────────────────────────────────────────────────────
    try {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: orgTimezone,
      }).format(new Date(newScheduledFor));

      if (isDraft) {
        // Draft → create a new scheduled post
        await api.post("/distribute", {
          assetId: entry.assetId,
          channel: entry.channel,
          scheduledFor: newScheduledFor,
        });
        toast.success(`Scheduled for ${formattedDate}`);
      } else {
        // Existing post → reschedule
        await api.patch(`/distribute/${entry.id}`, {
          scheduledFor: newScheduledFor,
        });
        toast.success(`Rescheduled to ${formattedDate}`);
      }

      // Reload to get accurate server state (cleans up optimistic id)
      await load();
    } catch (err: unknown) {
      toast.error((err as Error & { message?: string }).message ?? "Reschedule failed");
      setData(prevData); // revert
    }
  }

  // ── Build month grid ───────────────────────────────────────────────────────

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }

  // ── Build week grid dates (Mon–Sun) ────────────────────────────────────────

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    toDateStr(addDays(weekStart, i)),
  );

  // Week header label: "Mar 24 – Mar 30, 2025"
  const weekLabel = (() => {
    const start = weekDates[0]!;
    const end = weekDates[6]!;
    const fmt = (s: string) => {
      const d = new Date(s + "T12:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    };
    return `${fmt(start)} – ${fmt(end)}, ${weekStart.getFullYear()}`;
  })();

  const totalPosts = data ? Object.values(data.days).flat().length : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Next-steps panel — shown when arriving from the review page */}
      {showNextSteps && (
        <div className="mb-5 rounded-xl border border-orion-green/30 bg-orion-green/5 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orion-green/20">
              <CheckCircle2 className="h-5 w-5 text-orion-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Your content is scheduled!</p>
              <p className="text-sm text-muted-foreground mt-0.5 mb-4">
                Posts are queued and ready to publish. Here's what to do next:
              </p>
              <ul className="space-y-2 mb-4 text-sm">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orion-green/40 text-xs text-orion-green font-bold">1</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Review your schedule</strong> — drag posts to adjust timing if needed</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orion-green/40 text-xs text-orion-green font-bold">2</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Connect social channels</strong> in Settings &gt; Integrations to enable publishing</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orion-green/40 text-xs text-orion-green font-bold">3</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Turn on Auto-Publish</strong> in Settings when you're confident in the content</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <a href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-orion-green/50 hover:bg-orion-green/5 transition-colors">
                  <Plus className="h-3.5 w-3.5 text-orion-green" />
                  Plan another campaign
                </a>
                <a href="/dashboard/settings?tab=integrations" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-orion-green/50 hover:bg-orion-green/5 transition-colors">
                  <Zap className="h-3.5 w-3.5 text-orion-green" />
                  Connect channels
                </a>
                <a href="/dashboard/analytics" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-orion-green/50 hover:bg-orion-green/5 transition-colors">
                  <BarChart2 className="h-3.5 w-3.5 text-orion-green" />
                  View analytics
                </a>
              </div>
            </div>
            <button
              onClick={() => setShowNextSteps(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Content Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scheduled content across all channels
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month / Week toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border transition-colors ${
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Columns className="h-3.5 w-3.5" />
              Week
            </button>
          </div>

          {/* Period navigator */}
          <Button variant="outline" size="icon" onClick={prevPeriod} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-44 text-center font-semibold text-sm">
            {viewMode === "month" ? `${MONTH_NAMES[month]} ${year}` : weekLabel}
          </span>
          <Button variant="outline" size="icon" onClick={nextPeriod} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="mb-4 flex gap-3 flex-wrap">
          {[
            { key: "scheduled", label: "Scheduled", cls: "text-blue-400" },
            { key: "published", label: "Published", cls: "text-green-400" },
            { key: "failed",    label: "Failed",    cls: "text-red-400" },
            { key: "draft",     label: "Draft",     cls: "text-gray-400" },
          ].map(({ key, label, cls }) => (
            <div
              key={key}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className={`font-bold ${cls}`}>{(data.stats as Record<string, number>)[key]}</span>
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content area */}
      {loading && !data ? (
        <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading calendar…
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : totalPosts === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Your content calendar is empty this month"
          description="Create a campaign and your publishing schedule will appear here automatically — across every channel."
          actions={[
            { label: "Plan a Campaign", href: "/dashboard" },
            { label: "Schedule a Post", href: "/distribute", variant: "outline" },
          ]}
        />
      ) : (
        <>
          {/* Mobile: always show list view */}
          <div className="md:hidden">
            <MobileListView
              data={data}
              orgTimezone={orgTimezone}
              onPillClick={setSelectedEntry}
            />
          </div>

          {/* Desktop: month or week grid */}
          <div className="hidden md:block md:flex-1">
            {viewMode === "month" ? (
              <MonthGrid
                cells={cells}
                todayStr={todayStr}
                data={data}
                dragOverDate={dragOverDate}
                onDragOver={(e, date) => handleDragOver(e, date)}
                onDragLeave={handleDragLeave}
                onDrop={(e, date) => handleDrop(e, date)}
                onPillClick={setSelectedEntry}
                onPillDragStart={handlePillDragStart}
                onPillDragEnd={handlePillDragEnd}
              />
            ) : (
              <WeekGrid
                weekDates={weekDates}
                todayStr={todayStr}
                data={data}
                orgTimezone={orgTimezone}
                dragOverSlot={dragOverSlot}
                onDragOver={(e, date, hour) => handleDragOver(e, date, hour)}
                onDragLeave={handleDragLeave}
                onDrop={(e, date, hour) => handleDrop(e, date, hour)}
                onPillClick={setSelectedEntry}
                onPillDragStart={handlePillDragStart}
                onPillDragEnd={handlePillDragEnd}
              />
            )}
          </div>
        </>
      )}

      {/* Side panel */}
      {selectedEntry && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelectedEntry(null)}
          />
          <PostPanel
            entry={selectedEntry}
            orgTimezone={orgTimezone}
            onClose={() => setSelectedEntry(null)}
          />
        </>
      )}

      <FirstRunTip
        id="calendar"
        title="Your content schedule"
        body="Your scheduled posts appear here. Drag a post to a new date or time slot to reschedule it. Click any post to preview or edit. Connect social channels in Settings to enable auto-publishing."
        cta="Got it"
      />
    </div>
  );
}
