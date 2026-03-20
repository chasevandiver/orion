import { serverApi } from "@/lib/server-api";
import { WorkflowsList } from "./workflows-list";

export const metadata = { title: "Workflows" };

interface WorkflowRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  logJson?: Record<string, unknown>;
}

interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  triggerType: string;
  triggerConfigJson?: Record<string, unknown>;
  stepsJson?: Array<{ type: string; [k: string]: unknown }>;
  status: string;
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
  runs?: WorkflowRun[];
}

export default async function WorkflowsPage() {
  let workflows: Workflow[] = [];
  try {
    const res = await serverApi.get<{ data: Workflow[] }>("/workflows");
    workflows = res.data;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Automate recurring marketing tasks. Trigger manually or on a schedule.
        </p>
      </div>
      <WorkflowsList initialWorkflows={workflows} />
    </div>
  );
}
