"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Zap,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  MousePointer,
  Target,
  Send,
  FileText,
  BarChart3,
  Pencil,
  Check,
  X,
  Clock,
  Image as ImageIcon,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, createAgentStream } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeCampaigns: number;
  pendingReview: number;
  publishedThisWeek: number;
  totalGoals: number;
  recentGoals: Array<{
    id: string;
    brandName: string;
    type: string;
    createdAt: Date | string;
    pipelineStage: number | null;
    campaignId: string | null;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: Date | string;
    read: boolean;
  }>;
}

interface ScheduledPost {
  id: string;
  channel: string;
  scheduledFor: string;
  status: string;
  preflightStatus: string | null;
  asset: {
    id: string;
    channel: string;
    contentText: string;
    compositedImageUrl: string | null;
  } | null;
}

interface MetricTotals {
  impressions: number;
  clicks: number;
  conversions: number;
}

interface CommandCenterProps {
  brandName: string;
  stats: DashboardStats;
  scheduledPosts: ScheduledPost[];
  currentMetrics: MetricTotals;
  previousMetrics: MetricTotals;
  lastGoalDate?: Date | string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_EMOJI: Record<string, string> = {
  linkedin: "\uD83D\uDCBC",
  twitter: "\uD83D\uDC26",
  instagram: "\uD83D\uDCF8",
  facebook: "\uD83D\uDCD8",
  tiktok: "\uD83C\uDFB5",
  email: "\uD83D\uDCE7",
  sms: "\uD83D\uDCAC",
  blog: "\u270D\uFE0F",
  website: "\uD83C\uDF10",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Goal inference for Quick Campaign ────────────────────────────────────────

const GOAL_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: "leads", keywords: ["lead", "leads", "customers", "sign up", "signup", "subscribe", "subscribers", "capture", "funnel", "pipeline"] },
  { type: "conversions", keywords: ["convert", "conversion", "buy", "purchase", "checkout", "sale", "sales", "revenue", "roi"] },
  { type: "traffic", keywords: ["traffic", "website", "visits", "visitors", "blog", "seo", "search", "organic"] },
  { type: "social", keywords: ["followers", "following", "engagement", "community", "social", "grow audience", "likes"] },
  { type: "product", keywords: ["product", "launch", "release", "feature", "announce", "new product"] },
  { type: "event", keywords: ["event", "conference", "webinar", "workshop", "meetup", "seminar"] },
  { type: "awareness", keywords: ["awareness", "brand", "visibility", "exposure", "reach", "presence", "know about", "word out"] },
];

const QUICK_CHANNELS: Record<string, string[]> = {
  leads: ["linkedin", "email"],
  awareness: ["instagram", "facebook", "twitter"],
  event: ["linkedin", "instagram", "email"],
  product: ["instagram", "facebook", "linkedin"],
  traffic: ["twitter", "blog", "facebook"],
  social: ["instagram", "tiktok", "twitter"],
  conversions: ["email", "linkedin", "facebook"],
};

function inferGoalType(text: string): string {
  const lower = text.toLowerCase();
  let bestType = "awareness";
  let bestScore = 0;
  for (const { type, keywords } of GOAL_KEYWORDS) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(): Date[] {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, ...
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day === 0 ? 7 : day) - 1));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Channel metadata ──────────────────────────────────────────────────────────

const QUICK_POST_CHANNELS = [
  { value: "linkedin",  label: "LinkedIn",  emoji: "💼" },
  { value: "twitter",   label: "X / Twitter", emoji: "🐦" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "facebook",  label: "Facebook",  emoji: "📘" },
  { value: "tiktok",    label: "TikTok",    emoji: "🎵" },
  { value: "email",     label: "Email",     emoji: "📧" },
  { value: "sms",       label: "SMS",       emoji: "💬" },
  { value: "blog",      label: "Blog",      emoji: "✍️" },
];

