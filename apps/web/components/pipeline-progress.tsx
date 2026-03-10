"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Palette,
  PenLine,
  ImageIcon,
  Layers,
  Calendar,
  CheckCircle,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StageId = "strategy" | "brand" | "copy" | "visuals" | "designing" | "campaign" | "ready";
type StageState = "waiting" | "active" | "complete" | "error";

interface StageConfig {
  id: StageId;
  name: string;
  description: string;
  Icon: React.ElementType;
}

interface StatusData {
  stages: Array<{ id: StageId; state: StageState }>;
  campaignId: string | null;
  campaignName: string | null;
  goalId: string;
  done: boolean;
  strategyText: string | null;
  channels: string[];
  channelCounts: Record<string, { copy: number; images: number; composites: number; total: number }>;
  assetPreviews: Array<{
    id: string;
    channel: string;
    variant: "a" | "b";
    imageUrl: string | null;
    compositedImageUrl: string | null;
    contentPreview: string;
  }>;
  org: {
    logoUrl?: string | null;
    brandPrimaryColor?: string | null;
    brandSecondaryColor?: string | null;
    inspirationImageUrl?: string | null;
  } | null;
}

// ── Stage configuration ───────────────────────────────────────────────────────

const STAGE_CONFIGS: StageConfig[] = [
  { id: "strategy",  name: "Building Strategy",   description: "Analyzing your goal and generating a full marketing strategy", Icon: Brain },
  { id: "brand",     name: "Reading Your Brand",   description: "Loading brand identity, design preferences, and color palette", Icon: Palette },
  { id: "copy",      name: "Writing Copy",          description: "Generating platform-native content for each channel (A + B variants)", Icon: PenLine },
  { id: "visuals",   name: "Generating Visuals",    description: "Creating AI-generated images for each channel", Icon: ImageIcon },
  { id: "designing", name: "Designing",             description: "Compositing visuals with copy and brand elements", Icon: Layers },
  { id: "campaign",  name: "Building Campaign",     description: "Organizing all content into a campaign ready for review", Icon: Calendar },
  { id: "ready",     name: "Ready for Review",      description: "Your campaign is complete and awaiting your approval", Icon: CheckCircle },
];

const CHANNEL_META: Record<string, { color: string; emoji: string; label: string }> = {
  linkedin:  { color: "#0077b5", emoji: "💼", label: "LinkedIn" },
  twitter:   { color: "#1da1f2", emoji: "🐦", label: "X/Twitter" },
  instagram: { color: "#e1306c", emoji: "📸", label: "Instagram" },
  facebook:  { color: "#1877f2", emoji: "📘", label: "Facebook" },
  tiktok:    { color: "#ff0050", emoji: "🎵", label: "TikTok" },
  email:     { color: "#10b981", emoji: "📧", label: "Email" },
  blog:      { color: "#f59e0b", emoji: "✍️", label: "Blog" },
};

// ── Stage node (left column) ──────────────────────────────────────────────────

