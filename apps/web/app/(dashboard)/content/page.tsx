"use client";

/**
 * /dashboard/content — Content generator with SSE streaming + asset library
 */
import { useState, useRef, useEffect } from "react";
import { createAgentStream, api, downloadFileFromApi } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, Sparkles, FileText, ChevronDown, ChevronUp, Trash2, Pencil, X, ExternalLink, GitFork, Download, RefreshCw, Leaf, Eye, AlignLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";
import { RepurposeModal } from "@/components/repurpose-modal";
import {
  LinkedInPreview,
  TwitterPreview,
  InstagramPreview,
  FacebookPreview,
  EmailPreview,
} from "@/components/platform-previews";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Asset {
  id: string;
  channel: string;
  type: string;
  contentText: string;
  mediaUrls?: string[];
  status: string;
  generatedByAgent: string;
  campaignId?: string;
  createdAt: Date | string;
  recyclable?: boolean;
  recycleCount?: number;
  sourceAssetId?: string;
}

const CHANNELS = [
  { value: "linkedin", label: "LinkedIn", emoji: "💼" },
  { value: "twitter", label: "X / Twitter", emoji: "🐦" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "facebook", label: "Facebook", emoji: "📘" },
  { value: "tiktok", label: "TikTok", emoji: "🎵" },
  { value: "email", label: "Email", emoji: "📧" },
  { value: "sms", label: "SMS", emoji: "💬" },
  { value: "blog", label: "Blog", emoji: "✍️" },
];

const GOAL_TYPES = [
  "leads", "awareness", "conversions", "traffic", "social", "product", "event",
];

