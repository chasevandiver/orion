import { redirect } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { GoalsList } from "../goals-list";

export const metadata = { title: "Goals" };

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

export default async function DashboardPage() {
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
  await Promise.allSettled([
    serverApi.get<{ data: Goal[] }>("/goals")
      .then((r) => { goals = r.data ?? []; })
      .catch(() => {}),
    serverApi.get<{ data: Array<{ id: string }> }>("/settings/personas")
      .then((r) => { personaCount = (r.data ?? []).length; })
      .catch(() => {}),
  ]);

  // Determine checklist items
  const hasBrand = !!(orgSettings.brandPrimaryColor || orgSettings.logoUrl);
  const hasPersonas = personaCount > 0;
  const hasGoal = goals.length > 0;

  return (
    <div className="space-y-6">
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
                href: "#",
              },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                    item.done
                      ? "border-orion-green bg-orion-green text-black"
                      : "border-border"
                  }`}
                >
                  {item.done ? "✓" : ""}
                </span>
                <span className={item.done ? "line-through text-muted-foreground" : ""}>
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Define a marketing goal and ORION generates a full strategy automatically.
          </p>
        </div>
      </div>
      <GoalsList initialGoals={goals} />
    </div>
  );
}
