import { serverApi } from "@/lib/server-api";
import { GoalsList } from "../../goals-list";

export const metadata = { title: "Goals — STELOS" };

interface Goal {
  id: string;
  type: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
  timeline: string;
  budget?: number;
  status: string;
  createdAt: Date | string;
  strategies?: Array<{ id: string; generatedAt: string }>;
  campaigns?: Array<{ id: string; name: string; status: string }>;
}

interface OrgSettings {
  onboardingCompleted?: boolean;
  brandPrimaryColor?: string | null;
  logoUrl?: string | null;
  name?: string | null;
}

interface Brand {
  name?: string;
  description?: string;
  targetAudience?: string;
}

interface Persona {
  id: string;
  name: string;
  demographics?: string;
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams?: { newGoal?: string };
}) {
  let orgSettings: OrgSettings = {};
  let goals: Goal[] = [];
  let personas: Persona[] = [];
  let brands: Brand[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: OrgSettings }>("/settings/org")
      .then((r) => { orgSettings = r.data ?? {}; })
      .catch(() => {}),
    serverApi
      .get<{ data: Goal[] }>("/goals")
      .then((r) => { goals = r.data ?? []; })
      .catch(() => {}),
    serverApi
      .get<{ data: Persona[] }>("/settings/personas")
      .then((r) => { personas = r.data ?? []; })
      .catch(() => {}),
    serverApi
      .get<{ data: Brand[] }>("/brands")
      .then((r) => { brands = r.data ?? []; })
      .catch(() => {}),
  ]);

  const firstBrand = brands[0];
  const firstPersona = personas[0];

  const hasBrand = !!(orgSettings.brandPrimaryColor || orgSettings.logoUrl || firstBrand);
  const hasPersonas = personas.length > 0;
  const hasGoal = goals.length > 0;
  const autoOpenGoal =
    searchParams?.newGoal === "1" || (hasBrand && hasPersonas && !hasGoal);

  const initialBrand = {
    name: firstBrand?.name ?? orgSettings.name ?? undefined,
    description: firstBrand?.description ?? undefined,
    targetAudience: firstBrand?.targetAudience ?? firstPersona?.demographics ?? undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Goals</h1>
        <p className="text-sm text-muted-foreground">
          Define a marketing goal and STELOS generates a full strategy
          automatically.
        </p>
      </div>
      <GoalsList
        initialGoals={goals}
        autoOpenGoal={autoOpenGoal}
        initialBrand={initialBrand}
      />
    </div>
  );
}
