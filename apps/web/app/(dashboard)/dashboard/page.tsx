import { redirect } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { InngestHealthAlert } from "./inngest-health-alert";
import { AiHealthAlert } from "./ai-health-alert";
import { SetupGuideOverlay } from "./setup-guide-overlay";
import { CommandCenter } from "./command-center";

export const metadata = { title: "Dashboard" };

interface OrgSettings {
  onboardingCompleted?: boolean;
  brandPrimaryColor?: string | null;
  logoUrl?: string | null;
  name?: string | null;
}

interface DashboardStats {
  activeCampaigns: number;
  pendingReview: number;
  publishedThisWeek: number;
  totalGoals: number;
  recentGoals: Array<{
    id: string;
    brandName: string;
    type: string;
    createdAt: Date | string;
    pipelineStage: number | null;
    campaignId: string | null;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: Date | string;
    read: boolean;
  }>;
}

interface ScheduledPost {
  id: string;
  channel: string;
  scheduledFor: string;
  status: string;
  preflightStatus: string | null;
  asset: {
    id: string;
    channel: string;
    contentText: string;
    compositedImageUrl: string | null;
  } | null;
}

interface AnalyticsOverview {
  totals: {
    impressions: number;
    clicks: number;
    conversions: number;
    engagements: number;
    spend: number;
    revenue: number;
  };
}

const EMPTY_STATS: DashboardStats = {
  activeCampaigns: 0,
  pendingReview: 0,
  publishedThisWeek: 0,
  totalGoals: 0,
  recentGoals: [],
  recentNotifications: [],
};

const EMPTY_METRICS = { impressions: 0, clicks: 0, conversions: 0 };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { newGoal?: string };
}) {
  // Check onboarding status — redirect new users to setup wizard
  let orgSettings: OrgSettings = {};
  try {
    const res = await serverApi.get<{ data: OrgSettings }>("/settings/org");
    orgSettings = res.data ?? {};
  } catch {
    // If settings fetch fails, skip redirect
  }

  if (orgSettings.onboardingCompleted === false) {
    redirect("/dashboard/onboarding");
  }

  // Redirect ?newGoal=1 to the dedicated goals page
  if (searchParams?.newGoal === "1") {
    redirect("/dashboard/goals?newGoal=1");
  }

  let personaCount = 0;
  let stats: DashboardStats = EMPTY_STATS;
  let scheduledPosts: ScheduledPost[] = [];
  let currentMetrics = EMPTY_METRICS;
  let previousMetrics = EMPTY_METRICS;
  let tokenPct = 0;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  await Promise.allSettled([
    serverApi
      .get<{ data: Array<{ id: string }> }>("/settings/personas")
      .then((r) => {
        personaCount = (r.data ?? []).length;
      })
      .catch(() => {}),
    serverApi
      .get<{ data: DashboardStats }>("/dashboard")
      .then((r) => {
        stats = r.data ?? EMPTY_STATS;
      })
      .catch(() => {}),
    serverApi
      .get<{ data: ScheduledPost[] }>("/distribute")
      .then((r) => {
        scheduledPosts = r.data ?? [];
      })
      .catch(() => {}),
    serverApi
      .get<{ data: AnalyticsOverview }>(
        `/analytics/overview?from=${thirtyDaysAgo.toISOString()}&to=${now.toISOString()}`,
      )
      .then((r) => {
        const t = r.data?.totals;
        if (t)
          currentMetrics = {
            impressions: t.impressions,
            clicks: t.clicks,
            conversions: t.conversions,
          };
      })
      .catch(() => {}),
    serverApi
      .get<{ data: AnalyticsOverview }>(
        `/analytics/overview?from=${sixtyDaysAgo.toISOString()}&to=${thirtyDaysAgo.toISOString()}`,
      )
      .then((r) => {
        const t = r.data?.totals;
        if (t)
          previousMetrics = {
            impressions: t.impressions,
            clicks: t.clicks,
            conversions: t.conversions,
          };
      })
      .catch(() => {}),
    serverApi
      .get<{ data: { tokensUsed: number; tokensLimit: number } }>("/analytics/quota")
      .then((r) => {
        const { tokensUsed, tokensLimit } = r.data ?? {};
        if (tokensUsed && tokensLimit && tokensLimit < 1_000_000) {
          tokenPct = Math.min(100, Math.round((tokensUsed / tokensLimit) * 100));
        }
      })
      .catch(() => {}),
  ]);

  // Determine checklist items
  const hasBrand = !!(orgSettings.brandPrimaryColor || orgSettings.logoUrl);
  const hasPersonas = personaCount > 0;
  const hasGoal = stats.totalGoals > 0;

  // Most recent goal date for recommendation heuristics
  const lastGoalDate =
    stats.recentGoals.length > 0 ? stats.recentGoals[0].createdAt : null;

  return (
    <div className="space-y-6">
      {/* Setup guide overlay — shown on first visit when critical services are unconfigured */}
      {!hasGoal && <SetupGuideOverlay />}
      {/* AI service error — persistent, non-dismissible */}
      <AiHealthAlert />
      {/* Inngest health warning — dismissible */}
      <InngestHealthAlert />

      {/* AI credit usage warning — shown when >= 80% of monthly quota used */}
      {tokenPct >= 80 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            You&apos;ve used <strong>{tokenPct}%</strong> of your monthly AI credits.
          </p>
          <a
            href="/dashboard/billing"
            className="shrink-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400 transition-colors"
          >
            Upgrade Plan
          </a>
        </div>
      )}

      {/* Congrats banner — shown when brand+personas are set but no goals yet */}
      {hasBrand && hasPersonas && !hasGoal && (
        <div className="flex items-center gap-3 rounded-xl border border-orion-green/30 bg-orion-green/5 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orion-green/20 text-orion-green text-sm">
            ✓
          </div>
          <div>
            <p className="text-sm font-semibold text-orion-green">
              Your brand is ready.
            </p>
            <p className="text-xs text-muted-foreground">
              Create your first goal to launch a campaign.
            </p>
          </div>
        </div>
      )}

      {/* Setup checklist — shown until all items complete */}
      {(!hasBrand || !hasPersonas || !hasGoal) && (
        <div className="rounded-xl border border-orion-green/20 bg-orion-green/5 p-4">
          <h2 className="text-sm font-semibold text-orion-green mb-3">
            Setup Checklist
          </h2>
          <div className="space-y-2">
            {[
              {
                done: hasBrand,
                label: "Set up your brand profile",
                href: "/dashboard/settings",
              },
              {
                done: hasPersonas,
                label: "Add an audience persona",
                href: "/dashboard/settings",
              },
              {
                done: hasGoal,
                label: "Create your first goal",
                href: "/dashboard/goals?newGoal=1",
              },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    item.done
                      ? "border-orion-green bg-orion-green text-black"
                      : "border-border"
                  }`}
                >
                  {item.done ? "✓" : ""}
                </span>
                <span
                  className={
                    item.done ? "line-through text-muted-foreground/60" : ""
                  }
                >
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Command Center */}
      <CommandCenter
        brandName={orgSettings.name ?? ""}
        stats={stats}
        scheduledPosts={scheduledPosts}
        currentMetrics={currentMetrics}
        previousMetrics={previousMetrics}
        lastGoalDate={lastGoalDate}
      />
    </div>
  );
}
