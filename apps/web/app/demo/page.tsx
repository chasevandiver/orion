"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Zap,
  TrendingUp,
  Users,
  Target,
  BarChart2,
  Brain,
  Search,
  PenTool,
  Image as ImageIcon,
  Layers,
  Calendar,
  ChevronRight,
  ArrowRight,
  Shield,
  AlertTriangle,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import {
  LinkedInPreview,
  TwitterPreview,
  InstagramPreview,
  FacebookPreview,
  EmailPreview,
} from "@/components/platform-previews";

// ── Shared CTA button ─────────────────────────────────────────────────────────

function DemoCTA({ label = "See this for YOUR brand →", className = "" }: { label?: string; className?: string }) {
  return (
    <Link
      href="/auth/register"
      className={`inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#6d28d9] ${className}`}
    >
      {label}
    </Link>
  );
}

function SectionCTA({ label }: { label: string }) {
  return (
    <div className="mt-8 flex justify-center">
      <Link
        href="/auth/register"
        className="group inline-flex items-center gap-2.5 rounded-xl border border-[#7c3aed]/20 bg-[#7c3aed]/5 px-6 py-3 text-sm font-semibold text-[#7c3aed] transition-all hover:border-[#7c3aed]/40 hover:bg-[#7c3aed]/10"
      >
        <Sparkles className="h-4 w-4" />
        {label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function SectionHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 text-center">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/20 bg-[#7c3aed]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#7c3aed]">
        <span className="h-1 w-1 rounded-full bg-[#7c3aed]" />
        {eyebrow}
      </div>
      <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
      {sub && <p className="mx-auto mt-3 max-w-xl text-sm text-white/50">{sub}</p>}
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function DemoNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080809]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "16px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #ffffff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span><span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "16px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
          <span className="hidden text-xs text-white/30 sm:block">AI Marketing OS</span>
        </Link>
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className="hidden sm:block">Interactive Demo · Bloom Coffee Co.</span>
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#7c3aed] animate-pulse" />
        </div>
        <DemoCTA label="Start Free →" />
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function DemoHero() {
  return (
    <section className="relative overflow-hidden bg-[#080809] px-6 py-20 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[800px] rounded-full bg-[#7c3aed]/4 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/50">
          ☕ Real campaign · Real brand · Zero login required
        </div>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          See STELOS in action for{" "}
          <span className="text-[#7c3aed]">Bloom Coffee Co.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-white/50">
          Portland's artisan coffee roastery typed one goal. STELOS's 13 AI agents ran a full
          campaign — strategy, 7-channel content, branded visuals, and analytics — in under 5 minutes.
          This is the real output.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <DemoCTA label="Run STELOS for my brand →" className="text-base px-7 py-3.5" />
          <a
            href="#war-room"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-7 py-3.5 text-base font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            Watch the pipeline run
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        {/* Goal input mockup */}
        <div className="mx-auto mt-14 max-w-xl overflow-hidden rounded-xl border border-white/[0.07] bg-[#0e0e10] text-left">
          <div className="border-b border-white/[0.05] px-4 py-2.5 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]/50" />
            <span className="ml-2 text-[11px] text-white/20 font-mono">STELOS — Goal Runner</span>
          </div>
          <div className="p-4 font-mono text-sm space-y-2">
            <div className="flex gap-2">
              <span className="text-[#7c3aed]">$</span>
              <span className="text-white/40">orion run </span>
              <span className="text-white/80">"Build brand awareness for Bloom Coffee Co. in Portland"</span>
            </div>
            <div className="space-y-1 text-xs text-white/30">
              <div><span className="text-[#7c3aed]">✓</span> Goal analyzed · type: awareness · budget: $3,500</div>
              <div><span className="text-[#7c3aed]">✓</span> 3 audience segments identified</div>
              <div><span className="text-[#7c3aed]">✓</span> Competitive landscape mapped</div>
              <div><span className="text-[#7c3aed]">✓</span> Strategy + 7-channel content generated</div>
              <div><span className="text-[#7c3aed]">✓</span> Branded visuals composited</div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#7c3aed]" />
                <span>Campaign live · 61,400 people reached · 23% above target</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── War Room ──────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    id: "research",
    label: "Research",
    duration: 1800,
    agents: [
      { name: "CompetitorIntelligenceAgent", desc: "Mapping Stumptown, Water Avenue, Case Study Coffee" },
      { name: "TrendResearchAgent", desc: "Identifying spring 2026 specialty coffee trends" },
    ],
    output: "Competitor gaps identified · 3 whitespace opportunities surfaced",
  },
  {
    id: "strategy",
    label: "Strategy",
    duration: 2000,
    agents: [
      { name: "MarketingStrategistAgent", desc: "Building full go-to-market plan for 30-day awareness push" },
      { name: "SEOAgent", desc: "Targeting 'specialty coffee Portland', 'coffee subscription box'" },
    ],
    output: "7-channel strategy · 30-day content calendar · KPIs set",
  },
  {
    id: "content",
    label: "Content",
    duration: 2200,
    agents: [
      { name: "ContentCreatorAgent ×7", desc: "LinkedIn, Twitter, Instagram, Facebook, Email, Blog, TikTok" },
      { name: "BrandVoiceAgent", desc: "Applying warm, craft-focused tone across all channels" },
    ],
    output: "7 channel-native content pieces · A/B variants ready",
  },
  {
    id: "assets",
    label: "Assets",
    duration: 1900,
    agents: [
      { name: "ImageGeneratorAgent", desc: "Generating branded visuals — earthy tones, saddle brown palette" },
      { name: "CompositorAgent", desc: "Compositing logo, headline overlays, channel dimensions" },
    ],
    output: "7 composited visual assets · Ready for review",
  },
  {
    id: "scheduling",
    label: "Scheduling",
    duration: 1400,
    agents: [
      { name: "SchedulerAgent", desc: "Calculating peak engagement windows per channel" },
      { name: "AnalyticsAgent", desc: "Configuring UTM tracking and conversion attribution" },
    ],
    output: "7 posts scheduled · UTM parameters set · Campaign live",
  },
];

function WarRoomSection() {
  const [currentStage, setCurrentStage] = useState(-1);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let idx = 0;
    function advance() {
      setCurrentStage(idx);
      const stage = PIPELINE_STAGES[idx];
      if (!stage) return;
      setTimeout(() => {
        idx++;
        if (idx < PIPELINE_STAGES.length) {
          advance();
        } else {
          setCurrentStage(PIPELINE_STAGES.length); // all done
          setDone(true);
        }
      }, stage.duration);
    }

    setTimeout(advance, 600);
  }, []);

  return (
    <section id="war-room" className="bg-[#080809] px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <SectionHeader
          eyebrow="Live Pipeline"
          title="Watch STELOS build the campaign"
          sub="13 agents run in a coordinated pipeline — each one hands off context to the next."
        />

        {/* Pipeline stages */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c0e] overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${done ? "bg-[#7c3aed]" : currentStage >= 0 ? "bg-[#7c3aed] animate-pulse" : "bg-white/20"}`} />
              <span className="text-xs font-mono text-white/40">
                {done ? "Campaign complete · all stages passed" : currentStage >= 0 ? `Stage ${Math.min(currentStage + 1, PIPELINE_STAGES.length)} / ${PIPELINE_STAGES.length} running…` : "Initializing…"}
              </span>
            </div>
            {done && (
              <span className="text-xs text-[#7c3aed] font-semibold">✓ 61,400 reached · 23% above target</span>
            )}
          </div>

          <div className="divide-y divide-white/[0.04]">
            {PIPELINE_STAGES.map((stage, i) => {
              const isComplete = currentStage > i || done;
              const isActive = currentStage === i && !done;
              const isPending = currentStage < i && !done;

              return (
                <div key={stage.id} className={`px-5 py-4 transition-all duration-500 ${isActive ? "bg-[#7c3aed]/[0.03]" : ""}`}>
                  <div className="flex items-start gap-4">
                    {/* Stage icon */}
                    <div className="mt-0.5 shrink-0">
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-[#7c3aed]" />
                      ) : isActive ? (
                        <Loader2 className="h-5 w-5 text-[#7c3aed] animate-spin" />
                      ) : (
                        <Circle className="h-5 w-5 text-white/15" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Stage label */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-bold ${isComplete ? "text-white" : isActive ? "text-white" : "text-white/30"}`}>
                          Stage {i + 1} — {stage.label}
                        </span>
                        {isActive && (
                          <span className="text-[10px] text-[#7c3aed] bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-full px-2 py-0.5">
                            Running
                          </span>
                        )}
                        {isComplete && (
                          <span className="text-[10px] text-white/30 bg-white/5 rounded-full px-2 py-0.5">
                            Complete
                          </span>
                        )}
                      </div>

                      {/* Agents */}
                      <div className={`space-y-1.5 ${isPending ? "opacity-30" : ""}`}>
                        {stage.agents.map((agent) => (
                          <div key={agent.name} className="flex items-start gap-2">
                            <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${isComplete ? "bg-[#7c3aed]/60" : isActive ? "bg-[#7c3aed] animate-pulse" : "bg-white/15"}`} />
                            <div>
                              <span className={`text-xs font-mono font-semibold ${isActive || isComplete ? "text-[#38bdf8]" : "text-white/30"}`}>
                                {agent.name}
                              </span>
                              <span className={`text-xs ml-2 ${isActive || isComplete ? "text-white/50" : "text-white/20"}`}>
                                — {agent.desc}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Output */}
                      {isComplete && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7c3aed]/70">
                          <CheckCircle2 className="h-3 w-3" />
                          {stage.output}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Done banner */}
          {done && (
            <div className="border-t border-[#7c3aed]/20 bg-[#7c3aed]/5 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-[#7c3aed]" />
                <div>
                  <p className="text-sm font-bold text-[#7c3aed]">Campaign live · Spring Bloom Awareness</p>
                  <p className="text-xs text-white/40 mt-0.5">7 channels · 12 assets · 61,400 people reached</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-[#7c3aed]">4m 32s</p>
                <p className="text-[10px] text-white/30">pipeline runtime</p>
              </div>
            </div>
          )}
        </div>

        <SectionCTA label="Run the pipeline for YOUR brand" />
      </div>
    </section>
  );
}

// ── Strategy ──────────────────────────────────────────────────────────────────

const STRATEGY_DATA = {
  executiveSummary:
    "Grow brand recognition across Portland and online coffee communities. Lead with warmth and craft: \"Every cup is a handshake with the farmer who grew it.\" Reach 50,000 new people in 30 days across 7 channels.",
  channels: [
    { name: "Instagram", pct: 35, kpi: "+800 followers", color: "bg-pink-500" },
    { name: "Facebook", pct: 20, kpi: "2× weekly posts", color: "bg-[#1877f2]" },
    { name: "LinkedIn", pct: 15, kpi: "+B2B reach", color: "bg-[#0a66c2]" },
    { name: "Twitter", pct: 10, kpi: "Conversation driver", color: "bg-black border border-white/10" },
    { name: "Email", pct: 10, kpi: "+300 subscribers", color: "bg-violet-500" },
    { name: "Blog", pct: 7, kpi: "2,500 sessions", color: "bg-amber-500" },
    { name: "TikTok", pct: 3, kpi: "Behind-the-scenes", color: "bg-rose-500" },
  ],
  audiences: [
    { name: "Remote Workers", desc: "Ages 25–40, urban professionals, café as productivity tool", size: "Large", channels: "Instagram, Twitter, Email" },
    { name: "Coffee Enthusiasts", desc: "Ages 30–55, hobbyist baristas, care about origin & transparency", size: "Medium", channels: "Instagram, Blog, Email" },
    { name: "Local Families", desc: "Ages 30–50, Portland parents, weekend café visits", size: "Medium", channels: "Facebook, Instagram" },
  ],
  hooks: [
    "Every cup is a handshake with the farmer who grew it.",
    "Small batch. Big story.",
    "Your morning ritual, rooted in something real.",
  ],
  kpis: [
    { label: "Total Reach", target: "50,000+", actual: "61,400", beat: true },
    { label: "IG Followers", target: "+800", actual: "+934", beat: true },
    { label: "Email Subs", target: "+300", actual: "+287", beat: false },
    { label: "Blog Sessions", target: "2,500", actual: "3,100", beat: true },
  ],
};

function StrategySection() {
  return (
    <section className="bg-[#0c0c0e] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          eyebrow="AI Strategy"
          title="A complete go-to-market plan — in seconds"
          sub="MarketingStrategistAgent synthesized the competitive landscape, audience data, and brand voice into a full 30-day strategy."
        />

        {/* Summary card */}
        <div className="mb-6 rounded-xl border border-[#7c3aed]/15 bg-[#7c3aed]/[0.04] p-5">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-[#7c3aed] shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#7c3aed]/60 font-bold mb-1">Executive Summary</p>
              <p className="text-sm text-white/80 leading-relaxed">{STRATEGY_DATA.executiveSummary}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Channel mix */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] p-5 space-y-4">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Channel Mix
            </p>
            {STRATEGY_DATA.channels.map((ch) => (
              <div key={ch.name} className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-xs font-medium text-white/80">{ch.name}</p>
                  <p className="text-[10px] text-white/30">{ch.kpi}</p>
                </div>
                <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${ch.color}`} style={{ width: `${ch.pct * 2.5}%` }} />
                </div>
                <span className="text-xs text-white/40 w-8 text-right">{ch.pct}%</span>
              </div>
            ))}
          </div>

          {/* Audiences */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Target Audiences
            </p>
            {STRATEGY_DATA.audiences.map((a) => (
              <div key={a.name} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{a.name}</p>
                  <span className="text-[10px] text-white/30 border border-white/10 rounded px-1.5 py-0.5">{a.size}</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{a.desc}</p>
                <p className="text-[10px] text-[#38bdf8]/70 mt-1.5">{a.channels}</p>
              </div>
            ))}
          </div>

          {/* Messaging hooks */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> Messaging Hooks
            </p>
            {STRATEGY_DATA.hooks.map((h, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold text-[#7c3aed]/50 mt-0.5 shrink-0">0{i + 1}</span>
                <p className="text-sm text-white/70 leading-relaxed italic">"{h}"</p>
              </div>
            ))}
          </div>

          {/* KPI results */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" /> KPI Results
            </p>
            {STRATEGY_DATA.kpis.map((kpi) => (
              <div key={kpi.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-xs text-white/60">{kpi.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/30">target: {kpi.target}</span>
                  <span className={`text-xs font-bold ${kpi.beat ? "text-[#7c3aed]" : "text-amber-400"}`}>
                    {kpi.beat ? "✓" : "~"} {kpi.actual}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <SectionCTA label="Generate a strategy for YOUR brand" />
      </div>
    </section>
  );
}

// ── Content Previews ──────────────────────────────────────────────────────────

const CONTENT_ASSETS = [
  {
    channel: "linkedin" as const,
    content: `There's a farm in Ethiopia's Yirgacheffe region where coffee cherries are still hand-sorted by the farmers who planted them.

We visited last October. We shook hands, tasted the harvest, and made a commitment: to pay above fair-trade prices every year we work together.

That relationship is in every shot of espresso we pour.

At Bloom Coffee Co., we believe transparency isn't a marketing term — it's a supply chain practice.

This spring, come in and taste the story. We'll have tasting notes on the counter and a QR code that takes you straight to the farm.

#SpecialtyCoffee #DirectTrade #Portland`,
  },
  {
    channel: "twitter" as const,
    content: `hot take: the best coffee you've ever had was probably at a place you almost didn't walk into

a slightly scruffy door. no corporate logo. maybe a hand-painted sign.

that's us. come find out why Portland keeps coming back ☕`,
  },
  {
    channel: "instagram" as const,
    content: `Spring in the roaster. 🌸

We just finished our first batch of the new Ethiopia Yirgacheffe and the notes are wild — jasmine, lemon curd, and a finish like fresh strawberries.

It'll be on the pour-over bar starting Thursday. First 20 orders get tasting notes from the farm.

Link in bio to pre-order a 250g bag before it sells out (last batch went in 48 hours).

#BloomCoffeeCo #SpecialtyCoffee #YirgacheffeEthiopia #Portland #CoffeeRoaster #ThirdWaveCoffee`,
  },
  {
    channel: "facebook" as const,
    content: `🌷 Spring is here — and so is our new seasonal menu!

We've added three new drinks to celebrate the season:

☕ Lavender Oat Latte — our most-requested seasonal return
🧊 Cold Brew Lemonade — bright, citrusy, and dangerously refreshing
🍓 Strawberry Matcha — local strawberry syrup, ceremonial grade matcha

Plus our Easter Family Brunch is back: April 20th, 9am–2pm. Kids eat free with any adult entrée purchase.

Tag a friend who needs a coffee date this weekend 👇`,
  },
  {
    channel: "email" as const,
    content: `SUBJECT: The spring harvest is in (and it's our best yet)
PREVIEW: Ethiopia Yirgacheffe, lavender lattes, and a note from Maya
---
Hi there,

Every spring, we wait for this moment.

The new harvest from our friends at Daye Bensa farm in Ethiopia's Yirgacheffe region has arrived. We tasted it last week and the room went quiet — jasmine, citrus, a long bright finish. It's the kind of coffee that makes you stop mid-sip and just appreciate it.

What's new this season:

• Ethiopia Yirgacheffe (Daye Bensa) — available Thursday on pour-over and as whole beans
• Lavender Oat Latte is back — our most-requested seasonal drink
• Cold Brew Lemonade — new this year, bright and citrusy
• Easter Family Brunch — April 20th, kids eat free

For subscribers: You get first access to the Yirgacheffe before it hits the shelf. Reply to this email with SPRING and we'll hold a 250g bag for you at the counter.

With warmth,
Maya Bloom
Bloom Coffee Co.

PS: We're donating 50¢ from every seasonal drink sold this month to the Portland Coffee Community Fund.`,
  },
];

const CHANNEL_LABELS: Record<string, string> = {
  linkedin: "💼 LinkedIn",
  twitter: "𝕏 Twitter / X",
  instagram: "📸 Instagram",
  facebook: "📘 Facebook",
  email: "📧 Email",
};

function ContentSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = CONTENT_ASSETS[activeIdx]!;

  return (
    <section className="bg-[#080809] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          eyebrow="Channel Content"
          title="Platform-native copy for every channel"
          sub="ContentCreatorAgent wrote channel-specific copy for each platform — not generic text pasted everywhere."
        />

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* Channel tabs */}
          <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0">
            {CONTENT_ASSETS.map((asset, i) => (
              <button
                key={asset.channel}
                onClick={() => setActiveIdx(i)}
                className={`flex-shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition-all ${
                  activeIdx === i
                    ? "border-[#7c3aed]/30 bg-[#7c3aed]/[0.06] text-[#7c3aed]"
                    : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/10 hover:text-white/70"
                }`}
              >
                {CHANNEL_LABELS[asset.channel]}
              </button>
            ))}
            <div className="hidden lg:block mt-3 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3">
              <p className="text-[10px] text-amber-400/70 leading-relaxed">
                <span className="font-bold text-amber-400">Also generated:</span><br />
                Blog post · TikTok script · A/B variants for LinkedIn + Email
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/30 font-mono">
                Generated by <span className="text-[#38bdf8]">ContentCreatorAgent</span> · claude-sonnet-4-6
              </p>
            </div>
            <div className="overflow-hidden">
              {active.channel === "linkedin" && (
                <LinkedInPreview content={active.content} brandName="Bloom Coffee Co." channel="linkedin" />
              )}
              {active.channel === "twitter" && (
                <TwitterPreview content={active.content} brandName="Bloom Coffee Co." channel="twitter" />
              )}
              {active.channel === "instagram" && (
                <InstagramPreview content={active.content} brandName="Bloom Coffee Co." channel="instagram" />
              )}
              {active.channel === "facebook" && (
                <FacebookPreview content={active.content} brandName="Bloom Coffee Co." channel="facebook" />
              )}
              {active.channel === "email" && (
                <EmailPreview content={active.content} brandName="Bloom Coffee Co." channel="email" />
              )}
            </div>
          </div>
        </div>

        <SectionCTA label="Generate content for YOUR brand" />
      </div>
    </section>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────

const ANALYTICS_CHANNELS = [
  { name: "Instagram", icon: "📸", impressions: 14200, engagement: "2.1%", grade: "A", gradeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/[0.08]", barW: 100 },
  { name: "TikTok",    icon: "🎵", impressions: 21600, engagement: "Reach", grade: "B+", gradeColor: "text-yellow-400 border-yellow-400/30 bg-yellow-400/[0.08]", barW: 90 },
  { name: "Blog",      icon: "✍️", impressions: 3100,  engagement: "5:43 avg",  grade: "A",  gradeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/[0.08]", barW: 78 },
  { name: "Facebook",  icon: "📘", impressions: 9800,  engagement: "1.2%", grade: "B+", gradeColor: "text-yellow-400 border-yellow-400/30 bg-yellow-400/[0.08]", barW: 69 },
  { name: "Twitter",   icon: "𝕏",  impressions: 5200,  engagement: "1.8%", grade: "B",  gradeColor: "text-yellow-400 border-yellow-400/30 bg-yellow-400/[0.08]", barW: 55 },
  { name: "LinkedIn",  icon: "💼", impressions: 7600,  engagement: "0.7%",  grade: "B-", gradeColor: "text-amber-400 border-amber-400/30 bg-amber-400/[0.08]", barW: 48 },
  { name: "Email",     icon: "📧", impressions: 450,   engagement: "22.4% open", grade: "A-", gradeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/[0.08]", barW: 62 },
];

const TOP_INSIGHTS = [
  { text: "Instagram Reels outperformed static images by 3.2× on reach — prioritize video next campaign.", priority: "high" },
  { text: "Email subscribers who opened the spring newsletter were 4.7× more likely to visit the Coffee Club page.", priority: "high" },
  { text: "The Yirgacheffe blog post generated 1,240 organic sessions — 40% of total blog traffic. Expand origin series.", priority: "medium" },
  { text: "LinkedIn CTR (0.7%) was below 1.2% target — test shorter copy and stronger CTAs in Campaign 2.", priority: "medium" },
  { text: "Facebook post with Easter Brunch event had 2.4× engagement rate vs average — local event content resonates.", priority: "low" },
];

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-white/30",
};

function AnalyticsSection() {
  return (
    <section className="bg-[#0c0c0e] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          eyebrow="Campaign Analytics"
          title="Real-time performance across all 7 channels"
          sub="STELOS's OptimizationAgent surfaces exactly what worked and what to do next."
        />

        {/* Top metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Reach", value: "61,400", sub: "+23% vs target", green: true },
            { label: "Avg Engagement", value: "1.8%", sub: "vs 1.2% benchmark", green: true },
            { label: "Email Open Rate", value: "22.4%", sub: "Industry avg: 18%", green: true },
            { label: "CPA (leads)", value: "$28.40", sub: "Target ≤ $31", green: true },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-white/[0.07] bg-[#0e0e10] p-4">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{m.label}</p>
              <p className="text-2xl font-black text-white">{m.value}</p>
              <p className={`text-[11px] mt-1 ${m.green ? "text-[#7c3aed]" : "text-amber-400"}`}>{m.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Channel performance table */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] overflow-hidden">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Channel Performance</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {ANALYTICS_CHANNELS.map((ch) => (
                <div key={ch.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-base w-6 text-center shrink-0">{ch.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white/80">{ch.name}</span>
                      <span className="text-[11px] text-white/40">
                        {ch.impressions.toLocaleString()} · {ch.engagement}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#7c3aed]/50"
                        style={{ width: `${ch.barW}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 shrink-0 ${ch.gradeColor}`}>
                    {ch.grade}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0e0e10] overflow-hidden">
            <div className="border-b border-white/[0.05] px-4 py-3 flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-[#7c3aed]" />
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold">AI Insights</p>
              <span className="ml-auto text-[10px] text-[#7c3aed]/50">OptimizationAgent</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {TOP_INSIGHTS.map((ins, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${PRIORITY_STYLE[ins.priority]}`} />
                  <p className="text-xs text-white/60 leading-relaxed">{ins.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#0e0e10] p-5">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-4 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Recommended Next Actions
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              { priority: "high", action: "Launch a second origin story blog post (Colombia or Guatemala) within 2 weeks" },
              { priority: "high", action: "Repurpose Yirgacheffe email content into a LinkedIn carousel post" },
              { priority: "medium", action: "Test Instagram Reel (roasting b-roll) vs static post for Coffee Club campaign" },
              { priority: "medium", action: "Increase email send frequency from weekly to twice-weekly during active campaigns" },
            ].map((r, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${
                r.priority === "high" ? "border-red-500/20 bg-red-500/[0.04]" : "border-amber-400/15 bg-amber-400/[0.04]"
              }`}>
                <span className={`text-[10px] font-bold uppercase shrink-0 mt-0.5 ${r.priority === "high" ? "text-red-400" : "text-amber-400"}`}>
                  {r.priority}
                </span>
                <p className="text-xs text-white/60 leading-relaxed">{r.action}</p>
              </div>
            ))}
          </div>
        </div>

        <SectionCTA label="Track YOUR campaign performance with STELOS" />
      </div>
    </section>
  );
}

// ── Competitor Intelligence ───────────────────────────────────────────────────

const COMPETITORS = [
  {
    name: "Stumptown Coffee Roasters",
    type: "National Brand",
    strength: "Wide distribution, strong brand recognition, loyal following",
    weakness: "Acquired by JAB Holdings — authenticity concerns, less community feel, formulaic content",
    content: "Polished product photography, holiday campaigns, no origin storytelling",
    gap: "Direct-trade transparency — Stumptown doesn't disclose farm-gate prices",
    score: 71,
    threat: "medium" as const,
  },
  {
    name: "Water Avenue Coffee",
    type: "Local Roaster",
    strength: "Loyal Portland following, quality-focused, established café locations",
    weakness: "Minimal online presence, no subscription program, infrequent social posting",
    content: "Inconsistent Instagram, no blog, no email list",
    gap: "Digital channels & subscription monetization completely untapped",
    score: 45,
    threat: "low" as const,
  },
  {
    name: "Case Study Coffee",
    type: "Design-Forward Roaster",
    strength: "Iconic Portland brand, strong visual aesthetic, cult following",
    weakness: "Premium pricing without transparent value narrative, no long-form content",
    content: "Aesthetic Instagram only — no email, no blog, no LinkedIn presence",
    gap: "Corporate / B2B team subscription angle — completely unclaimed",
    score: 58,
    threat: "medium" as const,
  },
];

const WHITESPACE = [
  {
    title: "Direct-Trade Transparency",
    desc: "No local roaster publishes what they pay farmers. Bloom's above-fair-trade pricing is a differentiator if made visible.",
    channel: "Blog + LinkedIn",
    value: "High",
  },
  {
    title: "Corporate Team Subscriptions",
    desc: "Remote-first companies in Portland are buying coffee for distributed teams. Zero competitors targeting this segment.",
    channel: "LinkedIn + Email",
    value: "High",
  },
  {
    title: "Origin Content Series",
    desc: "No local roaster is running a blog series on farm origin. Yirgacheffe piece already ranking — double down.",
    channel: "Blog + Instagram",
    value: "Medium",
  },
  {
    title: "Behind-the-Scenes Video",
    desc: "Roasting process content performs 3× better than product shots on TikTok. No Portland roaster owns this niche.",
    channel: "TikTok + Instagram",
    value: "Medium",
  },
];

const THREAT_STYLE: Record<string, string> = {
  low: "text-green-400 border-green-400/20 bg-green-400/[0.06]",
  medium: "text-amber-400 border-amber-400/20 bg-amber-400/[0.06]",
  high: "text-red-400 border-red-400/20 bg-red-400/[0.06]",
};

function CompetitorIntelSection() {
  return (
    <section className="bg-[#080809] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          eyebrow="Competitive Intelligence"
          title="Know your competitive landscape before you post"
          sub="CompetitorIntelligenceAgent mapped the Portland specialty coffee market and identified 4 unclaimed content opportunities."
        />

        {/* Competitor cards */}
        <div className="mb-8 space-y-4">
          {COMPETITORS.map((comp) => (
            <div key={comp.name} className="rounded-xl border border-white/[0.07] bg-[#0c0c0e] p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm font-bold text-white">{comp.name}</p>
                  <p className="text-xs text-white/30 mt-0.5">{comp.type}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xl font-black text-white">{comp.score}</p>
                    <p className="text-[10px] text-white/30">threat score</p>
                  </div>
                  <span className={`text-[10px] font-bold border rounded-full px-2.5 py-1 ${THREAT_STYLE[comp.threat]}`}>
                    {comp.threat} threat
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Strengths</p>
                  <p className="text-white/60 leading-relaxed">{comp.strength}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Weaknesses</p>
                  <p className="text-white/60 leading-relaxed">{comp.weakness}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#7c3aed]/50 uppercase tracking-wider mb-1">Gap we can own</p>
                  <p className="text-[#7c3aed]/70 leading-relaxed font-medium">{comp.gap}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Whitespace opportunities */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-1.5 mb-4">
            <Search className="h-3.5 w-3.5" /> Unclaimed Market Opportunities
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {WHITESPACE.map((w) => (
              <div key={w.title} className="rounded-xl border border-[#7c3aed]/10 bg-[#7c3aed]/[0.03] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-bold text-white">{w.title}</p>
                  <span className={`shrink-0 text-[10px] font-bold border rounded px-1.5 py-0.5 ${w.value === "High" ? "text-[#7c3aed] border-[#7c3aed]/30 bg-[#7c3aed]/10" : "text-amber-400 border-amber-400/30 bg-amber-400/10"}`}>
                    {w.value} value
                  </span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed mb-2">{w.desc}</p>
                <p className="text-[10px] text-[#38bdf8]/70 font-medium">Best channel: {w.channel}</p>
              </div>
            ))}
          </div>
        </div>

        <SectionCTA label="Map YOUR competitive landscape with STELOS" />
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-[#0c0c0e] px-6 py-24 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-full bg-[#7c3aed]/5 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/20 bg-[#7c3aed]/5 px-4 py-1.5 text-xs font-medium text-[#7c3aed]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7c3aed] animate-pulse" />
          Ready to run STELOS for your brand?
        </div>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          What you just saw?{" "}
          <span className="text-[#7c3aed]">That's your campaign.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base text-white/50">
          Bloom Coffee Co. typed one goal. In under 5 minutes STELOS built their full spring
          campaign. Your brand is next.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-8 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#6d28d9]"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-8 py-3.5 text-base font-medium text-white/50 transition-colors hover:border-white/20 hover:text-white"
          >
            Learn more about STELOS
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/25">Free tier available · No credit card required</p>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#080809] text-white">
      <DemoNav />
      <main>
        <DemoHero />
        <WarRoomSection />
        <StrategySection />
        <ContentSection />
        <AnalyticsSection />
        <CompetitorIntelSection />
        <FinalCTA />
      </main>
      <footer className="border-t border-white/[0.05] bg-[#080809] px-6 py-8 text-center">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between max-w-5xl mx-auto">
          <Link href="/" className="flex items-baseline gap-0">
            <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "14px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #ffffff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
            <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "14px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
          </Link>
          <div className="flex gap-6 text-xs text-white/30">
            <Link href="/auth/login" className="hover:text-white transition-colors">Login</Link>
            <Link href="/auth/register" className="hover:text-white transition-colors">Get Started</Link>
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
          </div>
          <p className="text-xs text-white/20">Demo data is simulated. All content © Bloom Coffee Co. (fictional).</p>
        </div>
      </footer>
    </div>
  );
}
