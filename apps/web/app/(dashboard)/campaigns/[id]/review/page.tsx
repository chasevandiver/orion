"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, createAgentStream } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  Pencil,
  X,
  Loader2,
  AlertCircle,
  ImageIcon,
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  Maximize2,
  Copy,
  Sparkles,
  Undo2,
  GitFork,
  Info,
  RefreshCw,
  Wand2,
  Repeat2,
  Code2,
  Eye,
  History,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import {
  LinkedInPreview,
  TwitterPreview,
  InstagramPreview,
  FacebookPreview,
  EmailPreview,
} from "@/components/platform-previews";
import { RepurposeModal } from "@/components/repurpose-modal";
import { CompositorEditor } from "@/components/image-editor/CompositorEditor";
import { useAppToast } from "@/hooks/use-app-toast";
import { TooltipHelp } from "@/components/ui/tooltip-help";

// ── Types ──────────────────────────────────────────────────────────────────────

type ImageSource = "fal" | "pollinations" | "brand-graphic";

interface Asset {
  id: string;
  channel: string;
  type: string;
  status: string;
  contentText?: string;
  imageUrl?: string;
  compositedImageUrl?: string;
  variant?: "a" | "b";
  campaignId?: string;
  scheduledFor?: string;
  publishedAt?: string;
  metadata?: { imageSource?: ImageSource; [key: string]: unknown };
  _versionCount?: number;
}

interface AssetVersion {
  id: string;
  versionNum: number;
  contentText: string;
  editorName: string | null;
  editorEmail: string | null;
  createdAt: Date | string;
}

interface AssetsResponse {
  data: Asset[];
}

// ── Manual-publish channels ───────────────────────────────────────────────────

const MANUAL_CHANNELS = new Set(["tiktok", "blog"]);
const COPY_LABEL: Record<string, string> = {
  tiktok: "Copy Script",
  blog: "Copy to Clipboard",
};

