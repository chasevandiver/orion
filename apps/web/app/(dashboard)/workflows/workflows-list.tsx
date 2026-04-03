"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Zap,
  Play,
  Loader2,
  Archive,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  Pause,
  ToggleLeft,
  ToggleRight,
  Sparkles,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-muted text-muted-foreground border-border",
  active:   "bg-orion-green/10 text-orion-green border-orion-green/20",
  paused:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  archived: "bg-muted/50 text-muted-foreground/50 border-border/50",
};

const TRIGGER_ICONS: Record<string, string> = {
  manual:   "🖱️",
  schedule: "⏰",
  event:    "⚡",
};

const ACTIONS = [
  {
    value:       "publish_queue",
    label:       "Publish Queue",
    description: "Schedule all approved content for publishing",
  },
  {
    value:       "run_analytics",
    label:       "Run Analytics",
    description: "Trigger optimization reports for active campaigns",
  },
  {
    value:       "score_contacts",
    label:       "Score Contacts",
    description: "AI-score all contacts with a 0 lead score",
  },
  {
    value:       "send_sequence",
    label:       "Send Sequence",
    description: "Enroll matching contacts in an email sequence",
  },
] as const;

type ActionType = (typeof ACTIONS)[number]["value"];

const SCHEDULE_PRESETS = [
  { value: "daily_morning", label: "Daily at 9am UTC" },
  { value: "daily_evening", label: "Daily at 6pm UTC" },
  { value: "weekly_monday", label: "Every Monday at 9am" },
  { value: "weekly_friday", label: "Every Friday at 9am" },
];

