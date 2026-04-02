"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Sparkles, Rocket } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  brandName: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const GOAL_TYPES = [
  { value: "lead_generation", label: "Lead Generation" },
  { value: "product_launch", label: "Product Launch" },
  { value: "webinar_signup", label: "Webinar Signup" },
  { value: "free_trial", label: "Free Trial" },
  { value: "ebook_download", label: "eBook Download" },
  { value: "demo_request", label: "Demo Request" },
  { value: "newsletter_signup", label: "Newsletter Signup" },
  { value: "event_registration", label: "Event Registration" },
];

export function GenerateLandingPageModal({ open, onClose }: Props) {
  const router = useRouter();

  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [goalType, setGoalType] = useState("lead_generation");
  const [topic, setTopic] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Load campaigns for optional linking
  useEffect(() => {
    if (!open) return;
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((json) => {
        const list = (json?.data ?? []) as Array<{ id: string; name: string }>;
        setCampaigns(list.slice(0, 20));
      })
      .catch(() => {});
  }, [open]);

  const handleGenerate = async () => {
    if (!brandName.trim()) return;
    setStatus("generating");
    setStatusMessage("Starting…");

    const body: Record<string, string> = {
      brandName: brandName.trim(),
      goalType,
    };
    if (brandDescription.trim()) body.brandDescription = brandDescription.trim();
    if (topic.trim()) body.topic = topic.trim();
    if (selectedCampaignId) body.campaignId = selectedCampaignId;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/landing-pages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newPageId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.message) setStatusMessage(parsed.message);
            if (parsed.id) newPageId = parsed.id;
          } catch {}
        }

        if (newPageId) break;
      }

      setStatus("done");
      if (newPageId) {
        setTimeout(() => {
          onClose();
          router.push(`/landing-pages/${newPageId}/edit`);
        }, 400);
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
      setStatusMessage((err as Error).message);
    }
  };

  const handleClose = () => {
    if (status === "generating") {
      abortRef.current?.abort();
    }
    setStatus("idle");
    setStatusMessage("");
    setBrandName("");
    setBrandDescription("");
    setGoalType("lead_generation");
    setTopic("");
    setSelectedCampaignId("");
    onClose();
  };

  if (!open) return null;

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold">Generate Landing Page</h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {status === "generating" || status === "done" ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              {status === "generating" ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <p className="text-sm text-muted-foreground">{statusMessage || "Generating…"}</p>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orion-green/10">
                    <Rocket className="h-5 w-5 text-orion-green" />
                  </div>
                  <p className="text-sm font-medium">Landing page created!</p>
                  <p className="text-xs text-muted-foreground">Opening the editor…</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Brand / Product Name <span className="text-destructive">*</span>
                </label>
                <input
                  className={inputCls}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g., Acme SaaS"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Brand Description (optional)
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  placeholder="Short description of your product or service"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Goal Type</label>
                <select
                  className={inputCls}
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value)}
                >
                  {GOAL_TYPES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Key Message / Topic (optional)
                </label>
                <input
                  className={inputCls}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., AI-powered analytics for e-commerce teams"
                />
              </div>

              {campaigns.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Link to Campaign (optional)
                  </label>
                  <select
                    className={inputCls}
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                  >
                    <option value="">No campaign</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {status === "error" && (
                <p className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  {statusMessage || "Generation failed. Please try again."}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {status === "idle" || status === "error" ? (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button
              onClick={handleClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!brandName.trim()}
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Page
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
