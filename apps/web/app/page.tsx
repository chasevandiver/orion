import Link from "next/link";
import { StelosGem } from "@/components/ui/stelos-gem";
import { StelosHeroLogo } from "@/components/ui/stelos-hero-logo";

export const metadata = {
  title: "STELOS — AI Marketing OS",
  description:
    "Type a goal. Get a complete marketing campaign in under 5 minutes. 13 specialized AI agents handle strategy, content, assets, and publishing across 7 channels.",
};

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-orion-border bg-orion-dark/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <StelosGem size={28} />
          <div className="h-7 w-px bg-gradient-to-b from-transparent via-violet-500/40 to-transparent" />
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "20px", letterSpacing: "-1px", lineHeight: 1, background: "linear-gradient(135deg, #ffffff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "20px", letterSpacing: "-1px", lineHeight: 1, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
          <span className="hidden text-xs font-medium text-muted-foreground sm:block ml-0.5">
            AI Marketing OS
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/demo"
            className="rounded-md px-4 py-2 text-sm font-medium text-orion-green transition-colors hover:text-orion-green/80"
          >
            Live Demo
          </Link>
          <Link
            href="/auth/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="rounded-md bg-orion-green px-4 py-2 text-sm font-semibold text-orion-dark transition-colors hover:bg-orion-green-dim"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-orion-dark px-6 py-28 text-center sm:py-40">
      {/* Radial glow behind headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[600px] w-[900px] rounded-full bg-orion-green/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl">
        <StelosHeroLogo />

        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orion-green/20 bg-orion-green/5 px-4 py-1.5 text-xs font-medium text-orion-green">
          <span className="h-1.5 w-1.5 rounded-full bg-orion-green" />
          13 specialized AI agents · 7 channels · one platform
        </div>

        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Type a goal.{" "}
          <span className="text-gradient">Get a complete marketing campaign</span>{" "}
          in under 5 minutes.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          STELOS turns a single sentence into a full-stack marketing campaign — strategy,
          multi-channel content, branded assets, and publish scheduling — all driven by AI agents
          that learn from your results.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/auth/register"
            className="w-full rounded-md bg-orion-green px-8 py-3.5 text-base font-semibold text-orion-dark transition-colors hover:bg-orion-green-dim sm:w-auto"
          >
            Get Started Free
          </Link>
          <a
            href="#how-it-works"
            className="w-full rounded-md border border-orion-border px-8 py-3.5 text-base font-medium text-foreground transition-colors hover:border-orion-green/40 hover:text-orion-green sm:w-auto"
          >
            See How It Works
          </a>
        </div>
        <div className="mt-4 flex justify-center">
          <Link
            href="/demo"
            className="inline-flex items-center gap-1.5 text-sm text-orion-green/70 transition-colors hover:text-orion-green"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-orion-green animate-pulse" />
            Try the interactive demo — Bloom Coffee Co.
          </Link>
        </div>

        {/* Terminal mockup */}
        <div className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-xl border border-orion-border bg-orion-dark-2 text-left shadow-2xl">
          <div className="flex items-center gap-1.5 border-b border-orion-border px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <span className="h-3 w-3 rounded-full bg-orion-green/60" />
            <span className="ml-3 text-xs text-muted-foreground">stelos — goal runner</span>
          </div>
          <div className="space-y-3 p-5 font-mono text-sm">
            <div className="flex gap-2">
              <span className="text-orion-green">$</span>
              <span className="text-muted-foreground">stelos run</span>
              <span className="text-foreground">"Launch our B2B SaaS product to startup founders"</span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>
                <span className="text-orion-green">✓</span> MarketingStrategist —{" "}
                <span className="text-orion-blue">positioning &amp; ICP complete</span>
              </div>
              <div>
                <span className="text-orion-green">✓</span> ContentCreator ×7 —{" "}
                <span className="text-orion-blue">LinkedIn · Twitter · Email · Blog · ...</span>
              </div>
              <div>
                <span className="text-orion-green">✓</span> ImageGenerator ×7 —{" "}
                <span className="text-orion-blue">branded visuals composited</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orion-green" />
                <span>Scheduling 14 posts across 7 channels…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Problem ───────────────────────────────────────────────────────────────────