const QUICK_POST_SUGGESTIONS: Record<string, string[]> = {
  linkedin:  ["Announce a company milestone", "Share a leadership insight", "Promote a job opening"],
  twitter:   ["Hot take on industry news", "Behind-the-scenes moment", "Quick product tip"],
  instagram: ["Product showcase", "Team spotlight", "Customer success story"],
  facebook:  ["Community update", "Event promotion", "Weekly tip"],
  tiktok:    ["30-second product demo", "Day in the life", "Quick how-to"],
  email:     ["Monthly newsletter", "Product launch announcement", "Special offer"],
  sms:       ["Flash sale alert", "Appointment reminder", "Exclusive subscriber offer"],
  blog:      ["How-to guide", "Industry trends roundup", "Case study"],
};

// ── Quick Post result type ─────────────────────────────────────────────────────

interface QuickPostResult {
  assetId: string;
  campaignId: string;
  content: string;
  imageUrl?: string;
}

// ── Quick Post panel ─────────────────────────────────────────────────────────

function QuickPostPanel({ brandName }: { brandName: string }) {
  const router = useRouter();
  const toast = useAppToast();

  const [channel, setChannel] = useState("linkedin");
  const [topic, setTopic] = useState("");
  const [useDraft, setUseDraft] = useState(false);
  const [draft, setDraft] = useState("");

  const [streaming, setStreaming] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<QuickPostResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  function handleGenerate() {
    const topicValue = topic.trim();
    if (!topicValue) return;

    setResult(null);
    setEditMode(false);
    setStatusMsg("Starting…");
    setStreaming(true);

    let accContent = "";
    let doneData: QuickPostResult | null = null;

    const stop = createAgentStream(
      "/assets/quick-post",
      {
        channel,
        topic: topicValue,
        contentDraft: useDraft && draft.trim() ? draft.trim() : undefined,
      },
      {
        onChunk: (text) => {
          accContent += text;
          setEditText(accContent);
        },
        onEvent: (event, data: any) => {
          if (event === "status") setStatusMsg(data.message ?? "");
          if (event === "done") {
            doneData = {
              assetId: data.assetId,
              campaignId: data.campaignId,
              content: data.content ?? accContent,
              imageUrl: data.imageUrl,
            };
          }
        },
        onDone: () => {
          setStreaming(false);
          setStatusMsg("");
          if (doneData) {
            setResult(doneData);
            setEditText(doneData.content);
          }
        },
        onError: (msg) => {
          toast.error(msg ?? "Generation failed");
          setStreaming(false);
          setStatusMsg("");
        },
      },
    );
    stopRef.current = stop;
  }

  async function handleSaveEdit() {
    if (!result) return;
    setSavingEdit(true);
    try {
      await api.patch(`/assets/${result.assetId}`, { contentText: editText });
      setResult((prev) => prev ? { ...prev, content: editText } : prev);
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSchedule() {
    if (!result) return;
    setScheduling(true);
    try {
      // Schedule for next available slot (1 day from now at 9am)
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + 1);
      scheduledFor.setHours(9, 0, 0, 0);

      await api.post(`/scheduled-posts`, {
        assetId: result.assetId,
        channel,
        scheduledFor: scheduledFor.toISOString(),
      });
      toast.success("Post scheduled for tomorrow at 9am!");
      router.push("/dashboard/distribute");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  function handleReset() {
    setResult(null);
    setEditMode(false);
    setEditText("");
    setStatusMsg("");
  }

  const suggestions = QUICK_POST_SUGGESTIONS[channel] ?? [];

  return (
    <div className="space-y-4">
      {/* Channel selector */}
      {!result && (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {QUICK_POST_CHANNELS.map((ch) => (
              <button
                key={ch.value}
                type="button"
                disabled={streaming}
                onClick={() => setChannel(ch.value)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                  channel === ch.value
                    ? "border-orion-green bg-orion-green/10 text-orion-green"
                    : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent"
                }`}
              >
                <span className="text-base">{ch.emoji}</span>
                <span className="truncate text-[9px]">{ch.label}</span>
              </button>
            ))}
          </div>

          {/* Input mode toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseDraft(false)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                !useDraft
                  ? "border-orion-green/40 bg-orion-green/10 text-orion-green"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              Topic / idea
            </button>
            <button
              type="button"
              onClick={() => setUseDraft(true)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                useDraft
                  ? "border-orion-green/40 bg-orion-green/10 text-orion-green"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              Paste a draft
            </button>
          </div>

          {/* Topic input */}
          <div className="space-y-2">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && topic.trim() && !streaming) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder={`What's this post about? e.g. "${suggestions[0] ?? "Share an insight"}"`}
              disabled={streaming}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-orion-green/50 focus:outline-none focus:ring-1 focus:ring-orion-green/30 disabled:opacity-50"
            />
            {useDraft && (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your draft here — STELOS will refine and adapt it for the channel…"
                disabled={streaming}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-orion-green/50 focus:outline-none focus:ring-1 focus:ring-orion-green/30 disabled:opacity-50 resize-none"
              />
            )}
          </div>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={streaming}
                onClick={() => setTopic(s)}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-orion-green/30 hover:text-foreground transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={streaming || !topic.trim()}
            className="w-full bg-orion-green text-black hover:bg-orion-green-dim gap-2"
          >
            {streaming ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {statusMsg || "Generating…"}</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generate Post</>
            )}
          </Button>
        </>
      )}

      {/* Streaming preview */}
      {streaming && editText && (
        <div className="rounded-lg border border-orion-green/20 bg-muted/40 p-3">
          <p className="text-xs text-orion-green mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 animate-pulse" />
            {statusMsg || "Writing…"}
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
            {editText}
            <span className="inline-block h-3 w-0.5 animate-pulse bg-orion-green align-middle" />
          </pre>
        </div>
      )}

      {/* Result panel */}
      {result && !streaming && (
        <div className="space-y-3">
          {/* Image preview */}
          {result.imageUrl && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img
                src={result.imageUrl}
                alt="Generated visual"
                className="w-full object-cover max-h-48"
              />
            </div>
          )}

          {/* Content preview / edit */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {QUICK_POST_CHANNELS.find((c) => c.value === channel)?.emoji}{" "}
                {QUICK_POST_CHANNELS.find((c) => c.value === channel)?.label}
              </p>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="flex items-center gap-1 text-xs text-orion-green hover:text-orion-green/80 transition-colors"
                  >
                    {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditText(result.content); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              )}
            </div>

            {editMode ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                rows={5}
                className="w-full rounded-lg border border-border bg-background p-2.5 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-orion-green/40"
              />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {result.content}
              </pre>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleSchedule}
              disabled={scheduling || editMode}
            >
              {scheduling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              Schedule
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-orion-green text-black hover:bg-orion-green-dim"
              disabled={editMode}
              onClick={() => router.push(`/dashboard/distribute`)}
            >
              <Send className="h-3.5 w-3.5" />
              Distribute
            </Button>
            <button
              onClick={handleReset}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              New post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick Campaign Hero ──────────────────────────────────────────────────────

function QuickCampaignHero({ brandName }: { brandName: string }) {
  const router = useRouter();
  const toast = useAppToast();
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);
  const [mode, setMode] = useState<"campaign" | "quick-post">("campaign");

  async function handleLaunch() {
    const text = prompt.trim();
    if (!text || !brandName) return;

    setLaunching(true);
    const goalType = inferGoalType(text);
    const channels =
      QUICK_CHANNELS[goalType] ?? ["instagram", "facebook", "twitter"];

    try {
      const res = await api.post<{ data: { id: string } }>("/goals", {
        type: goalType,
        brandName,
        brandDescription: text,
        timeline: "1_month",
        channels,
        abTesting: false,
      });
      router.push(`/dashboard/campaigns/war-room?goalId=${res.data.id}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to launch campaign",
      );
      setLaunching(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-orion-green/20 bg-gradient-to-br from-orion-green/5 via-transparent to-orion-blue/5 p-6">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orion-green/5 blur-3xl" />
      <div className="relative space-y-4">
        {/* Tab toggle */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode("campaign")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "campaign"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Campaign
            </button>
            <button
              type="button"
              onClick={() => setMode("quick-post")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "quick-post"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Quick Post
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "campaign"
              ? "Full strategy + multi-channel pipeline"
              : "One post, one channel, instant"}
          </p>
        </div>

        {/* Campaign mode */}
        {mode === "campaign" && (
          <>
            <div className="flex gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
                    e.preventDefault();
                    handleLaunch();
                  }
                }}
                placeholder='e.g. "Get more customers for my bakery this month"'
                disabled={launching}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-orion-green/50 focus:outline-none focus:ring-1 focus:ring-orion-green/30 disabled:opacity-50"
              />
              <Button
                onClick={handleLaunch}
                disabled={launching || !prompt.trim()}
                className="bg-orion-green text-black hover:bg-orion-green-dim gap-2 px-5"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {launching ? "Launching..." : "Launch"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Get more leads from LinkedIn",
                "Grow my Instagram following",
                "Promote our upcoming webinar",
                "Drive traffic to our new blog",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPrompt(suggestion)}
                  disabled={launching}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground hover:border-orion-green/30 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Quick Post mode */}
        {mode === "quick-post" && <QuickPostPanel brandName={brandName} />}
      </div>
    </div>
  );
}

// ── Today's Posts ─────────────────────────────────────────────────────────────

function TodaysPosts({ posts }: { posts: ScheduledPost[] }) {
  const router = useRouter();
  const today = new Date();

  const todaysPosts = posts.filter((p) => {
    const postDate = new Date(p.scheduledFor);
    return isSameDay(postDate, today) && p.status === "scheduled";
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Send className="h-4 w-4 text-orion-green" />
        Today&apos;s Posts
        {todaysPosts.length > 0 && (
          <span className="ml-auto rounded-full bg-orion-green/10 px-2 py-0.5 text-xs text-orion-green">
            {todaysPosts.length}
          </span>
        )}
      </h3>

      {todaysPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Calendar className="mb-2 h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nothing scheduled for today.
          </p>
          <button
            onClick={() => router.push("/dashboard/distribute")}
            className="mt-2 text-xs text-orion-green hover:underline"
          >
            Create Quick Post
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {todaysPosts.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5"
            >
              <span className="text-lg shrink-0">
                {CHANNEL_EMOJI[post.channel] ?? "\uD83D\uDCDD"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {post.asset?.contentText?.slice(0, 60) ?? "Untitled post"}
                  {(post.asset?.contentText?.length ?? 0) > 60 ? "..." : ""}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatTime(post.scheduledFor)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {post.preflightStatus === "passed" ? (
                  <CheckCircle2 className="h-4 w-4 text-orion-green" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                )}
                <button
                  onClick={() => router.push("/dashboard/distribute")}
                  className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 hover:border-muted-foreground/50 transition-colors"
                >
                  Reschedule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── This Week Strip ──────────────────────────────────────────────────────────

function WeekStrip({ posts }: { posts: ScheduledPost[] }) {
  const router = useRouter();
  const weekDays = getWeekDays();
  const today = new Date();

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-orion-green" />
        This Week
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayPosts = posts.filter((p) => {
            const postDate = new Date(p.scheduledFor);
            return (
              isSameDay(postDate, day) &&
              (p.status === "scheduled" || p.status === "published")
            );
          });
          const isEmpty = dayPosts.length === 0;
          const dateStr = day.toISOString().split("T")[0];

          return (
            <button
              key={i}
              onClick={() =>
                router.push(`/dashboard/calendar?date=${dateStr}`)
              }
              className={`flex shrink-0 flex-col items-center rounded-lg p-2 transition-colors hover:bg-accent/50 flex-1 min-w-[44px] ${
                isToday ? "bg-orion-green/10 ring-1 ring-orion-green/30" : ""
              } ${isEmpty && !isToday ? "ring-1 ring-red-500/20" : ""}`}
            >
              <span
                className={`text-[10px] font-medium ${
                  isToday ? "text-orion-green" : "text-muted-foreground"
                }`}
              >
                {DAY_NAMES[i]}
              </span>
              <span
                className={`text-sm font-bold ${isToday ? "text-orion-green" : ""}`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 flex gap-0.5">
                {dayPosts.length > 0 ? (
                  dayPosts
                    .slice(0, 4)
                    .map((_, j) => (
                      <span
                        key={j}
                        className="h-1.5 w-1.5 rounded-full bg-orion-green"
                      />
                    ))
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                )}
              </div>
              {dayPosts.length > 4 && (
                <span className="text-[8px] text-muted-foreground">
                  +{dayPosts.length - 4}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Recommended Actions ──────────────────────────────────────────────────────

// ── Recommendation types ─────────────────────────────────────────────────────

interface ApiRecommendation {
  id: string;
  type: "content_gap" | "performance_drop" | "stale_campaign" | "top_performer" | "audience_growth";
  title: string;
  description: string;
  actionType: "create_campaign" | "repurpose" | "adjust_schedule" | "review_content";
  actionPayload: Record<string, unknown>;
  priority: number;
  status: string;
  expiresAt: string;
}

const ACTION_LABELS: Record<string, { label: string; href: (payload: Record<string, unknown>) => string }> = {
  create_campaign: {
    label: "Launch Campaign",
    href: (p) => {
      const params = new URLSearchParams({ newGoal: "1" });
      if (p.goalType) params.set("type", String(p.goalType));
      return `/dashboard/goals?${params.toString()}`;
    },
  },
  repurpose: {
    label: "Repurpose Content",
    href: (p) => p.campaignId ? `/dashboard/campaigns/${p.campaignId}/summary` : "/dashboard/content",
  },
  adjust_schedule: {
    label: "Open Calendar",
    href: () => "/dashboard/calendar",
  },
  review_content: {
    label: "Review Content",
    href: () => "/dashboard/review",
  },
};

const TYPE_COLORS: Record<string, string> = {
  content_gap: "text-yellow-400",
  performance_drop: "text-red-400",
  stale_campaign: "text-orange-400",
  top_performer: "text-green-400",
  audience_growth: "text-blue-400",
};

function RecommendedActions() {
  const router = useRouter();
  const toast = useAppToast();
  const [recs, setRecs] = useState<ApiRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecs = useCallback(async () => {
    try {
      const res = await api.get<{ data: ApiRecommendation[] }>("/recommendations");
      setRecs(res.data ?? []);
    } catch {
      // Silently fail — recommendations are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  async function handleDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await api.patch(`/recommendations/${id}`, { status: "dismissed" });
      setRecs((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error("Failed to dismiss");
    }
  }

  function handleAction(rec: ApiRecommendation) {
    // Mark as acted (fire-and-forget)
    api.patch(`/recommendations/${rec.id}`, { status: "acted" }).catch(() => {});

    const config = ACTION_LABELS[rec.actionType];
    if (config) {
      router.push(config.href(rec.actionPayload));
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orion-green" />
          Recommended Actions
        </h3>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-orion-green" />
        Recommended Actions
      </h3>
      <div className="space-y-2">
        {recs.slice(0, 5).map((rec) => {
          const config = ACTION_LABELS[rec.actionType];
          return (
            <div
              key={rec.id}
              className="group flex w-full items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <ArrowRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TYPE_COLORS[rec.type] ?? "text-orion-green"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rec.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleAction(rec)}
                  className="rounded-md bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green hover:bg-orion-green/20 transition-colors"
                >
                  {config?.label ?? "View"}
                </button>
                <button
                  onClick={(e) => handleDismiss(e, rec.id)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Performance Pulse ────────────────────────────────────────────────────────

interface BudgetSummary {
  monthlyBudget: number | null;
  totalSpendThisMonth: number;
  budgetUtilizationPct: number | null;
}

function PerformancePulse({
  current,
  previous,
}: {
  current: MetricTotals;
  previous: MetricTotals;
}) {
  const [budget, setBudget] = useState<BudgetSummary | null>(null);

  useEffect(() => {
    api.get<{ data: BudgetSummary }>("/analytics/budget")
      .then((res) => setBudget(res.data))
      .catch(() => {});
  }, []);

  const hasData =
    current.impressions > 0 || current.clicks > 0 || current.conversions > 0;

  const utilPct = budget?.budgetUtilizationPct ?? null;
  const barColor = utilPct == null ? "bg-primary"
    : utilPct < 80 ? "bg-green-500"
    : utilPct <= 100 ? "bg-yellow-500"
    : "bg-red-500";

  const budgetSection = budget?.monthlyBudget != null ? (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Wallet className="h-3 w-3" />
          Budget this month
        </span>
        <span className={`text-[11px] font-semibold tabular-nums ${
          utilPct != null && utilPct > 100 ? "text-red-400"
          : utilPct != null && utilPct >= 80 ? "text-yellow-400"
          : "text-muted-foreground"
        }`}>
          ${budget.totalSpendThisMonth.toLocaleString()} / ${budget.monthlyBudget.toLocaleString()}
          {utilPct != null && ` (${utilPct.toFixed(0)}%)`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, (budget.totalSpendThisMonth / budget.monthlyBudget) * 100)}%` }}
        />
      </div>
      {utilPct != null && utilPct > 100 && (
        <p className="mt-1 text-[10px] text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Over budget by ${(budget.totalSpendThisMonth - budget.monthlyBudget).toLocaleString()}
        </p>
      )}
    </div>
  ) : null;

  if (!hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orion-green" />
          Performance Pulse
        </h3>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <BarChart3 className="mb-2 h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Publish your first campaign to see performance metrics here.
          </p>
        </div>
        {budgetSection}
      </div>
    );
  }

  const metrics = [
    {
      label: "Impressions",
      value: current.impressions,
      change: computeChange(current.impressions, previous.impressions),
      icon: Eye,
    },
    {
      label: "Clicks",
      value: current.clicks,
      change: computeChange(current.clicks, previous.clicks),
      icon: MousePointer,
    },
    {
      label: "Conversions",
      value: current.conversions,
      change: computeChange(current.conversions, previous.conversions),
      icon: Target,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-orion-green" />
        Performance Pulse
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {metrics.map((m, idx) => (
          <div key={m.label} className={`text-center${idx === metrics.length - 1 && metrics.length % 2 !== 0 ? " col-span-2 sm:col-span-1" : ""}`}>
            <m.icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <p className="text-2xl font-bold tabular-nums">
              {m.value.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">{m.label}</p>
            <div
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                m.change > 0
                  ? "bg-green-500/10 text-green-400"
                  : m.change < 0
                    ? "bg-red-500/10 text-red-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {m.change > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : m.change < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {Math.abs(m.change)}%
            </div>
          </div>
        ))}
      </div>
      {budgetSection}
    </div>
  );
}

// ── Pending Approvals ────────────────────────────────────────────────────────

function PendingApprovals({ count }: { count: number }) {
  const router = useRouter();

  if (count === 0) return null;

  return (
    <button
      onClick={() => router.push("/dashboard/review")}
      className="flex w-full items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 transition-colors hover:bg-yellow-500/10"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
        <FileText className="h-5 w-5 text-yellow-400" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold">Pending Approvals</p>
        <p className="text-xs text-muted-foreground">
          Review {count} asset{count !== 1 ? "s" : ""} awaiting approval
        </p>
      </div>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-black">
        {count}
      </span>
    </button>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function CommandCenter({
  brandName,
  stats,
  scheduledPosts,
  currentMetrics,
  previousMetrics,
}: CommandCenterProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Your daily marketing operations at a glance.
        </p>
      </div>

      {/* Quick Campaign Hero */}
      {brandName && <QuickCampaignHero brandName={brandName} />}

      {/* Pending Approvals */}
      <PendingApprovals count={stats.pendingReview} />

      {/* Today's Posts + This Week */}
      <div className="grid gap-6 md:grid-cols-2">
        <TodaysPosts posts={scheduledPosts} />
        <WeekStrip posts={scheduledPosts} />
      </div>

      {/* Performance Pulse */}
      <PerformancePulse
        current={currentMetrics}
        previous={previousMetrics}
      />

      {/* Recommended Actions */}
      <RecommendedActions />
    </div>
  );
}
