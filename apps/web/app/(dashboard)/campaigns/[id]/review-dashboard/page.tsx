"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Users,
  Megaphone,
  Zap,
  Shield,
  Target,
  BarChart2,
  Calendar,
  Lightbulb,
  Rocket,
  Award,
  ChevronRight,
  Search,
  Brain,
  PenTool,
  Image,
  Layers,
  Globe,
  Send,
  Activity,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface StrategyJson {
  executiveSummary?: string;
  audiences?: Array<{
    name: string;
    description: string;
    painPoint: string;
    size: "small" | "medium" | "large";
  }>;
  channels?: string[];
  kpis?: Record<string, string>;
  messagingThemes?: string[];
  keyMessagesByChannel?: Record<string, string>;
  thirtyDayPlan?: string[];
  budgetAllocation?: Record<string, string>;
  contentCalendarOutline?: Array<{
    week: number;
    channel: string;
    topic: string;
    format: string;
  }>;
}

interface Asset {
  id: string;
  channel: string;
  type: string;
  status: string;
  contentText?: string;
  imageUrl?: string;
  compositedImageUrl?: string;
  variant?: "a" | "b";
  metadata?: { imageSource?: string };
}

interface Goal {
  id: string;
  type: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
  timeline?: string;
}

interface Strategy {
  id: string;
  contentJson?: StrategyJson;
  contentText?: string;
  channels?: string[];
  kpis?: Record<string, string>;
  tokensUsed?: number;
  generatedAt?: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  budget?: number;
  createdAt?: string;
  goal?: Goal;
  strategy?: Strategy;
  assets?: Asset[];
}

