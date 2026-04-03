"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  GitBranch,
  Loader2,
  Pause,
  Play,
  Archive,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ImageIcon,
  FileText,
  List,
  CalendarDays,
  LayoutDashboard,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageLightbox } from "@/components/image-lightbox";
import { ContentCalendar } from "@/components/content-calendar";
import { useAppToast } from "@/hooks/use-app-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  archived: "bg-muted/50 text-muted-foreground/50 border-border/50",
};

const CHANNEL_EMOJI: Record<string, string> = {
  linkedin: "💼", twitter: "🐦", instagram: "📸", facebook: "📘",
  tiktok: "🎵", email: "📧", blog: "✍️", website: "🌐",
};

interface Asset {
  id: string;
  channel: string;
  type: string;
  contentText: string;
  variant?: "a" | "b";
  imageUrl?: string | null;
  compositedImageUrl?: string | null;
  mediaUrls?: string[];
  status: string;
  generatedByAgent?: string;
  createdAt: Date | string;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  createdAt: Date | string;
  goal?: { id: string; type: string; brandName: string };
  assets?: Array<{ id: string; channel: string; type: string; status: string }>;
}

interface CampaignDetail extends Campaign {
  assets: Asset[];
}

const CHANNEL_META_DUP: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "X/Twitter" },
  instagram: { emoji: "📸", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  email:     { emoji: "📧", label: "Email" },
  blog:      { emoji: "✍️", label: "Blog" },
};

const ALL_CHANNELS_DUP = Object.keys(CHANNEL_META_DUP);

interface DupState {
  campaignId: string;
  campaignName: string;
  goalType: string;
  goalTimeline: string;
  brandName: string;
  defaultChannels: string[];
}

