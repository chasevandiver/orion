"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Check,
  RefreshCw,
  ImageIcon,
  CheckCircle,
  Send,
  Edit3,
} from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewAsset {
  id: string;
  channel: string;
  variant: "a" | "b";
  contentText: string;
  imageUrl?: string | null;
  compositedImageUrl?: string | null;
  status: string;
  campaignId?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  goal?: { type: string; brandName: string };
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

// ── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard({
  channel,
  assetA,
  assetB,
  onUpdate,
}: {
  channel: string;
  assetA?: ReviewAsset;
  assetB?: ReviewAsset;
  onUpdate: (updated: ReviewAsset) => void;
}) {
  const [activeVariant, setActiveVariant] = useState<"a" | "b">("a");
  const [regenCopy, setRegenCopy] = useState<"a" | "b" | null>(null);
  const [regenImage, setRegenImage] = useState<"a" | "b" | null>(null);
  const [approvingA, setApprovingA] = useState(false);
  const [approvingB, setApprovingB] = useState(false);

  const active = activeVariant === "a" ? assetA : assetB;
  const meta = CHANNEL_META[channel] ?? { color: "#666", emoji: "📄", label: channel };

  async function handleApprove(variant: "a" | "b") {
    const asset = variant === "a" ? assetA : assetB;
    if (!asset) return;
    if (variant === "a") setApprovingA(true);
    else setApprovingB(true);
    try {
      const newStatus = asset.status === "approved" ? "draft" : "approved";
      const res = await api.patch<{ data: ReviewAsset }>(`/assets/${asset.id}`, {
        status: newStatus,
      });
      onUpdate(res.data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      if (variant === "a") setApprovingA(false);
      else setApprovingB(false);
    }
  }

  async function handleRegenCopy(variant: "a" | "b") {
    const asset = variant === "a" ? assetA : assetB;
    if (!asset) return;
    setRegenCopy(variant);
    try {
      const res = await api.post<{ data: ReviewAsset }>(`/assets/${asset.id}/regen-copy`, {});
      onUpdate(res.data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegenCopy(null);
    }
  }

  async function handleRegenImage(variant: "a" | "b") {
    const asset = variant === "a" ? assetA : assetB;
    if (!asset) return;
    setRegenImage(variant);
    try {
      const res = await api.post<{ data: ReviewAsset }>(`/assets/${asset.id}/regen-image`, {});
      onUpdate(res.data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegenImage(null);
    }
  }

  const approvedCount = [assetA, assetB].filter((a) => a?.status === "approved").length;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }} className="text-lg">{meta.emoji}</span>
          <span className="font-semibold">{meta.label}</span>
          {approvedCount > 0 && (
            <Badge className="bg-orion-green/10 text-orion-green border-orion-green/20 text-[10px]">
              {approvedCount} approved
            </Badge>
          )}
        </div>

        {/* A/B variant tabs */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(["a", "b"] as const).map((v) => {
            const asset = v === "a" ? assetA : assetB;
            const isApproved = asset?.status === "approved";
            return (
              <button
                key={v}
                onClick={() => setActiveVariant(v)}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  activeVariant === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Variant {v.toUpperCase()}
                {isApproved && <Check className="h-3 w-3 text-orion-green" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Image area */}
      <div className="relative">
        {active?.compositedImageUrl ? (
          <>
            <ImageLightbox
              src={active.compositedImageUrl}
              alt={`${channel} composited`}
              containerClassName="max-h-72"
            />
            {active.imageUrl?.includes("unsplash.com") && (
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70 hover:text-white"
              >
                Photo: Unsplash
              </a>
            )}
          </>
        ) : active?.imageUrl ? (
          <ImageLightbox
            src={active.imageUrl}
            alt={`${channel} image`}
            className="max-h-72 opacity-70"
            containerClassName="max-h-72"
          />
        ) : (
          <div className="flex h-40 items-center justify-center bg-muted/20 text-muted-foreground">
            <ImageIcon className="mr-2 h-5 w-5" />
            <span className="text-sm">No image generated</span>
          </div>
        )}
      </div>

      {/* Copy area */}
      <div className="flex-1 px-4 py-3">
        {active && (
          <InlineCopyEditor asset={active} onUpdate={onUpdate} />
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={regenCopy !== null}
          onClick={() => handleRegenCopy(activeVariant)}
        >
          {regenCopy === activeVariant ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Regen copy
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={regenImage !== null}
          onClick={() => handleRegenImage(activeVariant)}
        >
          {regenImage === activeVariant ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ImageIcon className="h-3 w-3" />
          )}
          Regen image
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {(["a", "b"] as const).map((v) => {
            const asset = v === "a" ? assetA : assetB;
            const isApproved = asset?.status === "approved";
            const loading = v === "a" ? approvingA : approvingB;
            return (
              <button
                key={v}
                disabled={loading}
                onClick={() => handleApprove(v)}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
                  isApproved
                    ? "border-orion-green bg-orion-green/10 text-orion-green"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                }`}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isApproved ? (
                  <Check className="h-3 w-3" />
                ) : null}
                {v.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Inline copy editor ────────────────────────────────────────────────────────

function InlineCopyEditor({
  asset,
  onUpdate,
}: {
  asset: ReviewAsset;
  onUpdate: (updated: ReviewAsset) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(asset.contentText);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync when asset prop changes (e.g. after regen)
  useEffect(() => {
    setText(asset.contentText);
  }, [asset.contentText]);

  function handleClick() {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function handleBlur() {
    setEditing(false);
    if (text === asset.contentText) return; // no change
    setSaving(true);
    try {
      const res = await api.patch<{ data: ReviewAsset }>(`/assets/${asset.id}`, {
        contentText: text,
      });
      onUpdate(res.data);
    } catch (err: any) {
      alert(err.message);
      setText(asset.contentText); // revert on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      {editing ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          className="w-full resize-none rounded-md border border-orion-green/50 bg-muted/30 p-2 font-mono text-xs leading-relaxed outline-none focus:border-orion-green"
          rows={6}
        />
      ) : (
        <div
          onClick={handleClick}
          className="group relative cursor-text rounded-md border border-transparent p-2 hover:border-border hover:bg-muted/20"
        >
          <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
            {text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : part
            )}
          </div>
          <span className="absolute right-2 top-2 hidden items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground group-hover:flex">
            <Edit3 className="h-3 w-3" />
            Edit
          </span>
        </div>
      )}
      {saving && (
        <div className="absolute right-2 top-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ReviewScreen({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<ReviewAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [campaignRes, assetsRes] = await Promise.all([
          api.get<{ data: Campaign }>(`/campaigns/${campaignId}`),
          api.get<{ data: ReviewAsset[] }>(`/assets?campaignId=${campaignId}`),
        ]);
        setCampaign(campaignRes.data);
        setAssets(assetsRes.data);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  function handleAssetUpdate(updated: ReviewAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  }

  // Group assets by channel
  const channels = [...new Set(assets.map((a) => a.channel))];
  const byChannel: Record<string, { a?: ReviewAsset; b?: ReviewAsset }> = {};
  for (const ch of channels) {
    byChannel[ch] = {
      a: assets.find((a) => a.channel === ch && a.variant === "a"),
      b: assets.find((a) => a.channel === ch && a.variant === "b"),
    };
  }

  const approvedAssets = assets.filter((a) => a.status === "approved");
  const approvedCount = approvedAssets.length;
  const totalCount = assets.length;

  async function handleApproveAll() {
    setApprovingAll(true);
    try {
      const unapproved = assets.filter((a) => a.status !== "approved");
      await Promise.all(
        unapproved.map((a) =>
          api
            .patch<{ data: ReviewAsset }>(`/assets/${a.id}`, { status: "approved" })
            .then((res) => handleAssetUpdate(res.data)),
        ),
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setApprovingAll(false);
    }
  }

  async function handleLaunch() {
    if (approvedCount === 0) return;
    setLaunching(true);
    try {
      const approvedAssetIds = approvedAssets.map((a) => a.id);
      await api.post(`/campaigns/${campaignId}/launch`, { approvedAssetIds });
      router.push(`/dashboard/calendar`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading campaign…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign?.name ?? "Campaign Review"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {channels.length} channels ready · Review and approve content before launching
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-orion-green" />
          {approvedCount} of {totalCount} approved
        </div>
      </div>

      {/* Channel grid */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No content generated yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The pipeline may still be running. Check back in a moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <ChannelCard
              key={ch}
              channel={ch}
              assetA={byChannel[ch]?.a}
              assetB={byChannel[ch]?.b}
              onUpdate={handleAssetUpdate}
            />
          ))}
        </div>
      )}

      {/* Footer action bar */}
      <div className="sticky bottom-0 mt-8 flex items-center gap-3 rounded-xl border border-border bg-card/90 px-5 py-3 backdrop-blur">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {approvedCount} of {totalCount} assets approved
          </p>
          <div className="mt-1 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-orion-green transition-all"
              style={{ width: totalCount > 0 ? `${(approvedCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={approvingAll || approvedCount === totalCount}
          onClick={handleApproveAll}
          className="gap-2"
        >
          {approvingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve All
        </Button>

        <Button
          size="sm"
          disabled={approvedCount === 0 || launching}
          onClick={handleLaunch}
          className="gap-2"
        >
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Launch Campaign
        </Button>
      </div>
    </div>
  );
}
