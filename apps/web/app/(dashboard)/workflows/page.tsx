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
  createdAt: Date | string;
  runs?: WorkflowRun[];
}

interface TemplateStatus {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  triggerDescription: string;
  icon: string;
  steps: string[];
  workflowId: string | null;
  status: string | null;
  runCount: number;
  lastRunAt: string | null;
  isActive: boolean;
}

export default async function WorkflowsPage() {
  let workflows: Workflow[] = [];
  let templates: TemplateStatus[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: Workflow[] }>("/workflows")
      .then((res: { data: Workflow[] }) => { workflows = res.data; })
      .catch(() => {}),
    serverApi
      .get<{ data: TemplateStatus[] }>("/workflows/templates")
      .then((res: { data: TemplateStatus[] }) => { templates = res.data; })
      .catch(() => {}),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Activate pre-built automations or build custom ones. Trigger manually, on a schedule, or from events.
        </p>
      </div>
      <WorkflowsList initialWorkflows={workflows} initialTemplates={templates} />
    </div>
  );
}
