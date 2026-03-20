"use client";

/**
 * /dashboard/content — Content generator with SSE streaming + asset library
 */
import { useState, useRef, useEffect } from "react";
import { createAgentStream, api } from "@/lib/api-client";
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
import { Loader2, Copy, Check, Sparkles, FileText, ChevronDown, ChevronUp, Trash2, Pencil, X, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";

interface Asset {
  id: string;
  channel: string;
  type: string;
  contentText: string;
  mediaUrls?: string[];
  status: string;
  generatedByAgent: string;
  campaignId?: string;
  createdAt: string;
}

const CHANNELS = [
  { value: "linkedin", label: "LinkedIn", emoji: "💼" },
  { value: "twitter", label: "X / Twitter", emoji: "🐦" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "facebook", label: "Facebook", emoji: "📘" },
  { value: "tiktok", label: "TikTok", emoji: "🎵" },
  { value: "email", label: "Email", emoji: "📧" },
  { value: "blog", label: "Blog", emoji: "✍️" },
];

const GOAL_TYPES = [
  "leads", "awareness", "conversions", "traffic", "social", "product", "event",
];

export default function ContentPage() {
  const router = useRouter();
  const [channel, setChannel] = useState("linkedin");
  const [goalType, setGoalType] = useState("leads");
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [strategyContext, setStrategyContext] = useState("");

  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const stopRef = useRef<(() => void) | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedAsset, setCopiedAsset] = useState<string | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingAsset, setSavingAsset] = useState<string | null>(null);

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
      alert(err.message ?? "Failed to save");
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
      alert(err.message);
    } finally {
      setDeletingAsset(null);
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

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
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
            {content && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-orion-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>

          <div className="flex-1 p-4">
            {statusMsg && !content && (
              <p className="text-sm text-muted-foreground">{statusMsg}</p>
            )}
            {content ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {content}
                {streaming && (
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-orion-green align-middle" />
                )}
              </pre>
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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Generated Assets</h2>
          <span className="text-xs text-muted-foreground">{assets.length} total</span>
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
                <div key={asset.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-base">{ch?.emoji ?? "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{asset.channel}</span>
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          asset.status === "approved"
                            ? "bg-orion-green/10 text-orion-green border-orion-green/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {asset.status}
                        </span>
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
                          onClick={() => router.push(`/dashboard/campaigns/${asset.campaignId}/review`)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View in Campaign Review
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
