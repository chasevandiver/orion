import { redirect } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { GoalsList } from "../goals-list";
import { InngestHealthAlert } from "./inngest-health-alert";
import { AiHealthAlert } from "./ai-health-alert";
import { SetupGuideOverlay } from "./setup-guide-overlay";
import { DashboardHome } from "./dashboard-home";

export const metadata = { title: "Dashboard" };

interface Goal {
  id: string;
  type: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
  timeline: string;
  budget?: number;
  status: string;
  createdAt: string;
  strategies?: Array<{ id: string; generatedAt: string }>;
  campaigns?: Array<{ id: string; name: string; status: string }>;
}

interface OrgSettings {
  onboardingCompleted?: boolean;
  brandPrimaryColor?: string | null;
  logoUrl?: string | null;
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
    createdAt: string;
    pipelineStage: number | null;
    campaignId: string | null;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    read: boolean;
  }>;
}

const EMPTY_STATS: DashboardStats = {
  activeCampaigns: 0,
  pendingReview: 0,
  publishedThisWeek: 0,
  totalGoals: 0,
  recentGoals: [],
  recentNotifications: [],
};

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

  let goals: Goal[] = [];
  let personaCount = 0;
  let stats: DashboardStats = EMPTY_STATS;
  await Promise.allSettled([
    serverApi.get<{ data: Goal[] }>("/goals")
      .then((r) => { goals = r.data ?? []; })
      .catch(() => {}),
    serverApi.get<{ data: Array<{ id: string }> }>("/settings/personas")
      .then((r) => { personaCount = (r.data ?? []).length; })
      .catch(() => {}),
    serverApi.get<{ data: DashboardStats }>("/dashboard")
      .then((r) => { stats = r.data ?? EMPTY_STATS; })
      .catch(() => {}),
  ]);

  // Determine checklist items
  const hasBrand = !!(orgSettings.brandPrimaryColor || orgSettings.logoUrl);
  const hasPersonas = personaCount > 0;
  const hasGoal = goals.length > 0;
  const setupComplete = hasBrand && hasPersonas && hasGoal;

  // Auto-open goal dialog: either via ?newGoal=1 from the onboarding CTA, or
  // when setup is complete but no goals exist yet (first-visit state).
  const autoOpenGoal = searchParams?.newGoal === "1" || (hasBrand && hasPersonas && !hasGoal);

  return (
    <div className="space-y-6">
      {/* Setup guide overlay — shown on first visit when critical services are unconfigured */}
      {!hasGoal && <SetupGuideOverlay />}
      {/* AI service error — persistent, non-dismissible */}
      <AiHealthAlert />
      {/* Inngest health warning — dismissible */}
      <InngestHealthAlert />

      {/* Congrats banner — shown when brand+personas are set but no goals yet */}
      {hasBrand && hasPersonas && !hasGoal && (
        <div className="flex items-center gap-3 rounded-xl border border-orion-green/30 bg-orion-green/5 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orion-green/20 text-orion-green text-sm">
            ✓
          </div>
          <div>
            <p className="text-sm font-semibold text-orion-green">Your brand is ready.</p>
            <p className="text-xs text-muted-foreground">Create your first goal to launch a campaign.</p>
          </div>
        </div>
      )}

      {/* Setup checklist — shown until all items complete */}
      {(!hasBrand || !hasPersonas || !hasGoal) && (
        <div className="rounded-xl border border-orion-green/20 bg-orion-green/5 p-4">
          <h2 className="text-sm font-semibold text-orion-green mb-3">Setup Checklist</h2>
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
                href: "/dashboard?newGoal=1",
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
                <span className={item.done ? "line-through text-muted-foreground/60" : ""}>
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Mission Control — shown once setup is complete */}
      {setupComplete && <DashboardHome stats={stats} />}

      {/* Goals section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={setupComplete ? "text-lg font-semibold" : "text-2xl font-bold"}>Goals</h2>
            <p className="text-sm text-muted-foreground">
              Define a marketing goal and ORION generates a full strategy automatically.
            </p>
          </div>
        </div>
        <GoalsList initialGoals={goals} autoOpenGoal={autoOpenGoal} />
      </div>
    </div>
  );
}
