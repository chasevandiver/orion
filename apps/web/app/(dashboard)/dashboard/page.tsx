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

export default async function DashboardPage() {
  let goals: Goal[] = [];
  try {
    const res = await serverApi.get<{ data: Goal[] }>("/goals");
    goals = res.data;
  } catch {
    // Empty state shown below
  }

  return (
    <div className="space-y-6">
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
