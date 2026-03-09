"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEntry {
  id: string;
  assetId: string | null;
  channel: string;
  status: "scheduled" | "published" | "failed" | "draft" | string;
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

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Post pill ─────────────────────────────────────────────────────────────────

function PostPill({ entry, onClick }: { entry: CalendarEntry; onClick: () => void }) {
  const meta = CHANNEL_META[entry.channel] ?? { emoji: "📄", label: entry.channel };
  return (
    <button
      onClick={onClick}
      className="group w-full rounded px-1.5 py-1 text-left text-[10px] hover:bg-accent transition-colors flex items-center gap-1 min-w-0"
      draggable
    >
      <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${STATUS_DOT[entry.status] ?? "bg-gray-400"}`} />
      <span className="shrink-0">{meta.emoji}</span>
      <span className="truncate text-muted-foreground group-hover:text-foreground">
        {entry.contentPreview || "(no preview)"}
      </span>
    </button>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

function PostPanel({ entry, onClose }: { entry: CalendarEntry; onClose: () => void }) {
  const meta = CHANNEL_META[entry.channel] ?? { emoji: "📄", label: entry.channel };
  const [publishing, setPublishing] = useState(false);

  async function handlePublishNow() {
    if (!entry.id || entry.id.startsWith("draft-")) return;
    setPublishing(true);
    try {
      await api.post(`/distribute/${entry.id}/publish`, {});
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-card shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <span className="font-semibold">{meta.label}</span>
          <Badge className={`text-[10px] border ${STATUS_BADGE[entry.status] ?? ""}`}>
            {entry.status}
          </Badge>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entry.compositedImageUrl && (
          <div className="relative">
            <img
              src={entry.compositedImageUrl}
              alt="composited"
              className="w-full rounded-lg object-cover"
            />
            {entry.compositedImageUrl && (
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70 hover:text-white"
              >
                Photo: Unsplash
              </a>
            )}
          </div>
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
            <p className="text-sm">{new Date(entry.scheduledFor).toLocaleString()}</p>
          </div>
        )}

        {entry.publishedAt && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Published At</p>
            <p className="text-sm text-green-400">{new Date(entry.publishedAt).toLocaleString()}</p>
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

      <div className="border-t border-border p-4 flex gap-2">
        {(entry.status === "scheduled" || entry.status === "failed") && !entry.id.startsWith("draft-") && (
          <Button size="sm" onClick={handlePublishNow} disabled={publishing} className="flex-1 gap-2">
            {publishing && <Loader2 className="h-3 w-3 animate-spin" />}
            Publish Now
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );
}

// ── Main calendar view ────────────────────────────────────────────────────────

export function CalendarView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: CalendarData }>(`/pipeline/calendar?year=${year}&month=${month}`);
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
    // Poll every 30 seconds
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }

  const totalPosts = data ? Object.values(data.days).flat().length : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scheduled content across all channels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center font-semibold">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="mb-4 flex gap-3">
          {[
            { key: "scheduled", label: "Scheduled", cls: "text-blue-400" },
            { key: "published", label: "Published", cls: "text-green-400" },
            { key: "failed", label: "Failed", cls: "text-red-400" },
            { key: "draft", label: "Draft", cls: "text-gray-400" },
          ].map(({ key, label, cls }) => (
            <div key={key} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className={`font-bold ${cls}`}>{(data.stats as any)[key]}</span>
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar grid */}
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No posts scheduled for {MONTH_NAMES[month]}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run your first pipeline to see your content calendar fill up automatically.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {cells.map((cell, idx) => {
              const entries = cell.date ? (data?.days[cell.date] ?? []) : [];
              const isToday = cell.date === todayStr;
              return (
                <div
                  key={idx}
                  className={`min-h-24 bg-card p-1 flex flex-col ${!cell.date ? "opacity-30" : ""}`}
                >
                  {cell.day && (
                    <span
                      className={`mb-1 flex h-6 w-6 items-center justify-center self-end rounded-full text-xs font-medium ${
                        isToday
                          ? "bg-orion-green text-black"
                          : "text-muted-foreground"
                      }`}
                    >
                      {cell.day}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {entries.slice(0, 3).map((entry) => (
                      <PostPill key={entry.id} entry={entry} onClick={() => setSelectedEntry(entry)} />
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
      )}

      {/* Side panel */}
      {selectedEntry && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelectedEntry(null)}
          />
          <PostPanel entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        </>
      )}
    </div>
  );
}
