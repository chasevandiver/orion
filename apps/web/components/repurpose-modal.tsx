"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, GitFork } from "lucide-react";

const ALL_CHANNELS = [
  { value: "linkedin",  label: "LinkedIn",  emoji: "💼" },
  { value: "twitter",   label: "X / Twitter", emoji: "🐦" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "facebook",  label: "Facebook",  emoji: "📘" },
  { value: "tiktok",    label: "TikTok",    emoji: "🎵" },
  { value: "email",     label: "Email",     emoji: "📧" },
  { value: "blog",      label: "Blog",      emoji: "✍️" },
];

interface RepurposeModalProps {
  /** The asset to repurpose */
  assetId: string;
  /** The channel the asset was originally created for (pre-deselected) */
  sourceChannel: string;
  /** Short preview of the asset content */
  contentPreview: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RepurposeModal({
  assetId,
  sourceChannel,
  contentPreview,
  open,
  onOpenChange,
}: RepurposeModalProps) {
  const router = useRouter();
  const toast = useAppToast();

  // Pre-check all channels except the source
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(ALL_CHANNELS.map((c) => c.value).filter((v) => v !== sourceChannel)),
  );
  const [loading, setLoading] = useState(false);

  function toggleChannel(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Select at least one channel.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ data: { goalId: string } }>(
        `/assets/${assetId}/repurpose`,
        { channels: Array.from(selected) },
      );
      const goalId = res.data.goalId;
      onOpenChange(false);
      router.push(`/dashboard/campaigns/war-room?goalId=${goalId}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start repurpose");
    } finally {
      setLoading(false);
    }
  }

  // Reset selection whenever the modal opens
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSelected(new Set(ALL_CHANNELS.map((c) => c.value).filter((v) => v !== sourceChannel)));
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-4 w-4" />
            Repurpose Content
          </DialogTitle>
        </DialogHeader>

        {/* Source preview */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            Source · {ALL_CHANNELS.find((c) => c.value === sourceChannel)?.label ?? sourceChannel}
          </p>
          <p className="text-sm leading-relaxed line-clamp-4">{contentPreview}</p>
        </div>

        {/* Channel selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Repurpose to</p>
          <div className="grid grid-cols-4 gap-2">
            {ALL_CHANNELS.map((ch) => {
              const isSource = ch.value === sourceChannel;
              const isChecked = selected.has(ch.value);
              return (
                <button
                  key={ch.value}
                  type="button"
                  disabled={isSource}
                  onClick={() => toggleChannel(ch.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                    isSource
                      ? "border-border/40 text-muted-foreground/40 cursor-not-allowed opacity-40"
                      : isChecked
                      ? "border-orion-green bg-orion-green/10 text-orion-green"
                      : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent"
                  }`}
                >
                  <span className="text-base">{ch.emoji}</span>
                  <span className="truncate text-[10px]">{ch.label}</span>
                  {isSource && (
                    <span className="text-[9px] leading-none">source</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.size === 0
              ? "No channels selected"
              : `${selected.size} channel${selected.size !== 1 ? "s" : ""} selected`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selected.size === 0 || loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitFork className="h-4 w-4" />
            )}
            {loading
              ? "Starting…"
              : `Repurpose to ${selected.size} channel${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