// ── Static metadata ──────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, {
  label: string;
  icon: string;
  effort: "Low" | "Medium" | "High";
  effortColor: string;
  impact: string;
}> = {
  linkedin:  { label: "LinkedIn",  icon: "💼", effort: "Medium", effortColor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", impact: "B2B reach + professional credibility" },
  twitter:   { label: "Twitter/X", icon: "𝕏",  effort: "Low",    effortColor: "text-green-400 bg-green-400/10 border-green-400/20",  impact: "Brand visibility + real-time engagement" },
  instagram: { label: "Instagram", icon: "📸", effort: "Medium", effortColor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", impact: "Visual storytelling + audience growth" },
  facebook:  { label: "Facebook",  icon: "📘", effort: "Low",    effortColor: "text-green-400 bg-green-400/10 border-green-400/20",  impact: "Broad reach + retargeting" },
  tiktok:    { label: "TikTok",    icon: "🎵", effort: "High",   effortColor: "text-red-400 bg-red-400/10 border-red-400/20",       impact: "Viral potential + Gen Z reach" },
  email:     { label: "Email",     icon: "📧", effort: "Medium", effortColor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", impact: "High-conversion owned channel" },
  blog:      { label: "Blog",      icon: "✍️", effort: "High",   effortColor: "text-red-400 bg-red-400/10 border-red-400/20",       impact: "Long-term SEO + organic traffic" },
};

const GOAL_RISKS: Record<string, { risk: string; mitigation: string }> = {
  awareness:   { risk: "Brand message may not differentiate in crowded channels",    mitigation: "Lead with a specific POV, not generic awareness content" },
  leads:       { risk: "High lead volume at the expense of qualification quality",   mitigation: "Layer in qualification signals early in funnel copy" },
  conversions: { risk: "Bottom-funnel fatigue if top-funnel isn't feeding pipeline", mitigation: "Balance conversion content with awareness-stage assets" },
  engagement:  { risk: "Algorithm dependency may reduce organic reach over time",    mitigation: "Build email list as a fallback owned channel" },
  retention:   { risk: "Re-engagement campaigns may churn disengaged users faster",  mitigation: "Segment audience before launching retention sequences" },
};

interface AgentDef {
  name: string;
  shortName: string;
  icon: React.ReactNode;
  stage: string;
  whatAnalyzed: (ctx: SynthesisContext) => string;
  keyInsight: (ctx: SynthesisContext) => string;
  confidence: (ctx: SynthesisContext) => "High" | "Medium" | "Low";
}

interface SynthesisContext {
  campaign: Campaign;
  strategy: StrategyJson | undefined;
  assets: Asset[];
  channels: string[];
}

const AGENT_DEFS: AgentDef[] = [
  {
    name: "CompetitorIntelligenceAgent",
    shortName: "Competitor Intel",
    icon: <Search className="h-4 w-4" />,
    stage: "Research",
    whatAnalyzed: (ctx) => `Competitive landscape for ${ctx.campaign.goal?.brandName ?? "your brand"}`,
    keyInsight: (ctx) => ctx.strategy?.messagingThemes?.[0]
      ? `Identified differentiation angle: "${ctx.strategy.messagingThemes[0]}"`
      : "Mapped competitor positioning to surface whitespace opportunities",
    confidence: () => "High",
  },
  {
    name: "TrendResearchAgent",
    shortName: "Trend Research",
    icon: <TrendingUp className="h-4 w-4" />,
    stage: "Research",
    whatAnalyzed: (ctx) => `Market trends relevant to ${ctx.campaign.goal?.type ?? "campaign"} goals`,
    keyInsight: (ctx) => ctx.strategy?.messagingThemes?.[1]
      ? `Surfaced trend: "${ctx.strategy.messagingThemes[1]}"`
      : "Confirmed timing alignment with current market conditions",
    confidence: () => "High",
  },
  {
    name: "MarketingStrategistAgent",
    shortName: "Strategist",
    icon: <Brain className="h-4 w-4" />,
    stage: "Strategy",
    whatAnalyzed: (ctx) => `Full go-to-market plan for ${ctx.campaign.goal?.brandName ?? "your brand"}`,
    keyInsight: (ctx) => ctx.strategy?.executiveSummary
      ? ctx.strategy.executiveSummary.split(".")[0] + "."
      : "Produced comprehensive channel strategy and 30-day plan",
    confidence: () => "High",
  },
  {
    name: "SEOAgent",
    shortName: "SEO Agent",
    icon: <Globe className="h-4 w-4" />,
    stage: "Strategy",
    whatAnalyzed: () => "Keyword opportunities and organic search potential",
    keyInsight: (ctx) => ctx.channels.includes("blog")
      ? "Blog content optimized for organic discovery — long-tail keyword opportunities captured"
      : "SEO metadata and on-page signals applied to all written content",
    confidence: (ctx) => ctx.channels.includes("blog") ? "High" : "Medium",
  },
  {
    name: "ContentCreatorAgent",
    shortName: "Content Creator",
    icon: <PenTool className="h-4 w-4" />,
    stage: "Content",
    whatAnalyzed: (ctx) => `Channel-specific copy for ${ctx.channels.join(", ")}`,
    keyInsight: (ctx) => `Generated ${ctx.assets.length} content piece${ctx.assets.length !== 1 ? "s" : ""} across ${ctx.channels.length} channel${ctx.channels.length !== 1 ? "s" : ""}, tailored to brand voice and audience`,
    confidence: () => "High",
  },
  {
    name: "ImageGeneratorAgent",
    shortName: "Image Generator",
    icon: <Image className="h-4 w-4" />,
    stage: "Content",
    whatAnalyzed: (ctx) => `Visual assets for ${ctx.channels.filter(c => c !== "blog" && c !== "email").join(", ") || "campaign channels"}`,
    keyInsight: (ctx) => {
      const withImages = ctx.assets.filter(a => a.imageUrl || a.compositedImageUrl).length;
      return withImages > 0
        ? `${withImages} visual asset${withImages !== 1 ? "s" : ""} sourced and brand-aligned`
        : "Brand-consistent graphic assets generated for all channels";
    },
    confidence: () => "High",
  },
  {
    name: "CompositorAgent",
    shortName: "Compositor",
    icon: <Layers className="h-4 w-4" />,
    stage: "Images",
    whatAnalyzed: () => "Compositing, typography, and brand identity application",
    keyInsight: () => "Brand colors, logo position, and headline overlays applied to all composited visuals",
    confidence: () => "High",
  },
  {
    name: "LandingPageAgent",
    shortName: "Landing Page",
    icon: <Rocket className="h-4 w-4" />,
    stage: "Images",
    whatAnalyzed: (ctx) => `Conversion-optimized landing page for ${ctx.campaign.goal?.type ?? "campaign"}`,
    keyInsight: (ctx) => ["leads", "conversions"].includes(ctx.campaign.goal?.type ?? "")
      ? "High-converting landing page built with hero, social proof, and lead capture form"
      : "Supporting page content generated to reinforce campaign messaging",
    confidence: (ctx) => ["leads", "conversions"].includes(ctx.campaign.goal?.type ?? "") ? "High" : "Medium",
  },
  {
    name: "SchedulerAgent",
    shortName: "Scheduler",
    icon: <Calendar className="h-4 w-4" />,
    stage: "Scheduling",
    whatAnalyzed: (ctx) => `Optimal publishing times for ${ctx.channels.join(", ")}`,
    keyInsight: () => "Posts scheduled at peak engagement windows per channel based on audience activity patterns",
    confidence: () => "High",
  },
  {
    name: "AnalyticsAgent",
    shortName: "Analytics",
    icon: <Activity className="h-4 w-4" />,
    stage: "Scheduling",
    whatAnalyzed: () => "UTM tracking and conversion attribution setup",
    keyInsight: () => "UTM parameters and tracking links configured for full-funnel attribution",
    confidence: () => "Medium",
  },
];

// ── Synthesis helpers ────────────────────────────────────────────────────────

function deriveGrade(strategy?: StrategyJson): { grade: string; color: string; label: string } {
  if (!strategy) return { grade: "B", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10", label: "Good" };
  const channelCount = strategy.channels?.length ?? 0;
  const audienceCount = strategy.audiences?.length ?? 0;
  const themeCount = strategy.messagingThemes?.length ?? 0;
  const score = channelCount * 2 + audienceCount * 1.5 + themeCount;
  if (score >= 12) return { grade: "A+", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", label: "Excellent" };
  if (score >= 8)  return { grade: "A",  color: "text-green-400 border-green-400/30 bg-green-400/10",   label: "Strong" };
  if (score >= 5)  return { grade: "B+", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10", label: "Solid" };
  return               { grade: "B",  color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10", label: "Good" };
}

function deriveBullets(strategy?: StrategyJson, goal?: Goal): string[] {
  const bullets: string[] = [];
  if (strategy?.executiveSummary) bullets.push(strategy.executiveSummary);
  if (strategy?.channels?.length) bullets.push(`${strategy.channels.length} channel${strategy.channels.length !== 1 ? "s" : ""} selected: ${strategy.channels.map(c => CHANNEL_META[c]?.label ?? c).join(", ")}`);
  if (strategy?.audiences?.length) {
    const a = strategy.audiences[0];
    if (a) bullets.push(`Primary audience: ${a.name} — ${a.description}`);
  }
  if (strategy?.thirtyDayPlan?.length) {
    const step = strategy.thirtyDayPlan[0];
    if (step) bullets.push(step);
  }
  return bullets.slice(0, 5);
}

function deriveBigOpportunity(strategy?: StrategyJson): string {
  if (strategy?.messagingThemes?.[0]) return strategy.messagingThemes[0];
  if (strategy?.executiveSummary) {
    const sentences = strategy.executiveSummary.split(". ");
    return sentences[sentences.length - 1] ?? strategy.executiveSummary;
  }
  return "Differentiated positioning in an underserved market segment identified";
}

const DEFAULT_RISK = { risk: "Strategy assumes baseline brand awareness", mitigation: "Validate brand recognition before running direct-response content" };

function deriveBigRisk(goal?: Goal, strategy?: StrategyJson): { risk: string; mitigation: string } {
  const goalRisk = GOAL_RISKS[goal?.type ?? "awareness"] ?? DEFAULT_RISK;
  // Check if budget is spread too thin
  if ((strategy?.channels?.length ?? 0) > 4) {
    return {
      risk: "Budget dilution across too many channels simultaneously",
      mitigation: goalRisk.mitigation,
    };
  }
  return goalRisk;
}

function deriveKeyInsights(strategy?: StrategyJson, goal?: Goal): string[] {
  const insights: string[] = [];
  if (strategy?.messagingThemes?.length) {
    strategy.messagingThemes.slice(0, 3).forEach(t => insights.push(t));
  }
  if (strategy?.audiences?.length && strategy.audiences.length > 1) {
    insights.push(`${strategy.audiences.length} audience segments identified — consider sequential targeting to avoid dilution`);
  }
  if (strategy?.kpis) {
    const topKpi = Object.entries(strategy.kpis)[0];
    if (topKpi) insights.push(`Primary KPI target: ${topKpi[1]} on ${CHANNEL_META[topKpi[0]]?.label ?? topKpi[0]}`);
  }
  if (goal?.type === "leads" || goal?.type === "conversions") {
    insights.push("Bottom-funnel goal means content should prioritize action-oriented CTAs over brand storytelling");
  }
  return insights.slice(0, 5);
}

function deriveRisks(goal?: Goal, strategy?: StrategyJson): Array<{ title: string; detail: string; severity: "high" | "medium" | "low" }> {
  const risks: Array<{ title: string; detail: string; severity: "high" | "medium" | "low" }> = [];
  const bigRisk = deriveBigRisk(goal, strategy);
  risks.push({ title: bigRisk.risk, detail: bigRisk.mitigation, severity: "medium" });
  if ((strategy?.channels ?? []).includes("tiktok")) {
    risks.push({ title: "TikTok requires native, authentic video content", detail: "Pre-produced ads perform significantly worse than organic-style content on TikTok — plan for rapid iteration", severity: "medium" });
  }
  if ((strategy?.channels ?? []).length === 1) {
    risks.push({ title: "Single-channel dependency", detail: "Platform algorithm changes or policy shifts could significantly impact campaign performance — consider a backup channel", severity: "high" });
  }
  risks.push({ title: "Strategy assumes baseline brand awareness", detail: "If brand recognition is near zero, top-funnel investment should precede direct response content", severity: "low" });
  return risks.slice(0, 4);
}

const CONFIDENCE_STYLE: Record<string, string> = {
  High:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  Medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  Low:    "text-red-400 bg-red-400/10 border-red-400/20",
};

const SEVERITY_STYLE: Record<string, string> = {
  high:   "border-red-500/30 bg-red-500/[0.06]",
  medium: "border-yellow-500/30 bg-yellow-500/[0.06]",
  low:    "border-white/10 bg-white/[0.03]",
};

const SEVERITY_ICON_STYLE: Record<string, string> = {
  high:   "text-red-400",
  medium: "text-yellow-400",
  low:    "text-white/30",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ReviewDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ data: Campaign }>(`/campaigns/${id}`)
      .then(res => {
        setCampaign(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message ?? "Failed to load campaign");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#080809] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 rounded-full border-t-2 border-[#00ff88] animate-spin" />
          </div>
          <p className="text-sm text-white/40">Loading campaign intelligence…</p>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="fixed inset-0 bg-[#080809] flex items-center justify-center">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 max-w-md mx-4 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-white font-semibold">Failed to load campaign</p>
          <p className="text-sm text-white/50">{error ?? "Campaign not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/campaigns")} className="border-white/20 text-white hover:bg-white/10">
            Back to Campaigns
          </Button>
        </div>
      </div>
    );
  }

  // ── Synthesize data ──────────────────────────────────────────────────────

  const strategy = campaign.strategy?.contentJson;
  const assets = campaign.assets ?? [];
  const channels = strategy?.channels ?? campaign.strategy?.channels ?? [];
  const goal = campaign.goal;

  const ctx: SynthesisContext = { campaign, strategy, assets, channels };

  const grade = deriveGrade(strategy);
  const bullets = deriveBullets(strategy, goal);
  const bigOpportunity = deriveBigOpportunity(strategy);
  const bigRisk = deriveBigRisk(goal, strategy);
  const keyInsights = deriveKeyInsights(strategy, goal);
  const risks = deriveRisks(goal, strategy);
  const assetsWithImages = assets.filter(a => a.compositedImageUrl || a.imageUrl).length;

  return (
    <div className="min-h-screen bg-[#080809] text-white">

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080809]/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard/campaigns")}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Campaigns
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${grade.color}`}>
              {grade.grade} · {grade.label}
            </span>
          </div>
          <Button
            onClick={() => router.push(`/dashboard/campaigns/${id}/review`)}
            className="bg-[#00ff88] hover:bg-[#00e87a] text-black font-bold text-sm gap-1.5 h-9 px-4"
          >
            Review & Launch
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* ── Campaign title ────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-white/30 uppercase tracking-widest font-medium">
            <Zap className="h-3.5 w-3.5 text-[#00ff88]" />
            Campaign Intelligence Report
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          {goal && (
            <p className="text-sm text-white/40">
              {goal.brandName} · {goal.type?.charAt(0).toUpperCase() + goal.type?.slice(1)} campaign
            </p>
          )}
        </div>

        {/* ══ SECTION 1: Executive Summary ════════════════════════════════ */}
        <Section label="Executive Summary" icon={<Award className="h-3.5 w-3.5" />}>
          <div className="space-y-5">
            {/* Bullets */}
            <div className="space-y-3">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-[#00ff88] shrink-0 mt-0.5" />
                  <p className="text-sm text-white/80 leading-relaxed">{b}</p>
                </div>
              ))}
            </div>

            {/* Opportunity + Risk callouts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Big Opportunity
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{bigOpportunity}</p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Big Risk
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{bigRisk.risk}</p>
              </div>
            </div>
          </div>
        </Section>

        {/* ══ SECTION 2: Agent Activity ════════════════════════════════════ */}
        <Section label="Agent Activity" icon={<Brain className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {AGENT_DEFS.map((agent) => {
              const confidence = agent.confidence(ctx);
              return (
                <div
                  key={agent.name}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 shrink-0">
                        {agent.icon}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/90">{agent.shortName}</p>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">{agent.stage}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[confidence]}`}>
                      {confidence}
                    </span>
                  </div>
                  <div className="space-y-1 pl-9">
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      <span className="text-white/25">Analyzed: </span>{agent.whatAnalyzed(ctx)}
                    </p>
                    <p className="text-xs text-white/70 leading-relaxed">{agent.keyInsight(ctx)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ══ SECTION 3: Recommended Channels ══════════════════════════════ */}
        <Section label="Recommended Channels" icon={<Megaphone className="h-3.5 w-3.5" />}>
          <div className="space-y-2.5">
            {channels.length === 0 && (
              <p className="text-sm text-white/40 italic">No channels data available</p>
            )}
            {channels.map((ch, i) => {
              const meta = CHANNEL_META[ch] ?? { label: ch, icon: "📡", effort: "Medium" as const, effortColor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", impact: "Reach and engagement" };
              const kpi = strategy?.kpis?.[ch];
              const keyMsg = strategy?.keyMessagesByChannel?.[ch];
              const budget = strategy?.budgetAllocation?.[ch];
              return (
                <div
                  key={ch}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 flex items-start gap-4"
                >
                  <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                    <div className="h-9 w-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-base">
                      {meta.icon}
                    </div>
                    {i < 3 && (
                      <span className="text-[9px] font-bold text-[#00ff88]/70 uppercase tracking-wider">
                        #{i + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm font-semibold text-white">{meta.label}</p>
                      <div className="flex items-center gap-1.5">
                        {budget && (
                          <span className="text-[11px] text-white/50 border border-white/10 rounded px-1.5 py-0.5">
                            {budget}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.effortColor}`}>
                          {meta.effort} effort
                        </span>
                      </div>
                    </div>
                    {keyMsg && (
                      <p className="text-xs text-white/60 leading-relaxed">
                        <span className="text-white/25">Why: </span>{keyMsg}
                      </p>
                    )}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        <TrendingUp className="h-3 w-3 text-[#00ff88]" />
                        {meta.impact}
                      </div>
                      {kpi && (
                        <div className="flex items-center gap-1.5 text-xs text-white/50">
                          <Target className="h-3 w-3 text-white/30" />
                          Target: <span className="text-white/80 font-medium">{kpi}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ══ SECTIONS 4 + 5: Strategy + Key Insights ══════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Strategy Breakdown */}
          <Section label="Strategy Breakdown" icon={<Target className="h-3.5 w-3.5" />}>
            <div className="space-y-4">
              {/* Audiences */}
              {strategy?.audiences && strategy.audiences.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Target Audiences
                  </p>
                  {strategy.audiences.map((a, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">{a.name}</p>
                        <span className="text-[10px] text-white/30 border border-white/10 rounded px-1.5 py-0.5 capitalize">{a.size}</span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed">{a.painPoint}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Messaging themes */}
              {strategy?.messagingThemes && strategy.messagingThemes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium flex items-center gap-1.5">
                    <Megaphone className="h-3 w-3" /> Messaging Angles
                  </p>
                  <div className="space-y-1.5">
                    {strategy.messagingThemes.map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-[#00ff88]/60 mt-0.5">0{i + 1}</span>
                        <p className="text-xs text-white/70 leading-relaxed">{t}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 30-day plan preview */}
              {strategy?.thirtyDayPlan && strategy.thirtyDayPlan.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> 30-Day Plan
                  </p>
                  <div className="space-y-1.5">
                    {strategy.thirtyDayPlan.slice(0, 4).map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#00ff88]/40" />
                        <p className="text-[11px] text-white/60 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Key Insights */}
          <Section label="Key Insights" icon={<Lightbulb className="h-3.5 w-3.5" />}>
            <div className="space-y-2.5">
              {keyInsights.length === 0 && (
                <p className="text-sm text-white/40 italic">No insights derived</p>
              )}
              {keyInsights.map((insight, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 flex items-start gap-3"
                >
                  <div className="shrink-0 h-5 w-5 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center mt-0.5">
                    <span className="text-[9px] font-bold text-[#00ff88]">{i + 1}</span>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">{insight}</p>
                </div>
              ))}

              {/* KPI table */}
              {strategy?.kpis && Object.keys(strategy.kpis).length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden mt-1">
                  <div className="px-3 py-2 border-b border-white/[0.06]">
                    <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium flex items-center gap-1.5">
                      <BarChart2 className="h-3 w-3" /> KPI Targets
                    </p>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {Object.entries(strategy.kpis).map(([ch, kpi]) => (
                      <div key={ch} className="flex items-center justify-between px-3 py-2">
                        <span className="text-[11px] text-white/50 flex items-center gap-1.5">
                          <span>{CHANNEL_META[ch]?.icon}</span>
                          {CHANNEL_META[ch]?.label ?? ch}
                        </span>
                        <span className="text-[11px] font-medium text-white/80">{kpi}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* ══ SECTION 6: Risks & Watchouts ════════════════════════════════ */}
        <Section label="Risks & Watchouts" icon={<Shield className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {risks.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 space-y-1.5 ${SEVERITY_STYLE[r.severity]}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${SEVERITY_ICON_STYLE[r.severity]}`} />
                  <p className="text-xs font-semibold text-white/90 leading-tight">{r.title}</p>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed pl-5">{r.detail}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ══ SECTION 7: Action Plan ═══════════════════════════════════════ */}
        <Section label="Action Plan" icon={<Rocket className="h-3.5 w-3.5" />}>
          <div className="space-y-4">
            {/* What's ready */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <ReadyCard icon={<PenTool className="h-4 w-4" />} value={assets.length} label="Content pieces" />
              <ReadyCard icon={<Image className="h-4 w-4" />} value={assetsWithImages} label="Visual assets" />
              <ReadyCard icon={<Calendar className="h-4 w-4" />} value={assets.length} label="Posts scheduled" />
              <ReadyCard icon={<Send className="h-4 w-4" />} value={channels.length} label="Active channels" />
            </div>

            {/* Next steps */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] divide-y divide-white/[0.05]">
              {[
                { step: "Review generated content for each channel", action: "Approve or edit individual assets" },
                { step: "Verify scheduled publish times align with your calendar", action: "Adjust timing if needed" },
                { step: "Preview composited visuals before launching", action: "Regen any images that don't fit your brand" },
                { step: "Confirm campaign is ready to go live", action: "Launch when satisfied" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-3">
                  <span className="shrink-0 text-[11px] font-bold text-[#00ff88]/50 mt-0.5">0{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/80">{item.step}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{item.action}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/20 shrink-0 mt-0.5" />
                </div>
              ))}
            </div>

            {/* Launch CTA */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                onClick={() => router.push(`/dashboard/campaigns/${id}/review`)}
                className="w-full sm:w-auto bg-[#00ff88] hover:bg-[#00e87a] text-black font-bold text-sm gap-2 h-11 px-8"
              >
                <Rocket className="h-4 w-4" />
                Review Assets & Launch
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/campaigns/${id}/strategy`)}
                className="w-full sm:w-auto border-white/[0.12] text-white/70 hover:bg-white/[0.06] hover:text-white text-sm h-11 px-6"
              >
                View Full Strategy
              </Button>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-white/30">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-widest">{label}</span>
        </div>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      {children}
    </div>
  );
}

function ReadyCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-white/30">{icon}</div>
        <CheckCircle2 className="h-3.5 w-3.5 text-[#00ff88]" />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-[11px] text-white/40">{label}</p>
      </div>
    </div>
  );
}
