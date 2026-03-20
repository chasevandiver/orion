"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { ArrowUp, ArrowDown, Minus, Loader2, Trophy, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AssetStub {
  id: string;
  channel: string;
  variant: "a" | "b";
  contentText: string;
  compositedImageUrl?: string | null;
  imageUrl?: string | null;
}

export interface ABPair {
  channel: string;
  variantGroupId: string;
  assetA: AssetStub;
  assetB: AssetStub;
}

interface VariantStats {
  assetId: string;
  impressions: number;
  clicks: number;
  engagements: number;
  ctr: number;
}

interface Comparison {
  variantA: VariantStats;
  variantB: VariantStats;
  winner: "a" | "b" | "inconclusive";
  confidence: "low" | "medium" | "high";
  note: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "text-green-500",
  medium: "text-yellow-500",
  low:    "text-muted-foreground",
};

const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "X/Twitter" },
  instagram: { emoji: "📸", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  email:     { emoji: "📧", label: "Email" },
  blog:      { emoji: "✍️", label: "Blog" },
};

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-mono tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Single A/B pair card ───────────────────────────────────────────────────────

function ABPairCard({ pair }: { pair: ABPair }) {
  const toast = useAppToast();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [primarySet, setPrimarySet] = useState<"a" | "b" | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Comparison }>(
        `/analytics/variant-comparison?assetIdA=${pair.assetA.id}&assetIdB=${pair.assetB.id}`,
      )
      .then((res) => setComparison(res.data))
      .catch(() => setComparison(null))
      .finally(() => setLoading(false));
  }, [pair.assetA.id, pair.assetB.id]);

  async function handleSetPrimary(winner: "a" | "b") {
    setWorking(true);
    const winnerAsset = winner === "a" ? pair.assetA : pair.assetB;
    const loserAsset  = winner === "a" ? pair.assetB : pair.assetA;
    try {
      // Mark winner as approved
      await api.patch(`/assets/${winnerAsset.id}`, { status: "approved" });

      // Cancel all scheduled posts for the loser
      const postsRes = await api.get<{ data: Array<{ id: string }> }>(
        `/distribute?assetId=${loserAsset.id}`,
      );
      await Promise.all(
        postsRes.data.map((post) =>
          api.patch(`/distribute/${post.id}`, { status: "cancelled" }),
        ),
      );

      setPrimarySet(winner);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setWorking(false);
    }
  }

  const meta = CHANNEL_META[pair.channel] ?? { emoji: "📄", label: pair.channel };

  const maxImpressions = comparison
    ? Math.max(comparison.variantA.impressions, comparison.variantB.impressions, 1)
    : 1;
  const maxClicks = comparison
    ? Math.max(comparison.variantA.clicks, comparison.variantB.clicks, 1)
    : 1;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 border-b border-border">
        <span>{meta.emoji}</span>
        <span className="font-medium text-sm">{meta.label}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">A/B Test</span>
      </div>

      {/* Comparison body */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-0">
        {/* Variant A */}
        <VariantPanel
          label="A"
          asset={pair.assetA}
          stats={comparison?.variantA ?? null}
          isWinner={comparison?.winner === "a"}
          isPrimary={primarySet === "a"}
          canSetPrimary={comparison?.winner === "a" && !primarySet}
          working={working}
          onSetPrimary={() => handleSetPrimary("a")}
          maxImpressions={maxImpressions}
          maxClicks={maxClicks}
        />

        {/* Divider */}
        <div className="flex flex-col items-center justify-center px-3 py-6 gap-1">
          <span className="text-xs font-bold text-muted-foreground/60 tracking-widest">VS</span>
        </div>

        {/* Variant B */}
        <VariantPanel
          label="B"
          asset={pair.assetB}
          stats={comparison?.variantB ?? null}
          isWinner={comparison?.winner === "b"}
          isPrimary={primarySet === "b"}
          canSetPrimary={comparison?.winner === "b" && !primarySet}
          working={working}
          onSetPrimary={() => handleSetPrimary("b")}
          maxImpressions={maxImpressions}
          maxClicks={maxClicks}
        />
      </div>

      {/* Footer: winner badge + note */}
      <div className="border-t border-border px-4 py-3 flex items-start gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading analytics…
          </div>
        ) : comparison ? (
          <>
            <WinnerBadge winner={comparison.winner} primarySet={primarySet} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-relaxed">{comparison.note}</p>
            </div>
            <span className={`shrink-0 text-xs font-medium ${CONFIDENCE_COLORS[comparison.confidence]}`}>
              {comparison.confidence} confidence
            </span>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Could not load analytics data.</p>
        )}
      </div>
    </div>
  );
}

