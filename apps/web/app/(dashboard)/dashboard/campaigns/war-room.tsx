"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Zap,
  Trophy,
  AlertTriangle,
  RefreshCw,
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

function CircularProgress({ value }: { value: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={value >= 100 ? "#22c55e" : "#00ff88"}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{Math.round(value)}%</span>
        <span className="text-xs text-white/50 mt-1">Complete</span>
      </div>
    </div>
  );
}

function AgentCard({ agent, status }: { agent: AgentDef; status: AgentStatus }) {
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
        <p className={`text-sm font-semibold truncate ${cfg.text}`}>{agent.name}</p>
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
  // Pipeline state
  const [pipelineStage, setPipelineStage]       = useState(0);
  const [pipelineStatus, setPipelineStatus]     = useState<string>("running");
  const [resolvedCampaignId, setResolvedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [timeline, setTimeline]                 = useState<TimelineEvent[]>([]);
  const [error, setError]                       = useState<string | null>(null);
  const [isDone, setIsDone]                     = useState(false);
  const [isError, setIsError]                   = useState(false);
  const [errorStage, setErrorStage]             = useState<string | null>(null);
  const [isRetrying, setIsRetrying]             = useState(false);
  const [inngestUnhealthy, setInngestUnhealthy] = useState(false);
  // New state
  const [connectionMode, setConnectionMode]     = useState<ConnectionMode>("connecting");
  const [elapsedSeconds, setElapsedSeconds]     = useState(0);
  const [activeMessage, setActiveMessage]       = useState(STAGE_ACTIVE_MESSAGES[0]);
  const [retryKey, setRetryKey]                 = useState(0);

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

  // ── Shared status handler (called by both SSE path and polling fallback) ────

  const applyStatusUpdate = useCallback((
    stage: number,
    status: string,
    stagesComplete: string[],
    campaignId?: string | null,
  ) => {
    setPipelineStage(stage);
    setPipelineStatus(status);
    if (campaignId) setResolvedCampaignId(campaignId);

    // Append timeline events for any newly completed stages
    if (stage > prevStageRef.current) {
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
    // Reset elapsed timer on mount and on retry
    startTimeRef.current = Date.now();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
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
      setIsRetrying(false);
      // Increment retryKey to re-run the useEffect (teardown + fresh SSE connection)
      setRetryKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message ?? "Failed to retry pipeline");
      setIsRetrying(false);
    }
  }, [goalId]);

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

        {/* Circular readiness score */}
        <div className="flex flex-col items-center gap-3 py-4">
          <CircularProgress value={readinessScore} />
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">Campaign Readiness Score</p>
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

        {/* Agent grid */}
        <div className="grid grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              status={getAgentStatus(agent, pipelineStage, pipelineStatus, isDone)}
            />
          ))}
        </div>

        {/* Timeline feed */}
        {timeline.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold text-white/60 mb-4 uppercase tracking-wider">
              Pipeline Timeline
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
    </div>
  );
}
