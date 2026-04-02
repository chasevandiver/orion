"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppToast } from "@/hooks/use-app-toast";

interface CompetitorAnalysis {
  competitors: Array<{
    name: string;
    headline: string;
    mainClaim: string;
    pricingStrategy: string;
    contentAngles: string[];
  }>;
  whitespace: string[];
  differentiators: string[];
  messagingWarnings: string[];
  recommendedPositioning: string;
}

interface CompetitorChange {
  detectedAt: string;
  changes: Array<{ field: string; previous: string; current: string }>;
}

interface CompetitorProfile {
  id: string;
  orgId: string;
  competitorName: string;
  websiteUrl?: string | null;
  analysisJson?: CompetitorAnalysis | null;
  competitorChanges?: CompetitorChange | null;
  lastAnalyzedAt?: string | null;
  createdAt: string;
}

export function CompetitorsDashboard({
  initialCompetitors,
}: {
  initialCompetitors: CompetitorProfile[];
}) {
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toast = useAppToast();

  // Aggregate whitespace from all competitor analyses
  const allWhitespace = Array.from(
    new Set(
      competitors.flatMap((c) => c.analysisJson?.whitespace ?? []),
    ),
  );

  // Check if any competitor has recent changes
  const competitorsWithChanges = competitors.filter((c) => c.competitorChanges);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await api.post<{ data: CompetitorProfile }>("/competitors", {
        competitorName: name,
        websiteUrl: url || undefined,
      });
      setCompetitors((prev) => [res.data, ...prev]);
      setAddOpen(false);
      setName("");
      setUrl("");
      toast.success("Competitor added and analyzed");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add competitor");
    } finally {
      setAdding(false);
    }
  }

  async function handleRefresh(id: string) {
    setRefreshingId(id);
    try {
      const res = await api.post<{ data: CompetitorProfile }>(`/competitors/${id}/refresh`, {});
      setCompetitors((prev) =>
        prev.map((c) => (c.id === id ? res.data : c)),
      );
      toast.success("Analysis refreshed");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to refresh");
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/competitors/${id}`);
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
      toast.success("Competitor removed");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      {/* Changes Alert */}
      {competitorsWithChanges.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <h3 className="font-semibold text-yellow-400">Changes Since Last Week</h3>
          </div>
          <div className="space-y-2">
            {competitorsWithChanges.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-medium">{c.competitorName}:</span>
                <ul className="ml-4 mt-1 space-y-0.5 text-muted-foreground">
                  {c.competitorChanges!.changes.slice(0, 3).map((ch, i) => (
                    <li key={i}>
                      <span className="text-foreground">{ch.field}</span> — {ch.current}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {competitors.length} competitor{competitors.length !== 1 ? "s" : ""} tracked
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Competitor Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Website URL (optional)</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  type="url"
                />
              </div>
              <Button type="submit" className="w-full" disabled={adding || !name.trim()}>
                {adding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Add & Analyze"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Competitor List */}
      {competitors.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="No competitors tracked"
          description="Add a competitor to start monitoring their positioning, pricing, and content strategy."
        />
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => {
            const isExpanded = expandedId === c.id;
            const analysis = c.analysisJson;
            // Find the matching competitor entry in the analysis
            const matchedCompetitor = analysis?.competitors.find(
              (comp) => comp.name.toLowerCase().includes(c.competitorName.toLowerCase()) ||
                c.competitorName.toLowerCase().includes(comp.name.toLowerCase()),
            ) ?? analysis?.competitors[0];

            return (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-card"
              >
                {/* Summary Row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{c.competitorName}</h3>
                      {c.competitorChanges && (
                        <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 text-[10px]">
                          Changed
                        </Badge>
                      )}
                    </div>
                    {c.websiteUrl && (
                      <a
                        href={c.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-orion-green flex items-center gap-1 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {new URL(c.websiteUrl).hostname}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {matchedCompetitor && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {matchedCompetitor.mainClaim}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">
                      {c.lastAnalyzedAt
                        ? `Analyzed ${new Date(c.lastAnalyzedAt).toLocaleDateString()}`
                        : "Not analyzed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefresh(c.id);
                      }}
                      disabled={refreshingId === c.id}
                    >
                      {refreshingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && analysis && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Competitor entries from analysis */}
                    {analysis.competitors.map((comp, i) => (
                      <div key={i} className="space-y-1.5">
                        <h4 className="text-sm font-semibold">{comp.name}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Headline: </span>
                            {comp.headline}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Main Claim: </span>
                            {comp.mainClaim}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Pricing: </span>
                            {comp.pricingStrategy}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Content Angles: </span>
                            {comp.contentAngles.join(", ")}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Differentiators */}
                    {analysis.differentiators.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Your Differentiators</h4>
                        <ul className="text-sm text-muted-foreground space-y-0.5">
                          {analysis.differentiators.map((d, i) => (
                            <li key={i}>• {d}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Messaging Warnings */}
                    {analysis.messagingWarnings.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1 text-yellow-400">Messaging Warnings</h4>
                        <ul className="text-sm text-muted-foreground space-y-0.5">
                          {analysis.messagingWarnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommended Positioning */}
                    {analysis.recommendedPositioning && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1 text-orion-green">Recommended Positioning</h4>
                        <p className="text-sm text-muted-foreground">{analysis.recommendedPositioning}</p>
                      </div>
                    )}

                    {/* Changes Detail */}
                    {c.competitorChanges && (
                      <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                        <h4 className="text-sm font-semibold text-yellow-400 mb-2">
                          Changes Detected ({new Date(c.competitorChanges.detectedAt).toLocaleDateString()})
                        </h4>
                        <div className="space-y-1.5">
                          {c.competitorChanges.changes.map((ch, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-medium">{ch.field}</span>
                              <div className="ml-2 text-xs text-muted-foreground">
                                <span className="line-through">{ch.previous}</span>
                                {" → "}
                                <span className="text-foreground">{ch.current}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Combined Whitespace Opportunities */}
      {allWhitespace.length > 0 && (
        <div className="rounded-lg border border-orion-green/20 bg-orion-green/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="h-4 w-4 text-orion-green" />
            <h3 className="font-semibold text-orion-green">Whitespace Opportunities</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Market gaps identified across all competitor analyses:
          </p>
          <ul className="space-y-1">
            {allWhitespace.map((w, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-orion-green mt-1 shrink-0">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
