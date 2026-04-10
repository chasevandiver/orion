"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip-help";
import { FirstRunTip } from "@/components/ui/first-run-tip";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Zap,
  Trophy,
  AlertTriangle,
  RefreshCw,
  X as XIcon,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PipelineStatus {
  stage: number;
  status?: string;
  stagesTotal?: number;
  stagesComplete: string[];
  goalId?: string;
  campaign?: { id: string; name: string; status: string } | null;
  assetCount?: number;
  scheduledCount?: number;
  pipelineError?: string | null;
  pipelineErrorAt?: string | null;
  pipelineStage?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<number, string> = {
  1: "Research complete",
  2: "Strategy & SEO done",
  3: "Content generated",
  4: "Images composited",
  5: "Pipeline complete",
};

// Active message shown below the progress ring while each stage runs
const STAGE_ACTIVE_MESSAGES: Record<number, string> = {
  0: "Initializing pipeline…",
  1: "Research agents scanning market trends and competitors…",
  2: "Marketing Strategist building your 30-day plan…",
  3: "Content Creator writing channel-specific copy…",
  4: "Image Generator compositing campaign visuals…",
  5: "Scheduler optimizing publishing times…",
};

const STAGE_FRIENDLY_NAMES: Record<string, string> = {
  strategy: "Strategy Generation",
  content: "Content Creation",
  images: "Image Generation",
  scheduling: "Post Scheduling",
};

// SSE fallback: if no event is received within this window, switch to polling
const SSE_CONNECT_TIMEOUT_MS = 5000;
// Delay before a single reconnect attempt after an unexpected SSE drop
const SSE_RECONNECT_DELAY_MS = 1500;

// ── Utilities ─────────────────────────────────────────────────────────────────

function sanitizeErrorMessage(msg: string): string {
  if (!msg) return "An unexpected error occurred.";
  if (msg.includes("ANTHROPIC_API_KEY") || msg.includes("anthropic"))
    return "AI service not configured. Please check your API key in environment settings.";
  if (msg.includes("OPENAI_API_KEY") || msg.includes("openai"))
    return "AI image service not configured. Please check your API key in environment settings.";
  if (/rate.?limit|429|quota exceeded/i.test(msg))
    return "AI service rate limit reached. Please wait a moment and retry.";
  if (/plan.?limit|monthly.?limit/i.test(msg))
    return "Monthly plan limit reached. Please upgrade your plan to continue.";
  if (/database|ECONNREFUSED|connection refused/i.test(msg))
    return "Database connection error. Please retry.";
  if (/\n\s+at /.test(msg)) return "An internal error occurred. Please retry or contact support.";
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Agent definitions ─────────────────────────────────────────────────────────

interface AgentDef {
  name: string;
  description: string;
  stage: number; // active when pipelineStage === this; complete when pipelineStage > this
}

const AGENTS: AgentDef[] = [
  { name: "CompetitorIntelligenceAgent", description: "Analyzing competitors", stage: 1 },
  { name: "TrendResearchAgent",          description: "Researching trends",    stage: 1 },
  { name: "MarketingStrategistAgent",    description: "Building strategy",     stage: 2 },
  { name: "SEOAgent",                    description: "Optimizing for search", stage: 2 },
  { name: "ContentCreatorAgent",         description: "Writing copy",          stage: 3 },
  { name: "ImageGeneratorAgent",         description: "Selecting visuals",     stage: 3 },
  { name: "CompositorAgent",             description: "Designing images",      stage: 4 },
  { name: "LandingPageAgent",            description: "Building landing page", stage: 4 },
  { name: "SchedulerAgent",              description: "Optimizing send times", stage: 5 },
  { name: "AnalyticsAgent",              description: "Setting up tracking",   stage: 5 },
];

const AGENT_TOOLTIPS: Record<string, string> = {
  CompetitorIntelligenceAgent: "Scans competitor content to find positioning gaps.",
  TrendResearchAgent:          "Identifies trending topics relevant to your audience.",
  MarketingStrategistAgent:    "Builds your 30-day posting plan and messaging framework.",
  SEOAgent:                    "Finds keywords to boost organic reach for each post.",
  ContentCreatorAgent:         "Writes channel-specific copy tailored to your brand voice.",
  ImageGeneratorAgent:         "Selects and generates visuals for each post.",
  CompositorAgent:             "Overlays your logo, colors, and headline on images.",
  LandingPageAgent:            "Builds a conversion-optimized landing page for the campaign.",
  SchedulerAgent:              "Picks the best times to post for maximum engagement.",
  AnalyticsAgent:              "Sets up tracking so you can measure campaign results.",
};

type AgentStatus = "waiting" | "running" | "complete" | "failed";

function getAgentStatus(
  agent: AgentDef,
  pipelineStage: number,
  pipelineStatus: string,
  isDone: boolean,
): AgentStatus {
  if (isDone) return "complete";
  if (pipelineStatus === "failed" && pipelineStage < agent.stage) return "failed";
  if (pipelineStage > agent.stage) return "complete";
  if (pipelineStage === agent.stage || pipelineStage === agent.stage - 1) return "running";
  return "waiting";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GemProgress({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  // Fill rises from bottom tip (y=95) to top tip (y=-95) — total 190 SVG units
  const fillHeight = (pct / 100) * 200;
  const fillY = 95 - fillHeight;
  // Rings speed up as progress increases: 5.5s→1.2s (ring1), 8s→2s (ring2)
  const ring1Dur = (5.5 - (pct / 100) * 4.3).toFixed(2) + "s";
  const ring2Dur = (8 - (pct / 100) * 6).toFixed(2) + "s";
  const isDone = pct >= 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="120" height="165" viewBox="-80 -110 160 220" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="gp_amb" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#6d28d9" stopOpacity="0.45"/>
            <stop offset="60%"  stopColor="#4c1d95" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="#03010a" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="gp_top" cx="42%" cy="0%" r="100%">
            <stop offset="0%"   stopColor="#ffffff"/>
            <stop offset="35%"  stopColor="#ede9fe"/>
            <stop offset="75%"  stopColor="#c4b5fd"/>
            <stop offset="100%" stopColor="#8b5cf6"/>
          </radialGradient>
          <radialGradient id="gp_glint" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"/>
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="gp_r1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#8b5cf6" stopOpacity="0"/>
            <stop offset="22%"  stopColor="#8b5cf6" stopOpacity="0.92"/>
            <stop offset="50%"  stopColor="#a78bfa" stopOpacity="1"/>
            <stop offset="78%"  stopColor="#8b5cf6" stopOpacity="0.92"/>
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="gp_r2" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%"   stopColor="#4338ca" stopOpacity="0"/>
            <stop offset="22%"  stopColor="#4338ca" stopOpacity="0.85"/>
            <stop offset="50%"  stopColor="#6366f1" stopOpacity="0.95"/>
            <stop offset="78%"  stopColor="#4338ca" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#4338ca" stopOpacity="0"/>
          </linearGradient>
          {/* Liquid fill clip — rises from bottom tip upward */}
          <clipPath id="gp_fill">
            <rect x="-80" y={fillY} width="160" height={fillHeight + 20} style={{ transition: "y 0.6s ease, height 0.6s ease" }}/>
          </clipPath>
          <clipPath id="gp_back"><rect x="-80" y="-110" width="160" height="110"/></clipPath>
          <clipPath id="gp_front"><rect x="-80" y="0" width="160" height="110"/></clipPath>
          <filter id="gp_gemGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="gp_ringGlow" x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="gp_nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {isDone && (
            <filter id="gp_doneGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          )}
        </defs>

        {/* Ambient glow — intensifies with progress */}
        <ellipse cx="0" cy="0" rx="72" ry="72" fill="url(#gp_amb)" opacity={0.3 + pct / 100 * 0.7}/>

        {/* Back ring halves */}
        <g transform="rotate(-20)" filter="url(#gp_ringGlow)">
          <ellipse cx="0" cy="0" rx="76" ry="19" fill="none" stroke="url(#gp_r1)" strokeWidth="3.5" clipPath="url(#gp_back)" opacity="1"/>
        </g>
        <g transform="rotate(16)" filter="url(#gp_ringGlow)">
          <ellipse cx="0" cy="0" rx="64" ry="14" fill="none" stroke="url(#gp_r2)" strokeWidth="2.6" clipPath="url(#gp_back)" opacity="0.88"/>
        </g>

        {/* ── Dim skeleton gem (always visible, shows shape) ── */}
        <g opacity="0.18">
          <polygon points="0,-95 -44,-40 -28,0" fill="#3b0764"/>
          <polygon points="0,95  -44,40  -28,0" fill="#2e1065"/>
          <polygon points="0,-95  44,-40  28,0" fill="#5b21b6"/>
          <polygon points="0,95   44,40   28,0" fill="#4c1d95"/>
          <polygon points="0,-95 75,0 0,-10"  fill="url(#gp_top)"/>
          <polygon points="0,-95 -75,0 0,-10" fill="#c4b5fd"/>
          <polygon points="0,95 75,0 0,10"    fill="#7c3aed"/>
          <polygon points="0,95 -75,0 0,10"   fill="#4c1d95"/>
          <polygon points="0,-10 0,10 -75,0"  fill="#6d28d9"/>
          <polygon points="0,-10 0,10  75,0"  fill="#8b5cf6"/>
        </g>

        {/* ── Bright filled gem (clipped to liquid fill rect) ── */}
        <g clipPath="url(#gp_fill)">
          <polygon points="0,-95 -44,-40 -28,0" fill="#3b0764" opacity="0.9"/>
          <polygon points="0,95  -44,40  -28,0" fill="#2e1065" opacity="0.95"/>
          <polygon points="0,-95  44,-40  28,0" fill="#5b21b6" opacity="0.65"/>
          <polygon points="0,95   44,40   28,0" fill="#4c1d95" opacity="0.85"/>
          <g filter="url(#gp_gemGlow)">
            <polygon points="0,-95 75,0 0,-10"  fill="url(#gp_top)" opacity="1"/>
            <polygon points="0,-95 -75,0 0,-10" fill="#c4b5fd"      opacity="0.82"/>
            <polygon points="0,95 75,0 0,10"    fill="#7c3aed"      opacity="0.96"/>
            <polygon points="0,95 -75,0 0,10"   fill="#4c1d95"      opacity="0.94"/>
            <polygon points="0,-10 0,10 -75,0"  fill="#6d28d9"      opacity="0.55"/>
            <polygon points="0,-10 0,10  75,0"  fill="#8b5cf6"      opacity="0.42"/>
          </g>
        </g>

        {/* Outline — always visible */}
        <polygon points="0,-95 75,0 0,95 -75,0" fill="none" stroke="#8b5cf6" strokeWidth="1.1" strokeOpacity="0.6"/>
        <line x1="0" y1="-95" x2="75"  y2="0" stroke="white" strokeWidth="1"   strokeOpacity="0.2"/>
        <line x1="0" y1="-95" x2="-75" y2="0" stroke="white" strokeWidth="0.6" strokeOpacity="0.1"/>

        {/* Crown glint — appears as gem fills past 65% */}
        {pct >= 65 && (
          <g opacity={Math.min(1, (pct - 65) / 20)}>
            <ellipse cx="0" cy="-34" rx="16" ry="16" fill="url(#gp_glint)" opacity="0.88"/>
            <circle  cx="0" cy="-34" r="6.5" fill="white" opacity="0.98"/>
            <circle  cx="0" cy="-34" r="2.8" fill="white"/>
            <circle cx="20" cy="-62" r="3.5" fill="white" opacity="0.52"/>
            <circle cx="-8" cy="-74" r="2"   fill="white" opacity="0.28"/>
          </g>
        )}

        {/* Front ring halves */}
        <g transform="rotate(-20)" filter="url(#gp_ringGlow)">
          <ellipse cx="0" cy="0" rx="76" ry="19" fill="none" stroke="url(#gp_r1)" strokeWidth="3.5" clipPath="url(#gp_front)" opacity="1"/>
        </g>
        <g transform="rotate(16)" filter="url(#gp_ringGlow)">
          <ellipse cx="0" cy="0" rx="64" ry="14" fill="none" stroke="url(#gp_r2)" strokeWidth="2.6" clipPath="url(#gp_front)" opacity="0.88"/>
        </g>

        {/* Motion paths */}
        <path id="gp_mp1" d="M 76,0 A 76,19 0 1,1 -76,0 A 76,19 0 1,1 76,0 Z" fill="none" transform="rotate(-20)"/>
        <path id="gp_mp2" d="M 64,0 A 64,14 0 1,1 -64,0 A 64,14 0 1,1 64,0 Z" fill="none" transform="rotate(16)"/>

        {/* Ring 1 nodes — speed up with progress */}
        <g transform="rotate(-20)">
          <circle r="5.5" fill={isDone ? "#22c55e" : "#a78bfa"} filter="url(#gp_nodeGlow)">
            <animateMotion dur={ring1Dur} repeatCount="indefinite" rotate="auto"><mpath href="#gp_mp1"/></animateMotion>
          </circle>
          <circle r="3" fill={isDone ? "#86efac" : "#c4b5fd"} filter="url(#gp_nodeGlow)" opacity="0.75">
            <animateMotion dur={ring1Dur} repeatCount="indefinite" begin={`-${(parseFloat(ring1Dur) / 2).toFixed(2)}s`} rotate="auto"><mpath href="#gp_mp1"/></animateMotion>
          </circle>
        </g>

        {/* Ring 2 nodes */}
        <g transform="rotate(16)">
          <circle r="4.5" fill={isDone ? "#4ade80" : "#6366f1"} filter="url(#gp_nodeGlow)">
            <animateMotion dur={ring2Dur} repeatCount="indefinite" begin={`-${(parseFloat(ring2Dur) / 2).toFixed(2)}s`} rotate="auto"><mpath href="#gp_mp2"/></animateMotion>
          </circle>
          <circle r="2.5" fill={isDone ? "#86efac" : "#818cf8"} filter="url(#gp_nodeGlow)" opacity="0.7">
            <animateMotion dur={ring2Dur} repeatCount="indefinite" begin={`-${(parseFloat(ring2Dur) / 4).toFixed(2)}s`} rotate="auto"><mpath href="#gp_mp2"/></animateMotion>
          </circle>
        </g>
      </svg>

      {/* Percentage label below gem */}
      <div className="text-center">
        <span className={`text-3xl font-bold ${isDone ? "text-green-400" : "text-white"}`}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

function AgentCard({ agent, status, tooltip }: { agent: AgentDef; status: AgentStatus; tooltip?: string }) {
  const cfg = {
    waiting: {
      border: "border-white/10", bg: "bg-white/5",
      icon: <Clock className="h-4 w-4 text-white/30" />,
      text: "text-white/30", badge: "bg-white/10 text-white/30", label: "Waiting",
    },
    running: {
      border: "border-orion-green/50", bg: "bg-orion-green/10",
      icon: <Loader2 className="h-4 w-4 text-orion-green animate-spin" />,
      text: "text-white", badge: "bg-orion-green/20 text-orion-green", label: "Running",
    },
    complete: {
      border: "border-green-500/40", bg: "bg-green-500/10",
      icon: <CheckCircle2 className="h-4 w-4 text-green-400" />,
      text: "text-white/70", badge: "bg-green-500/20 text-green-400", label: "Complete",
    },
    failed: {
      border: "border-red-500/40", bg: "bg-red-500/10",
      icon: <XCircle className="h-4 w-4 text-red-400" />,
      text: "text-white/50", badge: "bg-red-500/20 text-red-400", label: "Failed",
    },
  }[status];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-start gap-3 transition-all duration-300`}>
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${cfg.text} flex items-center gap-1`}>
          {agent.name}
          {tooltip && <TooltipHelp text={tooltip} side="top" />}
        </p>
        <p className="text-xs text-white/40 mt-0.5">{agent.description}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
        {cfg.label}
      </span>
    </div>
  );
}

type ConnectionMode = "connecting" | "sse" | "polling";

function ConnectionBadge({ mode }: { mode: ConnectionMode }) {
  if (mode === "sse") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        <span className="text-xs text-white/40">Live</span>
      </div>
    );
  }
  if (mode === "polling") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-white/40">Polling</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Loader2 className="h-3 w-3 text-white/30 animate-spin" />
      <span className="text-xs text-white/30">Connecting…</span>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface TimelineEvent {
  label: string;
  ts: Date;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface WarRoomProps {
  goalId: string;
  campaignId?: string | undefined;
  onComplete: (campaignId: string) => void;
}

export function WarRoom({ goalId, campaignId: initialCampaignId, onComplete }: WarRoomProps) {
  const router = useRouter();
  // Pipeline state
  const [pipelineStage, setPipelineStage]       = useState(0);
  const [pipelineStatus, setPipelineStatus]     = useState<string>("running");
  const [resolvedCampaignId, setResolvedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [timeline, setTimeline]                 = useState<TimelineEvent[]>([]);
  const [error, setError]                       = useState<string | null>(null);
  const [isDone, setIsDone]                     = useState(false);
  const [isError, setIsError]                   = useState(false);
  const [errorStage, setErrorStage]             = useState<string | null>(null);
  const [isRetrying, setIsRetrying]                   = useState(false);
  const [inngestUnhealthy, setInngestUnhealthy]       = useState(false);
  // New state
  const [connectionMode, setConnectionMode]           = useState<ConnectionMode>("connecting");
  const [elapsedSeconds, setElapsedSeconds]           = useState(0);
  const [activeMessage, setActiveMessage]             = useState(STAGE_ACTIVE_MESSAGES[0]);
  const [retryKey, setRetryKey]                       = useState(0);
  // Timeout/stuck warnings
  const [showNoProgressWarning, setShowNoProgressWarning] = useState(false);
  const [showStuckWarning, setShowStuckWarning]           = useState(false);

  // Refs — for values that need to be read inside async closures without stale captures
  const prevStageRef         = useRef<number>(0);
  const intervalRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef                = useRef<EventSource | null>(null);
  const reconnectTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef         = useRef<number>(Date.now());
  const sseReceivedAnyRef    = useRef<boolean>(false);
  const reconnectAttemptRef  = useRef<boolean>(false);
  // Mirror of state for use inside SSE closures (avoids stale closure on boolean state)
  const isDoneRef            = useRef<boolean>(false);
  const isErrorRef           = useRef<boolean>(false);
  // For warning timeout checks inside the interval callback
  const pipelineStageRef     = useRef<number>(0);
  const stageLastAdvancedRef = useRef<number>(Date.now());

  // ── Shared status handler (called by both SSE path and polling fallback) ────

  const applyStatusUpdate = useCallback((
    stage: number,
    status: string,
    stagesComplete: string[],
    campaignId?: string | null,
  ) => {
    setPipelineStage(stage);
    setPipelineStatus(status);
    pipelineStageRef.current = stage;
    if (campaignId) setResolvedCampaignId(campaignId);

    // Append timeline events for any newly completed stages
    if (stage > prevStageRef.current) {
      stageLastAdvancedRef.current = Date.now();
      const newEvents: TimelineEvent[] = [];
      for (let s = prevStageRef.current + 1; s <= stage; s++) {
        const label = STAGE_LABELS[s];
        if (label) newEvents.push({ label, ts: new Date() });
      }
      if (newEvents.length > 0) setTimeline((prev) => [...prev, ...newEvents]);
      setActiveMessage(STAGE_ACTIVE_MESSAGES[stage] ?? STAGE_ACTIVE_MESSAGES[0]);
      prevStageRef.current = stage;
    }

    // Mark complete when all DB stages are present or status field says so
    const isComplete = status === "complete" || stagesComplete.length >= 4;
    if (isComplete && !isDoneRef.current) {
      isDoneRef.current = true;
      setIsDone(true);
    }
  }, []); // all deps are either refs (stable) or React stable setters

  // ── Polling fallback ──────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<PipelineStatus>(`/goals/${goalId}/pipeline-status`);
      const stage = res?.stage ?? 0;
      const campaignId = res?.campaign?.id;
      const statusStr = res?.status ?? "running";

      if (res?.pipelineError) {
        isErrorRef.current = true;
        setIsError(true);
        setError(sanitizeErrorMessage(res.pipelineError));
        setErrorStage(res.pipelineStage ?? null);
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        return;
      }

      applyStatusUpdate(stage, statusStr, res?.stagesComplete ?? [], campaignId);

      if (isDoneRef.current) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch pipeline status");
    }
  }, [goalId, applyStatusUpdate]);

  // ── Main effect: set up SSE with polling fallback ─────────────────────────

  useEffect(() => {
    // Reset elapsed timer and warning refs on mount and on retry
    startTimeRef.current = Date.now();
    stageLastAdvancedRef.current = Date.now();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      const nowMs = Date.now();
      const elapsed = Math.floor((nowMs - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);

      if (!isDoneRef.current && !isErrorRef.current) {
        // No-progress warning: stage still at 0 after 45 seconds (Inngest may be down)
        if (elapsed >= 45 && pipelineStageRef.current === 0) {
          setShowNoProgressWarning(true);
        }
        // Stuck-stage warning: same stage for 3+ minutes (and we have made some progress)
        const stageAge = Math.floor((nowMs - stageLastAdvancedRef.current) / 1000);
        if (stageAge >= 180 && pipelineStageRef.current > 0) {
          setShowStuckWarning(true);
        }
      }
    }, 1000);

    // Inngest health check — once on first mount only
    if (retryKey === 0) {
      api.get<{ healthy: boolean }>("/health/inngest")
        .then((r) => { if (!r.healthy) setInngestUnhealthy(true); })
        .catch(() => {});
    }

    function stopPolling() {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }

    function startPolling() {
      setConnectionMode("polling");
      fetchStatus();
      intervalRef.current = setInterval(fetchStatus, 3000);
    }

    // SSE connection — uses native EventSource (GET, sends session cookie automatically)
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    function connectSSE(isReconnect = false) {
      const es = new EventSource(`/api/goals/${goalId}/war-room-stream`);
      esRef.current = es;

      // On initial connection: if no event arrives within timeout, fall back to polling
      if (!isReconnect) {
        fallbackTimer = setTimeout(() => {
          if (!sseReceivedAnyRef.current && !isDoneRef.current && !isErrorRef.current) {
            es.close();
            esRef.current = null;
            startPolling();
          }
        }, SSE_CONNECT_TIMEOUT_MS);
      }

      function markSSEActive() {
        if (!sseReceivedAnyRef.current) {
          sseReceivedAnyRef.current = true;
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
          setConnectionMode("sse");
        }
      }

      es.addEventListener("stage_update", (e: MessageEvent) => {
        markSSEActive();
        try {
          const data = JSON.parse(e.data) as { stage: number; status: string; stagesComplete: string[] };
          applyStatusUpdate(data.stage, data.status ?? "running", data.stagesComplete ?? []);
          // If polling fallback was already running, stop it
          stopPolling();
          if (isDoneRef.current) { es.close(); esRef.current = null; }
        } catch {}
      });

      es.addEventListener("pipeline_complete", (e: MessageEvent) => {
        markSSEActive();
        stopPolling();
        try {
          const data = JSON.parse(e.data) as { campaignId: string | null; assetsCount: number };
          if (data.campaignId) setResolvedCampaignId(data.campaignId);
        } catch {}
        isDoneRef.current = true;
        setIsDone(true);
        es.close();
        esRef.current = null;
      });

      es.addEventListener("pipeline_error", (e: MessageEvent) => {
        markSSEActive();
        stopPolling();
        try {
          const data = JSON.parse(e.data) as { message: string; errorStage?: string | null };
          isErrorRef.current = true;
          setIsError(true);
          setError(sanitizeErrorMessage(data.message));
          setErrorStage(data.errorStage ?? null);
        } catch {}
        es.close();
        esRef.current = null;
      });

      // Transient error from server — stream stays open, no action needed client-side
      es.addEventListener("error", () => {/* server-side transient error; stream continues */});

      es.onerror = () => {
        if (!sseReceivedAnyRef.current) {
          // EventSource couldn't connect at all — fall back to polling
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
          es.close();
          esRef.current = null;
          startPolling();
        } else if (es.readyState === EventSource.CLOSED && !isDoneRef.current && !isErrorRef.current) {
          // Connection dropped after working — try one reconnect
          esRef.current = null;
          if (!reconnectAttemptRef.current) {
            reconnectAttemptRef.current = true;
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (!isDoneRef.current && !isErrorRef.current) connectSSE(true);
            }, SSE_RECONNECT_DELAY_MS);
          } else {
            // Second failure — fall back to polling
            startPolling();
          }
        }
      };
    }

    connectSSE();

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [goalId, retryKey, fetchStatus, applyStatusUpdate]); // retryKey re-triggers on manual retry

  // ── Retry handler ─────────────────────────────────────────────────────────

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await api.post(`/goals/${goalId}/retry`, {});
      // Reset all pipeline state before re-mounting the SSE connection
      isErrorRef.current = false;
      isDoneRef.current = false;
      prevStageRef.current = 0;
      pipelineStageRef.current = 0;
      stageLastAdvancedRef.current = Date.now();
      sseReceivedAnyRef.current = false;
      reconnectAttemptRef.current = false;
      setIsError(false);
      setError(null);
      setErrorStage(null);
      setIsDone(false);
      setPipelineStage(0);
      setPipelineStatus("running");
      setTimeline([]);
      setActiveMessage(STAGE_ACTIVE_MESSAGES[0]);
      setConnectionMode("connecting");
      setElapsedSeconds(0);
      setShowNoProgressWarning(false);
      setShowStuckWarning(false);
      setIsRetrying(false);
      // Increment retryKey to re-run the useEffect (teardown + fresh SSE connection)
      setRetryKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message ?? "Failed to retry pipeline");
      setIsRetrying(false);
    }
  }, [goalId]);

  const handleCloseAndContinue = useCallback(() => {
    if (resolvedCampaignId) {
      onComplete(resolvedCampaignId);
    } else {
      router.push("/dashboard");
    }
  }, [resolvedCampaignId, onComplete, router]);

  // Auto-dismiss warnings when pipeline succeeds
  useEffect(() => {
    if (isDone) {
      setShowNoProgressWarning(false);
      setShowStuckWarning(false);
    }
  }, [isDone]);

  const readinessScore = isDone ? 100 : Math.min(99, Math.round((pipelineStage / 4) * 100));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orion-green/20">
            <Zap className="h-5 w-5 text-orion-green" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Campaign War Room</h1>
            <p className="text-xs text-white/40">AI agents are building your campaign</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Elapsed time */}
          <div className="flex items-center gap-1.5 font-mono text-sm text-white/40">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsed(elapsedSeconds)}
          </div>
          {/* Connection status */}
          <ConnectionBadge mode={connectionMode} />
          {isError && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Pipeline Failed</Badge>
          )}
        </div>
      </div>

      <div className="flex-1 px-8 py-6 space-y-8 max-w-6xl mx-auto w-full">
        {/* Inngest health warning */}
        {inngestUnhealthy && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200 leading-relaxed">
              <span className="font-semibold">Background job server is not running.</span>{" "}
              Your campaign pipeline cannot execute. Please ensure the Inngest dev server is running
              {" "}(<code className="text-yellow-300 font-mono text-xs">npx inngest-cli@latest dev</code>).
            </p>
          </div>
        )}

        {/* No-progress warning: pipeline is queuing */}
        {showNoProgressWarning && !isDone && !isError && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200 leading-relaxed flex-1">
              <span className="font-semibold">Pipeline is queuing…</span>{" "}
              This usually starts within a minute. You can leave this page — your campaign will continue running in the background.
            </p>
            <button
              className="text-yellow-400/60 hover:text-yellow-300 shrink-0"
              onClick={() => setShowNoProgressWarning(false)}
              aria-label="Dismiss"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Stuck-stage warning: pipeline is running but hasn't advanced in 3 minutes */}
        {showStuckWarning && !isDone && !isError && (
          <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-orange-200 leading-relaxed">
                <span className="font-semibold">This stage is taking longer than expected.</span>{" "}
                You can retry the pipeline or close this page and check back later.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold gap-1.5"
                >
                  {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Retry Pipeline
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCloseAndContinue}
                  className="border-orange-500/40 text-orange-200 hover:bg-orange-500/10"
                >
                  Close &amp; Continue
                </Button>
              </div>
            </div>
            <button
              className="text-orange-400/60 hover:text-orange-300 shrink-0"
              onClick={() => setShowStuckWarning(false)}
              aria-label="Dismiss"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Pipeline error state */}
        {isError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-red-300">Pipeline Failed</p>
                {errorStage && (
                  <p className="text-sm text-red-400/80 mt-0.5">
                    Failed during: <span className="font-medium">{STAGE_FRIENDLY_NAMES[errorStage] ?? errorStage}</span>
                  </p>
                )}
                {error && (
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{error}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleRetry}
                disabled={isRetrying}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold gap-2"
              >
                {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isRetrying ? "Retrying…" : "Retry Pipeline"}
              </Button>
            </div>
          </div>
        )}

        {/* Gem readiness score */}
        <div className="flex flex-col items-center gap-3 py-4">
          <GemProgress value={readinessScore} />
          <div className="text-center">
            <p className="text-sm font-medium text-white/60 flex items-center gap-1 justify-center">
              Campaign Readiness
              <TooltipHelp text="The current step in the automated campaign building process." side="top" />
            </p>
            {isDone ? (
              <p className="mt-1 text-green-400 font-semibold flex items-center gap-1 justify-center">
                <Trophy className="h-4 w-4" />
                Your campaign is ready to review!
              </p>
            ) : !isError ? (
              <p className="mt-1 text-xs text-white/40 italic">{activeMessage}</p>
            ) : null}
          </div>
        </div>

        {/* CTA — shown at TOP when pipeline completes (also shown at bottom) */}
        {isDone && resolvedCampaignId && (
          <div className="flex justify-center">
            <Button
              size="lg"
              className="bg-green-500 hover:bg-green-600 text-black font-bold px-10 gap-2 animate-pulse"
              onClick={() => onComplete(resolvedCampaignId)}
            >
              <CheckCircle2 className="h-5 w-5" />
              Review Campaign Assets
            </Button>
          </div>
        )}

        {/* Agent grid */}
        <div className="grid grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              status={getAgentStatus(agent, pipelineStage, pipelineStatus, isDone)}
              tooltip={AGENT_TOOLTIPS[agent.name] ?? ""}
            />
          ))}
        </div>

        {/* Timeline feed */}
        {timeline.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold text-white/60 mb-4 uppercase tracking-wider flex items-center gap-1.5">
              Pipeline Timeline
              <TooltipHelp text="Real-time log of each agent completing its task." side="right" />
            </h3>
            <div className="space-y-3">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-sm text-white/80">{event.label}</span>
                  <span className="ml-auto text-xs text-white/30">{event.ts.toLocaleTimeString()}</span>
                </div>
              ))}
              {!isDone && !isError && (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-orion-green animate-pulse shrink-0" />
                  <span className="text-sm text-white/40">Processing…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA — shown when pipeline completes and we know the campaign ID */}
        {isDone && resolvedCampaignId && (
          <div className="flex justify-center pb-6">
            <Button
              size="lg"
              className="bg-green-500 hover:bg-green-600 text-black font-bold px-10 gap-2"
              onClick={() => onComplete(resolvedCampaignId)}
            >
              <CheckCircle2 className="h-5 w-5" />
              Review Campaign Assets
            </Button>
          </div>
        )}
      </div>

      {/* First-run tip */}
      {!isDone && (
        <FirstRunTip
          id="war-room"
          title="Your agents are working"
          body="Each card lights up as an agent completes its task. When all agents finish, a green button will appear at the top and bottom — click it to review your campaign."
          cta="Got it"
        />
      )}
    </div>
  );
}
