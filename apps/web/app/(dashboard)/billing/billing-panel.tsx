"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Zap, Users, FileText, Loader2, ExternalLink } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground border-border",
  pro: "bg-orion-green/10 text-orion-green border-orion-green/20",
  enterprise: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  trialing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  past_due: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
  unpaid: "bg-destructive/10 text-destructive border-destructive/20",
};

const PLAN_LIMITS: Record<string, { tokens: string; posts: string; contacts: string }> = {
  free: { tokens: "100k", posts: "10", contacts: "250" },
  pro: { tokens: "2M", posts: "500", contacts: "10k" },
  enterprise: { tokens: "Unlimited", posts: "Unlimited", contacts: "Unlimited" },
};

interface Subscription {
  id: string;
  plan: string;
  status: string;
  stripeCustomerId: string;
  currentPeriodEnd?: string;
}

interface UsageRecord {
  month: string;
  aiTokensUsed: number;
  postsPublished: number;
  contactsCount: number;
}

function UsageStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface PlansConfig {
  configured: boolean;
  pro: { priceId: string; price: string; features: string[] };
  enterprise: { priceId: string; price: string; features: string[] };
}

export function BillingPanel({
  subscription,
  usage,
}: {
  subscription: Subscription | null;
  usage: UsageRecord | null;
}) {
  const toast = useAppToast();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlansConfig | null>(null);

  useEffect(() => {
    api
      .get<PlansConfig>("/billing/plans")
      .then(setPlans)
      .catch(() => setPlans({ configured: false, pro: { priceId: "", price: "$79", features: [] }, enterprise: { priceId: "", price: "$299", features: [] } }));
  }, []);

  const plan = subscription?.plan ?? "free";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free!;

  async function handlePortal() {
    setLoadingPortal(true);
    try {
      const res = await api.post<{ data: { url: string } }>("/billing/portal", {});
      window.location.href = res.data.url;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to open billing portal");
      setLoadingPortal(false);
    }
  }

  async function handleCheckout(priceId: string) {
    setLoadingCheckout(priceId);
    try {
      const res = await api.post<{ data: { url: string } }>("/billing/checkout", { priceId });
      window.location.href = res.data.url;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start checkout");
      setLoadingCheckout(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs uppercase font-semibold ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}
              >
                {plan}
              </span>
              {subscription && (
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[subscription.status] ?? STATUS_COLORS.active}`}
                >
                  {subscription.status}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {subscription?.currentPeriodEnd
                ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : "No active subscription"}
            </p>
          </div>

          {subscription?.stripeCustomerId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loadingPortal}
              onClick={handlePortal}
            >
              {loadingPortal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage Subscription
            </Button>
          )}
        </div>

        {/* Plan limits */}
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">AI Tokens / mo</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{limits.tokens}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Posts / mo</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{limits.posts}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contacts</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{limits.contacts}</p>
          </div>
        </div>
      </div>

      {/* Usage this month */}
      {usage && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">
            Usage — {usage.month}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <UsageStat
              label="AI Tokens used"
              value={usage.aiTokensUsed.toLocaleString()}
              icon={Zap}
            />
            <UsageStat
              label="Posts published"
              value={usage.postsPublished.toLocaleString()}
              icon={FileText}
            />
            <UsageStat
              label="Contacts"
              value={usage.contactsCount.toLocaleString()}
              icon={Users}
            />
          </div>
        </div>
      )}

      {/* Upgrade plans */}
      {plan === "free" && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">Upgrade Plan</h2>
          {plans !== null && !plans.configured ? (
            <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Billing is not configured in this environment. You&apos;re on the free plan.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Pro */}
              <div className="rounded-lg border border-orion-green/30 bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-orion-green">PRO</span>
                  <span className="text-sm font-semibold">{plans?.pro.price ?? "$79"} / mo</span>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {(plans?.pro.features ?? ["2M AI tokens/month", "500 scheduled posts", "10,000 contacts", "Priority support"]).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  disabled={!!loadingCheckout || !plans?.pro.priceId}
                  onClick={() => plans?.pro.priceId && handleCheckout(plans.pro.priceId)}
                >
                  {loadingCheckout === plans?.pro.priceId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Upgrade to Pro"
                  )}
                </Button>
              </div>

              {/* Enterprise */}
              <div className="rounded-lg border border-purple-500/30 bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-purple-400">ENTERPRISE</span>
                  <span className="text-sm font-semibold">{plans?.enterprise.price ?? "$299"} / mo</span>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {(plans?.enterprise.features ?? ["Unlimited AI tokens", "Unlimited posts", "Unlimited contacts", "Dedicated support + SLA"]).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  size="sm"
                  disabled={!!loadingCheckout || !plans?.enterprise.priceId}
                  onClick={() => plans?.enterprise.priceId && handleCheckout(plans.enterprise.priceId)}
                >
                  {loadingCheckout === plans?.enterprise.priceId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Upgrade to Enterprise"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
