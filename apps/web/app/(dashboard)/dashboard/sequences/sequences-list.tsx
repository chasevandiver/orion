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
  Plus,
  Loader2,
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mail,
  Edit,
  X,
  Check,
} from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SequenceStep {
  id: string;
  stepNumber: number;
  delayDays: number;
  subject: string;
  contentText: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  status: string;
  steps: SequenceStep[];
  createdAt: Date | string;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

const TRIGGER_STYLES: Record<string, string> = {
  welcome:        "bg-blue-500/10 text-blue-400 border-blue-500/20",
  trial_ending:   "bg-purple-500/10 text-purple-400 border-purple-500/20",
  re_engagement:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  manual:         "bg-muted text-muted-foreground border-border",
  signup:         "bg-blue-500/10 text-blue-400 border-blue-500/20",
  download:       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  purchase:       "bg-orion-green/10 text-orion-green border-orion-green/20",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  draft:  "bg-muted text-muted-foreground border-border",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const TRIGGER_LABELS: Record<string, string> = {
  welcome:       "Welcome",
  trial_ending:  "Trial Ending",
  re_engagement: "Re-engagement",
  manual:        "Manual",
  signup:        "Signup",
  download:      "Download",
  purchase:      "Purchase",
};

// ── Create Wizard ─────────────────────────────────────────────────────────────

interface BuilderStep {
  stepNumber: number;
  delayDays: number;
  subject: string;
  contentText: string;
  generating: boolean;
}

const EMPTY_BUILDER_STEP = (n: number): BuilderStep => ({
  stepNumber: n,
  delayDays: n === 1 ? 0 : 3,
  subject: "",
  contentText: "",
  generating: false,
});

function CreateSequenceDialog({
  onCreated,
}: {
  onCreated: (seq: Sequence) => void;
}) {
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Step 1 fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("welcome");

  // Step 2 fields
  const [steps, setSteps] = useState<BuilderStep[]>([EMPTY_BUILDER_STEP(1)]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setWizardStep(1);
    setName("");
    setDescription("");
    setTriggerType("welcome");
    setSteps([EMPTY_BUILDER_STEP(1)]);
    setError("");
    setSubmitting(false);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  function goToStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setWizardStep(2);
  }

  // ── Step 2: AI generation ─────────────────────────────────────────────────
  async function generateStepContent(idx: number) {
    const current = steps[idx];
    if (!current) return;

    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, generating: true } : s)),
    );

    try {
      const res = await api.post<{ data: { subject: string; body: string } }>(
        "/email-sequences/generate-step",
        {
          sequenceName: name,
          triggerType,
          stepNumber: current.stepNumber,
          totalSteps: steps.length,
          brandName: "Our Brand", // TODO: pull from org context
          delayDays: current.delayDays,
          previousSubjects: steps.slice(0, idx).map((s) => s.subject).filter(Boolean),
        },
      );

      setSteps((prev) =>
        prev.map((s, i) =>
          i === idx
            ? { ...s, subject: res.data.subject, contentText: res.data.body, generating: false }
            : s,
        ),
      );
    } catch (err: any) {
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, generating: false } : s)),
      );
      setError(err.message ?? "AI generation failed");
    }
  }

  function addStep() {
    setSteps((prev) => [...prev, EMPTY_BUILDER_STEP(prev.length + 1)]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }

  function updateStep(idx: number, field: keyof BuilderStep, value: string | number) {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  }

  // ── Step 3: submit ─────────────────────────────────────────────────────────
  async function handleSubmit(activate: boolean) {
    setSubmitting(true);
    setError("");
    try {
      // Create sequence
      const seqRes = await api.post<{ data: Sequence }>("/email-sequences", {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        status: activate ? "active" : "draft",
      });
      const seq = seqRes.data;

      // Create each step
      for (const step of steps) {
        if (!step.subject.trim() && !step.contentText.trim()) continue;
        await api.post(`/email-sequences/${seq.id}/steps`, {
          stepNumber: step.stepNumber,
          delayDays: step.delayDays,
          subject: step.subject.trim() || `Step ${step.stepNumber}`,
          contentText: step.contentText.trim() || " ",
        });
      }

      // Re-fetch with steps included
      const fullRes = await api.get<{ data: Sequence }>(`/email-sequences/${seq.id}`);
      onCreated(fullRes.data);
      setOpen(false);
      reset();
    } catch (err: any) {
      setError(err.message ?? "Failed to create sequence");
    } finally {
      setSubmitting(false);
    }
  }

  const canProceedStep1 = name.trim().length > 0;
  const hasStepContent = steps.some(
    (s) => s.subject.trim() || s.contentText.trim(),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 bg-orion-green text-black hover:bg-orion-green/90">
          <Plus className="h-4 w-4" />
          Create Sequence
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {wizardStep === 1 && "New Email Sequence"}
            {wizardStep === 2 && `Add Steps — ${name}`}
            {wizardStep === 3 && "Review & Activate"}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium border transition-colors ${
                  n < wizardStep
                    ? "bg-orion-green border-orion-green text-black"
                    : n === wizardStep
                    ? "border-orion-green text-orion-green"
                    : "border-border text-muted-foreground"
                }`}
              >
                {n < wizardStep ? <Check className="h-3 w-3" /> : n}
              </div>
              {n < 3 && (
                <div
                  className={`h-px w-8 ${n < wizardStep ? "bg-orion-green" : "bg-border"}`}
                />
              )}
            </div>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            {wizardStep === 1 && "Sequence details"}
            {wizardStep === 2 && "Email steps"}
            {wizardStep === 3 && "Review"}
          </span>
        </div>

        {error && (
          <p className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* ── Step 1 ── */}
        {wizardStep === 1 && (
          <form onSubmit={goToStep2} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="seq-name">Sequence Name *</Label>
              <Input
                id="seq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New User Welcome Series"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seq-desc">Description (optional)</Label>
              <Input
                id="seq-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this sequence for?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seq-trigger">Trigger Type</Label>
              <select
                id="seq-trigger"
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="welcome">Welcome — new signup</option>
                <option value="trial_ending">Trial Ending — before trial expires</option>
                <option value="re_engagement">Re-engagement — inactive users</option>
                <option value="manual">Manual — triggered manually</option>
                <option value="signup">Signup (legacy)</option>
                <option value="download">Download — after content download</option>
                <option value="purchase">Purchase — post-purchase</option>
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!canProceedStep1}>
                Next: Add Steps
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2 ── */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Step {step.stepNumber}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => generateStepContent(idx)}
                      disabled={step.generating}
                      className="inline-flex items-center gap-1.5 rounded border border-orion-green/30 bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green hover:bg-orion-green/20 disabled:opacity-50 transition-colors"
                    >
                      {step.generating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {step.generating ? "Generating…" : "Generate with AI"}
                    </button>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Delay (days after previous step)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={step.delayDays}
                      onChange={(e) =>
                        updateStep(idx, "delayDays", parseInt(e.target.value) || 0)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subject Line</Label>
                    <Input
                      value={step.subject}
                      onChange={(e) => updateStep(idx, "subject", e.target.value)}
                      placeholder="Email subject…"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Email Body</Label>
                  <Textarea
                    value={step.contentText}
                    onChange={(e) => updateStep(idx, "contentText", e.target.value)}
                    placeholder="Write the email body here, or click Generate with AI…"
                    rows={5}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addStep}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-orion-green/30 hover:text-orion-green transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another step
            </button>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setWizardStep(1)}>
                Back
              </Button>
              <Button onClick={() => setWizardStep(3)} disabled={!hasStepContent}>
                Review
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-base">{name}</span>
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-xs capitalize ${TRIGGER_STYLES[triggerType] ?? "bg-muted text-muted-foreground border-border"}`}
                >
                  {TRIGGER_LABELS[triggerType] ?? triggerType}
                </span>
              </div>
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
              <div className="pt-1 space-y-2">
                {steps
                  .filter((s) => s.subject || s.contentText)
                  .map((s) => (
                    <div
                      key={s.stepNumber}
                      className="flex items-start gap-3 rounded border border-border bg-background p-3"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {s.stepNumber}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {s.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.delayDays === 0
                            ? "Sends immediately"
                            : `Sends after ${s.delayDays} day${s.delayDays !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setWizardStep(2)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as Draft"}
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="bg-orion-green text-black hover:bg-orion-green/90"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1.5" />
                      Activate Sequence
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Step editor (inline editing in expanded row) ──────────────────────────────

function StepEditor({
  sequenceId,
  sequenceName,
  triggerType,
  step,
  totalSteps,
  previousSubjects,
  onUpdated,
  onDeleted,
}: {
  sequenceId: string;
  sequenceName: string;
  triggerType: string;
  step: SequenceStep;
  totalSteps: number;
  previousSubjects: string[];
  onUpdated: (updated: SequenceStep) => void;
  onDeleted: () => void;
}) {
  const toast = useAppToast();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(step.subject);
  const [contentText, setContentText] = useState(step.contentText);
  const [delayDays, setDelayDays] = useState(step.delayDays);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await api.patch<{ data: SequenceStep }>(
        `/email-sequences/${sequenceId}/steps/${step.id}`,
        { subject, contentText, delayDays },
      );
      onUpdated(res.data);
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save step");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this step?")) return;
    setDeleting(true);
    try {
      await api.delete(`/email-sequences/${sequenceId}/steps/${step.id}`);
      onDeleted();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete step");
      setDeleting(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api.post<{ data: { subject: string; body: string } }>(
        "/email-sequences/generate-step",
        {
          sequenceName,
          triggerType,
          stepNumber: step.stepNumber,
          totalSteps,
          brandName: "Our Brand",
          delayDays,
          previousSubjects,
        },
      );
      setSubject(res.data.subject);
      setContentText(res.data.body);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate content");
    } finally {
      setGenerating(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-3 rounded border border-border bg-background/50 p-3 text-sm">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium mt-0.5">
          {step.stepNumber}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{step.subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {step.delayDays === 0
              ? "Sends immediately"
              : `+${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
            {step.contentText}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-orion-green/30 bg-background p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
          Editing Step {step.stepNumber}
        </span>
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded border border-orion-green/30 bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green hover:bg-orion-green/20 disabled:opacity-50 transition-colors"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {generating ? "Generating…" : "Generate with AI"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Delay (days)</Label>
          <Input
            type="number"
            min="0"
            value={delayDays}
            onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Body</Label>
        <Textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          rows={5}
          className="text-xs resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSubject(step.subject);
            setContentText(step.contentText);
            setDelayDays(step.delayDays);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Add Step inline ───────────────────────────────────────────────────────────

function AddStepInline({
  sequenceId,
  sequenceName,
  triggerType,
  nextStepNumber,
  previousSubjects,
  onAdded,
}: {
  sequenceId: string;
  sequenceName: string;
  triggerType: string;
  nextStepNumber: number;
  previousSubjects: string[];
  onAdded: (step: SequenceStep) => void;
}) {
  const toast = useAppToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [contentText, setContentText] = useState("");
  const [delayDays, setDelayDays] = useState(3);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api.post<{ data: { subject: string; body: string } }>(
        "/email-sequences/generate-step",
        {
          sequenceName,
          triggerType,
          stepNumber: nextStepNumber,
          totalSteps: nextStepNumber,
          brandName: "Our Brand",
          delayDays,
          previousSubjects,
        },
      );
      setSubject(res.data.subject);
      setContentText(res.data.body);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate content");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd() {
    setSaving(true);
    try {
      const res = await api.post<{ data: SequenceStep }>(
        `/email-sequences/${sequenceId}/steps`,
        {
          stepNumber: nextStepNumber,
          delayDays,
          subject: subject.trim() || `Step ${nextStepNumber}`,
          contentText: contentText.trim() || " ",
        },
      );
      onAdded(res.data);
      setOpen(false);
      setSubject("");
      setContentText("");
      setDelayDays(3);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add step");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-orion-green/30 hover:text-orion-green transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add step {nextStepNumber}
      </button>
    );
  }

  return (
    <div className="rounded border border-orion-green/30 bg-background p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          New Step {nextStepNumber}
        </span>
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded border border-orion-green/30 bg-orion-green/10 px-2.5 py-1 text-xs font-medium text-orion-green hover:bg-orion-green/20 disabled:opacity-50 transition-colors"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {generating ? "Generating…" : "Generate with AI"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Delay (days)</Label>
          <Input
            type="number"
            min="0"
            value={delayDays}
            onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject…"
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Body</Label>
        <Textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          placeholder="Email body…"
          rows={4}
          className="text-xs resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Step"}
        </Button>
      </div>
    </div>
  );
}

// ── Sequence row (expandable) ─────────────────────────────────────────────────

function SequenceRow({
  sequence: initial,
  onDeleted,
}: {
  sequence: Sequence;
  onDeleted: () => void;
}) {
  const toast = useAppToast();
  const [sequence, setSequence] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleStatus() {
    const newStatus = sequence.status === "active" ? "paused" : "active";
    setToggling(true);
    try {
      const res = await api.patch<{ data: Sequence }>(
        `/email-sequences/${sequence.id}`,
        { status: newStatus },
      );
      setSequence((prev) => ({ ...prev, status: res.data.status }));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update status");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${sequence.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/email-sequences/${sequence.id}`);
      onDeleted();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete sequence");
      setDeleting(false);
    }
  }

  function handleStepUpdated(stepId: string, updated: SequenceStep) {
    setSequence((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === stepId ? updated : s)),
    }));
  }

  function handleStepDeleted(stepId: string) {
    setSequence((prev) => ({
      ...prev,
      steps: prev.steps.filter((s) => s.id !== stepId).map((s, i) => ({
        ...s,
        stepNumber: i + 1,
      })),
    }));
  }

  function handleStepAdded(step: SequenceStep) {
    setSequence((prev) => ({ ...prev, steps: [...prev.steps, step] }));
  }

  const triggerStyle =
    TRIGGER_STYLES[sequence.triggerType] ?? "bg-muted text-muted-foreground border-border";
  const statusStyle =
    STATUS_STYLES[sequence.status] ?? "bg-muted text-muted-foreground border-border";
  const stepCount = sequence.steps.length;
  const previousSubjects = sequence.steps.map((s) => s.subject);

  return (
    <>
      <tr
        className="hover:bg-muted/10 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium text-foreground leading-tight">{sequence.name}</p>
              {sequence.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {sequence.description}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${triggerStyle}`}>
            {TRIGGER_LABELS[sequence.triggerType] ?? sequence.triggerType}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${statusStyle}`}>
            {sequence.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {stepCount} step{stepCount !== 1 ? "s" : ""}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(sequence.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </td>
        <td className="px-4 py-3">
          <div
            className="flex items-center gap-1 justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={toggleStatus}
              disabled={toggling}
              title={sequence.status === "active" ? "Pause" : "Activate"}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {toggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : sequence.status === "active" ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete"
              className="rounded p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded steps panel */}
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/5 px-4 py-4">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Email Steps
              </p>
              {sequence.steps.map((step) => (
                <StepEditor
                  key={step.id}
                  sequenceId={sequence.id}
                  sequenceName={sequence.name}
                  triggerType={sequence.triggerType}
                  step={step}
                  totalSteps={stepCount}
                  previousSubjects={sequence.steps
                    .filter((s) => s.stepNumber < step.stepNumber)
                    .map((s) => s.subject)}
                  onUpdated={(updated) => handleStepUpdated(step.id, updated)}
                  onDeleted={() => handleStepDeleted(step.id)}
                />
              ))}
              <AddStepInline
                sequenceId={sequence.id}
                sequenceName={sequence.name}
                triggerType={sequence.triggerType}
                nextStepNumber={stepCount + 1}
                previousSubjects={previousSubjects}
                onAdded={handleStepAdded}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SequencesList({ initialSequences }: { initialSequences: Sequence[] }) {
  const [sequences, setSequences] = useState(initialSequences);

  function handleCreated(seq: Sequence) {
    setSequences((prev) => [seq, ...prev]);
  }

  function handleDeleted(id: string) {
    setSequences((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Sequences</h1>
          <p className="text-sm text-muted-foreground">
            Automated nurture sequences for every stage
          </p>
        </div>
        <CreateSequenceDialog onCreated={handleCreated} />
      </div>

      {/* Empty state */}
      {sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Mail className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No email sequences yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first sequence to start nurturing leads automatically.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Trigger</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sequences.map((seq) => (
                <SequenceRow
                  key={seq.id}
                  sequence={seq}
                  onDeleted={() => handleDeleted(seq.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
