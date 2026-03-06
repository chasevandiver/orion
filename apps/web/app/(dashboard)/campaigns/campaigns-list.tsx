"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Plus, GitBranch, Loader2, Pause, Play, Archive } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  archived: "bg-muted/50 text-muted-foreground/50 border-border/50",
};

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  goal?: { id: string; type: string; brandName: string };
  assets?: Array<{ id: string }>;
}

export function CampaignsList({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", description: "" });

  const filtered =
    filter === "all" ? campaigns.filter((c) => c.status !== "archived") : campaigns.filter((c) => c.status === filter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Campaign }>("/campaigns", form);
      setCampaigns((prev) => [res.data, ...prev]);
      setOpen(false);
      setForm({ name: "", description: "" });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(campaign: Campaign, status: string) {
    setUpdating(campaign.id);
    try {
      const res = await api.patch<{ data: Campaign }>(`/campaigns/${campaign.id}`, { status });
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? res.data : c)));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdating(null);
    }
  }

  const STATUS_TABS = ["all", "active", "draft", "paused", "completed"];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded px-3 py-1.5 text-xs capitalize transition-colors ${
                filter === s
                  ? "bg-orion-green text-black font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Q1 LinkedIn Lead Gen"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Brief description of this campaign…"
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
      </div>

      {/* Campaign list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <GitBranch className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No {filter !== "all" ? filter : ""} campaigns</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a campaign to start organizing content.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{campaign.name}</span>
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft}`}
                  >
                    {campaign.status}
                  </span>
                </div>
                {campaign.goal && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {campaign.goal.brandName} · {campaign.goal.type}
                  </p>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {campaign.assets?.length ?? 0} assets
              </div>

              {/* Quick status actions */}
              <div className="flex items-center gap-1">
                {campaign.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={updating === campaign.id}
                    onClick={() => handleStatusChange(campaign, "active")}
                  >
                    {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Activate
                  </Button>
                )}
                {campaign.status === "active" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={updating === campaign.id}
                    onClick={() => handleStatusChange(campaign, "paused")}
                  >
                    {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                    Pause
                  </Button>
                )}
                {campaign.status === "paused" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={updating === campaign.id}
                    onClick={() => handleStatusChange(campaign, "active")}
                  >
                    {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Resume
                  </Button>
                )}
                {campaign.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={updating === campaign.id}
                    onClick={() => handleStatusChange(campaign, "archived")}
                    title="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
