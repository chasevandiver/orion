"use client";

/**
 * SequenceBuilder — shared builder UI for creating and editing email sequences.
 * Used by /sequences/new and /sequences/[id].
 */
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, createAgentStream } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Loader2,
  ArrowLeft,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SequenceStep {
  id?: string; // undefined for new (unsaved) steps
  stepNumber: number;
  delayDays: number;
  subject: string;
  contentText: string;
}

export interface SequenceData {
  id?: string;
  name: string;
  description?: string | null;
  triggerType: string;
  status: string;
  steps: SequenceStep[];
}

interface StepStats {
  openRate?: number;
  clickRate?: number;
}

export interface SequenceBuilderProps {
  initialData?: SequenceData;
  stepStats?: Record<string, StepStats>; // stepId → stats
  onDuplicate?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "welcome", label: "Welcome", description: "Sent when a new contact joins" },
  { value: "nurture", label: "Nurture", description: "Drip sequence for engaged leads" },
  { value: "re_engagement", label: "Re-engagement", description: "Win back inactive contacts" },
  { value: "signup", label: "Signup", description: "Triggered on form signup" },
  { value: "download", label: "Download", description: "After a lead magnet download" },
  { value: "purchase", label: "Purchase", description: "Post-purchase follow-up" },
  { value: "trial_ending", label: "Trial Ending", description: "Before trial expires" },
  { value: "manual", label: "Manual / Custom", description: "Manually enrolled contacts" },
];

const TRIGGER_LABELS: Record<string, string> = Object.fromEntries(
  TRIGGER_OPTIONS.map((t) => [t.value, t.label]),
);

function defaultStep(stepNumber: number): SequenceStep {
  return { stepNumber, delayDays: stepNumber === 1 ? 0 : 1, subject: "", contentText: "" };
}

// ── Step Card ─────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: SequenceStep;
  index: number;
  total: number;
  triggerType: string;
  allSteps: SequenceStep[];
  stats?: StepStats;
  onChange: (index: number, field: keyof SequenceStep, value: string | number) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

function StepCard({
  step,
  index,
  total,
  triggerType,
  allSteps,
  stats,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepCardProps) {
  const toast = useAppToast();
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    onChange(index, "contentText", "");

    // Build context about this step's place in the sequence
    const prevSteps = allSteps.slice(0, index);
    const prevTopics = prevSteps
      .map((s, i) => `Step ${i + 1}: ${s.subject || "untitled"}`)
      .join(", ");
    const cumulativeDays = allSteps
      .slice(0, index + 1)
      .reduce((sum, s) => sum + s.delayDays, 0);

    const triggerLabel = TRIGGER_LABELS[triggerType] ?? triggerType;
    const strategyContext = [
      `This is step ${step.stepNumber} of a ${triggerLabel} email sequence.`,
      cumulativeDays > 0 ? `It is sent ${cumulativeDays} day(s) after the sequence starts.` : "It is sent immediately when the sequence starts.",
      prevTopics ? `Previous steps covered: ${prevTopics}.` : null,
      step.subject ? `Subject line for this email: "${step.subject}".` : null,
      "Write the full email body only (no subject line). Use a warm, direct tone.",
    ]
      .filter(Boolean)
      .join(" ");

    const cleanup = createAgentStream(
      "/assets/generate",
      {
        channel: "email",
        goalType: "nurture",
        brandName: "Your Brand",
        strategyContext,
      },
      {
        onChunk: (text) => {
          onChange(index, "contentText", (allSteps[index]?.contentText ?? "") + text);
        },
        onDone: () => {
          setGenerating(false);
        },
        onError: (msg) => {
          setGenerating(false);
          toast.error("Generation failed", msg);
        },
      },
    );
    abortRef.current = cleanup;
  }, [index, step, allSteps, triggerType, onChange, toast]);

  const stopGenerate = () => {
    abortRef.current?.();
    setGenerating(false);
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground">
          {step.stepNumber}
        </div>
        {index < total - 1 && (
          <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: "24px" }} />
        )}
      </div>

      {/* Card */}
      <div className="mb-4 flex-1 rounded-lg border border-border bg-card p-4">
        {/* Card header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Delay selector */}
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Wait</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={step.delayDays}
              onChange={(e) => onChange(index, "delayDays", parseInt(e.target.value, 10) || 0)}
              className="h-7 w-16 text-center text-sm"
            />
            <Label className="text-xs text-muted-foreground">
              {step.delayDays === 1 ? "day" : "days"}
              {index === 0 ? " (0 = send immediately)" : " after previous"}
            </Label>
          </div>

          {/* Step stats */}
          {stats && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {stats.openRate !== undefined && (
                <span>Open: <span className="text-foreground font-medium">{stats.openRate.toFixed(1)}%</span></span>
              )}
              {stats.clickRate !== undefined && (
                <span>Click: <span className="text-foreground font-medium">{stats.clickRate.toFixed(1)}%</span></span>
              )}
            </div>
          )}

          {/* Reorder + remove */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => onMoveDown(index)}
              disabled={index === total - 1}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => onRemove(index)}
              className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
              title="Remove step"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Subject */}
        <div className="mb-3">
          <Label className="mb-1 block text-xs text-muted-foreground">Subject line</Label>
          <Input
            placeholder={`e.g., "Welcome to ${TRIGGER_LABELS[triggerType] ?? "your journey"}"`}
            value={step.subject}
            onChange={(e) => onChange(index, "subject", e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Body */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Email body</Label>
            <button
              onClick={generating ? stopGenerate : handleGenerate}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                generating
                  ? "bg-orion-blue/10 text-orion-blue hover:bg-orion-blue/20"
                  : "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
              )}
            >
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Stop
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Generate with AI
                </>
              )}
            </button>
          </div>
          <Textarea
            placeholder="Write your email body here, or use Generate with AI…"
            value={step.contentText}
            onChange={(e) => onChange(index, "contentText", e.target.value)}
            className="min-h-[140px] text-sm font-mono leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}

