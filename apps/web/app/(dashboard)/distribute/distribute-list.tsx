"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
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
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  published: "bg-orion-green/10 text-orion-green border-orion-green/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-muted/50 text-muted-foreground/50 border-border/50",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  scheduled: <Clock className="h-3.5 w-3.5" />,
  queued: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
  published: <CheckCircle2 className="h-3.5 w-3.5" />,
  failed: <XCircle className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  blog: <FileText className="h-4 w-4" />,
  tiktok: <Zap className="h-4 w-4" />,
};

const CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"] as const;

interface ScheduledPost {
  id: string;
  channel: string;
  status: string;
  scheduledFor: string;
  publishedAt?: string;
  platformPostId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
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
  initialConnections: Connection[];
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DistributeList({ initialPosts, initialConnections }: DistributeListProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [connections] = useState(initialConnections);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [form, setForm] = useState({
    channel: "linkedin" as (typeof CHANNELS)[number],
    contentText: "",
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  const connectedChannels = new Set(connections.map((c) => c.channel));

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.post<{ data: ScheduledPost }>("/distribute", {
        ...form,
        scheduledFor: new Date(form.scheduledFor).toISOString(),
      });
      setPosts([res.data, ...posts]);
      setOpen(false);
      setForm({
        channel: "linkedin",
        contentText: "",
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
      });
    } catch (err: any) {
      alert(err.message ?? "Failed to schedule post");
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(postId: string) {
    setPublishing(postId);
    try {
      const res = await api.post<{
        data: { postId: string; platformPostId: string; publishedAt: string };
      }>(`/distribute/${postId}/publish`, {});
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, status: "published", platformPostId: res.data.platformPostId, publishedAt: res.data.publishedAt }
            : p,
        ),
      );
    } catch (err: any) {
      alert(err.message ?? "Failed to publish post");
    } finally {
      setPublishing(null);
    }
  }

  async function handleCancel(postId: string) {
    try {
      await api.delete(`/distribute/${postId}`);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "cancelled" } : p)));
    } catch (err: any) {
      alert(err.message ?? "Failed to cancel post");
    }
  }

  const filtered =
    statusFilter === "all" ? posts : posts.filter((p) => p.status === statusFilter);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
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
                            {ch}
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

      {/* Connected channels */}
      {connections.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">Connected:</span>
          {connections.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded border border-orion-green/20 bg-orion-green/10 px-2 py-0.5 text-xs capitalize text-orion-green"
            >
              {CHANNEL_ICONS[c.channel]}
              {c.channel}
              {c.accountName && <span className="text-muted-foreground">({c.accountName})</span>}
            </span>
          ))}
        </div>
      )}

      {/* Posts list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <Send className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No posts yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule your first post to start distributing content.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((post) => (
            <div
              key={post.id}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80"
            >
              <div className="flex items-start gap-3">
                {/* Channel icon */}
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  {CHANNEL_ICONS[post.channel] ?? <Send className="h-4 w-4" />}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{post.channel}</span>
                    <Badge
                      variant="outline"
                      className={`flex items-center gap-1 text-xs ${STATUS_COLORS[post.status] ?? ""}`}
                    >
                      {STATUS_ICONS[post.status]}
                      {post.status}
                    </Badge>
                  </div>

                  {post.asset?.contentText && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {post.asset.contentText}
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Scheduled: {formatDate(post.scheduledFor)}</span>
                    {post.publishedAt && (
                      <span className="text-orion-green">
                        Published: {formatDate(post.publishedAt)}
                      </span>
                    )}
                    {post.platformPostId && (
                      <span className="font-mono">ID: {post.platformPostId}</span>
                    )}
                    {post.retryCount > 0 && (
                      <span className="text-yellow-400">Retries: {post.retryCount}</span>
                    )}
                  </div>

                  {post.errorMessage && (
                    <p className="mt-1 text-xs text-red-400">{post.errorMessage}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
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
                  {post.status === "scheduled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleCancel(post.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