// ── Variant panel (one side of the VS) ────────────────────────────────────────

function VariantPanel({
  label,
  asset,
  stats,
  isWinner,
  isPrimary,
  canSetPrimary,
  working,
  onSetPrimary,
  maxImpressions,
  maxClicks,
}: {
  label: string;
  asset: AssetStub;
  stats: VariantStats | null;
  isWinner: boolean;
  isPrimary: boolean;
  canSetPrimary: boolean;
  working: boolean;
  onSetPrimary: () => void;
  maxImpressions: number;
  maxClicks: number;
}) {
  const imgSrc = asset.compositedImageUrl ?? asset.imageUrl ?? null;

  return (
    <div className={`p-4 space-y-3 ${isWinner ? "bg-orion-green/5" : ""}`}>
      {/* Variant label */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold border ${
            isWinner
              ? "border-orion-green/40 bg-orion-green/10 text-orion-green"
              : "border-border text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {isWinner && <Trophy className="h-3.5 w-3.5 text-orion-green" />}
        {isPrimary && (
          <span className="text-[10px] font-medium text-orion-green">PRIMARY</span>
        )}
      </div>

      {/* Image */}
      {imgSrc ? (
        <div className="aspect-video overflow-hidden rounded-lg border border-border">
          <img src={imgSrc} alt={`Variant ${label}`} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video flex items-center justify-center rounded-lg border border-border bg-muted/20">
          <span className="text-xs text-muted-foreground/40">No image</span>
        </div>
      )}

      {/* Content preview */}
      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
        {asset.contentText.slice(0, 140)}
      </p>

      {/* Stats */}
      {stats && (
        <div className="space-y-2">
          <StatBar label="Impressions" value={stats.impressions} max={maxImpressions} />
          <StatBar label="Clicks" value={stats.clicks} max={maxClicks} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">CTR</span>
            <span className={`text-[11px] font-mono font-semibold ${isWinner ? "text-orion-green" : ""}`}>
              {stats.ctr}%
            </span>
          </div>
        </div>
      )}

      {/* Set as Primary button */}
      {canSetPrimary && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs border-orion-green/40 text-orion-green hover:bg-orion-green/10"
          disabled={working}
          onClick={onSetPrimary}
        >
          {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trophy className="h-3 w-3" />}
          Set as Primary
        </Button>
      )}

      {/* Already set primary — show loser as cancelled */}
      {!canSetPrimary && !isPrimary && !isWinner && primarySet && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <Ban className="h-3 w-3" />
          Scheduled posts cancelled
        </div>
      )}
    </div>
  );
}

// ── Winner badge ───────────────────────────────────────────────────────────────

function WinnerBadge({
  winner,
  primarySet,
}: {
  winner: "a" | "b" | "inconclusive";
  primarySet: "a" | "b" | null;
}) {
  if (primarySet) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green border border-orion-green/30">
        <Trophy className="h-3 w-3" />
        Variant {primarySet.toUpperCase()} Primary
      </span>
    );
  }
  if (winner === "inconclusive") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border">
        <Minus className="h-3 w-3" />
        Too early to tell
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green border border-orion-green/30">
      <Trophy className="h-3 w-3" />
      Variant {winner.toUpperCase()} Wins
    </span>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ABResults({ pairs }: { pairs: ABPair[] }) {
  if (pairs.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">A/B Test Results</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Side-by-side performance comparison for each channel with A/B variants.
      </p>
      <div className="space-y-6">
        {pairs.map((pair) => (
          <ABPairCard key={pair.variantGroupId} pair={pair} />
        ))}
      </div>
    </section>
  );
}
