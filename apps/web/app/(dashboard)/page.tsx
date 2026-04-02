/**
 * /dashboard — Goals engine
 *
 * Server Component: fetches goals from Express via serverApi.
 * Client Component: GoalsList handles create/delete interactions.
 */
import { serverApi } from "@/lib/server-api";
import { GoalsList } from "./goals-list";

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

export default async function DashboardPage() {
  let goals: Goal[] = [];
  let brand: Brand | null = null;
  let personas: Persona[] = [];

  await Promise.allSettled([
    serverApi.get<{ data: Goal[] }>("/goals").then((r) => { goals = r.data; }).catch(() => {}),
    serverApi.get<{ data: Brand[] }>("/brands").then((r) => { brand = r.data[0] ?? null; }).catch(() => {}),
    serverApi.get<{ data: Persona[] }>("/settings/personas").then((r) => { personas = r.data ?? []; }).catch(() => {}),
  ]);

  const initialBrand = brand
    ? {
        name: brand.name,
        description: brand.description,
        targetAudience: brand.targetAudience ?? personas[0]?.demographics,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Define a marketing goal and STELOS generates a full strategy automatically.
          </p>
        </div>
      </div>
      <GoalsList initialGoals={goals} initialBrand={initialBrand} />
    </div>
  );
}
