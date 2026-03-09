"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  Pencil,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  ImageIcon,
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  Maximize2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  channel: string;
  type: string;
  status: string;
  contentText?: string;
  imageUrl?: string;
  compositedImageUrl?: string;
  variant?: "a" | "b";
  scheduledFor?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

interface AssetsResponse {
  data: Asset[];
}

// ── Channel colours / icons ───────────────────────────────────────────────────

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  linkedin:  { label: "LinkedIn",  icon: "💼", color: "bg-blue-600/10 text-blue-400 border-blue-600/20" },
  twitter:   { label: "Twitter/X", icon: "🐦", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  instagram: { label: "Instagram", icon: "📸", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  facebook:  { label: "Facebook",  icon: "📘", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  email:     { label: "Email",     icon: "📧", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  blog:      { label: "Blog",      icon: "✍️", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  review:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  published:"bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ── Platform-native previews ──────────────────────────────────────────────────

function LinkedInPreview({ content }: { content: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 max-w-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-lg">👤</div>
        <div>
          <div className="text-sm font-semibold">Your Company</div>
          <div className="text-xs text-muted-foreground">Marketing · Just now</div>
        </div>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3">{content}</p>
      <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
        <button className="flex items-center gap-1 hover:text-blue-400 transition-colors">👍 Like</button>
        <button className="flex items-center gap-1 hover:text-blue-400 transition-colors">💬 Comment</button>
        <button className="flex items-center gap-1 hover:text-blue-400 transition-colors">↗ Share</button>
        <button className="flex items-center gap-1 hover:text-blue-400 transition-colors">✉ Send</button>
      </div>
    </div>
  );
}

function TwitterPreview({ content }: { content: string }) {
  const charCount = content.length;
  const remaining = 280 - charCount;
  return (
    <div className="rounded-xl border border-border bg-card p-4 max-w-lg">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-sky-500/20 flex items-center justify-center">🐦</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold">Your Company</span>
            <span className="text-xs text-muted-foreground">@yourcompany · now</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span>💬 Reply</span>
              <span>🔁 Repost</span>
              <span>❤️ Like</span>
              <span>📤 Share</span>
            </div>
            <span className={remaining < 0 ? "text-red-400" : remaining < 20 ? "text-yellow-400" : ""}>
              {remaining}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstagramPreview({ content, imageUrl }: { content: string; imageUrl?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-pink-500 to-yellow-500 flex items-center justify-center text-xs text-white font-bold">Y</div>
        <span className="text-sm font-semibold">yourcompany</span>
        <span className="ml-auto text-xs text-muted-foreground">···</span>
      </div>
      <div className="aspect-square bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt="post" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="px-3 py-2">
        <div className="flex gap-3 mb-2 text-sm">❤️ Like  💬 Comment  📤 Share  🔖 Save</div>
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">yourcompany </span>
          {content.slice(0, 120)}{content.length > 120 ? "… more" : ""}
        </p>
      </div>
    </div>
  );
}

function EmailPreview({ content }: { content: string }) {
  const lines = content.split("\n").filter(Boolean);
  const subject = lines[0] ?? "Your email subject";
  const body = lines.slice(1).join("\n") || content;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden max-w-lg">
      <div className="bg-muted/50 px-4 py-2 border-b border-border text-xs text-muted-foreground space-y-1">
        <div><span className="font-medium text-foreground">From:</span> Your Company &lt;hello@yourco.com&gt;</div>
        <div><span className="font-medium text-foreground">Subject:</span> {subject}</div>
      </div>
      <div className="p-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}

function BlogPreview({ content }: { content: string }) {
  const lines = content.split("\n").filter(Boolean);
  const headline = lines[0] ?? "Blog Post Title";
  const intro = lines.slice(1, 4).join(" ") || content;
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold leading-tight mb-3">{headline}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{intro.slice(0, 300)}{intro.length > 300 ? "…" : ""}</p>
    </div>
  );
}

function PlatformPreview({ asset }: { asset: Asset }) {
  const content = asset.contentText ?? "";
  switch (asset.channel) {
    case "linkedin":  return <LinkedInPreview content={content} />;
    case "twitter":   return <TwitterPreview content={content} />;
    case "instagram": return <InstagramPreview content={content} imageUrl={asset.compositedImageUrl ?? asset.imageUrl ?? undefined} />;
    case "email":     return <EmailPreview content={content} />;
    case "blog":      return <BlogPreview content={content} />;
    default:          return <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>;
  }
}

// ── Asset card ─────────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onApprove,
  onSave,
  onRegenerate,
}: {
  asset: Asset;
  onApprove: (id: string) => Promise<void>;
  onSave: (id: string, text: string) => Promise<void>;
  onRegenerate: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(asset.contentText ?? "");
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState(asset.status);

  const meta = CHANNEL_META[asset.channel] ?? { label: asset.channel, icon: "📄", color: "" };

  async function handleApprove() {
    setApproving(true);
    try {
      await onApprove(asset.id);
      setLocalStatus("approved");
    } finally {
      setApproving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(asset.id, editText);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await onRegenerate(asset.id);
    } finally {
      setRegenerating(false);
    }
  }

  const imageUrl = asset.compositedImageUrl ?? asset.imageUrl;

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Badge className={`border text-xs ${meta.color}`}>
              {meta.icon} {meta.label}
            </Badge>
            {asset.variant && (
              <Badge variant="outline" className="text-xs">
                Variant {asset.variant.toUpperCase()}
              </Badge>
            )}
          </div>
          <Badge className={`border text-xs ${STATUS_COLORS[localStatus] ?? ""}`}>
            {localStatus}
          </Badge>
        </div>

        {/* Image thumbnail */}
        {imageUrl && (
          <div className="relative bg-muted border-b border-border">
            <img
              src={imageUrl}
              alt="composited"
              className="w-full h-48 object-cover cursor-pointer"
              onClick={() => setImageOpen(true)}
            />
            <button
              onClick={() => setImageOpen(true)}
              className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {editing ? (
            <textarea
              className="w-full min-h-[200px] rounded-lg border border-border bg-background p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="overflow-hidden">
              <PlatformPreview asset={asset} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30">
          {editing ? (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => { setEditing(false); setEditText(asset.contentText ?? ""); }}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                onClick={handleApprove}
                disabled={approving || localStatus === "approved"}
              >
                {approving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {localStatus === "approved" ? "Approved" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Regenerate
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Image modal */}
      {imageOpen && imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImageOpen(false)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setImageOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imageUrl}
            alt="full"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<AssetsResponse>(`/campaigns/${id}/assets`);
      setAssets(res.data ?? []);
    } catch (err: any) {
      setError(err.message ?? "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(assetId: string) {
    await api.patch(`/assets/${assetId}`, { status: "approved" });
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, status: "approved" } : a))
    );
  }

  async function handleSave(assetId: string, contentText: string) {
    await api.patch(`/assets/${assetId}`, { contentText });
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, contentText } : a))
    );
  }

  async function handleRegenerate(assetId: string) {
    await api.post(`/assets/${assetId}/regenerate`, {});
    // Poll for the updated asset
    setTimeout(load, 3000);
  }

  async function handleApproveAll() {
    setScheduling(true);
    try {
      await Promise.all(
        assets
          .filter((a) => a.status !== "approved")
          .map((a) => api.patch(`/assets/${a.id}`, { status: "approved" }))
      );
      router.push(`/dashboard/calendar`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setScheduling(false);
    }
  }

  const approvedCount = assets.filter((a) => a.status === "approved").length;
  const totalCount = assets.length;
  const allApproved = totalCount > 0 && approvedCount === totalCount;
  const progressPct = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading assets…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => router.push(`/dashboard/campaigns/${id}/summary`)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Campaign
            </Button>
          </div>
          <h1 className="text-2xl font-bold">Review Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review, edit, and approve your campaign content before publishing.
          </p>
        </div>
        <Button
          className="gap-2"
          disabled={!allApproved || scheduling}
          onClick={handleApproveAll}
        >
          {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
          Approve All & Schedule
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-sm">
          <span className="text-muted-foreground">{approvedCount} of {totalCount} approved</span>
          <span className="font-medium">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Assets grid */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-border text-muted-foreground">
          <ImageIcon className="h-10 w-10 mb-3" />
          <p>No assets found for this campaign.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onApprove={handleApprove}
              onSave={handleSave}
              onRegenerate={handleRegenerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
