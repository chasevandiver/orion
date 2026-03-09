"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, Brain, GitBranch, Loader2, Trash2, ImageIcon, Sparkles, X } from "lucide-react";

const GOAL_TYPES = [
  { value: "leads", label: "Lead Generation" },
  { value: "awareness", label: "Brand Awareness" },
  { value: "conversions", label: "Conversions" },
  { value: "traffic", label: "Website Traffic" },
  { value: "social", label: "Social Growth" },
  { value: "product", label: "Product Launch" },
  { value: "event", label: "Event Promotion" },
];

const TIMELINES = [
  { value: "1_week", label: "1 Week" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "1_month", label: "1 Month" },
  { value: "3_months", label: "3 Months" },
];

const ALL_CHANNELS = [
  { value: "linkedin",  label: "LinkedIn",   emoji: "💼" },
  { value: "twitter",   label: "Twitter/X",  emoji: "🐦" },
  { value: "instagram", label: "Instagram",  emoji: "📸" },
  { value: "facebook",  label: "Facebook",   emoji: "📘" },
  { value: "tiktok",    label: "TikTok",     emoji: "🎵" },
  { value: "email",     label: "Email",      emoji: "📧" },
  { value: "blog",      label: "Blog",       emoji: "✍️" },
];

const RECOMMENDED_CHANNELS: Record<string, string[]> = {
  leads:       ["linkedin", "email"],
  awareness:   ["instagram", "facebook", "twitter"],
  event:       ["linkedin", "instagram", "email"],
  product:     ["instagram", "facebook", "linkedin"],
  traffic:     ["twitter", "blog", "facebook"],
  social:      ["instagram", "tiktok", "twitter"],
  conversions: ["email", "linkedin", "facebook"],
};