// ── Add Step Button ───────────────────────────────────────────────────────────

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-orion-blue/50 hover:text-orion-blue"
    >
      <Plus className="h-4 w-4" />
      Add Step
    </button>
  );
}

// ── Main Builder ──────────────────────────────────────────────────────────────

export function SequenceBuilder({ initialData, stepStats, onDuplicate }: SequenceBuilderProps) {
  const router = useRouter();
  const toast = useAppToast();

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "" );
  const [triggerType, setTriggerType] = useState(initialData?.triggerType ?? "welcome");
  const [status, setStatus] = useState(initialData?.status ?? "draft");
  const [steps, setSteps] = useState<SequenceStep[]>(
    initialData?.steps?.length
      ? initialData.steps
      : [defaultStep(1)],
  );
  const [saving, setSaving] = useState(false);

  const sequenceId = initialData?.id;

  // ── Step mutations ──────────────────────────────────────────────────────────

  const handleStepChange = useCallback(
    (index: number, field: keyof SequenceStep, value: string | number) => {
      setSteps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index]!, [field]: value } as SequenceStep;
        return next;
      });
    },
    [],
  );

  const addStep = useCallback((afterIndex?: number) => {
    setSteps((prev) => {
      const insertAt = afterIndex !== undefined ? afterIndex + 1 : prev.length;
      const newStep = defaultStep(insertAt + 1);
      const next = [
        ...prev.slice(0, insertAt),
        newStep,
        ...prev.slice(insertAt),
      ];
      // Re-number
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => {
      if (prev.length === 1) return prev; // keep at least one step
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }, []);

  const moveStep = useCallback((index: number, direction: "up" | "down") => {
    setSteps((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }, []);

  // ── Save / Activate ─────────────────────────────────────────────────────────

  const validate = () => {
    if (!name.trim()) { toast.error("Name required", "Please enter a sequence name."); return false; }
    for (const [i, step] of steps.entries()) {
      if (!step.subject.trim()) { toast.error(`Step ${i + 1} missing subject`, "Enter a subject line for every step."); return false; }
      if (!step.contentText.trim()) { toast.error(`Step ${i + 1} missing body`, "Enter or generate email body for every step."); return false; }
    }
    return true;
  };

  const save = async (targetStatus: "draft" | "active") => {
    if (!validate()) return;
    setSaving(true);
    try {
      let seqId = sequenceId;

      if (seqId) {
        // Update metadata
        await api.patch(`/email-sequences/${seqId}`, { name, description, triggerType, status: targetStatus });
        // Sync steps: delete all existing, re-insert
        const existing = await api.get<{ data: { id: string }[] }>(`/email-sequences/${seqId}/steps`);
        await Promise.all(existing.data.map((s) => api.delete(`/email-sequences/${seqId}/steps/${s.id}`)));
      } else {
        // Create sequence
        const res = await api.post<{ data: { id: string } }>("/email-sequences", {
          name, description, triggerType, status: targetStatus,
        });
        seqId = res.data.id;
      }

      // Insert steps
      for (const step of steps) {
        await api.post(`/email-sequences/${seqId}/steps`, {
          stepNumber: step.stepNumber,
          delayDays: step.delayDays,
          subject: step.subject,
          contentText: step.contentText,
        });
      }

      setStatus(targetStatus);
      toast.success(
        targetStatus === "active" ? "Sequence activated" : "Draft saved",
        `"${name}" ${targetStatus === "active" ? "is now live" : "saved as draft"}.`,
      );

      if (!sequenceId) {
        router.push(`/sequences/${seqId}`);
      }
    } catch (err: unknown) {
      toast.error("Save failed", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!sequenceId) return;
    try {
      await api.patch(`/email-sequences/${sequenceId}`, { status: "paused" });
      setStatus("paused");
      toast.info("Sequence paused", "No new contacts will enter this sequence.");
    } catch (err: unknown) {
      toast.error("Failed to pause", (err as Error).message);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/sequences")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Sequences
        </button>
        <div className="flex items-center gap-2">
          {onDuplicate && (
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <Copy className="mr-1 h-4 w-4" />
              Duplicate
            </Button>
          )}
          {sequenceId && status === "active" && (
            <Button variant="outline" size="sm" onClick={handleDeactivate}>
              Deactivate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => save("draft")}
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save Draft
          </Button>
          <Button
            size="sm"
            disabled={saving || status === "active"}
            onClick={() => save("active")}
            className="bg-orion-green text-black hover:bg-orion-green/90"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {status === "active" ? "Active" : "Activate Sequence"}
          </Button>
        </div>
      </div>

      {/* Sequence metadata */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Sequence name</Label>
          <Input
            placeholder="e.g., SaaS Welcome Series"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Description (optional)</Label>
          <Input
            placeholder="Short description of this sequence's goal"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Trigger type</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div>
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Steps ({steps.length})
        </h2>
        <div>
          {steps.map((step, index) => (
            <StepCard
              key={`${step.id ?? "new"}-${index}`}
              step={step}
              index={index}
              total={steps.length}
              triggerType={triggerType}
              allSteps={steps}
              {...(step.id && stepStats?.[step.id] ? { stats: stepStats[step.id] } : {})}
              onChange={handleStepChange}
              onRemove={removeStep}
              onMoveUp={(i) => moveStep(i, "up")}
              onMoveDown={(i) => moveStep(i, "down")}
            />
          ))}
        </div>
        <div className="ml-10">
          <AddStepButton onClick={() => addStep()} />
        </div>
      </div>
    </div>
  );
}
