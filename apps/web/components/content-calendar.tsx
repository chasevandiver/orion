"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarAsset {
  id: string;
  channel: string;
  contentText: string;
  compositedImageUrl?: string | null;
  imageUrl?: string | null;
  status: string;
  variant: "a" | "b";
  campaignId?: string | null;
  createdAt: string;
}

const CHANNEL_META: Record<string, { color: string; emoji: string; label: string }> = {
  linkedin:  { color: "#0077b5", emoji: "💼", label: "LinkedIn" },
  twitter:   { color: "#1da1f2", emoji: "🐦", label: "X/Twitter" },
  instagram: { color: "#e1306c", emoji: "📸", label: "Instagram" },
  facebook:  { color: "#1877f2", emoji: "📘", label: "Facebook" },
  tiktok:    { color: "#ff0050", emoji: "🎵", label: "TikTok" },
  email:     { color: "#10b981", emoji: "📧", label: "Email" },
  blog:      { color: "#f59e0b", emoji: "✍️", label: "Blog" },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Post chip ─────────────────────────────────────────────────────────────────

function PostChip({
  asset,
  onClick,
}: {
  asset: CalendarAsset;
  onClick: () => void;
}) {
  const meta = CHANNEL_META[asset.channel] ?? { color: "#666", emoji: "📄", label: asset.channel };
  const thumb = asset.compositedImageUrl ?? asset.imageUrl;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-accent transition-colors"
    >
      {/* Channel color dot */}
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {/* Thumbnail */}
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-4 w-4 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="text-[10px]">{meta.emoji}</span>
      )}
      {/* Copy preview */}
      <span className="truncate text-muted-foreground">
        {asset.contentText.slice(0, 30)}
      </span>
    </button>
  );
}

// ── Asset detail drawer ───────────────────────────────────────────────────────

function AssetDrawer({
  asset,
  open,
  onClose,
}: {
  asset: CalendarAsset | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!asset) return null;
  const meta = CHANNEL_META[asset.channel] ?? { color: "#666", emoji: "📄", label: asset.channel };
  const thumb = asset.compositedImageUrl ?? asset.imageUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span style={{ color: meta.color }}>{meta.emoji}</span>
            {meta.label}
            <span className="ml-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              Variant {asset.variant.toUpperCase()}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {thumb && (
            <img
              src={thumb}
              alt={`${asset.channel} visual`}
              className="w-full rounded-lg border border-border object-cover max-h-64"
            />
          )}

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {asset.contentText}
            </pre>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created {new Date(asset.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                asset.status === "approved"
                  ? "border-orion-green/30 bg-orion-green/10 text-orion-green"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {asset.status}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ContentCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [grouped, setGrouped] = useState<Record<string, CalendarAsset[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<CalendarAsset | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ data: { grouped: Record<string, CalendarAsset[]> } }>(
        `/pipeline/calendar?year=${year}&month=${month}`,
      )
      .then((res) => setGrouped(res.data.grouped))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push({ date: `${year}-${mm}-${dd}`, day: d });
  }

  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goToday}>
          Today
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {!loading && <span>{totalCount} assets</span>}
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
        {cells.map((cell, i) => {
          if (!cell.date) {
            return <div key={`empty-${i}`} className="bg-background min-h-[100px]" />;
          }

          const dayAssets = grouped[cell.date] ?? [];
          const isToday = cell.date === todayStr;

          return (
            <div
              key={cell.date}
              className="bg-background p-1.5 min-h-[100px] flex flex-col"
            >
              {/* Day number */}
              <div
                className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isToday
                    ? "bg-orion-green text-black"
                    : "text-muted-foreground"
                }`}
              >
                {cell.day}
              </div>

              {/* Post chips */}
              <div className="flex flex-col gap-0.5">
                {dayAssets.slice(0, 3).map((asset) => (
                  <PostChip
                    key={asset.id}
                    asset={asset}
                    onClick={() => setSelectedAsset(asset)}
                  />
                ))}
                {dayAssets.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground">
                    +{dayAssets.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Asset drawer */}
      <AssetDrawer
        asset={selectedAsset}
        open={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />
    </div>
  );
}