const EVENT_OPTIONS = [
  { value: "campaign.completed", label: "Campaign Completed" },
  { value: "contact.scored",     label: "Contact Scored" },
  { value: "goal.created",       label: "Goal Created" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionLabel(workflow: Workflow): string {
  const type = workflow.stepsJson?.[0]?.type;
  return ACTIONS.find((a) => a.value === type)?.label ?? "—";
}

function runStatusIcon(status: string) {
  if (status === "completed")
    return <CheckCircle className="h-3.5 w-3.5 text-orion-green shrink-0" />;
  if (status === "failed")
    return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0 animate-pulse" />;
}

function formatDuration(start: string, end?: string): string {
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Template run history ───────────────────────────────────────────────────────

function TemplateRunHistory({ templateId }: { templateId: string }) {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: WorkflowRun[] }>(`/workflows/templates/${templateId}/runs`);
      setRuns(res.data ?? []);
      setLoaded(true);
    } catch {
      setRuns([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) load();

  if (loading || !loaded) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading run history…
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No runs yet.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {runs.map((run) => {
        const log = run.logJson as Record<string, unknown> | undefined;
        const result = log?.result as Record<string, unknown> | undefined;
        const error = log?.error as string | undefined;

        return (
          <div key={run.id} className="flex items-start gap-3 px-3 py-2.5 text-xs bg-background/50">
            {runStatusIcon(run.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="capitalize font-medium">{run.status}</span>
                <span className="text-muted-foreground">
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {run.completedAt && (
                  <span className="text-muted-foreground">
                    · {formatDuration(run.startedAt, run.completedAt)}
                  </span>
                )}
              </div>
              {error && <p className="mt-0.5 text-red-400 truncate">{error}</p>}
              {result && (
                <p className="mt-0.5 text-muted-foreground">
                  {Object.entries(result)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template: initial,
  onToggle,
}: {
  template: TemplateStatus;
  onToggle: (updated: TemplateStatus) => void;
}) {
  const toast = useAppToast();
  const [template, setTemplate] = useState(initial);
  const [toggling, setToggling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      if (template.isActive) {
        // Deactivate
        await api.delete(`/workflows/templates/${template.id}/activate`);
        const updated = { ...template, isActive: false, status: "paused" };
        setTemplate(updated);
        onToggle(updated);
        toast.success(`"${template.name}" deactivated`);
      } else {
        // Activate
        const res = await api.post<{ data: Workflow }>(
          `/workflows/templates/${template.id}/activate`,
          {},
        );
        const updated: TemplateStatus = {
          ...template,
          isActive: true,
          status: "active",
          workflowId: res.data.id,
        };
        setTemplate(updated);
        onToggle(updated);
        toast.success(`"${template.name}" activated`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to toggle workflow");
    } finally {
      setToggling(false);
    }
  }

  const triggerIcon = template.triggerType === "schedule" ? "⏰" : "⚡";

  return (
    <div
      className={`rounded-lg border bg-card overflow-hidden transition-colors ${
        template.isActive ? "border-orion-green/30" : "border-border"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-4 px-4 py-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-xl">
          {template.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="font-semibold">{template.name}</span>
            {template.isActive ? (
              <span className="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase bg-orion-green/10 text-orion-green border-orion-green/20">
                active
              </span>
            ) : (
              <span className="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase bg-muted text-muted-foreground border-border">
                inactive
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-snug">{template.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {triggerIcon} {template.triggerDescription}
            </span>
            {template.runCount > 0 && (
              <span>
                {template.runCount} run{template.runCount !== 1 ? "s" : ""}
                {template.lastRunAt &&
                  ` · last ${new Date(template.lastRunAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}`}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <Button
            variant={template.isActive ? "outline" : "default"}
            size="sm"
            className={`h-8 gap-1.5 text-xs min-w-[100px] ${
              template.isActive
                ? "border-orion-green/30 text-orion-green hover:bg-orion-green/10"
                : ""
            }`}
            disabled={toggling}
            onClick={handleToggle}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : template.isActive ? (
              <>
                <ToggleRight className="h-3.5 w-3.5" />
                Deactivate
              </>
            ) : (
              <>
                <ToggleLeft className="h-3.5 w-3.5" />
                Activate
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/5 px-4 py-3 space-y-4">
          {/* Step list */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Automation Steps
            </p>
            <ol className="space-y-1">
              {template.steps.map((step, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Run history */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Run History
            </p>
            <TemplateRunHistory templateId={template.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Run history panel (for custom workflows) ───────────────────────────────────

function RunHistory({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: Workflow }>(`/workflows/${workflowId}`);
      setRuns(res.data.runs ?? []);
      setLoaded(true);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) load();

  if (loading || !loaded) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading run history…
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">No runs yet.</p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {runs.slice(0, 10).map((run) => {
        const log = run.logJson as Record<string, unknown> | undefined;
        const result = log?.result as Record<string, unknown> | undefined;
        const error = log?.error as string | undefined;

        return (
          <div key={run.id} className="flex items-start gap-3 px-3 py-2.5 text-xs bg-background/50">
            {runStatusIcon(run.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="capitalize font-medium">{run.status}</span>
                <span className="text-muted-foreground">
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {run.completedAt && (
                  <span className="text-muted-foreground">
                    · {formatDuration(run.startedAt, run.completedAt)}
                  </span>
                )}
              </div>
              {error && <p className="mt-0.5 text-red-400 truncate">{error}</p>}
              {result && (
                <p className="mt-0.5 text-muted-foreground">
                  {Object.entries(result)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Create workflow dialog ─────────────────────────────────────────────────────

function CreateWorkflowDialog({ onCreated }: { onCreated: (w: Workflow) => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<"manual" | "schedule" | "event">("manual");
  const [action, setAction] = useState<ActionType>("publish_queue");
  const [schedule, setSchedule] = useState("daily_morning");
  const [eventName, setEventName] = useState("campaign.completed");
  const [error, setError] = useState("");

  function reset() {
    setName("");
    setDescription("");
    setTriggerType("manual");
    setAction("publish_queue");
    setSchedule("daily_morning");
    setEventName("campaign.completed");
    setError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        action: { type: action },
      };
      if (triggerType === "schedule") payload.schedule = schedule;
      if (triggerType === "event") payload.eventName = eventName;

      const res = await api.post<{ data: Workflow }>("/workflows", payload);
      onCreated(res.data);
      setOpen(false);
      reset();
    } catch (err: any) {
      setError(err.message ?? "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  }

  const selectedAction = ACTIONS.find((a) => a.value === action);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Custom Workflow
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Custom Workflow</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          {error && (
            <p className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly content push"
              autoFocus
            />
          </div>

          {/* Trigger type */}
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select
              value={triggerType}
              onValueChange={(v) => setTriggerType(v as typeof triggerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">🖱️ Manual — run on demand</SelectItem>
                <SelectItem value="schedule">⏰ Schedule — run on a cron</SelectItem>
                <SelectItem value="event">⚡ Event — run when something happens</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional trigger config */}
          {triggerType === "schedule" && (
            <div className="space-y-1.5">
              <Label>Schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {triggerType === "event" && (
            <div className="space-y-1.5">
              <Label>Trigger Event</Label>
              <Select value={eventName} onValueChange={setEventName}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action selector */}
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as ActionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAction && (
              <p className="text-xs text-muted-foreground">{selectedAction.description}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this workflow do?"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()} className="gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Custom workflow card ───────────────────────────────────────────────────────

function WorkflowCard({
  workflow: initial,
  onArchived,
}: {
  workflow: Workflow;
  onArchived: () => void;
}) {
  const toast = useAppToast();
  const [workflow, setWorkflow] = useState(initial);
  const [triggering, setTriggering] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await api.post(`/workflows/${workflow.id}/trigger`, {});
      setWorkflow((w) => ({
        ...w,
        runCount: w.runCount + 1,
        lastRunAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to trigger workflow");
    } finally {
      setTriggering(false);
    }
  }

  async function handleToggleStatus() {
    const newStatus = workflow.status === "active" ? "paused" : "active";
    setStatusChanging(true);
    try {
      const res = await api.patch<{ data: Workflow }>(`/workflows/${workflow.id}`, {
        status: newStatus,
      });
      setWorkflow(res.data);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update workflow status");
    } finally {
      setStatusChanging(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive "${workflow.name}"?`)) return;
    setStatusChanging(true);
    try {
      await api.delete(`/workflows/${workflow.id}`);
      onArchived();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to archive workflow");
      setStatusChanging(false);
    }
  }

  const config = (workflow.triggerConfigJson ?? {}) as Record<string, string>;
  const scheduleLabel = SCHEDULE_PRESETS.find((p) => p.value === config.schedule)?.label;
  const eventLabel = EVENT_OPTIONS.find((e) => e.value === config.event)?.label;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-base">
          {TRIGGER_ICONS[workflow.triggerType] ?? "⚙️"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{workflow.name}</span>
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[workflow.status] ?? STATUS_COLORS.draft}`}
            >
              {workflow.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            <span>{actionLabel(workflow)}</span>
            {scheduleLabel && <span>· {scheduleLabel}</span>}
            {eventLabel && <span>· on {eventLabel}</span>}
            <span>
              {workflow.runCount} run{workflow.runCount !== 1 ? "s" : ""}
              {workflow.lastRunAt &&
                ` · last ${new Date(workflow.lastRunAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle active/paused */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={statusChanging || workflow.status === "draft"}
            onClick={handleToggleStatus}
          >
            {statusChanging ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : workflow.status === "active" ? (
              <>
                <Pause className="h-3 w-3" />
                Pause
              </>
            ) : (
              "Activate"
            )}
          </Button>

          {/* Manual trigger */}
          {workflow.status === "active" && workflow.triggerType === "manual" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={triggering}
              onClick={handleTrigger}
            >
              {triggering ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Run
            </Button>
          )}

          {/* Archive */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            disabled={statusChanging}
            onClick={handleArchive}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>

          {/* Expand/collapse */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded run history */}
      {expanded && (
        <div className="border-t border-border bg-muted/5 px-4 py-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Run History
          </p>
          <RunHistory workflowId={workflow.id} />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WorkflowsList({
  initialWorkflows,
  initialTemplates,
}: {
  initialWorkflows: Workflow[];
  initialTemplates?: TemplateStatus[];
}) {
  const [workflows, setWorkflows] = useState(
    initialWorkflows.filter((w) => w.status !== "archived"),
  );
  const [templates, setTemplates] = useState(initialTemplates ?? []);

  // Filter out custom workflows that are actually template-backed (they show in the templates section)
  const customWorkflows = workflows.filter((w) => {
    const steps = w.stepsJson ?? [];
    return steps[0]?.type !== "template";
  });

  function handleCreated(w: Workflow) {
    setWorkflows((prev) => [w, ...prev]);
  }

  function handleArchived(id: string) {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }

  function handleTemplateToggled(updated: TemplateStatus) {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="space-y-8">
      {/* ── Pre-built Templates ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pre-built Templates</h2>
          <span className="text-xs text-muted-foreground">
            — activate with one click
          </span>
        </div>
        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No templates available. Make sure the API server is running and refresh the page.
            </div>
          ) : (
            templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onToggle={handleTemplateToggled}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Custom Workflows ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Custom Workflows</h2>
          </div>
          <CreateWorkflowDialog onCreated={handleCreated} />
        </div>

        {customWorkflows.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No custom workflows yet"
            description="Automate your marketing. Workflows trigger actions automatically — like emailing new leads or alerting you when a campaign performs well."
            actions={[{ label: "Browse Templates", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) }]}
          />
        ) : (
          <div className="space-y-2">
            {customWorkflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onArchived={() => handleArchived(workflow.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
