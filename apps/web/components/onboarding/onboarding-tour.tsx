"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Target,
  Zap,
  GitBranch,
  CheckSquare,
  Settings,
  ArrowRight,
  X,
} from "lucide-react";

// ── Tour steps ────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: "💎",
    title: "Welcome to STELOS",
    body: "STELOS is your AI-powered marketing OS. In minutes, it can build a complete campaign strategy, write all your content, design channel images, and schedule your posts — all automatically.",
    cta: "Let's take a quick tour",
  },
  {
    icon: <Target className="h-8 w-8 text-violet-400" />,
    title: "Start with Goals",
    body: "Every campaign starts with a Goal. Tell STELOS your brand name, what you're promoting, and who you're targeting. This single form kicks off the entire AI pipeline.",
    cta: "Next",
    href: "/dashboard/goals",
    hrefLabel: "Go to Goals →",
  },
  {
    icon: <Zap className="h-8 w-8 text-orion-green" />,
    title: "Watch the War Room",
    body: "Once you submit a Goal, the War Room opens. You can watch 10+ AI agents working in parallel — researching competitors, writing strategy, generating content, compositing images, and scheduling posts.",
    cta: "Next",
  },
  {
    icon: <GitBranch className="h-8 w-8 text-blue-400" />,
    title: "Explore Campaigns",
    body: "After the pipeline completes, your Campaign is ready. View the AI-generated strategy, channel-specific content for every platform you chose, and a 4-week content calendar.",
    cta: "Next",
    href: "/dashboard/campaigns",
    hrefLabel: "View Campaigns →",
  },
  {
    icon: <CheckSquare className="h-8 w-8 text-green-400" />,
    title: "Review & Approve Assets",
    body: "In the Review panel, you can read every post before it goes out, approve or reject it, regenerate the image, or edit the copy. Only approved assets get scheduled to publish.",
    cta: "Next",
    href: "/dashboard/review",
    hrefLabel: "Open Review →",
  },
  {
    icon: <Settings className="h-8 w-8 text-pink-400" />,
    title: "Set Up Your Brand",
    body: "Head to Settings → Brand Kit to upload your logo, set your brand colors, choose a font style, and add up to 3 audience personas. The AI uses all of this to personalize every piece of content.",
    cta: "Next",
    href: "/dashboard/settings",
    hrefLabel: "Open Settings →",
  },
  {
    icon: "🚀",
    title: "You're all set!",
    body: "That's everything you need to know to get started. Create your first Goal, watch the agents work, and you'll have a full campaign ready in minutes. Questions? Click the ? icon anywhere to get context.",
    cta: "Start creating",
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

const LS_KEY = "stelos_tour_dismissed";

export function OnboardingTour({ onboardingCompleted }: { onboardingCompleted: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show tour only if org hasn't completed it and user hasn't dismissed this session
    if (!onboardingCompleted && !localStorage.getItem(LS_KEY)) {
      setVisible(true);
    }
  }, [onboardingCompleted]);

  async function dismiss() {
    localStorage.setItem(LS_KEY, "1");
    setVisible(false);
    try {
      await api.patch("/settings/org", { onboardingCompleted: true });
    } catch {
      // Non-critical — tour dismissed in localStorage anyway
    }
  }

  async function finish() {
    setVisible(false);
    try {
      await api.patch("/settings/org", { onboardingCompleted: true });
    } catch {}
    localStorage.setItem(LS_KEY, "1");
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome tour"
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f1a] shadow-2xl p-8"
      >
        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step counter */}
        <p className="text-xs text-white/30 mb-6 uppercase tracking-widest">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Icon */}
        <div className="mb-5 flex">
          {typeof current.icon === "string" ? (
            <span className="text-5xl">{current.icon}</span>
          ) : (
            <div className="rounded-xl bg-white/5 p-3">{current.icon}</div>
          )}
        </div>

        {/* Content */}
        <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
        <p className="text-white/60 leading-relaxed mb-8">{current.body}</p>

        {/* Quick link */}
        {"href" in current && current.href && (
          <a
            href={current.href}
            onClick={dismiss}
            className="inline-block mb-6 text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            {current.hrefLabel}
          </a>
        )}

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/10 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-white/30 hover:text-white/60 transition-colors"
            >
              ← Back
            </button>
          ) : (
            <button
              onClick={dismiss}
              className="text-sm text-white/30 hover:text-white/60 transition-colors"
            >
              Skip tour
            </button>
          )}

          <Button
            onClick={isLast ? finish : () => setStep((s) => s + 1)}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {isLast ? current.cta : (
              <>
                {current.cta}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