const FRAGMENTED_TOOLS = [
  { name: "ChatGPT", desc: "Copy prompts" },
  { name: "Canva", desc: "Design assets" },
  { name: "Hootsuite", desc: "Scheduling" },
  { name: "Mailchimp", desc: "Email campaigns" },
  { name: "Google Analytics", desc: "Performance" },
  { name: "Airtable", desc: "Campaign tracking" },
];

function Problem() {
  return (
    <section className="bg-orion-dark-2 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            The{" "}
            <span className="text-orion-red line-through decoration-red-400">
              Frankenstein stack
            </span>{" "}
            is killing your marketing.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Most teams juggle 6–10 disconnected tools, losing hours to copy-paste, context
            switching, and misaligned messaging. STELOS replaces the entire stack.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          {/* Before */}
          <div className="space-y-3">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-red-400">
              Before STELOS
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FRAGMENTED_TOOLS.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-1 rounded-lg border border-red-500/20 bg-red-500/5 p-3 opacity-70"
                >
                  <span className="text-sm font-semibold text-foreground/80">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-red-400">
              6 logins · 6 invoices · 6 learning curves · zero shared context
            </p>
          </div>

          {/* After */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-orion-green">
              With STELOS
            </p>
            <div className="rounded-xl border border-orion-green/20 bg-orion-green/5 p-6 card-glow">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black" style={{ fontFamily: "var(--font-brand)", background: "linear-gradient(135deg, #ffffff, #c4b5fd, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STELOS</span>
                <span className="rounded-full border border-orion-green/30 bg-orion-green/10 px-2.5 py-0.5 text-xs text-orion-green">
                  AI Marketing OS
                </span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {[
                  "Strategy & ICP research",
                  "Multi-channel content generation",
                  "Branded asset creation",
                  "CRM & lead scoring",
                  "Automated publishing",
                  "Performance analytics & optimization",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orion-green text-[10px] font-bold text-orion-dark">
                      ✓
                    </span>
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-orion-green">
                1 platform · 1 subscription · everything in sync
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    title: "Set Your Goal",
    desc: "Describe your campaign objective in plain English. STELOS understands brand, audience, and intent.",
  },
  {
    n: "02",
    title: "AI Research",
    desc: "The Strategist agent analyzes your ICP, competitive landscape, and top-performing content patterns.",
  },
  {
    n: "03",
    title: "Strategy Generated",
    desc: "A full marketing strategy — positioning, messaging pillars, channel mix, and a 4-week calendar.",
  },
  {
    n: "04",
    title: "Content Created",
    desc: "Channel-native copy for every platform simultaneously. LinkedIn thought leadership, Twitter threads, email sequences, and more.",
  },
  {
    n: "05",
    title: "Assets Produced",
    desc: "The Image Generator creates on-brand visuals with your logo, colors, and typography — composited and ready to publish.",
  },
  {
    n: "06",
    title: "Review & Refine",
    desc: "You stay in control. Preview all assets, edit copy, or regenerate anything before going live.",
  },
  {
    n: "07",
    title: "Publish & Track",
    desc: "Posts go out on optimal schedules. Analytics roll up in real time. The Optimization agent surfaces what to do next.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-orion-dark px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            From{" "}
            <span className="text-gradient">goal to live campaign</span>{" "}
            in 7 steps
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            STELOS&apos; pipeline runs automatically. You set the goal and review the output.
          </p>
        </div>

        <div className="relative">
          {/* Vertical connector line (desktop) */}
          <div
            aria-hidden
            className="absolute left-[27px] top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-orion-green/40 via-orion-blue/20 to-transparent lg:block"
          />

          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={step.n} className="flex gap-5">
                <div className="flex shrink-0 flex-col items-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border font-mono text-sm font-bold"
                    style={{
                      borderColor: i === 0 ? "#7c3aed" : i < 4 ? "#a78bfa" : "#c4b5fd",
                      color: i === 0 ? "#7c3aed" : i < 4 ? "#a78bfa" : "#c4b5fd",
                      background:
                        i === 0
                          ? "rgba(124,58,237,0.08)"
                          : i < 4
                          ? "rgba(167,139,250,0.08)"
                          : "rgba(196,181,253,0.08)",
                    }}
                  >
                    {step.n}
                  </div>
                </div>
                <div className="pb-2 pt-3">
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── AI Agents ─────────────────────────────────────────────────────────────────

const AGENTS = [
  { name: "MarketingStrategist", color: "orion-green", desc: "ICP, positioning, calendar" },
  { name: "ContentCreator ×7", color: "orion-blue", desc: "Platform-native copy" },
  { name: "SEO Optimizer", color: "orion-blue", desc: "Keywords, meta, internal links" },
  { name: "ImageGenerator", color: "orion-purple", desc: "Brand-aware visuals" },
  { name: "CRMIntelligence", color: "orion-yellow", desc: "Lead scoring & enrichment" },
  { name: "DistributionAgent", color: "orion-green", desc: "Optimal publish scheduling" },
  { name: "OptimizationAgent", color: "orion-orange", desc: "Post-publish analysis" },
  { name: "BrandVoice", color: "orion-blue", desc: "Tone & style consistency" },
];

const AGENT_COLORS: Record<string, string> = {
  "orion-green": "border-orion-green/25 bg-orion-green/5 text-orion-green",
  "orion-blue": "border-orion-blue/25 bg-orion-blue/5 text-orion-blue",
  "orion-purple": "border-orion-purple/25 bg-orion-purple/5 text-orion-purple",
  "orion-yellow": "border-orion-yellow/25 bg-orion-yellow/5 text-orion-yellow",
  "orion-orange": "border-orion-orange/25 bg-orion-orange/5 text-orion-orange",
};

function AIAgents() {
  return (
    <section className="bg-orion-dark-2 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            <span className="text-gradient">13 specialized AI agents</span>{" "}
            working in concert
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Each agent is an expert in its domain. Together they hand off context seamlessly —
            like a world-class marketing team that never sleeps.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {AGENTS.map((agent) => (
            <div
              key={agent.name}
              className={`rounded-lg border p-4 ${AGENT_COLORS[agent.color] ?? AGENT_COLORS["orion-blue"]}`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="font-mono text-xs font-semibold">{agent.name}</span>
              </div>
              <p className="text-xs opacity-70">{agent.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────────

const CHANNELS = [
  { name: "LinkedIn", icon: "💼", note: "Thought leadership, lead gen" },
  { name: "Twitter / X", icon: "🐦", note: "Threads, announcements" },
  { name: "Instagram", icon: "📸", note: "Visual stories, reels copy" },
  { name: "Facebook", icon: "📘", note: "Community, ads copy" },
  { name: "TikTok", icon: "🎵", note: "Short-form scripts" },
  { name: "Email", icon: "📧", note: "Sequences, newsletters" },
  { name: "Blog", icon: "✍️", note: "SEO articles, thought leadership" },
];

function Channels() {
  return (
    <section className="bg-orion-dark px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            One campaign,{" "}
            <span className="text-gradient">7 channels at once</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Each channel gets content written for its native format and audience — not generic
            copy pasted across platforms.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          {CHANNELS.map((ch) => (
            <div
              key={ch.name}
              className="flex flex-col items-center gap-2 rounded-xl border border-orion-border bg-orion-dark-2 p-4 text-center transition-colors hover:border-orion-green/30"
            >
              <span className="text-3xl">{ch.icon}</span>
              <span className="text-sm font-semibold">{ch.name}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{ch.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Feedback Loop ─────────────────────────────────────────────────────────────

const LOOP_STEPS = [
  { label: "Publish", desc: "Posts go live on optimal schedules across all channels" },
  { label: "Measure", desc: "Real-time analytics roll up impressions, clicks, and conversions" },
  { label: "Optimize", desc: "AI surfaces what worked, what didn't, and what to do next" },
  { label: "Repeat", desc: "Every campaign makes STELOS smarter about your brand" },
];

function FeedbackLoop() {
  return (
    <section className="bg-orion-dark-2 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            The real differentiator is{" "}
            <span className="text-gradient">what happens after launch</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Most AI tools stop at content generation. STELOS keeps running — tracking performance,
            learning from results, and automatically improving your next campaign.
          </p>
        </div>

        <div className="relative">
          {/* Arrow connectors */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {LOOP_STEPS.map((s, i) => (
              <div key={s.label} className="relative flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orion-green/40 bg-orion-green/10 font-mono text-sm font-bold text-orion-green">
                    {i + 1}
                  </div>
                  {i < LOOP_STEPS.length - 1 && (
                    <div className="hidden h-px flex-1 bg-gradient-to-r from-orion-green/40 to-orion-green/10 lg:block" />
                  )}
                  {i === LOOP_STEPS.length - 1 && (
                    <div className="hidden h-px flex-1 bg-gradient-to-r from-orion-green/40 to-orion-green/60 lg:block" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-orion-green">{s.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Loop indicator */}
          <div className="mt-8 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-orion-green/20 bg-orion-green/5 px-4 py-2 text-xs text-orion-green">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
                />
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
              </svg>
              Continuous improvement — every campaign is an input to the next
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Try STELOS risk-free with your first campaigns.",
    features: [
      "50,000 AI tokens / month",
      "10 published posts / month",
      "3 channels",
      "1 brand profile",
      "Basic analytics",
    ],
    cta: "Start Free",
    href: "/auth/register",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$79",
    period: "per month",
    desc: "For marketers and small teams running regular campaigns.",
    features: [
      "500,000 AI tokens / month",
      "500 published posts / month",
      "All 7 channels",
      "Custom brand voice",
      "A/B testing",
      "Advanced analytics + AI reports",
      "CRM with AI lead scoring",
    ],
    cta: "Start Pro Free",
    href: "/auth/register?plan=pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$249",
    period: "per month",
    desc: "For agencies and teams at scale.",
    features: [
      "Unlimited AI tokens",
      "Unlimited posts",
      "All channels + white-label",
      "Multi-brand workspaces",
      "Priority AI processing",
      "Dedicated support",
      "SSO + SCIM",
    ],
    cta: "Contact Sales",
    href: "/auth/register?plan=enterprise",
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="bg-orion-dark px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Simple,{" "}
            <span className="text-gradient">transparent pricing</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            No per-seat fees. No hidden add-ons. Cancel any time.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.highlight
                  ? "border-orion-green/40 bg-orion-green/5 card-glow"
                  : "border-orion-border bg-orion-dark-2"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-orion-green px-3 py-0.5 text-xs font-bold text-orion-dark">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-5">
                <p className="text-sm font-semibold text-muted-foreground">{plan.name}</p>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="mb-1 text-sm text-muted-foreground">/ {plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.desc}</p>
              </div>

              <ul className="mb-8 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orion-green/20 text-[10px] text-orion-green">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block rounded-md py-3 text-center text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-orion-green text-orion-dark hover:bg-orion-green-dim"
                    : "border border-orion-border text-foreground hover:border-orion-green/40 hover:text-orion-green"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Banner ────────────────────────────────────────────────────────────────

function CTABanner() {
  return (
    <section className="relative overflow-hidden bg-orion-dark-2 px-6 py-20 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[400px] w-[700px] rounded-full bg-orion-blue/5 blur-3xl" />
      </div>
      <div className="relative">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          Your next campaign starts with{" "}
          <span className="text-gradient">one sentence.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Join thousands of marketers using STELOS to run smarter campaigns in less time.
        </p>
        <Link
          href="/auth/register"
          className="mt-8 inline-block rounded-md bg-orion-green px-10 py-3.5 text-base font-semibold text-orion-dark transition-colors hover:bg-orion-green-dim"
        >
          Get Started Free
        </Link>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-orion-border bg-orion-dark px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "18px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #ffffff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "18px", letterSpacing: "-0.5px", lineHeight: 1, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
          <span className="text-xs text-muted-foreground ml-1">AI Marketing OS</span>
        </div>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link href="/demo" className="transition-colors hover:text-foreground text-orion-green/70">
            Live Demo
          </Link>
          <Link href="/auth/login" className="transition-colors hover:text-foreground">
            Login
          </Link>
          <Link href="/auth/register" className="transition-colors hover:text-foreground">
            Register
          </Link>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How It Works
          </a>
        </nav>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} STELOS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-orion-dark text-foreground">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <AIAgents />
        <Channels />
        <FeedbackLoop />
        <Pricing />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
