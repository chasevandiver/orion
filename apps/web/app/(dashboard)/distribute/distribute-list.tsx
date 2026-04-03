"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatInOrgTimezone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Mail,
  FileText,
  RefreshCw,
  Copy,
  Check,
  BookOpen,
  Wifi,
  WifiOff,
  X,
  AlertTriangle,
  Link2,
  MessageSquare,
  MapPin,
  CalendarClock,
} from "lucide-react";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { TooltipHelp } from "@/components/ui/tooltip-help";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  scheduled:        "bg-blue-500/10 text-blue-400 border-blue-500/20",
  queued:           "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  published:        "bg-orion-green/10 text-orion-green border-orion-green/20",
  failed:           "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled:        "bg-muted/50 text-muted-foreground/50 border-border/50",
  preflight_failed: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  scheduled:        <Clock className="h-3.5 w-3.5" />,
  queued:           <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
  published:        <CheckCircle2 className="h-3.5 w-3.5" />,
  failed:           <XCircle className="h-3.5 w-3.5" />,
  cancelled:        <XCircle className="h-3.5 w-3.5" />,
  preflight_failed: <AlertTriangle className="h-3.5 w-3.5" />,
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  linkedin:         <Linkedin      className="h-4 w-4" />,
  twitter:          <Twitter       className="h-4 w-4" />,
  instagram:        <Instagram     className="h-4 w-4" />,
  facebook:         <Facebook      className="h-4 w-4" />,
  email:            <Mail          className="h-4 w-4" />,
  blog:             <FileText      className="h-4 w-4" />,
  tiktok:           <Zap           className="h-4 w-4" />,
  sms:              <MessageSquare className="h-4 w-4" />,
  google_business:  <MapPin        className="h-4 w-4" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  google_business: "Google Business",
};

function channelLabel(ch: string): string {
  return CHANNEL_LABELS[ch] ?? ch;
}

const CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "sms", "blog", "google_business"] as const;

const UTM_MEDIUM_MAP: Record<string, string> = {
  linkedin: "social", twitter: "social", instagram: "social",
  facebook: "social", tiktok: "social", email: "email", blog: "blog", sms: "sms",
  google_business: "social",
};

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-{2,}/g, "-").slice(0, 50).replace(/^-+|-+$/g, "");
}

function extractUrls(text: string): string[] {
  return [...(text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])];
}

// Channels where auto-publishing is not supported by any API (content-only).
const MANUAL_CHANNELS = new Set(["tiktok", "blog"]);

const MANUAL_BADGE = "bg-amber-500/10 text-amber-400 border-amber-500/20";
const MANUAL_LABELS: Record<string, string> = {
  tiktok: "TikTok content must be published manually (no organic posting API). Copy the script below.",
  blog: "Blog content must be published manually to your CMS. Copy the content below.",
};

const CONNECT_DISMISSED_KEY = "orion_distribute_connect_dismissed_v1";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreflightIssue {
  code: string;
  message: string;
  severity: "warning" | "critical";
}

interface ScheduledPost {
  id: string;
  channel: string;
  status: string;
  scheduledFor: string;
  publishedAt?: string;
  platformPostId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date | string;
  preflightStatus?: string | null;
  preflightErrors?: PreflightIssue[] | null;
  asset?: {
    id: string;
    contentText: string;
    channel: string;
    status: string;
  };
}

interface Connection {
  id: string;
  channel: string;
  accountName?: string;
  isActive: boolean;
  connectedAt: string;
}

interface DistributeListProps {
  initialPosts: ScheduledPost[];
  hasCampaigns?: boolean;
  initialConnections: Connection[];
  orgTimezone?: string;
  autoUtmEnabled?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string, tz: string) {
  return formatInOrgTimezone(d, tz, "short");
}

