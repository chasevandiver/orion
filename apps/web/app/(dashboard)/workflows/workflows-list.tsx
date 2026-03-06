"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Zap, Play, Loader2, Archive } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  archived: "bg-muted/50 text-muted-foreground/50 border-border/50",
};

const TRIGGER_ICONS: Record<string, string> = {
  manual: "🖱️",
  schedule: "⏰",
  event: "⚡",
};

interface Workflow {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  status: string;
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
}

export function WorkflowsList({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerType: "manual" as "manual" | "schedule" | "event",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Workflow }>("/workflows", form);
      setWorkflows((prev) => [res.data, ...prev]);
      setOpen(false);
      setForm({ name: "", description: "", triggerType: "manual" });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleTrigger(workflow: Workflow) {
    setTriggering(workflow.id);
    try {
      await api.post(`/workflows/${workflow.id}/trigger`, {});
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflow.id
            ? { ...w, runCount: w.runCount + 1, lastRunAt: new Date().toISOString() }
            : w,
        ),
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTriggering(null);
    }
  }

  async function handleActivate(workflow: Workflow) {
    const newStatus = workflow.status === "active" ? "paused" : "active";
    setStatusChanging(workflow.id);
    try {
      const res = await api.patch<{ data: Workflow }>(`/workflows/${workflow.id}`, {
        status: newStatus,
      });
      setWorkflows((prev) => prev.map((w) => (w.id === workflow.id ? res.data : w)));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setStatusChanging(null);
    }
  }

  async function handleArchive(workflow: Workflow) {
    if (!confirm("Archive this workflow?")) return;
    setStatusChanging(workflow.id);
    try {
      await api.delete(`/workflows/${workflow.id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setStatusChanging(null);
    }
  }

  const visible = workflows.filter((w) => w.status !== "archived");

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Weekly engagement report"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger Type</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, triggerType: v as typeof form.triggerType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">🖱️ Manual</SelectItem>
                  <SelectItem value="schedule">⏰ Schedule</SelectItem>
                  <SelectItem value="event">⚡ Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What does this workflow do?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <Zap className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No workflows yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Automate content scheduling, reporting, and distribution tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((workflow) => (
            <div
              key={workflow.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-base">
                {TRIGGER_ICONS[workflow.triggerType] ?? "⚙️"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{workflow.name}</span>
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[workflow.status] ?? STATUS_COLORS.draft}`}
                  >
                    {workflow.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {workflow.runCount} runs
                  {workflow.lastRunAt &&
                    ` · last ${new Date(workflow.lastRunAt).toLocaleDateString()}`}
                </p>
              </div>

              <div className="flex items-center gap-1">
                {/* Toggle active/paused */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={
                    statusChanging === workflow.id ||
                    workflow.status === "draft"
                  }
                  onClick={() => handleActivate(workflow)}
                >
                  {statusChanging === workflow.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : workflow.status === "active" ? (
                    "Pause"
                  ) : (
                    "Activate"
                  )}
                </Button>

                {/* Manual trigger */}
                {workflow.status === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={triggering === workflow.id}
                    onClick={() => handleTrigger(workflow)}
                  >
                    {triggering === workflow.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Run
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={statusChanging === workflow.id}
                  onClick={() => handleArchive(workflow)}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
