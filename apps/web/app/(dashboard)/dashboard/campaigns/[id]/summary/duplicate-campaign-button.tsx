"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Loader2, Rocket } from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";

const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "X/Twitter" },
  instagram: { emoji: "📸", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  email:     { emoji: "📧", label: "Email" },
  blog:      { emoji: "✍️", label: "Blog" },
};

const ALL_CHANNELS = Object.keys(CHANNEL_META);

interface DuplicateCampaignButtonProps {
  campaignId: string;
  goalType: string;
  goalTimeline: string;
  brandName: string;
  defaultChannels: string[];
}

export function DuplicateCampaignButton({
  campaignId,
  goalType,
  goalTimeline,
  brandName,
  defaultChannels,
}: DuplicateCampaignButtonProps) {
  const toast = useAppToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState<string[]>(defaultChannels.length > 0 ? defaultChannels : []);
  const [loading, setLoading] = useState<"draft" | "launch" | null>(null);

  function toggleChannel(ch: string) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  async function handleSubmit(mode: "draft" | "launch") {
    if (!description.trim()) return;
    setLoading(mode);
    try {
      const res = await api.post<{ data: { goalId: string; channels: string[] } }>(
        `/campaigns/${campaignId}/duplicate`,
        { description: description.trim(), channels },
      );
      const { goalId } = res.data;

      if (mode === "launch") {
        await api.post(`/goals/${goalId}/run-pipeline`, { channels });
        toast.success("Campaign duplicated and pipeline started");
        router.push(`/dashboard/campaigns/war-room?goalId=${goalId}`);
      } else {
        toast.success("Goal created as draft — configure and launch when ready");
        router.push(`/dashboard`);
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to duplicate campaign");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Copy className="h-4 w-4" />
          Duplicate Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Original campaign context */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
            <p className="font-medium text-foreground">{brandName}</p>
            <p className="text-muted-foreground capitalize">
              Goal: {goalType.replace(/_/g, " ")} · {goalTimeline.replace(/_/g, " ")}
            </p>
            {defaultChannels.length > 0 && (
              <p className="text-muted-foreground">
                Original channels:{" "}
                {defaultChannels
                  .map((ch) => CHANNEL_META[ch]?.emoji ?? ch)
                  .join(" ")}
              </p>
            )}
          </div>

          {/* What's different */}
          <div className="space-y-1.5">
            <Label htmlFor="dup-desc">
              What&apos;s different this time? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dup-desc"
              rows={3}
              placeholder="e.g. Targeting a different audience segment, or promoting the Q2 product launch…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Channel selection */}
          <div className="space-y-2">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((ch) => {
                const meta = CHANNEL_META[ch]!;
                const selected = channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-orion-green bg-orion-green/10 text-orion-green"
                        : "border-border bg-card text-muted-foreground hover:border-orion-green/40 hover:text-foreground"
                    }`}
                  >
                    {meta.emoji} {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!description.trim() || loading !== null}
              onClick={() => handleSubmit("draft")}
            >
              {loading === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Create Draft
            </Button>
            <Button
              type="button"
              disabled={!description.trim() || channels.length === 0 || loading !== null}
              onClick={() => handleSubmit("launch")}
              className="gap-2"
            >
              {loading === "launch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Create &amp; Launch
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