/** A post is considered simulated when it was "published" but the channel has no real connection. */
function isSimulatedPublish(post: ScheduledPost, connectedChannels: Set<string>): boolean {
  return (
    post.status === "published" &&
    !MANUAL_CHANNELS.has(post.channel) &&
    !connectedChannels.has(post.channel)
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Prominent callout shown when zero auto-publishable channels are connected. */
function NoConnectionsCallout({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <button
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
          <WifiOff className="h-4 w-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300">No social accounts connected</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Connect your social accounts to publish content automatically. Without connected
            accounts, posts are simulated and won't reach your audience.
          </p>
          <div className="mt-3">
            <Button size="sm" className="gap-1.5 text-xs" asChild>
              <Link href="/dashboard/settings">
                <Link2 className="h-3.5 w-3.5" />
                Connect Accounts
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Soft notice shown when some channels are connected but posts use unconnected channels. */
function PartialConnectionNotice({
  channels,
  onDismiss,
}: {
  channels: string[];
  onDismiss: () => void;
}) {
  const label = channels.map((c) => {
    const lbl = channelLabel(c);
    return lbl.charAt(0).toUpperCase() + lbl.slice(1);
  }).join(", ");
  return (
    <div className="relative rounded-lg border border-border bg-muted/30 p-3">
      <button
        onClick={onDismiss}
        className="absolute right-2.5 top-2.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-2.5 pr-6">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-muted-foreground">
          You have content for{" "}
          <span className="font-medium text-foreground">{label}</span>. Connect these
          accounts to publish automatically.{" "}
          <Link
            href="/dashboard/settings"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Connect accounts →
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Channel-by-channel connection status summary for channels appearing in posts. */
function ChannelStatusSummary({
  usedChannels,
  connectedChannels,
}: {
  usedChannels: string[];
  connectedChannels: Set<string>;
}) {
  if (usedChannels.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="mb-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Channel Status
      </p>
      <div className="flex flex-wrap gap-2">
        {usedChannels.map((ch) => {
          const isManual = MANUAL_CHANNELS.has(ch);
          const isConnected = connectedChannels.has(ch);
          if (isManual) {
            return (
              <span
                key={ch}
                className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1 text-xs capitalize text-muted-foreground"
              >
                {CHANNEL_ICONS[ch]}
                {channelLabel(ch)}
                <span className="text-[10px] text-muted-foreground/60">(content only)</span>
              </span>
            );
          }
          if (isConnected) {
            return (
              <span
                key={ch}
                className="flex items-center gap-1.5 rounded border border-orion-green/20 bg-orion-green/10 px-2.5 py-1 text-xs capitalize text-orion-green"
              >
                <Wifi className="h-3 w-3" />
                {channelLabel(ch)}
              </span>
            );
          }
          return (
            <Link
              key={ch}
              href="/dashboard/settings"
              className="flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-xs capitalize text-amber-400 hover:border-amber-500/40 transition-colors"
            >
              <WifiOff className="h-3 w-3" />
              {channelLabel(ch)}
              <span className="text-[10px] text-amber-400/70">Connect →</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DistributeList({ initialPosts, initialConnections, hasCampaigns = false, orgTimezone = "America/Chicago", autoUtmEnabled = true }: DistributeListProps) {
  const toast = useAppToast();
  const [posts, setPosts] = useState(initialPosts);
  const [connections] = useState(initialConnections);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // ── Bulk select state ──────────────────────────────────────────────────────
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(
    new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  );

  // UTM state for the schedule dialog
  const [utmEnabled, setUtmEnabled] = useState(autoUtmEnabled);
  const [utmCampaign, setUtmCampaign] = useState("");

  // Restore dismissed state from localStorage (only runs client-side)
  useEffect(() => {
    try {
      if (localStorage.getItem(CONNECT_DISMISSED_KEY) === "1") setDismissed(true);
    } catch {}
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try { localStorage.setItem(CONNECT_DISMISSED_KEY, "1"); } catch {}
  }

  const [form, setForm] = useState({
    channel: "linkedin" as (typeof CHANNELS)[number],
    contentText: "",
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  // Derive sets used throughout the component
  const connectedChannels = new Set(connections.map((c) => c.channel));

  // Unique channels that appear in current posts, excluding manual-only channels
  const usedAutoChannels = Array.from(
    new Set(posts.map((p) => p.channel).filter((ch) => !MANUAL_CHANNELS.has(ch)))
  );

  // Auto channels used in posts that have no connection
  const unconnectedUsedChannels = usedAutoChannels.filter(
    (ch) => !connectedChannels.has(ch)
  );

  // All unique channels in posts (for the status summary)
  const allUsedChannels = Array.from(new Set(posts.map((p) => p.channel)));

  // Which callout to show (null = nothing to show)
  const hasAnyAutoConnection = connections.some((c) => !MANUAL_CHANNELS.has(c.channel));
  const showNoConnectionsCallout = !dismissed && !hasAnyAutoConnection && posts.length > 0;
  const showPartialCallout =
    !dismissed && hasAnyAutoConnection && unconnectedUsedChannels.length > 0;

  async function handleCopyContent(postId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPostId(postId);
      setTimeout(() => setCopiedPostId(null), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedPostId(postId);
      setTimeout(() => setCopiedPostId(null), 2000);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      let contentText = form.contentText;

      // Apply UTM params to any URLs in the content
      if (utmEnabled && utmCampaign.trim()) {
        const medium = UTM_MEDIUM_MAP[form.channel] ?? "social";
        contentText = contentText.replace(/https?:\/\/[^\s<>"')\]]+/g, (url) => {
          try {
            const parsed = new URL(url);
            if (parsed.searchParams.has("utm_source")) return url;
            parsed.searchParams.set("utm_source", form.channel);
            parsed.searchParams.set("utm_medium", medium);
            parsed.searchParams.set("utm_campaign", slugify(utmCampaign));
            return parsed.toString();
          } catch { return url; }
        });
      }

      const res = await api.post<{ data: ScheduledPost }>("/distribute", {
        ...form,
        contentText,
        scheduledFor: new Date(form.scheduledFor).toISOString(),
      });
      setPosts([res.data, ...posts]);
      setOpen(false);
      setForm({
        channel: "linkedin",
        contentText: "",
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
      });
      setUtmCampaign("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to schedule post");
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(postId: string, force = false) {
    setPublishing(postId);
    try {
      const res = await api.post<{
        data: { postId: string; platformPostId: string; publishedAt: string };
      }>(`/distribute/${postId}/publish`, { force });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, status: "published", platformPostId: res.data.platformPostId, publishedAt: res.data.publishedAt }
            : p,
        ),
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to publish post");
    } finally {
      setPublishing(null);
    }
  }

  async function handleCancel(postId: string) {
    try {
      await api.delete(`/distribute/${postId}`);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "cancelled" } : p)));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to cancel post");
    }
  }

  function togglePostSelect(id: string) {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedPosts(prev =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)),
    );
  }

  async function handleBulkCancel() {
    setBulkUpdating(true);
    try {
      await api.post("/distribute/bulk-update", {
        postIds: Array.from(selectedPosts),
        action: "cancel",
      });
      const ids = selectedPosts;
      setPosts(prev => prev.map(p => ids.has(p.id) ? { ...p, status: "cancelled" } : p));
      setSelectedPosts(new Set());
      toast.success(`${ids.size} post${ids.size !== 1 ? "s" : ""} cancelled`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to cancel posts");
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleBulkReschedule() {
    setBulkUpdating(true);
    try {
      const scheduledFor = new Date(rescheduleDate).toISOString();
      await api.post("/distribute/bulk-update", {
        postIds: Array.from(selectedPosts),
        action: "reschedule",
        scheduledFor,
      });
      const ids = selectedPosts;
      setPosts(prev => prev.map(p => ids.has(p.id) ? { ...p, scheduledFor } : p));
      setSelectedPosts(new Set());
      setRescheduleOpen(false);
      toast.success(`${ids.size} post${ids.size !== 1 ? "s" : ""} rescheduled`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reschedule posts");
    } finally {
      setBulkUpdating(false);
    }
  }

  const filtered =
    statusFilter === "all" ? posts : posts.filter((p) => p.status === statusFilter);

  return (
    <div className="space-y-4">
      {/* Zero-connections callout */}
      {showNoConnectionsCallout && (
        <NoConnectionsCallout onDismiss={handleDismiss} />
      )}

      {/* Partial-connections notice */}
      {showPartialCallout && (
        <PartialConnectionNotice
          channels={unconnectedUsedChannels}
          onDismiss={handleDismiss}
        />
      )}

      {/* Channel status summary — shown when there are posts to give context */}
      {allUsedChannels.length > 0 && (
        <ChannelStatusSummary
          usedChannels={allUsedChannels}
          connectedChannels={connectedChannels}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {filtered.length > 0 && (
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer accent-orion-green"
            checked={selectedPosts.size === filtered.length && filtered.length > 0}
            onChange={toggleSelectAll}
            aria-label="Select all posts"
          />
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="preflight_failed">Preflight Failed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Schedule Post
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Schedule a Post</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Channel</Label>
                  <Select
                    value={form.channel}
                    onValueChange={(v) => setForm((f) => ({ ...f, channel: v as any }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((ch) => (
                        <SelectItem key={ch} value={ch}>
                          <span className="flex items-center gap-2 capitalize">
                            {CHANNEL_ICONS[ch]}
                            {channelLabel(ch)}
                            {connectedChannels.has(ch) && (
                              <span className="text-xs text-orion-green">✓ connected</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Content</Label>
                  <Textarea
                    className="mt-1 min-h-[120px] font-mono text-sm"
                    placeholder="Write your post content here..."
                    value={form.contentText}
                    onChange={(e) => setForm((f) => ({ ...f, contentText: e.target.value }))}
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {form.contentText.length} chars
                  </p>
                </div>

                <div>
                  <Label>Schedule For</Label>
                  <Input
                    type="datetime-local"
                    className="mt-1"
                    value={form.scheduledFor}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
                  />
                </div>

                {/* UTM Attribution */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">UTM Attribution</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={utmEnabled}
                      onClick={() => setUtmEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                        utmEnabled ? "bg-orion-green" : "bg-muted"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${utmEnabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {utmEnabled && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Campaign name</Label>
                        <Input
                          className="mt-1 h-8 text-xs"
                          placeholder="e.g. q4-product-launch"
                          value={utmCampaign}
                          onChange={(e) => setUtmCampaign(e.target.value)}
                        />
                      </div>
                      {extractUrls(form.contentText).length > 0 && utmCampaign.trim() && (
                        <div className="rounded-md bg-muted/60 p-2 space-y-0.5 text-xs font-mono text-muted-foreground">
                          <p>utm_source=<span className="text-foreground">{form.channel}</span></p>
                          <p>utm_medium=<span className="text-foreground">{UTM_MEDIUM_MAP[form.channel] ?? "social"}</span></p>
                          <p>utm_campaign=<span className="text-foreground">{slugify(utmCampaign)}</span></p>
                          <p className="font-sans text-xs text-muted-foreground/70 pt-0.5">
                            Will be applied to {extractUrls(form.contentText).length} URL{extractUrls(form.contentText).length !== 1 ? "s" : ""} in your content.
                          </p>
                        </div>
                      )}
                      {extractUrls(form.contentText).length === 0 && (
                        <p className="text-xs text-muted-foreground/70">No URLs detected in content yet.</p>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={creating || !form.contentText.trim()}
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Schedule Post
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Posts list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Send className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">No scheduled posts</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Once your campaign is created and content is approved, posts will appear here.
          </p>
          <div className="mt-6">
            {hasCampaigns ? (
              <Button size="sm" asChild>
                <a href="/dashboard/campaigns">Review Content</a>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <a href="/dashboard">Create Campaign</a>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((post) => {
            const isManual = MANUAL_CHANNELS.has(post.channel);
            const isConnected = connectedChannels.has(post.channel);
            const isSimulated = isSimulatedPublish(post, connectedChannels);

            return (
              <div
                key={post.id}
                className={`group rounded-lg border bg-card p-4 transition-colors hover:border-border/80 ${
                  selectedPosts.has(post.id)
                    ? "border-orion-green/30 bg-orion-green/[0.02]"
                    : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Row checkbox */}
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-orion-green"
                    checked={selectedPosts.has(post.id)}
                    onChange={() => togglePostSelect(post.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  {/* Channel icon */}
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    {CHANNEL_ICONS[post.channel] ?? <Send className="h-4 w-4" />}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium capitalize">{channelLabel(post.channel)}</span>

                      {/* Manual-channel badge */}
                      {isManual ? (
                        <Badge variant="outline" className={`flex items-center gap-1 text-xs ${MANUAL_BADGE}`}>
                          <BookOpen className="h-3 w-3" />
                          Content Ready
                        </Badge>
                      ) : (
                        <>
                          {/* Status badge — swap "published" for "Simulated" when unconnected */}
                          {isSimulated ? (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                              <Zap className="h-3 w-3" />
                              Simulated
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`flex items-center gap-1 text-xs ${STATUS_COLORS[post.status] ?? ""}`}
                            >
                              {STATUS_ICONS[post.status]}
                              {post.status}
                            </Badge>
                          )}

                          {/* Unconnected indicator — shown for non-manual, non-connected, not-yet-published posts */}
                          {!isConnected && post.status !== "published" && post.status !== "cancelled" && (
                            <Link
                              href="/dashboard/settings"
                              className="flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[11px] text-amber-400 hover:border-amber-500/40 transition-colors"
                            >
                              <WifiOff className="h-2.5 w-2.5" />
                              Not connected — Connect →
                            </Link>
                          )}
                        </>
                      )}
                    </div>

                    {isManual && (
                      <p className="mt-1 text-[11px] text-amber-500/80">
                        {MANUAL_LABELS[post.channel]}
                      </p>
                    )}

                    {post.asset?.contentText && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {post.asset.contentText}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {!isManual && (
                        <span>Scheduled: {formatDate(post.scheduledFor, orgTimezone)}</span>
                      )}
                      {post.publishedAt && (
                        <span className={isSimulated ? "text-amber-400" : "text-orion-green"}>
                          {isSimulated ? "Simulated" : "Published"}: {formatDate(post.publishedAt, orgTimezone)}
                        </span>
                      )}
                      {post.platformPostId && !isSimulated && (
                        <span className="font-mono">ID: {post.platformPostId}</span>
                      )}
                      {post.retryCount > 0 && (
                        <span className="text-yellow-400">Retries: {post.retryCount}</span>
                      )}
                    </div>

                    {/* Preflight warnings */}
                    {post.preflightStatus === "warning" && post.preflightErrors && post.preflightErrors.length > 0 && (
                      <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1">
                        <p className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                          Preflight warnings
                          <TooltipHelp text="Automated checks for character limits, brand safety, and link validity." side="right" />
                          :
                        </p>
                        {post.preflightErrors.map((issue, i) => (
                          <p key={i} className="text-[11px] text-amber-400/80">{issue.message}</p>
                        ))}
                      </div>
                    )}

                    {/* Preflight failure details */}
                    {post.status === "preflight_failed" && post.preflightErrors && post.preflightErrors.length > 0 && (
                      <div className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                        <p className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                          Preflight check failed
                          <TooltipHelp text="Automated checks for character limits, brand safety, and link validity." side="right" />
                          :
                        </p>
                        {post.preflightErrors.map((issue, i) => (
                          <p key={i} className="text-[11px] text-amber-400/80">• {issue.message}</p>
                        ))}
                      </div>
                    )}

                    {post.errorMessage && post.status !== "preflight_failed" && (
                      <p className="mt-1 text-xs text-red-400">{post.errorMessage}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {isManual ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleCopyContent(post.id, post.asset?.contentText ?? "")}
                        disabled={!post.asset?.contentText}
                      >
                        {copiedPostId === post.id ? (
                          <Check className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedPostId === post.id ? "Copied!" : "Copy Content"}
                      </Button>
                    ) : (
                      <>
                        {(post.status === "scheduled" || post.status === "failed") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handlePublish(post.id)}
                            disabled={publishing === post.id}
                          >
                            {publishing === post.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Publish Now
                          </Button>
                        )}

                        {/* Publish Anyway — for non-critical preflight failures */}
                        {post.status === "preflight_failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            onClick={() => handlePublish(post.id, true)}
                            disabled={publishing === post.id}
                            title="Publish despite preflight warnings"
                          >
                            {publishing === post.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Publish Anyway
                          </Button>
                        )}

                        {(post.status === "scheduled" || post.status === "preflight_failed") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleCancel(post.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={(v) => { if (!v) setRescheduleOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule {selectedPosts.size} Post{selectedPosts.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>New scheduled time</Label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={rescheduleDate}
                onChange={e => setRescheduleDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={bulkUpdating || !rescheduleDate}
                onClick={handleBulkReschedule}
                className="gap-1.5"
              >
                {bulkUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Reschedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedPosts.size}
        noun="post"
        onClear={() => setSelectedPosts(new Set())}
        actions={[
          {
            label: `Cancel Selected (${selectedPosts.size})`,
            variant: "destructive",
            icon: <XCircle className="h-3 w-3" />,
            disabled: bulkUpdating,
            onClick: handleBulkCancel,
          },
          {
            label: "Reschedule Selected",
            variant: "outline",
            icon: <CalendarClock className="h-3 w-3" />,
            disabled: bulkUpdating,
            onClick: () => setRescheduleOpen(true),
          },
        ]}
      />
    </div>
  );
}