const GOAL_TYPE_COLORS: Record<string, string> = {
  leads: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awareness: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  conversions: "bg-orion-green/10 text-orion-green border-orion-green/20",
  traffic: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  social: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  product: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  event: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

interface Goal {
  id: string;
  type: string;
  brandName: string;
  brandDescription?: string;
  timeline: string;
  budget?: number;
  status: string;
  createdAt: string;
  strategies?: Array<{ id: string }>;
  campaigns?: Array<{ id: string; name: string; status: string }>;
}

interface InitialBrand {
  name?: string;
  description?: string;
  targetAudience?: string;
}

export function GoalsList({
  initialGoals,
  initialBrand,
}: {
  initialGoals: Goal[];
  initialBrand?: InitialBrand | null;
}) {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Two-step modal state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(RECOMMENDED_CHANNELS["leads"] ?? ["linkedin"]);
  const [abTesting, setAbTesting] = useState(false);

  const [visualMode, setVisualMode] = useState<"generate" | "user-photo">("generate");
  const [uploadedPhoto, setUploadedPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [manualUrlError, setManualUrlError] = useState("");
  const [form, setForm] = useState({
    type: "leads",
    brandName: initialBrand?.name ?? "",
    brandDescription: initialBrand?.description ?? "",
    targetAudience: initialBrand?.targetAudience ?? "",
    timeline: "1_month",
    budget: "",
  });

  function resetModal() {
    setStep(1);
    setSelectedChannels(RECOMMENDED_CHANNELS["leads"] ?? ["linkedin"]);
    setAbTesting(false);
    setVisualMode("generate");
    setUploadedPhoto(null);
    setManualUrl("");
    setManualUrlError("");
    setForm({
      type: "leads",
      brandName: initialBrand?.name ?? "",
      brandDescription: initialBrand?.description ?? "",
      targetAudience: initialBrand?.targetAudience ?? "",
      timeline: "1_month",
      budget: "",
    });
  }

  function handleGoalTypeChange(newType: string) {
    setForm((f) => ({ ...f, type: newType }));
    setSelectedChannels(RECOMMENDED_CHANNELS[newType] ?? ["linkedin"]);
  }

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  async function handlePhotoFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? "Upload failed");
      }
      const { url } = await res.json();
      setUploadedPhoto({ url, preview: URL.createObjectURL(file) });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedChannels.length === 0) return;

    if (visualMode === "user-photo" && !uploadedPhoto && manualUrl) {
      if (!manualUrl.startsWith("https://") && !manualUrl.startsWith("http://")) {
        setManualUrlError("Please enter a valid URL starting with https://");
        return;
      }
    }

    setCreating(true);

    const sourcePhotoUrl =
      visualMode === "user-photo"
        ? (uploadedPhoto?.url || (manualUrl.startsWith("http") ? manualUrl : undefined))
        : undefined;

    try {
      const body: Record<string, unknown> = {
        type: form.type,
        brandName: form.brandName,
        brandDescription: form.brandDescription || undefined,
        targetAudience: form.targetAudience || undefined,
        timeline: form.timeline,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        channels: selectedChannels,
        abTesting,
      };
      if (sourcePhotoUrl) body.sourcePhotoUrl = sourcePhotoUrl;

      const res = await api.post<{ data: Goal }>("/goals", body);
      setOpen(false);
      resetModal();
      router.push(`/dashboard/pipeline/${res.data.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await api.delete(`/goals/${id}`);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* New Goal button */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetModal();
        }}
      >
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Goal
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Create Marketing Goal
              <span className="text-xs font-normal text-muted-foreground">
                Step {step} of 2
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex-1 overflow-y-auto pr-1">
            {/* ── Step 1: Goal details ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Goal Type</Label>
                    <Select value={form.type} onValueChange={handleGoalTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timeline</Label>
                    <Select value={form.timeline} onValueChange={(v) => setForm((f) => ({ ...f, timeline: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMELINES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Brand Name *</Label>
                  <Input
                    required
                    value={form.brandName}
                    onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Brand Description</Label>
                  <Textarea
                    value={form.brandDescription}
                    onChange={(e) => setForm((f) => ({ ...f, brandDescription: e.target.value }))}
                    placeholder="B2B SaaS platform that helps teams automate workflows..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Target Audience</Label>
                  <Input
                    value={form.targetAudience}
                    onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
                    placeholder="Marketing managers at mid-size SaaS companies"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Budget (optional, USD)</Label>
                  <Input
                    type="number"
                    value={form.budget}
                    onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Visuals</Label>
                  <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => { setVisualMode("generate"); setUploadedPhoto(null); setManualUrl(""); setManualUrlError(""); }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        visualMode === "generate"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate visuals
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualMode("user-photo")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        visualMode === "user-photo"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Use my photo
                    </button>
                  </div>

                  {visualMode === "generate" && (
                    <p className="text-[11px] text-muted-foreground">
                      ORION will generate unique AI visuals styled to your brand for each channel.
                    </p>
                  )}

                  {visualMode === "user-photo" && (
                    <div className="space-y-3">
                      {uploadedPhoto ? (
                        <div className="relative rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={uploadedPhoto.preview}
                            alt="Uploaded photo"
                            className="h-36 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setUploadedPhoto(null)}
                            className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-5 text-center transition-colors hover:border-muted-foreground/50">
                          {uploading ? (
                            <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" />
                          ) : (
                            <ImageIcon className="mb-2 h-6 w-6 text-muted-foreground" />
                          )}
                          <p className="text-xs font-medium text-muted-foreground">
                            {uploading ? "Uploading…" : "Click or drag to upload your photo"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">JPG, PNG, WebP — max 10 MB</p>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) { setManualUrl(""); setManualUrlError(""); handlePhotoFile(file); }
                            }}
                          />
                        </label>
                      )}

                      {!uploadedPhoto && (
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or paste a URL</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      {!uploadedPhoto && (
                        <div className="space-y-1">
                          <Input
                            type="url"
                            placeholder="https://example.com/my-photo.jpg"
                            value={manualUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              setManualUrl(val);
                              if (val && !val.startsWith("https://") && !val.startsWith("http://")) {
                                setManualUrlError("Please enter a valid URL starting with https://");
                              } else {
                                setManualUrlError("");
                              }
                            }}
                          />
                          {manualUrlError && (
                            <p className="text-[11px] text-destructive">{manualUrlError}</p>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-muted-foreground">
                        AI will analyze your photo for mood, subject, and style — then tailor all copy to it.
                        Your photo will be used as the visual background for every channel.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={!form.brandName}
                    onClick={() => setStep(2)}
                    className="gap-2"
                  >
                    Next: Select Channels
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Channel selection + A/B toggle ───────────────────────── */}
            {step === 2 && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Select channels for your campaign. Recommended channels are pre-selected based on your goal type.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {ALL_CHANNELS.map((ch) => {
                    const isSelected = selectedChannels.includes(ch.value);
                    const isRecommended = (RECOMMENDED_CHANNELS[form.type] ?? []).includes(ch.value);
                    return (
                      <button
                        key={ch.value}
                        type="button"
                        onClick={() => toggleChannel(ch.value)}
                        className={`relative flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-orion-green bg-orion-green/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                        }`}
                      >
                        <span className="text-base">{ch.emoji}</span>
                        <span className="font-medium">{ch.label}</span>
                        {isRecommended && (
                          <span className="ml-auto rounded border border-orion-green/30 px-1 py-0.5 font-mono text-[9px] text-orion-green">
                            REC
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedChannels.length === 0 && (
                  <p className="text-[11px] text-destructive">Select at least one channel to continue.</p>
                )}

                {/* A/B Testing toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium">Generate A/B variants</p>
                    <p className="text-[11px] text-muted-foreground">
                      Generate 2 copy variants per channel for split testing
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={abTesting}
                    onClick={() => setAbTesting((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                      abTesting ? "bg-orion-green" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
                        abTesting ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || selectedChannels.length === 0}
                    className="gap-2"
                  >
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create &amp; Generate Strategy
                  </Button>
                </div>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Goals grid */}
      {goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Brain className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No goals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a goal and ORION will generate a complete marketing strategy.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-orion-green/50"
            >
              {/* Type badge */}
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${GOAL_TYPE_COLORS[goal.type] ?? "bg-muted text-muted-foreground border-border"}`}
                >
                  {goal.type}
                </span>
                {confirmDelete === goal.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={deleting === goal.id}
                      onClick={() => handleDelete(goal.id)}
                    >
                      {deleting === goal.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Delete?"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    disabled={deleting === goal.id}
                    onClick={() => setConfirmDelete(goal.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>

              <h3 className="font-semibold leading-tight">{goal.brandName}</h3>
              {goal.brandDescription && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {goal.brandDescription}
                </p>
              )}

              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{goal.timeline.replace("_", " ")}</span>
                {goal.budget && <span>${goal.budget.toLocaleString()}</span>}
              </div>

              {/* Strategy & campaign counts */}
              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs">
                <button
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-orion-green"
                  onClick={() => router.push("/dashboard/strategy")}
                >
                  <Brain className="h-3.5 w-3.5" />
                  {goal.strategies?.length ?? 0} strategies
                </button>
                <button
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-orion-green"
                  onClick={() => router.push("/dashboard/campaigns")}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {goal.campaigns?.length ?? 0} campaigns
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
