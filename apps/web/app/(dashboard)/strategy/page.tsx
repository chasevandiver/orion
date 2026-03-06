/**
 * /dashboard/strategy — Strategy viewer
 *
 * Lists all strategies for the org, renders the markdown content,
 * and exposes a Regenerate button that fires POST /strategies/:id/regenerate.
 */
import { serverApi } from "@/lib/server-api";
import { StrategyList } from "./strategy-list";

export const metadata = { title: "Strategy" };

interface Strategy {
  id: string;
  goalId: string;
  contentText: string;
  channels?: string[];
  kpis?: Record<string, string>;
  targetAudiences?: Array<{ name: string; description: string }>;
  modelVersion?: string;
  tokensUsed?: number;
  generatedAt: string;
  goal?: { id: string; type: string; brandName: string };
}

export default async function StrategyPage() {
  let strategies: Strategy[] = [];
  try {
    const res = await serverApi.get<{ data: Strategy[] }>("/strategies");
    strategies = res.data;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategy</h1>
        <p className="text-sm text-muted-foreground">
          AI-generated marketing strategies. Create a goal to trigger a new one.
        </p>
      </div>
      <StrategyList initialStrategies={strategies} />
    </div>
  );
}