export default function ContentPage() {
  const router = useRouter();
  const toast = useAppToast();
  const [channel, setChannel] = useState("linkedin");
  const [goalType, setGoalType] = useState("leads");
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [strategyContext, setStrategyContext] = useState("");

  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [outputTab, setOutputTab] = useState<"text" | "preview">("text");
  const stopRef = useRef<(() => void) | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedAsset, setCopiedAsset] = useState<string | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingAsset, setSavingAsset] = useState<string | null>(null);
  const [repurposeAsset, setRepurposeAsset] = useState<Asset | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [recyclingAsset, setRecyclingAsset] = useState<string | null>(null);

  async function handleExportCsv() {
    setExportingCsv(true);
    try {
      await downloadFileFromApi("/assets/export", "content-export.csv");
    } catch (err: any) {
      toast.error(err.message ?? "Export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  // ── Bulk select state ──────────────────────────────────────────────────────
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRepurposeOpen, setBulkRepurposeOpen] = useState(false);
  const [bulkRepurposeChannels, setBulkRepurposeChannels] = useState<string[]>([]);
  const [bulkRepurposing, setBulkRepurposing] = useState(false);

  useEffect(() => {
    api.get<{ data: Asset[] }>("/assets")
      .then((res) => setAssets(res.data))
      .catch(() => {})
      .finally(() => setLoadingAssets(false));
  }, []);

  async function handleCopyAsset(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedAsset(id);
    setTimeout(() => setCopiedAsset(null), 1500);
  }

  function handleStartEdit(asset: Asset) {
    setEditingAsset(asset.id);
    setEditText(asset.contentText);
    if (expanded !== asset.id) setExpanded(asset.id);
  }

  function handleCancelEdit() {
    setEditingAsset(null);
    setEditText("");
  }

  async function handleSaveEdit(id: string) {
    setSavingAsset(id);
    try {
      await api.patch(`/assets/${id}`, { contentText: editText });
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, contentText: editText } : a)));
      setEditingAsset(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSavingAsset(null);
    }
  }

  async function handleDeleteAsset(id: string) {
    setDeletingAsset(id);
    try {
      await api.delete(`/assets/${id}`);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete asset");
    } finally {
      setDeletingAsset(null);
    }
  }

  async function handleRecycleAsset(id: string) {
    setRecyclingAsset(id);
    try {
      await api.post(`/assets/${id}/recycle`, {});
      toast.success("Recycling queued — a refreshed version will be auto-scheduled shortly.");
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, recyclable: true } : a)),
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to queue recycle");
    } finally {
      setRecyclingAsset(null);
    }
  }

  function toggleAssetSelect(id: string) {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedAssets(prev =>
      prev.size === assets.length ? new Set() : new Set(assets.map(a => a.id)),
    );
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selectedAssets);
    try {
      await Promise.all(ids.map(id => api.delete(`/assets/${id}`)));
      setAssets(prev => prev.filter(a => !ids.includes(a.id)));
      setSelectedAssets(new Set());
      toast.success(`${ids.length} asset${ids.length !== 1 ? "s" : ""} deleted`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete assets");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkRepurpose() {
    if (bulkRepurposeChannels.length === 0) return;
    setBulkRepurposing(true);
    const ids = Array.from(selectedAssets);
    try {
      await Promise.all(
        ids.flatMap(assetId =>
          bulkRepurposeChannels.map(channel =>
            api.post(`/assets/${assetId}/repurpose`, { targetChannel: channel }),
          ),
        ),
      );
      toast.success(`Repurposed ${ids.length} asset${ids.length !== 1 ? "s" : ""} to ${bulkRepurposeChannels.join(", ")}`);
      setSelectedAssets(new Set());
      setBulkRepurposeOpen(false);
      setBulkRepurposeChannels([]);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to repurpose assets");
    } finally {
      setBulkRepurposing(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (streaming) {
      stopRef.current?.();
      setStreaming(false);
      return;
    }

    setContent("");
    setStatusMsg("Connecting to Content Creator Agent…");
    setStreaming(true);

    const stop = createAgentStream(
      "/assets/generate",
      { channel, goalType, brandName, brandDescription, strategyContext },
      {
        onChunk: (text) => setContent((prev) => prev + text),
        onEvent: (event, data: any) => {
          if (event === "status") setStatusMsg(data.message ?? "");
          if (event === "done") setStatusMsg("Generation complete.");
        },
        onDone: () => setStreaming(false),
        onError: (msg) => {
          setStatusMsg(`Error: ${msg}`);
          setStreaming(false);
        },
      },
    );
    stopRef.current = stop;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="text-sm text-muted-foreground">
          Generate platform-native marketing copy with real-time AI streaming.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] grid-cols-1">
        {/* Form panel */}
        <form onSubmit={handleGenerate} className="space-y-4">
          {/* Channel selector */}
          <div className="space-y-2">
            <Label>Channel</Label>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setChannel(ch.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                    channel === ch.value
                      ? "border-orion-green bg-orion-green/10 text-orion-green"
                      : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent"
                  }`}
                >
                  <span className="text-base">{ch.emoji}</span>
                  <span className="truncate text-[10px]">{ch.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Goal Type</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Brand Name *</Label>
            <Input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Brand Description</Label>
            <Textarea
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
              placeholder="What does your brand do and who is it for?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Strategy Context (optional)</Label>
            <Textarea
              value={strategyContext}
              onChange={(e) => setStrategyContext(e.target.value)}
              placeholder="Paste key points from your strategy to guide the content…"
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full gap-2" disabled={!brandName}>
            {streaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Stop Generation
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Content
              </>
            )}
          </Button>
        </form>

        {/* Output panel */}
        <div className="flex flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Generated Content</span>
              {streaming && (
                <Badge variant="outline" className="border-orion-green/30 text-orion-green text-[10px]">
                  LIVE
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {content && (
                <>
                  {/* Tab switcher */}
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button
                      onClick={() => setOutputTab("text")}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${outputTab === "text" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <AlignLeft className="h-3 w-3" />
                      Raw
                    </button>
                    <button
                      onClick={() => setOutputTab("preview")}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l border-border ${outputTab === "preview" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </button>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleCopy}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-orion-green" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 p-4">
            {statusMsg && !content && (
              <p className="text-sm text-muted-foreground">{statusMsg}</p>
            )}
            {content ? (
              outputTab === "preview" ? (
                <div className="flex justify-center">
                  {channel === "linkedin" && <LinkedInPreview content={content} brandName={brandName || "Your Brand"} />}
                  {channel === "twitter" && <TwitterPreview content={content} brandName={brandName || "Your Brand"} />}
                  {channel === "instagram" && <InstagramPreview content={content} brandName={brandName || "Your Brand"} />}
                  {channel === "facebook" && <FacebookPreview content={content} brandName={brandName || "Your Brand"} />}
                  {channel === "email" && <EmailPreview content={content} brandName={brandName || "Your Brand"} />}
                  {!["linkedin", "twitter", "instagram", "facebook", "email"].includes(channel) && (
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed w-full">{content}</pre>
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {content}
                  {streaming && (
                    <span className="inline-block h-4 w-0.5 animate-pulse bg-orion-green align-middle" />
                  )}
                </pre>
              )
            ) : !statusMsg ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Fill in the form and click Generate to stream content.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Asset Library */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {assets.length > 0 && (
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-orion-green"
              checked={selectedAssets.size === assets.length && assets.length > 0}
              onChange={toggleSelectAll}
              aria-label="Select all assets"
            />
          )}
          <h2 className="font-semibold">Generated Assets</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{assets.length} total</span>
            {assets.length > 0 && (
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                className="flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {exportingCsv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Export CSV
              </button>
            )}
          </div>
        </div>

        {loadingAssets ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading assets…
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No content yet"
            description="Create your first campaign to generate channel-specific content."
            actions={[{ label: "Create Campaign", href: "/dashboard" }]}
          />
        ) : (
          <div className="space-y-2">
            {assets.map((asset) => {
              const ch = CHANNELS.find((c) => c.value === asset.channel);
              const isExpanded = expanded === asset.id;
              return (
                <div
                key={asset.id}
                className={`rounded-lg border bg-card transition-colors ${
                  selectedAssets.has(asset.id)
                    ? "border-orion-green/30 bg-orion-green/[0.03]"
                    : "border-border"
                }`}
              >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer accent-orion-green"
                      checked={selectedAssets.has(asset.id)}
                      onChange={() => toggleAssetSelect(asset.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="text-base">{ch?.emoji ?? "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium capitalize">{asset.channel}</span>
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          asset.status === "approved"
                            ? "bg-orion-green/10 text-orion-green border-orion-green/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {asset.status}
                        </span>
                        {asset.recyclable && !asset.sourceAssetId && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                            <Leaf className="h-2.5 w-2.5" />
                            Evergreen
                          </span>
                        )}
                        {asset.sourceAssetId && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                            <RefreshCw className="h-2.5 w-2.5" />
                            Recycled
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(asset.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {!isExpanded && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {asset.type === "graphic_prompt"
                            ? "🖼️ AI-generated image"
                            : `${asset.contentText.slice(0, 100)}…`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!asset.sourceAssetId && (asset.status === "approved" || asset.status === "published") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Recycle Now — refresh with a new hook"
                          disabled={recyclingAsset === asset.id}
                          onClick={() => handleRecycleAsset(asset.id)}
                        >
                          {recyclingAsset === asset.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </Button>
                      )}
                      {asset.campaignId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Repurpose to other channels"
                          onClick={() => setRepurposeAsset(asset)}
                        >
                          <GitFork className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Quick edit"
                        onClick={() => editingAsset === asset.id ? handleCancelEdit() : handleStartEdit(asset)}
                      >
                        {editingAsset === asset.id ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopyAsset(asset.id, asset.contentText)}
                      >
                        {copiedAsset === asset.id ? (
                          <Check className="h-3.5 w-3.5 text-orion-green" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={deletingAsset === asset.id}
                        onClick={() => handleDeleteAsset(asset.id)}
                      >
                        {deletingAsset === asset.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpanded(isExpanded ? null : asset.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      {asset.mediaUrls && asset.mediaUrls.length > 0 && (
                        <div className="space-y-2">
                          {asset.mediaUrls.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`Generated visual for ${asset.channel}`}
                              className="w-full rounded-lg border border-border object-cover max-h-80"
                            />
                          ))}
                        </div>
                      )}

                      {editingAsset === asset.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full min-h-[160px] rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => handleSaveEdit(asset.id)}
                              disabled={savingAsset === asset.id}
                            >
                              {savingAsset === asset.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Save
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCancelEdit}>
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {asset.type !== "graphic_prompt" && (
                            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                              {asset.contentText}
                            </pre>
                          )}
                          {asset.type === "graphic_prompt" && (
                            <p className="text-xs text-muted-foreground italic">
                              Prompt: {asset.contentText}
                            </p>
                          )}
                        </>
                      )}

                      {asset.campaignId && (
                        <button
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => router.push(`/campaigns/${asset.campaignId}/review`)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View in Campaign Review
                        </button>
                      )}
                      {asset.sourceAssetId && (
                        <p className="flex items-center gap-1.5 text-xs text-sky-400">
                          <RefreshCw className="h-3 w-3" />
                          Recycled variant — original asset ID: <span className="font-mono">{asset.sourceAssetId.slice(0, 8)}…</span>
                        </p>
                      )}
                      {asset.recyclable && !asset.sourceAssetId && (asset.recycleCount ?? 0) > 0 && (
                        <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                          <Leaf className="h-3 w-3" />
                          Recycled {asset.recycleCount} time{asset.recycleCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {repurposeAsset && (
        <RepurposeModal
          assetId={repurposeAsset.id}
          sourceChannel={repurposeAsset.channel}
          contentPreview={repurposeAsset.contentText}
          open={!!repurposeAsset}
          onOpenChange={(open) => { if (!open) setRepurposeAsset(null); }}
        />
      )}

      {/* Bulk repurpose channel picker */}
      <Dialog open={bulkRepurposeOpen} onOpenChange={(v) => { if (!v) setBulkRepurposeOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Repurpose {selectedAssets.size} Asset{selectedAssets.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Select target channels. Each selected asset will be repurposed to each chosen channel.
            </p>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(ch => {
                const selected = bulkRepurposeChannels.includes(ch.value);
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() =>
                      setBulkRepurposeChannels(prev =>
                        prev.includes(ch.value) ? prev.filter(c => c !== ch.value) : [...prev, ch.value],
                      )
                    }
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-orion-green bg-orion-green/10 text-orion-green"
                        : "border-border bg-card text-muted-foreground hover:border-orion-green/40"
                    }`}
                  >
                    {ch.emoji} {ch.label}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkRepurposeOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={bulkRepurposeChannels.length === 0 || bulkRepurposing}
                onClick={handleBulkRepurpose}
                className="flex items-center gap-1.5 rounded-md bg-orion-green px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 hover:bg-orion-green/90 transition-colors"
              >
                {bulkRepurposing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Repurpose
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedAssets.size}
        noun="asset"
        onClear={() => setSelectedAssets(new Set())}
        actions={[
          {
            label: `Delete Selected (${selectedAssets.size})`,
            variant: "destructive",
            icon: <Trash2 className="h-3 w-3" />,
            disabled: bulkDeleting,
            onClick: handleBulkDelete,
          },
          {
            label: "Repurpose Selected",
            variant: "outline",
            icon: <GitFork className="h-3 w-3" />,
            onClick: () => setBulkRepurposeOpen(true),
          },
        ]}
      />
    </div>
  );
}
