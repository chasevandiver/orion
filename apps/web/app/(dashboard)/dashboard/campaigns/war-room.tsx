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
}

// ── Agent definitions ─────────────────────────────────────────────────────────

interface AgentDef {
  name: string;
  description: string;
  stage: number; // completed when pipeline stage >= this
}

const AGENTS: AgentDef[] = [
  { name: "CompetitorIntelligenceAgent", description: "Analyzing competitors", stage: 1 },
  { name: "TrendResearchAgent", description: "Researching trends", stage: 1 },
  { name: "MarketingStrategistAgent", description: "Building strategy", stage: 2 },
  { name: "SEOAgent", description: "Optimizing for search", stage: 2 },
  { name: "ContentCreatorAgent", description: "Writing copy", stage: 3 },
  { name: "ImageGeneratorAgent", description: "Selecting visuals", stage: 3 },
  { name: "CompositorAgent", description: "Designing images", stage: 4 },
  { name: "LandingPageAgent", description: "Building landing page", stage: 4 },
  { name: "SchedulerAgent", description: "Optimizing send times", stage: 5 },
  { name: "AnalyticsAgent", description: "Setting up tracking", stage: 5 },
];

type AgentStatus = "waiting" | "running" | "complete" | "failed";

function getAgentStatus(agent: AgentDef, pipelineStage: number, pipelineStatus: string): AgentStatus {
  if (pipelineStatus === "failed" && pipelineStage < agent.stage) return "failed";
  if (pipelineStage > agent.stage) return "complete";
  if (pipelineStage === agent.stage) return "running";
  if (pipelineStage === agent.stage - 1) return "running";
  return "waiting";
}

// ── Circular progress ──────────────────────────────────────────────────────────

function CircularProgress({ value }: { value: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" className="-rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="10"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={value >= 100 ? "#22c55e" : "#6366f1"}
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

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, status }: { agent: AgentDef; status: AgentStatus }) {
  const statusConfig = {
    waiting: {
      border: "border-white/10",
      bg: "bg-white/5",
      icon: <Clock className="h-4 w-4 text-white/30" />,
      text: "text-white/30",
      badge: "bg-white/10 text-white/30",
      label: "Waiting",
    },
    running: {
      border: "border-indigo-500/50",
      bg: "bg-indigo-500/10",
      icon: <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />,
      text: "text-white",
      badge: "bg-indigo-500/20 text-indigo-300",
      label: "Running",
    },
    complete: {
      border: "border-green-500/40",
      bg: "bg-green-500/10",
      icon: <CheckCircle2 className="h-4 w-4 text-green-400" />,
      text: "text-white/70",
      badge: "bg-green-500/20 text-green-400",
      label: "Complete",
    },
    failed: {
      border: "border-red-500/40",
      bg: "bg-red-500/10",
      icon: <XCircle className="h-4 w-4 text-red-400" />,
      text: "text-white/50",
      badge: "bg-red-500/20 text-red-400",
      label: "Failed",
    },
  };

  const cfg = statusConfig[status];

  return (
    <div
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-start gap-3 transition-all duration-300 ${
        status === "running" ? "animate-pulse" : ""
      }`}
    >
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

// ── Timeline feed ──────────────────────────────────────────────────────────────

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
  const [pipelineStage, setPipelineStage] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState<string>("running");
  const [resolvedCampaignId, setResolvedCampaignId] = useState<string | undefined>(initialCampaignId ?? undefined);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const prevStageRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stage labels for timeline
  const STAGE_LABELS: Record<number, string> = {
    1: "Research complete",
    2: "Strategy & SEO done",
    3: "Content generated",
    4: "Images composited",
    5: "Pipeline complete",
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<PipelineStatus>(`/goals/${goalId}/pipeline-status`);
      // API returns the object directly (no .data wrapper)
      const stage = res?.stage ?? 0;
      const campaignId = res?.campaign?.id;
      const pipelineStatusStr = res?.status ?? "running";

      setPipelineStage(stage);
      setPipelineStatus(pipelineStatusStr);

      if (campaignId) setResolvedCampaignId(campaignId);

      // Add timeline events for new stages
      if (stage > prevStageRef.current) {
        const newEvents: TimelineEvent[] = [];
        for (let s = prevStageRef.current + 1; s <= stage; s++) {
          const stageLabel = STAGE_LABELS[s];
          if (stageLabel) {
            newEvents.push({ label: stageLabel, ts: new Date() });
          }
        }
        if (newEvents.length > 0) {
          setTimeline((prev) => [...prev, ...newEvents]);
        }
        prevStageRef.current = stage;
      }

      // Check completion: stagesComplete reaches all 4 known stages or campaign status is ready
      const stagesComplete = res?.stagesComplete ?? [];
      const campaignStatus = res?.campaign?.status;
      const isComplete =
        stagesComplete.length >= 4 ||
        campaignStatus === "ready" ||
        campaignStatus === "complete" ||
        pipelineStatusStr === "complete";

      if (isComplete) {
        setIsDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch pipeline status");
    }
  }, [goalId]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const readinessScore = Math.min(100, Math.round((pipelineStage / 5) * 100));

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20">
            <Zap className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Campaign War Room</h1>
            <p className="text-xs text-white/40">AI agents are building your campaign</p>
          </div>
        </div>
        {error && (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{error}</Badge>
        )}
      </div>

      <div className="flex-1 px-8 py-6 space-y-8 max-w-6xl mx-auto w-full">
        {/* Center readiness score */}
        <div className="flex flex-col items-center gap-3 py-4">
          <CircularProgress value={readinessScore} />
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">Campaign Readiness Score</p>
            {isDone && (
              <p className="mt-1 text-green-400 font-semibold flex items-center gap-1 justify-center">
                <Trophy className="h-4 w-4" />
                Your campaign is ready to review!
              </p>
            )}
          </div>
        </div>

        {/* Agent grid */}
        <div className="grid grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              status={getAgentStatus(agent, pipelineStage, pipelineStatus)}
            />
          ))}
        </div>

        {/* Timeline Feed */}
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
                  <span className="ml-auto text-xs text-white/30">
                    {event.ts.toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {!isDone && (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                  <span className="text-sm text-white/40">Processing…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
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