export function CampaignsList({ initialCampaigns, goalId }: { initialCampaigns: Campaign[]; goalId?: string }) {
  const toast = useAppToast();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // Duplicate modal state
  const [dupState, setDupState] = useState<DupState | null>(null);
  const [dupDescription, setDupDescription] = useState("");
  const [dupChannels, setDupChannels] = useState<string[]>([]);
  const [duplicating, setDuplicating] = useState<"draft" | "launch" | null>(null);

  // Expanded campaign state
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, CampaignDetail>>({});
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", description: "" });

  const goalFiltered = goalId
    ? campaigns.filter((c) => c.goal?.id === goalId)
    : campaigns;

  const filtered =
    filter === "all"
      ? goalFiltered.filter((c) => c.status !== "archived")
      : goalFiltered.filter((c) => c.status === filter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Campaign }>("/campaigns", form);
      setCampaigns((prev) => [res.data, ...prev]);
      setOpen(false);
      setForm({ name: "", description: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(campaign: Campaign, status: string) {
    setUpdating(campaign.id);
    try {
      const res = await api.patch<{ data: Campaign }>(`/campaigns/${campaign.id}`, { status });
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? res.data : c)));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update campaign");
    } finally {
      setUpdating(null);
    }
  }

  async function toggleExpand(campaignId: string) {
    if (expanded === campaignId) {
      setExpanded(null);
      return;
    }
    setExpanded(campaignId);
    if (expandedData[campaignId]) return; // already loaded

    setLoadingExpand(campaignId);
    try {
      const res = await api.get<{ data: CampaignDetail }>(`/campaigns/${campaignId}`);
      setExpandedData((prev) => ({ ...prev, [campaignId]: res.data }));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load campaign details");
    } finally {
      setLoadingExpand(null);
    }
  }

  async function handleCopy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function openDuplicate(campaign: Campaign) {
    setDupDescription("");
    setDupChannels([]);
    setDupState({
      campaignId: campaign.id,
      campaignName: campaign.name,
      goalType: campaign.goal?.type ?? "awareness",
      goalTimeline: "1_month",
      brandName: campaign.goal?.brandName ?? campaign.name,
      defaultChannels: [],
    });

    // Load full campaign detail to get strategy channels if not already loaded
    if (expandedData[campaign.id]) {
      // We don't have strategy in the list — just use empty defaults
    }
  }

  async function handleDuplicate(mode: "draft" | "launch") {
    if (!dupState || !dupDescription.trim()) return;
    setDuplicating(mode);
    try {
      const res = await api.post<{ data: { goalId: string; channels: string[] } }>(
        `/campaigns/${dupState.campaignId}/duplicate`,
        { description: dupDescription.trim(), channels: dupChannels },
      );
      const { goalId } = res.data;

      if (mode === "launch") {
        await api.post(`/goals/${goalId}/run-pipeline`, { channels: dupChannels });
        toast.success("Campaign duplicated and pipeline started");
        router.push(`/dashboard/campaigns/war-room?goalId=${goalId}`);
      } else {
        toast.success("Goal created as draft");
        router.push("/dashboard");
      }
      setDupState(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to duplicate campaign");
    } finally {
      setDuplicating(null);
    }
  }

  const STATUS_TABS = ["all", "active", "draft", "paused", "completed"];

  return (
    <div className="space-y-4">
      {goalId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filtered by goal</span>
          <button
            onClick={() => router.push("/dashboard/campaigns")}
            className="text-orion-green hover:underline text-xs"
          >
            Show all
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Status filter (list view only) */}
          {view === "list" && (
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
              {STATUS_TABS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded px-3 py-1.5 text-xs capitalize transition-colors ${
                    filter === s
                      ? "bg-orion-green text-black font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* View toggle */}
          <div className="flex gap-0.5 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
                view === "list"
                  ? "bg-orion-green text-black font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
                view === "calendar"
                  ? "bg-orion-green text-black font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </button>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Q1 LinkedIn Lead Gen"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Brief description of this campaign…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar view */}
      {view === "calendar" && <ContentCalendar />}

      {/* Campaign list */}
      {view === "list" && (filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <GitBranch className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">No {filter !== "all" ? filter + " " : ""}campaigns yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Set a marketing goal to generate your first campaign automatically.
          </p>
          {filter === "all" && (
            <div className="mt-6">
              <Button size="sm" asChild>
                <a href="/dashboard">Set a Goal</a>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((campaign) => {
            const isExpanded = expanded === campaign.id;
            const detail = expandedData[campaign.id];
            const isLoading = loadingExpand === campaign.id;

            return (
              <div key={campaign.id} className="rounded-lg border border-border bg-card overflow-hidden transition-all duration-200 hover:border-orion-green/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orion-green/5">
                {/* Campaign header row */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{campaign.name}</span>
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft}`}
                      >
                        {campaign.status}
                      </span>
                    </div>
                    {campaign.goal && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {campaign.goal.brandName} · {campaign.goal.type}
                      </p>
                    )}
                  </div>

                  <button
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggleExpand(campaign.id)}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <span>{campaign.assets?.length ?? 0} assets</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </>
                    )}
                  </button>

                  {/* Status actions */}
                  <div className="flex items-center gap-1">
                    {campaign.status === "draft" && (
                      <Button
                        variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                        disabled={updating === campaign.id}
                        onClick={() => handleStatusChange(campaign, "active")}
                      >
                        {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Activate
                      </Button>
                    )}
                    {campaign.status === "active" && (
                      <Button
                        variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                        disabled={updating === campaign.id}
                        onClick={() => handleStatusChange(campaign, "paused")}
                      >
                        {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                        Pause
                      </Button>
                    )}
                    {campaign.status === "paused" && (
                      <Button
                        variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                        disabled={updating === campaign.id}
                        onClick={() => handleStatusChange(campaign, "active")}
                      >
                        {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Resume
                      </Button>
                    )}
                    {campaign.status !== "archived" && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={updating === campaign.id}
                        onClick={() => handleStatusChange(campaign, "archived")}
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Navigation shortcuts */}
                  <div className="flex items-center gap-0.5 pl-1 border-l border-border ml-1">
                    <a
                      href={`/dashboard/review/${campaign.id}`}
                      className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="View Assets"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Assets
                    </a>
                    <a
                      href={`/dashboard/campaigns/${campaign.id}/summary`}
                      className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="View Summary"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Summary
                    </a>
                  </div>

                  {/* More actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => openDuplicate(campaign)}>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Expanded assets panel */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                    {!detail ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading assets…
                      </div>
                    ) : detail.assets.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">No assets yet.</p>
                    ) : (
                      detail.assets.map((asset) => {
                        const isAssetExpanded = expandedAsset === asset.id;
                        const isImage = asset.type === "graphic_prompt";
                        return (
                          <div key={asset.id} className="rounded-lg border border-border bg-card overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <span className="text-base">{CHANNEL_EMOJI[asset.channel] ?? "📄"}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium capitalize">{asset.channel}</span>
                                  {isImage ? (
                                    <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                                    asset.status === "approved"
                                      ? "bg-orion-green/10 text-orion-green border-orion-green/20"
                                      : "bg-muted text-muted-foreground border-border"
                                  }`}>
                                    {asset.status}
                                  </span>
                                </div>
                                {!isAssetExpanded && !isImage && (
                                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                    {asset.contentText.slice(0, 80)}…
                                  </p>
                                )}
                                {!isAssetExpanded && isImage && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">AI-generated visual</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!isImage && (
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => handleCopy(asset.id, asset.contentText)}
                                  >
                                    {copied === asset.id ? (
                                      <Check className="h-3.5 w-3.5 text-orion-green" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setExpandedAsset(isAssetExpanded ? null : asset.id)}
                                >
                                  {isAssetExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>

                            {isAssetExpanded && (
                              <div className="border-t border-border px-3 py-3 space-y-3">
                                {/* Composited image > raw generated image > mediaUrls > placeholder */}
                                {(asset.compositedImageUrl || asset.imageUrl) ? (
                                  <div className="overflow-hidden rounded-lg border border-border">
                                    <ImageLightbox
                                      src={asset.compositedImageUrl ?? asset.imageUrl ?? ""}
                                      alt={`${asset.channel} visual`}
                                      containerClassName="max-h-72"
                                    />
                                    {asset.compositedImageUrl && (
                                      <div className="flex items-center gap-1 px-2 py-1 bg-orion-green/5 border-t border-orion-green/20">
                                        <span className="text-[10px] font-mono text-orion-green">COMPOSITED</span>
                                      </div>
                                    )}
                                  </div>
                                ) : asset.mediaUrls && asset.mediaUrls.length > 0 ? (
                                  <div>
                                    {asset.mediaUrls.map((url, i) => (
                                      <ImageLightbox
                                        key={i}
                                        src={url}
                                        alt={`Visual for ${asset.channel}`}
                                        containerClassName="max-h-72 rounded-lg border border-border"
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border bg-muted/20">
                                    <div className="text-center">
                                      <ImageIcon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                                      <p className="text-[11px] text-muted-foreground">No image generated</p>
                                    </div>
                                  </div>
                                )}
                                {asset.variant && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-muted-foreground">VARIANT</span>
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-orion-green/10 text-[10px] font-mono font-bold text-orion-green border border-orion-green/30">
                                      {asset.variant.toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                {!isImage && (
                                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                                    {asset.contentText}
                                  </pre>
                                )}
                                {isImage && (
                                  <p className="text-xs text-muted-foreground italic">
                                    Prompt: {asset.contentText}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Duplicate Campaign Modal */}
      <Dialog open={!!dupState} onOpenChange={(v) => { if (!v) setDupState(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate Campaign</DialogTitle>
          </DialogHeader>
          {dupState && (
            <div className="space-y-5 pt-1">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{dupState.brandName}</p>
                <p className="text-muted-foreground capitalize">
                  Goal: {dupState.goalType.replace(/_/g, " ")} · {dupState.goalTimeline.replace(/_/g, " ")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dup-list-desc">
                  What&apos;s different this time? <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="dup-list-desc"
                  rows={3}
                  placeholder="e.g. Targeting a different audience segment, or promoting the Q2 product launch…"
                  value={dupDescription}
                  onChange={(e) => setDupDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_CHANNELS_DUP.map((ch) => {
                    const meta = CHANNEL_META_DUP[ch]!;
                    const selected = dupChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() =>
                          setDupChannels((prev) =>
                            prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
                          )
                        }
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-orion-green bg-orion-green/10 text-orion-green"
                            : "border-border bg-card text-muted-foreground hover:border-orion-green/40 hover:text-foreground"
                        }`}
                      >
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDupState(null)} disabled={duplicating !== null}>
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  disabled={!dupDescription.trim() || duplicating !== null}
                  onClick={() => handleDuplicate("draft")}
                >
                  {duplicating === "draft" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                  Create Draft
                </Button>
                <Button
                  disabled={!dupDescription.trim() || dupChannels.length === 0 || duplicating !== null}
                  onClick={() => handleDuplicate("launch")}
                  className="gap-2"
                >
                  {duplicating === "launch" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create &amp; Launch
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
