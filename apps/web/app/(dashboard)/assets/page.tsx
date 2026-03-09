"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ImageIcon,
  Search,
  Filter,
  Calendar,
  ExternalLink,
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
  campaignName?: string;
  campaign?: { id: string; name: string };
}

interface AssetsResponse {
  data: Asset[];
  total?: number;
  page?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHANNELS = ["all", "linkedin", "twitter", "instagram", "facebook", "email", "blog"];
const STATUSES = ["all", "draft", "review", "approved", "published"];
const PAGE_SIZE = 24;

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  linkedin:  { label: "LinkedIn",  icon: "💼", color: "bg-blue-600/10 text-blue-400 border-blue-600/20" },
  twitter:   { label: "Twitter/X", icon: "🐦", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  instagram: { label: "Instagram", icon: "📸", color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  facebook:  { label: "Facebook",  icon: "📘", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  email:     { label: "Email",     icon: "📧", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  blog:      { label: "Blog",      icon: "✍️", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-500/10 text-gray-400 border-gray-500/20",
  review:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved:  "bg-green-500/10 text-green-400 border-green-500/20",
  published: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ── Asset card ─────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: Asset }) {
  const [hovered, setHovered] = useState(false);
  const meta = CHANNEL_META[asset.channel] ?? { label: asset.channel, icon: "📄", color: "" };
  const imageUrl = asset.compositedImageUrl ?? asset.imageUrl;
  const preview = (asset.contentText ?? "").slice(0, 60) + ((asset.contentText?.length ?? 0) > 60 ? "…" : "");
  const campaignName = asset.campaignName ?? asset.campaign?.name;
  const dateStr = asset.publishedAt
    ? new Date(asset.publishedAt).toLocaleDateString()
    : asset.scheduledFor
    ? new Date(asset.scheduledFor).toLocaleDateString()
    : "Draft";

  return (
    <div
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div className="relative bg-muted aspect-video flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="asset"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="text-3xl">{meta.icon}</span>
            <span className="text-xs">No image</span>
          </div>
        )}

        {/* Hover overlay */}
        {hovered && asset.contentText && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-3">
            <p className="text-xs text-white text-center leading-relaxed">
              {asset.contentText.slice(0, 200)}{asset.contentText.length > 200 ? "…" : ""}
            </p>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={`border text-[10px] px-1.5 ${meta.color}`}>
            {meta.icon} {meta.label}
          </Badge>
          <Badge className={`border text-[10px] px-1.5 ${STATUS_COLORS[asset.status] ?? ""}`}>
            {asset.status}
          </Badge>
          {asset.variant && (
            <Badge variant="outline" className="text-[10px] px-1.5">
              {asset.variant.toUpperCase()}
            </Badge>
          )}
        </div>

        {preview && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{preview}</p>
        )}

        {campaignName && (
          <p className="text-[10px] text-muted-foreground truncate">
            📁 {campaignName}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {dateStr}
          </div>
          {asset.campaign?.id && (
            <a
              href={`/dashboard/campaigns/${asset.campaign.id}/review`}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Review
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const buildQuery = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(p * PAGE_SIZE));
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      return `/assets?${params.toString()}`;
    },
    [channelFilter, statusFilter, search]
  );

  const loadAssets = useCallback(
    async (reset = false) => {
      const p = reset ? 0 : page;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await api.get<AssetsResponse>(buildQuery(p));
        const newAssets = res.data ?? [];
        if (reset) {
          setAssets(newAssets);
          setPage(0);
        } else {
          setAssets((prev) => [...prev, ...newAssets]);
        }
        setHasMore(newAssets.length === PAGE_SIZE);
      } catch (err: any) {
        setError(err.message ?? "Failed to load assets");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery, page]
  );

  // Reload on filter changes
  useEffect(() => {
    loadAssets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter, search]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    loadAssets(false);
  }

  function handleSearch() {
    setSearch(searchInput);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Asset Studio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All generated content assets across your campaigns.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search content…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} className="gap-1.5">
          <Search className="h-3.5 w-3.5" />
          Search
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch === "all" ? "All Channels" : (CHANNEL_META[ch]?.icon ?? "") + " " + (CHANNEL_META[ch]?.label ?? ch)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadAssets(true)}>
            Retry
          </Button>
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-border text-muted-foreground">
          <ImageIcon className="h-10 w-10 mb-3" />
          <p className="font-medium">No assets found</p>
          <p className="text-sm mt-1">Try adjusting your filters or run a campaign pipeline.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
