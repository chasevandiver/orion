"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Zap, ArrowUpRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Quota {
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  postsPublished: number;
  postsLimit: number;
  postsRemaining: number;
  month: string;
}

// ── Usage bar ──────────────────────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit === Infinity || limit >= 1_000_000;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-orion-green";
  const fmt = (n: number) =>
    n >= 1_000_000 ? "∞" : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {fmt(used)}
          <span className="text-muted-foreground"> / {fmt(limit)}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: isUnlimited ? "0%" : `${pct}%` }}
        />
      </div>
      {!isUnlimited && (
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {pct}% used
        </p>
      )}
    </div>
  );
}

// ── Plan feature list ──────────────────────────────────────────────────────────

const FREE_FEATURES = [
  "50,000 AI tokens / month",
  "5 published posts / month",
  "1 brand",
  "1 user",
  "3 active campaigns",
  "Community support",
];

const PRO_FEATURES = [
  "500,000 AI tokens / month",
  "250 published posts / month",
  "Unlimited brands",
  "Up to 5 users",
  "Unlimited campaigns",
  "A/B testing",
  "Priority support",
];

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="space-y-2 mt-4">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-orion-green" />
          {f}
        </li>
      ))}
    </ul>
  );
}

interface PlansConfig {
  configured: boolean;
  pro: { priceId: string; price: string };
}

// ── Main client component ──────────────────────────────────────────────────────

export function BillingClient({ quota }: { quota: Quota }) {
  const toast = useAppToast();
  const [upgrading, setUpgrading] = useState(false);
  const [portaling, setPortaling] = useState(false);
  const [plans, setPlans] = useState<PlansConfig | null>(null);
  const isPro = quota.plan === "pro";

  useEffect(() => {
    api
      .get<PlansConfig>("/billing/plans")
      .then(setPlans)
      .catch(() => setPlans({ configured: false, pro: { priceId: "", price: "$49" } }));
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const priceId = plans?.pro.priceId ?? "";
      if (!priceId) throw new Error("Billing is not configured in this environment.");
      const res = await api.post<{ data: { url: string } }>("/billing/checkout", { priceId });
      window.location.href = res.data.url;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start checkout");
      setUpgrading(false);
    }
  }

  async function handlePortal() {
    setPortaling(true);
    try {
      const res = await api.post<{ data: { url: string } }>("/billing/portal", {});
      window.location.href = res.data.url;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to open billing portal");
      setPortaling(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* ── Current usage ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Current Usage</h2>
          <span className="rounded-full border border-border px-3 py-1 font-mono text-xs capitalize">
            {quota.plan} plan · {quota.month}
          </span>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <UsageBar
            label="AI Tokens"
            used={quota.tokensUsed}
            limit={quota.tokensLimit}
          />
          <UsageBar
            label="Posts Published"
            used={quota.postsPublished}
            limit={quota.postsLimit}
          />
        </div>
      </section>

      {/* ── Plan cards ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free plan */}
          <div
            className={`rounded-xl border p-6 flex flex-col ${
              !isPro
                ? "border-orion-green bg-orion-green/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Free
                </p>
                <p className="mt-1 text-3xl font-bold">$0</p>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              {!isPro && (
                <span className="rounded-full bg-orion-green/10 border border-orion-green/30 px-2.5 py-1 text-[11px] font-medium text-orion-green">
                  Current plan
                </span>
              )}
            </div>
            <FeatureList features={FREE_FEATURES} />
            <div className="mt-6">
              <Button variant="outline" className="w-full" disabled>
                {!isPro ? "Current Plan" : "Downgrade"}
              </Button>
            </div>
          </div>

          {/* Pro plan */}
          <div
            className={`rounded-xl border p-6 flex flex-col ${
              isPro
                ? "border-orion-green bg-orion-green/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Pro
                  </p>
                  <span className="rounded border border-orion-green/30 bg-orion-green/10 px-1.5 py-0.5 font-mono text-[10px] text-orion-green">
                    RECOMMENDED
                  </span>
                </div>
                <p className="mt-1 text-3xl font-bold">$49</p>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              {isPro && (
                <span className="rounded-full bg-orion-green/10 border border-orion-green/30 px-2.5 py-1 text-[11px] font-medium text-orion-green">
                  Current plan
                </span>
              )}
            </div>
            <FeatureList features={PRO_FEATURES} />
            <div className="mt-6">
              {isPro ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handlePortal}
                  disabled={portaling}
                >
                  {portaling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                  {portaling ? "Opening portal…" : "Manage Subscription"}
                </Button>
              ) : plans !== null && !plans.configured ? (
                <p className="text-xs text-muted-foreground">
                  Billing is not configured in this environment.
                </p>
              ) : (
                <Button
                  className="w-full gap-2 bg-orion-green text-black hover:bg-orion-green/90"
                  onClick={handleUpgrade}
                  disabled={upgrading || !plans?.pro.priceId}
                >
                  {upgrading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {upgrading ? "Redirecting…" : "Upgrade to Pro"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Info footer ────────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground">
        Payments are processed securely by Stripe. Subscriptions renew monthly and can be
        cancelled any time from the customer portal.
      </p>
    </div>
  );
}
