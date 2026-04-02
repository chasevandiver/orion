"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Zap, ArrowUpRight, TrendingUp } from "lucide-react";
import { TooltipHelp } from "@/components/ui/tooltip-help";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Quota {
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  postsPublished: number;
  postsLimit: number;
  postsRemaining: number;
  campaignsCreated: number;
  campaignsLimit: number;
  campaignsRemaining: number;
  month: string;
}

interface CampaignBreakdown {
  campaignId: string | null;
  campaignName: string;
  tokensUsed: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  return n >= 1_000_000 ? "∞" : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function fmtWords(tokens: number): string {
  const words = Math.round(tokens / 1.3);
  return words >= 1000 ? `~${(words / 1000).toFixed(1)}k` : `~${words}`;
}

function projectedLimitDate(tokensUsed: number, tokensLimit: number): string | null {
  if (tokensLimit === Infinity || tokensLimit >= 1_000_000 || tokensUsed === 0) return null;
  const today = new Date();
  const dayOfMonth = today.getDate();
  const dailyRate = tokensUsed / dayOfMonth;
  if (dailyRate === 0) return null;
  const daysUntilLimit = (tokensLimit - tokensUsed) / dailyRate;
  if (daysUntilLimit < 0) return "already exceeded";
  const limitDate = new Date(today.getTime() + daysUntilLimit * 86_400_000);
  return limitDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricBar({
  label,
  used,
  limit,
  suffix,
  tooltip,
}: {
  label: string;
  used: number;
  limit: number;
  suffix?: string;
  tooltip?: string;
}) {
  const isUnlimited = limit === Infinity || limit >= 1_000_000;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-orion-green";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && <TooltipHelp text={tooltip} side="right" />}
        </span>
        <span className="font-mono tabular-nums">
          {fmtCount(used)}
          {suffix && <span className="text-muted-foreground text-xs ml-0.5">{suffix}</span>}
          {!isUnlimited && (
            <span className="text-muted-foreground"> / {fmtCount(limit)}</span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: isUnlimited ? "0%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ── Plan feature list ──────────────────────────────────────────────────────────

const FREE_FEATURES = [
  "50,000 AI tokens / month (~38k words)",
  "10 published posts / month",
  "3 campaigns / month",
  "1 brand",
  "1 user",
  "Community support",
];

const PRO_FEATURES = [
  "500,000 AI tokens / month (~385k words)",
  "500 published posts / month",
  "Unlimited campaigns",
  "Unlimited brands",
  "Up to 5 users",
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
  const [breakdown, setBreakdown] = useState<CampaignBreakdown[]>([]);
  const isPro = quota.plan === "pro";

  const tokenPct =
    quota.tokensLimit >= 1_000_000
      ? 0
      : Math.min(100, Math.round((quota.tokensUsed / quota.tokensLimit) * 100));

  const limitDate = projectedLimitDate(quota.tokensUsed, quota.tokensLimit);

  useEffect(() => {
    api
      .get<PlansConfig>("/billing/plans")
      .then(setPlans)
      .catch(() => setPlans({ configured: false, pro: { priceId: "", price: "$49" } }));

    api
      .get<{ data: CampaignBreakdown[] }>("/billing/usage-breakdown")
      .then((res) => setBreakdown(res.data ?? []))
      .catch(() => {});
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

        {/* At-a-glance pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatPill label="AI credits used" value={`${tokenPct}%`} />
          <StatPill label="Words generated" value={fmtWords(quota.tokensUsed)} />
          <StatPill label="Posts published" value={`${quota.postsPublished} / ${quota.postsLimit >= 1_000_000 ? "∞" : quota.postsLimit}`} />
          <StatPill label="Campaigns" value={`${quota.campaignsCreated} / ${quota.campaignsLimit >= 1_000_000 ? "∞" : quota.campaignsLimit}`} />
        </div>

        {/* Bars */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <MetricBar
            label="AI credits"
            used={quota.tokensUsed}
            limit={quota.tokensLimit}
            suffix=" tokens"
            tooltip="AI processing credits. One campaign uses approximately 5,000–15,000 tokens."
          />
          <MetricBar
            label="Posts published"
            used={quota.postsPublished}
            limit={quota.postsLimit}
          />
          <MetricBar
            label="Campaigns this month"
            used={quota.campaignsCreated}
            limit={quota.campaignsLimit}
          />

          {/* Projected limit */}
          {limitDate && tokenPct < 100 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              At your current rate, you&apos;ll hit your AI credit limit around{" "}
              <strong>{limitDate}</strong>. Consider upgrading to avoid interruptions.
            </div>
          )}
        </div>
      </section>

      {/* ── Token usage by campaign ─────────────────────────────────────────── */}
      {breakdown.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">AI Credits by Campaign</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {breakdown.map((row, i) => {
              const pct =
                quota.tokensUsed > 0
                  ? Math.round((row.tokensUsed / quota.tokensUsed) * 100)
                  : 0;
              return (
                <div key={row.campaignId ?? i} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.campaignName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtWords(row.tokensUsed)} words · {row.tokensUsed.toLocaleString()} tokens
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div
                        className="h-full rounded-full bg-orion-green/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