function StageNode({
  config,
  state,
  isSelected,
  onClick,
}: {
  config: StageConfig;
  state: StageState;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { Icon } = config;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <div className="relative mt-0.5 shrink-0">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
            state === "complete"
              ? "border-orion-green bg-orion-green/10"
              : state === "active"
              ? "border-blue-500 bg-blue-500/10"
              : state === "error"
              ? "border-destructive bg-destructive/10"
              : "border-border bg-muted"
          }`}
        >
          {state === "complete" ? (
            <Check className="h-4 w-4 text-orion-green" />
          ) : state === "error" ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Icon
              className={`h-4 w-4 ${state === "active" ? "text-blue-500" : "text-muted-foreground"}`}
            />
          )}
        </div>
        {state === "active" && (
          <span className="absolute inset-0 rounded-full border-2 border-blue-500 animate-ping opacity-50" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium leading-tight ${
            state === "waiting" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {config.name}
        </p>
        {isSelected && (
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">
            {config.description}
          </p>
        )}
      </div>

      {state === "active" && (
        <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
      )}
    </button>
  );
}

// ── Right panel — per-stage content ──────────────────────────────────────────

function RightPanel({ stageId, status }: { stageId: StageId; status: StatusData | null }) {
  if (!status) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stageId === "strategy") {
    return (
      <div className="h-full overflow-y-auto p-6">
        <SectionLabel>Strategy Output</SectionLabel>
        {status.strategyText ? (
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {status.strategyText}
          </pre>
        ) : (
          <div className="mt-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">Strategist agent is analyzing your goal…</p>
          </div>
        )}
      </div>
    );
  }

  if (stageId === "brand") {
    const org = status.org;
    return (
      <div className="p-6 space-y-5">
        <SectionLabel>Brand Identity</SectionLabel>
        {org?.logoUrl || org?.inspirationImageUrl ? (
          <div className="grid grid-cols-2 gap-4">
            {org.logoUrl && (
              <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4">
                <img src={org.logoUrl} alt="Brand logo" className="max-h-20 max-w-full object-contain" />
              </div>
            )}
            {org.inspirationImageUrl && (
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={org.inspirationImageUrl}
                  alt="Inspiration"
                  className="h-full w-full max-h-32 object-cover"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            No logo or inspiration image configured.
          </div>
        )}

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Color palette</p>
          <div className="flex items-center gap-3">
            {[org?.brandPrimaryColor, org?.brandSecondaryColor].filter(Boolean).map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-full border border-border shadow"
                  style={{ backgroundColor: color! }}
                />
                <span className="font-mono text-xs text-muted-foreground">{color}</span>
              </div>
            ))}
            {!org?.brandPrimaryColor && (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#10b981] border border-border shadow" />
                <span className="font-mono text-xs text-muted-foreground">#10b981 (default)</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Brand configuration loaded. Design system ready for all channels.
        </p>
      </div>
    );
  }

  if (stageId === "copy") {
    return (
      <div className="p-6 space-y-4">
        <SectionLabel>Copy Generation (A/B Variants)</SectionLabel>
        {status.channels.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">Waiting for channel strategy…</p>
          </div>
        ) : (
          <div className="space-y-3">
            {status.channels.map((ch) => {
              const counts = status.channelCounts[ch];
              const meta = CHANNEL_META[ch] ?? { color: "#666", emoji: "📄", label: ch };
              const complete = (counts?.total ?? 0) > 0;
              const previews = status.assetPreviews.filter((p) => p.channel === ch);
              return (
                <div
                  key={ch}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    complete ? "border-orion-green/30 bg-orion-green/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: meta.color }}>{meta.emoji}</span>
                    <span className="text-sm font-medium">{meta.label}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {(["a", "b"] as const).map((v) => {
                        const p = previews.find((x) => x.variant === v);
                        return (
                          <span
                            key={v}
                            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-mono font-bold border ${
                              p ? "border-orion-green/40 bg-orion-green/10 text-orion-green" : "border-border text-muted-foreground/40"
                            }`}
                          >
                            {v.toUpperCase()}
                          </span>
                        );
                      })}
                      {complete ? (
                        <Check className="ml-1 h-3.5 w-3.5 text-orion-green" />
                      ) : (
                        <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-blue-500" />
                      )}
                    </div>
                  </div>
                  {previews.map((p) => (
                    <p key={p.id} className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      <span className="mr-1 font-mono text-[10px] text-muted-foreground/50">
                        [{p.variant.toUpperCase()}]
                      </span>
                      {p.contentPreview}…
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (stageId === "visuals") {
    return (
      <div className="p-6 space-y-4">
        <SectionLabel>Visual Generation</SectionLabel>
        {status.channels.length === 0 ? (
          <WaitingMessage text="Waiting for copy to complete…" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {status.channels.flatMap((ch) =>
              (["a", "b"] as const).map((variant) => {
                const preview = status.assetPreviews.find(
                  (p) => p.channel === ch && p.variant === variant,
                );
                const meta = CHANNEL_META[ch] ?? { color: "#666", emoji: "📄" };
                return (
                  <ImageTile
                    key={`${ch}-${variant}`}
                    src={preview?.imageUrl ?? null}
                    label={`${meta.emoji} ${variant.toUpperCase()}`}
                  />
                );
              }),
            )}
          </div>
        )}
      </div>
    );
  }

  if (stageId === "designing") {
    return (
      <div className="p-6 space-y-4">
        <SectionLabel>Compositing</SectionLabel>
        {status.channels.length === 0 ? (
          <WaitingMessage text="Waiting for visuals to complete…" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {status.channels.flatMap((ch) =>
              (["a", "b"] as const).map((variant) => {
                const preview = status.assetPreviews.find(
                  (p) => p.channel === ch && p.variant === variant,
                );
                const meta = CHANNEL_META[ch] ?? { color: "#666", emoji: "📄" };
                const src = preview?.compositedImageUrl ?? preview?.imageUrl ?? null;
                const isComposited = !!preview?.compositedImageUrl;
                return (
                  <ImageTile
                    key={`${ch}-${variant}`}
                    src={src}
                    label={`${meta.emoji} ${variant.toUpperCase()}`}
                    dimmed={!isComposited && !!preview?.imageUrl}
                    border={isComposited ? "orion-green" : undefined}
                  />
                );
              }),
            )}
          </div>
        )}
      </div>
    );
  }

  if (stageId === "campaign") {
    const now = new Date();
    return (
      <div className="p-6 space-y-4">
        <SectionLabel>Campaign Assembly</SectionLabel>
        {status.campaignName ? (
          <div className="rounded-lg border border-orion-green/30 bg-orion-green/5 p-4">
            <p className="font-semibold">{status.campaignName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.assetPreviews.length} assets · {status.channels.length} channels
            </p>
          </div>
        ) : (
          <WaitingMessage text="Building campaign structure…" />
        )}

        {/* Mini calendar */}
        <div className="rounded-lg border border-border overflow-hidden text-xs">
          <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>
              {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <span>{status.assetPreviews.length} posts</span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 p-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            <MiniCalendarDays status={status} />
          </div>
        </div>
      </div>
    );
  }

  if (stageId === "ready") {
    // Group previews by channel for the results summary
    const byChannel: Record<string, typeof status.assetPreviews> = {};
    for (const p of status.assetPreviews) {
      if (!byChannel[p.channel]) byChannel[p.channel] = [];
      byChannel[p.channel]!.push(p);
    }

    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center pb-4 border-b border-border">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-orion-green/30 bg-orion-green/10">
            <CheckCircle className="h-7 w-7 text-orion-green" />
          </div>
          <h2 className="text-xl font-bold">Campaign Ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.assetPreviews.length} assets across {status.channels.length} channel{status.channels.length !== 1 ? "s" : ""} generated and composited
          </p>
        </div>

        {/* Strategy summary */}
        {status.strategyText && (
          <div>
            <SectionLabel>Strategy Headline</SectionLabel>
            <p className="mt-2 text-sm text-foreground leading-relaxed line-clamp-3">
              {status.strategyText.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? ""}
            </p>
          </div>
        )}

        {/* Per-channel asset previews */}
        <div>
          <SectionLabel>Generated Assets by Channel</SectionLabel>
          <div className="mt-3 space-y-4">
            {Object.entries(byChannel).map(([ch, previews]) => {
              const meta = CHANNEL_META[ch] ?? { color: "#666", emoji: "📄", label: ch };
              return (
                <div key={ch} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                    <span style={{ color: meta.color }}>{meta.emoji}</span>
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {previews.length} variant{previews.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className={`grid gap-2 p-2 ${previews.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {previews.map((p) => (
                      <div key={p.id} className="space-y-1">
                        <ImageTile
                          src={p.compositedImageUrl ?? p.imageUrl ?? null}
                          label={`Variant ${p.variant.toUpperCase()}`}
                          border={p.compositedImageUrl ? "orion-green" : undefined}
                        />
                        <p className="text-[10px] text-muted-foreground line-clamp-2 px-1">
                          {p.contentPreview}…
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pb-4">
          {status.campaignId && (
            <>
              <p className="text-center text-xs text-muted-foreground">
                Redirecting to review in a moment…
              </p>
              <a href={`/dashboard/review/${status.campaignId}`} className="w-full">
                <Button className="w-full gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Review &amp; Approve Assets
                </Button>
              </a>
              <a href={`/dashboard/campaigns/${status.campaignId}/summary`} className="w-full">
                <Button variant="outline" className="w-full gap-2">
                  View Campaign Summary
                </Button>
              </a>
              <a href="/dashboard/calendar" className="w-full">
                <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  View in Calendar
                </Button>
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Small reusable sub-components ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function WaitingMessage({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function ImageTile({
  src,
  label,
  dimmed = false,
  border,
}: {
  src: string | null;
  label: string;
  dimmed?: boolean;
  border?: string;
}) {
  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden rounded-lg border transition-colors ${
        border === "orion-green" ? "border-orion-green/50" : "border-border"
      } bg-muted`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full object-cover transition-opacity ${dimmed ? "opacity-40" : "opacity-100"}`}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />
      )}
      {dimmed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/70" />
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
        {label}
      </div>
    </div>
  );
}

function MiniCalendarDays({ status }: { status: StatusData }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`e${i}`} />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today;
    const chIndex = (d - 1) % Math.max(status.channels.length, 1);
    const ch = status.channels[chIndex];
    const meta = ch ? (CHANNEL_META[ch] ?? null) : null;
    const showDot = status.assetPreviews.length > 0 && d >= today && d <= today + status.channels.length;

    cells.push(
      <div
        key={d}
        className={`relative rounded py-1 text-center text-[10px] ${
          isToday ? "bg-orion-green/20 font-bold text-orion-green" : "text-muted-foreground"
        }`}
      >
        {d}
        {showDot && meta && (
          <span
            className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        )}
      </div>,
    );
  }

  return <>{cells}</>;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PipelineProgress({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageId>("strategy");
  const [navigated, setNavigated] = useState(false);
  const doneRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (doneRef.current) return;
    try {
      const res = await api.get<{ data: StatusData }>(`/pipeline/status/${goalId}`);
      const data = res.data;
      setStatus(data);

      // Auto-select the currently active stage
      const activeStage = data.stages.find((s) => s.state === "active");
      if (activeStage) {
        setSelectedStage(activeStage.id);
      } else {
        const lastComplete = [...data.stages].reverse().find((s) => s.state === "complete");
        if (lastComplete) setSelectedStage(lastComplete.id);
      }

      // When pipeline completes: show "ready" stage then auto-redirect to review
      if (data.done && !navigated) {
        doneRef.current = true;
        setNavigated(true);
        setSelectedStage("ready");
      }
    } catch (err) {
      console.error("[pipeline] Status fetch failed:", err);
    }
  }, [goalId, navigated]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Auto-redirect to campaign review 4 seconds after pipeline completes
  useEffect(() => {
    if (!navigated || !status?.done || !status.campaignId) return;
    const timer = setTimeout(() => {
      router.push(`/dashboard/review/${status.campaignId}`);
    }, 4000);
    return () => clearTimeout(timer);
  }, [navigated, status?.done, status?.campaignId, router]);

  const stageStates = new Map(status?.stages.map((s) => [s.id, s.state]) ?? []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left column — stage list */}
      <div className="w-72 shrink-0 overflow-y-auto border-r border-border bg-orion-dark-2 px-2 py-4">
        <div className="mb-4 px-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Pipeline
          </p>
          <h2 className="mt-1 text-sm font-semibold">Running your campaign</h2>
          {!status && (
            <p className="mt-1 text-[11px] text-muted-foreground">Connecting…</p>
          )}
        </div>

        <div className="space-y-0.5">
          {STAGE_CONFIGS.map((config) => (
            <StageNode
              key={config.id}
              config={config}
              state={stageStates.get(config.id) ?? "waiting"}
              isSelected={selectedStage === config.id}
              onClick={() => setSelectedStage(config.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel — contextual content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <RightPanel stageId={selectedStage} status={status} />
      </div>
    </div>
  );
}