// ── Channel metadata ──────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  linkedin:  { label: "LinkedIn",  icon: "💼", color: "bg-blue-600/10 text-blue-400 border-blue-600/20" },
  twitter:   { label: "Twitter/X", icon: "🐦", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  instagram: { label: "Instagram", icon: "📸", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  facebook:  { label: "Facebook",  icon: "📘", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  tiktok:    { label: "TikTok",    icon: "🎵", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  email:     { label: "Email",     icon: "📧", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  blog:      { label: "Blog",      icon: "✍️", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  review:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  published:"bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ── Platform character limits ─────────────────────────────────────────────────

const CHANNEL_LIMITS: Record<string, number | null> = {
  linkedin:  3000,
  twitter:   280,
  instagram: 2200,
  facebook:  63206,
  tiktok:    null,
  email:     null,
  blog:      null,
};

// ── Channel formatting guidance ───────────────────────────────────────────────

const CHANNEL_GUIDANCE: Record<string, string> = {
  linkedin:  "150–200 words · strong hook · 2–3 hashtags",
  twitter:   "3-tweet thread · 280 chars per tweet",
  instagram: "100–150 words · visual-first · 10–12 hashtags",
  facebook:  "120–160 words · conversational · embedded question",
  tiktok:    "30–45 sec script · 4 acts: Hook → Build → Payoff → CTA",
  email:     "Subject line + preview text + body under 200 words",
  blog:      "SEO headline · meta description · 250-word intro",
};

// ── Inline previews for channels without library components ──────────────────

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

function TikTokPreview({ content }: { content: string }) {
  const lines = content.split("\n").filter(Boolean);
  const hook = lines[0] ?? "";
  const body = lines.slice(1).join("\n");
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden max-w-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-500/10">
        <span className="text-base">🎵</span>
        <span className="text-sm font-semibold text-orange-400">TikTok Script</span>
        <span className="ml-auto text-[10px] text-orange-400/60 bg-orange-400/10 rounded px-1.5 py-0.5">Content only</span>
      </div>
      <div className="p-4 space-y-2">
        {hook && (
          <div>
            <p className="text-[10px] font-medium text-orange-400/70 uppercase tracking-wide mb-1">Hook</p>
            <p className="text-sm font-semibold leading-snug">{hook}</p>
          </div>
        )}
        {body && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Script</p>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{body.slice(0, 400)}{body.length > 400 ? "…" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlatformPreview({
  asset,
  brandName,
  brandLogo,
}: {
  asset: Asset;
  brandName: string;
  brandLogo?: string;
}) {
  const content = asset.contentText ?? "";
  const image = asset.compositedImageUrl ?? asset.imageUrl;
  const logoProps = brandLogo ? { brandLogo } : {};
  const imgProps = image ? { image } : {};
  switch (asset.channel) {
    case "linkedin":
      return <LinkedInPreview content={content} brandName={brandName} {...logoProps} {...imgProps} />;
    case "twitter":
      return <TwitterPreview content={content} brandName={brandName} {...logoProps} {...imgProps} />;
    case "instagram":
      return <InstagramPreview content={content} brandName={brandName} {...logoProps} {...imgProps} />;
    case "facebook":
      return <FacebookPreview content={content} brandName={brandName} {...logoProps} {...imgProps} />;
    case "email":
      return <EmailPreview content={content} brandName={brandName} {...logoProps} />;
    case "tiktok":
      return <TikTokPreview content={content} />;
    case "blog":
      return <BlogPreview content={content} />;
    default:
      return <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>;
  }
}

// ── Image source helpers ───────────────────────────────────────────────────────

const IMAGE_SOURCE_LABELS: Record<ImageSource, { label: string; color: string }> = {
  fal:           { label: "AI Generated",      color: "bg-orion-green/10 text-orion-green border-orion-green/20" },
  pollinations:  { label: "AI Generated",      color: "bg-orion-green/10 text-orion-green border-orion-green/20" },
  "brand-graphic": { label: "Brand Graphic",   color: "bg-orange-400/10 text-orange-400 border-orange-400/20" },
};

function getImageSource(asset: Asset): ImageSource | null {
  if (asset.metadata?.imageSource) return asset.metadata.imageSource as ImageSource;
  // Infer from data: no imageUrl → brand graphic was used
  if (asset.compositedImageUrl && !asset.imageUrl) return "brand-graphic";
  if (asset.imageUrl) return "pollinations"; // pre-metadata assets default to pollinations
  return null;
}

// ── FAL tip banner (one-time, dismisses to localStorage) ──────────────────────

function FalTipBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-orange-400/20 bg-orange-400/5 px-4 py-3">
      <Wand2 className="h-4 w-4 shrink-0 mt-0.5 text-orange-400" />
      <div className="flex-1 text-sm text-muted-foreground">
        <span className="font-medium text-orange-400">Tip:</span> Configure{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">FAL_KEY</code> for
        AI-generated images, or STELOS will use branded graphics instead.
      </div>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Version history panel ──────────────────────────────────────────────────────

function diffSummary(oldText: string, newText: string): string {
  const delta = newText.length - oldText.length;
  if (delta === 0) return "±0 chars";
  return delta > 0 ? `+${delta} chars` : `${delta} chars`;
}

function VersionHistoryPanel({
  assetId,
  currentText,
  onRestore,
}: {
  assetId: string;
  currentText: string;
  onRestore: (text: string) => Promise<void>;
}) {
  const toast = useAppToast();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function fetchVersions() {
    setLoading(true);
    try {
      const res = await api.get<{ data: AssetVersion[] }>(`/assets/${assetId}/versions`);
      setVersions(res.data ?? []);
      setFetched(true);
    } catch {
      toast.error("Failed to load version history");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    if (!open && !fetched) fetchVersions();
    setOpen((v) => !v);
  }

  async function handleRestore(version: AssetVersion) {
    setRestoring(version.id);
    try {
      await onRestore(version.contentText);
      await fetchVersions();
      toast.success("Content restored to v" + version.versionNum);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to restore");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="border-t border-border">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        onClick={handleToggle}
      >
        <span className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          Version History
          {fetched && versions.length > 0 && (
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {versions.length}
            </span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading history…
            </div>
          ) : versions.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No previous versions yet. Edits will appear here.</p>
          ) : (
            versions.map((v, i) => {
              const newText = i === 0 ? currentText : versions[i - 1]!.contentText;
              const diff = diffSummary(v.contentText, newText);
              const editorLabel = v.editorName ?? v.editorEmail ?? "Unknown";
              const date = new Date(v.createdAt);
              const isPositive = diff.startsWith("+");
              const isNegative = diff.startsWith("-");
              return (
                <div key={v.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">v{v.versionNum}</span>
                      <span>·</span>
                      <span>{editorLabel}</span>
                      <span>·</span>
                      <span title={date.toISOString()}>
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono ${isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-muted-foreground"}`}>
                      {diff}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
                    >
                      <Eye className="h-3 w-3" />
                      {previewId === v.id ? "Hide" : "Preview"}
                    </button>
                    <button
                      className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      onClick={() => handleRestore(v)}
                      disabled={restoring !== null}
                    >
                      {restoring === v.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      Restore
                    </button>
                  </div>
                  {previewId === v.id && (
                    <pre className="max-h-32 overflow-y-auto rounded border border-border bg-background p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                      {v.contentText}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Asset card ─────────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  brandName,
  brandLogo,
  onApprove,
  onSave,
  onCreateVariant,
  onRegenImage,
  onRepurpose,
  onEditImage,
}: {
  asset: Asset;
  brandName: string;
  brandLogo?: string;
  onApprove: (id: string) => Promise<void>;
  onSave: (id: string, text: string) => Promise<void>;
  onCreateVariant: (newAsset: Asset) => void;
  onRegenImage: (id: string) => Promise<void>;
  onRepurpose: (asset: Asset) => void;
  onEditImage: (asset: Asset) => void;
}) {
  const toast = useAppToast();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(asset.contentText ?? "");
  const [prevText, setPrevText] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "unsaved" | "saving" | "saved">("idle");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState(asset.status);
  const [copied, setCopied] = useState(false);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [regeningImage, setRegeningImage] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);
  const [localImageSource, setLocalImageSource] = useState<ImageSource | null>(() => getImageSource(asset));

  // Keep image source in sync when parent updates the asset (e.g. after regen-image)
  useEffect(() => {
    setLocalImageSource(getImageSource(asset));
  }, [asset.metadata?.imageSource, asset.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const isManual = MANUAL_CHANNELS.has(asset.channel);
  const meta = CHANNEL_META[asset.channel] ?? { label: asset.channel, icon: "📄", color: "" };
  const charLimit = CHANNEL_LIMITS[asset.channel] ?? null;
  const guidance = CHANNEL_GUIDANCE[asset.channel];

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const streamedTextRef = useRef("");

  // Auto-resize textarea whenever content or edit mode changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editText, editing]);

  // Sync local text when parent updates the asset (e.g. after approve-all reload)
  useEffect(() => {
    if (!editing && !streaming) {
      setEditText(asset.contentText ?? "");
    }
  }, [asset.contentText]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleAutoSave(text: string) {
    setSaveIndicator("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveIndicator("saving");
      try {
        await onSave(asset.id, text);
        setSaveIndicator("saved");
        setTimeout(() => setSaveIndicator("idle"), 2000);
      } catch {
        setSaveIndicator("unsaved");
      }
    }, 1500);
  }

  function handleTextChange(text: string) {
    setEditText(text);
    if (!streaming) scheduleAutoSave(text);
  }

  async function handleManualSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    setSaveIndicator("saving");
    try {
      await onSave(asset.id, editText);
      setSaveIndicator("saved");
      setTimeout(() => {
        setSaveIndicator("idle");
        setEditing(false);
      }, 800);
    } catch {
      setSaveIndicator("unsaved");
    } finally {
      setSaving(false);
    }
  }

  function handleStartEdit() {
    setEditText(asset.contentText ?? "");
    setPrevText(null);
    setSaveIndicator("idle");
    setEditing(true);
  }

  function handleCancelEdit() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setEditing(false);
    setEditText(asset.contentText ?? "");
    setSaveIndicator("idle");
    setPrevText(null);
  }

  function handleUndo() {
    if (prevText === null) return;
    const toRestore = prevText;
    setPrevText(null);
    setEditText(toRestore);
    scheduleAutoSave(toRestore);
  }

  function handleRegenerate() {
    if (streaming) {
      stopStreamRef.current?.();
      setStreaming(false);
      return;
    }

    const currentText = editText;
    setPrevText(currentText);
    setEditText("");
    streamedTextRef.current = "";
    setStreaming(true);
    setStreamError(null);
    if (!editing) setEditing(true);

    let settled = false;
    const stop = createAgentStream(
      `/assets/${asset.id}/regen-stream`,
      null,
      {
        onChunk: (text) => {
          streamedTextRef.current += text;
          setEditText((prev) => prev + text);
        },
        onDone: async () => {
          if (settled) return;
          settled = true;
          setStreaming(false);
          setSaveIndicator("saving");
          try {
            // Sync parent state (server already saved; this updates parent's asset list)
            await onSave(asset.id, streamedTextRef.current);
            setSaveIndicator("saved");
            setTimeout(() => setSaveIndicator("idle"), 2000);
          } catch {
            setSaveIndicator("idle");
          }
        },
        onError: (msg) => {
          if (settled) return;
          settled = true;
          setStreaming(false);
          setStreamError(msg);
          setEditText(currentText);
          setPrevText(null);
        },
      },
    );
    stopStreamRef.current = stop;
  }

  async function handleCreateVariant() {
    setCreatingVariant(true);
    try {
      const res = await api.post<{ data: Asset }>(`/assets/${asset.id}/variants`, {});
      onCreateVariant(res.data);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create variant");
    } finally {
      setCreatingVariant(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await onApprove(asset.id);
      setLocalStatus("approved");
    } finally {
      setApproving(false);
    }
  }

  async function handleRegenImage() {
    setRegeningImage(true);
    try {
      await onRegenImage(asset.id);
      // After regen, source may have changed — refresh it from parent
      setLocalImageSource(getImageSource(asset));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to regenerate image");
    } finally {
      setRegeningImage(false);
    }
  }

  async function handleCopy() {
    const text = asset.contentText ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const charCount = editText.length;
  const overLimit = charLimit !== null && charCount > charLimit;
  const imageUrl = asset.compositedImageUrl ?? asset.imageUrl;

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`border text-xs ${meta.color}`}>
              {meta.icon} {meta.label}
            </Badge>
            {asset.variant && (
              <Badge variant="outline" className="text-xs">
                Variant {asset.variant.toUpperCase()}
              </Badge>
            )}
            {isManual && (
              <Badge className="border text-xs bg-orange-400/10 text-orange-400 border-orange-400/20">
                Manual publish
              </Badge>
            )}
            {!!asset._versionCount && (
              <Badge variant="outline" className="gap-1 border text-xs text-muted-foreground">
                <History className="h-2.5 w-2.5" />
                {asset._versionCount}v
              </Badge>
            )}
          </div>
          <Badge className={`border text-xs ${STATUS_COLORS[localStatus] ?? ""}`}>
            {localStatus}
          </Badge>
        </div>

        {/* Image thumbnail */}
        {imageUrl && (
          <div className="relative bg-muted border-b border-border group/img">
            <img
              src={imageUrl}
              alt="composited"
              className="w-full h-48 object-cover cursor-pointer"
              onClick={() => setImageOpen(true)}
            />
            <button
              onClick={() => setImageOpen(true)}
              className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
              aria-label="View full size image"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            {/* Image source badge + regen button */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              {localImageSource && IMAGE_SOURCE_LABELS[localImageSource] && (
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium ${IMAGE_SOURCE_LABELS[localImageSource]!.color}`}>
                  {IMAGE_SOURCE_LABELS[localImageSource]!.label}
                </span>
              )}
              <button
                onClick={handleRegenImage}
                disabled={regeningImage}
                title="Regenerate image"
                className="inline-flex items-center gap-1 rounded border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
              >
                {regeningImage ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-2.5 w-2.5" />
                )}
                {regeningImage ? "Generating…" : "Regen Image"}
              </button>
              <button
                onClick={() => onEditImage(asset)}
                title="Edit composited image"
                className="inline-flex items-center gap-1 rounded border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] text-white hover:bg-black/80"
              >
                <SlidersHorizontal className="h-2.5 w-2.5" />
                Edit Image
              </button>
              <TooltipHelp text="Your brand colors, logo, and headline overlaid on the campaign image." side="top" />
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="p-4 space-y-3">
          {editing ? (
            <>
              {/* Formatting guidance */}
              {guidance && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{guidance}</p>
                </div>
              )}

              {/* Auto-resizing textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className={`w-full min-h-[160px] rounded-lg border bg-background p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-300 ${
                    overLimit ? "border-red-500/50 focus:ring-red-500/50" : streaming ? "border-orion-green/50 shadow-[0_0_12px_rgba(0,255,136,0.1)]" : "border-border"
                  } ${streaming ? "cursor-not-allowed" : ""}`}
                  value={editText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  readOnly={streaming}
                  placeholder="Content will appear here…"
                />
                {streaming && (
                  <span className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] text-orion-green">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    AI is writing…
                  </span>
                )}
              </div>

              {/* Char count + save state */}
              <div className="flex items-center justify-between text-[11px]">
                <span className={overLimit ? "font-medium text-red-400" : "text-muted-foreground"}>
                  {charCount.toLocaleString()}
                  {charLimit ? ` / ${charLimit.toLocaleString()}` : " chars"}
                  {overLimit && " — over limit"}
                </span>
                <span className={
                  saveIndicator === "unsaved" ? "text-amber-400" :
                  saveIndicator === "saving"  ? "text-muted-foreground" :
                  saveIndicator === "saved"   ? "text-green-400" :
                  "text-transparent select-none"
                }>
                  {saveIndicator === "unsaved" ? "● Unsaved" :
                   saveIndicator === "saving"  ? "Saving…" :
                   saveIndicator === "saved"   ? "✓ Saved" : "·"}
                </span>
              </div>

              {streamError && (
                <p className="text-xs text-red-400">{streamError}</p>
              )}
            </>
          ) : (
            <div className="overflow-hidden space-y-2">
              {/* Preview / Raw toggle */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setViewRaw((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border rounded-md px-2 py-1 transition-all"
                >
                  {viewRaw ? (
                    <><Eye className="h-3 w-3" /> Preview</>
                  ) : (
                    <><Code2 className="h-3 w-3" /> View Raw Text</>
                  )}
                </button>
              </div>
              {viewRaw ? (
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed font-mono bg-muted/40 rounded-lg p-3 border border-border min-h-[80px]">
                  {editText || "(No content)"}
                </pre>
              ) : (
                <PlatformPreview
                  asset={{ ...asset, contentText: editText }}
                  brandName={brandName}
                  {...(brandLogo ? { brandLogo } : {})}
                />
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-border bg-muted/30">
          {editing ? (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleManualSave}
                disabled={saving || streaming}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleCancelEdit}
                disabled={streaming}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>

              <div className="flex items-center gap-1.5 ml-auto">
                {prevText !== null && !streaming && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleUndo}
                    title="Undo last regeneration"
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 ${streaming ? "border-orion-green/30 text-orion-green hover:bg-orion-green/10" : ""}`}
                  onClick={handleRegenerate}
                  disabled={creatingVariant}
                >
                  {streaming ? (
                    <><X className="h-3.5 w-3.5" /> Stop</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Regen</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleCreateVariant}
                  disabled={creatingVariant || streaming}
                  title="Generate an A/B variant"
                >
                  {creatingVariant ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitFork className="h-3.5 w-3.5" />
                  )}
                  Variant
                  <TooltipHelp text="Creates two versions of each post. Orion tracks which performs better." side="top" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                onClick={handleApprove}
                disabled={approving || localStatus === "approved"}
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {localStatus === "approved" ? "Approved" : "Approve"}
              </Button>
              {isManual && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleCopy}
                  disabled={!asset.contentText}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : (COPY_LABEL[asset.channel] ?? "Copy")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleRegenerate}
                disabled={creatingVariant}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Regen
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleCreateVariant}
                disabled={creatingVariant}
                title="Generate an A/B variant"
              >
                {creatingVariant ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
                Variant
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onRepurpose(asset)}
                title="Repurpose to other channels"
              >
                <Repeat2 className="h-3.5 w-3.5" />
                Repurpose
              </Button>
            </>
          )}
        </div>

        {/* Version History */}
        <VersionHistoryPanel
          assetId={asset.id}
          currentText={asset.contentText ?? ""}
          onRestore={async (text) => { await onSave(asset.id, text); }}
        />
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
            aria-label="Close image viewer"
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

const FAL_TIP_KEY = "orion_fal_tip_dismissed";
const REVIEW_TUTORIAL_KEY = "stelos_review_tutorial_seen";

export default function ReviewPage() {
  const toast = useAppToast();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showFalTip, setShowFalTip] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [repurposeAsset, setRepurposeAsset] = useState<Asset | null>(null);
  const [editingImageAsset, setEditingImageAsset] = useState<Asset | null>(null);
  const [brandName, setBrandName] = useState("Your Brand");
  const [brandLogo, setBrandLogo] = useState<string | undefined>(undefined);

  // Show tutorial on first visit
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(REVIEW_TUTORIAL_KEY)) {
      setShowTutorial(true);
    }
  }, []);

  // Fetch campaign to get brand context for platform previews
  useEffect(() => {
    if (!id) return;
    api
      .get<{ data: { goal?: { brandName?: string }; name?: string } }>(`/campaigns/${id}`)
      .then((res) => {
        const bn = res.data?.goal?.brandName ?? res.data?.name ?? "Your Brand";
        setBrandName(bn);
      })
      .catch(() => {}); // non-critical — previews degrade gracefully
  }, [id]);

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

  // Show FAL tip if any asset used brand-graphic fallback and user hasn't dismissed it
  useEffect(() => {
    if (loading || assets.length === 0) return;
    const hasBrandGraphic = assets.some((a) => getImageSource(a) === "brand-graphic");
    if (hasBrandGraphic && !localStorage.getItem(FAL_TIP_KEY)) {
      setShowFalTip(true);
    }
  }, [loading, assets]);

  async function handleApprove(assetId: string) {
    await api.patch(`/assets/${assetId}`, { status: "approved" });
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, status: "approved" } : a)));
  }

  async function handleSave(assetId: string, contentText: string) {
    await api.patch(`/assets/${assetId}`, { contentText });
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, contentText } : a)));
  }

  function handleCreateVariant(newAsset: Asset) {
    setAssets((prev) => [...prev, newAsset]);
  }

  async function handleRegenImage(assetId: string) {
    const updated = await api.post<{ data: Asset }>(`/assets/${assetId}/regen-image`, {});
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, ...updated.data } : a)));
  }

  function handleImageSaved(assetId: string, newCompositedUrl: string) {
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, compositedImageUrl: newCompositedUrl } : a)),
    );
  }

  async function handleApproveAll() {
    setScheduling(true);
    try {
      // Navigate to calendar — assets that are individually approved will be scheduled.
      // Users approve what they want via the per-card Approve button, then click here.
      router.push(`/dashboard/calendar?from=review`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
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
    <div>
      {/* Sticky action bar — stays visible while scrolling */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 border-b border-border bg-card/90 backdrop-blur-sm flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground shrink-0"
          onClick={() => router.push(`/dashboard/campaigns/${id}/summary`)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Campaign</span>
        </Button>

        {/* Progress inline */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {approvedCount}/{totalCount}
          </span>
        </div>

        <Button
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={approvedCount === 0 || scheduling}
          onClick={handleApproveAll}
        >
          {scheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{allApproved ? "Schedule All" : `Schedule Approved (${approvedCount})`}</span>
          <span className="sm:hidden">Schedule</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* First-run tutorial modal */}
      {showTutorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { localStorage.setItem(REVIEW_TUTORIAL_KEY, "1"); setShowTutorial(false); }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Eye className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold">How the Review Dashboard works</h2>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { localStorage.setItem(REVIEW_TUTORIAL_KEY, "1"); setShowTutorial(false); }}
                aria-label="Dismiss tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                <span><strong className="text-foreground">Browse your content cards</strong> — each card is a generated post for a specific channel. Click a card to expand it.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                <span><strong className="text-foreground">Edit and regenerate</strong> — tweak copy inline or regenerate the image if you don't like it.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
                <span><strong className="text-foreground">Approve what looks good</strong> — hit the checkmark on each card, then click Schedule All when you're ready.</span>
              </li>
            </ul>
            <Button
              className="w-full"
              onClick={() => { localStorage.setItem(REVIEW_TUTORIAL_KEY, "1"); setShowTutorial(false); }}
            >
              Got it, let's review
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-6 pt-6">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold">Review Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review, edit, and approve your campaign content before publishing.
          </p>
        </div>

        {/* FAL tip banner */}
        {showFalTip && (
          <FalTipBanner
            onDismiss={() => {
              localStorage.setItem(FAL_TIP_KEY, "1");
              setShowFalTip(false);
            }}
          />
        )}

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
                brandName={brandName}
                {...(brandLogo ? { brandLogo } : {})}
                onApprove={handleApprove}
                onSave={handleSave}
                onCreateVariant={handleCreateVariant}
                onRegenImage={handleRegenImage}
                onRepurpose={setRepurposeAsset}
                onEditImage={setEditingImageAsset}
              />
            ))}
          </div>
        )}

        {repurposeAsset && (
          <RepurposeModal
            assetId={repurposeAsset.id}
            sourceChannel={repurposeAsset.channel}
            contentPreview={repurposeAsset.contentText ?? ""}
            open={!!repurposeAsset}
            onOpenChange={(open) => { if (!open) setRepurposeAsset(null); }}
          />
        )}

        {editingImageAsset && (
          <CompositorEditor
            asset={editingImageAsset}
            brandName={brandName}
            {...(brandLogo ? { brandLogo } : {})}
            open={!!editingImageAsset}
            onOpenChange={(open) => { if (!open) setEditingImageAsset(null); }}
            onSaved={(url) => handleImageSaved(editingImageAsset.id, url)}
          />
        )}
      </div>
    </div>
  );
}
