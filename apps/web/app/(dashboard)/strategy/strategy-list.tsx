"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, ChevronDown, ChevronUp, Loader2, Target } from "lucide-react";

interface Strategy {
  id: string;
  goalId: string;
  contentText: string;
  channels?: string[];
  kpis?: Record<string, string>;
  targetAudiences?: Array<{ name: string; description: string }>;
  tokensUsed?: number;
  generatedAt: string;
  goal?: { id: string; type: string; brandName: string };
}

export function StrategyList({ initialStrategies }: { initialStrategies: Strategy[] }) {
  const [strategies, setStrategies] = useState(initialStrategies);
  const [expanded, setExpanded] = useState<string | null>(
    initialStrategies[0]?.id ?? null,
  );
  const [regenerating, setRegenerating] = useState<string | null>(null);

  async function handleRegenerate(strategy: Strategy) {
    setRegenerating(strategy.id);
    try {
      await api.post(`/strategies/${strategy.id}/regenerate`, {});
      alert("Regeneration queued. Refresh in a minute to see the new strategy.");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegenerating(null);
    }
  }

  if (strategies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <Brain className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-medium">No strategies yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a goal on the Goals page — ORION will generate a strategy automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {strategies.map((strategy) => {
        const isOpen = expanded === strategy.id;
        return (
          <div key={strategy.id} className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div
              className="flex cursor-pointer items-center justify-between p-4"
              onClick={() => setExpanded(isOpen ? null : strategy.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orion-green/10">
                  <Brain className="h-4 w-4 text-orion-green" />
                </div>
                <div>
                  <p className="font-medium">{strategy.goal?.brandName ?? "Strategy"}</p>
                  <p className="text-xs text-muted-foreground">
                    {strategy.goal?.type} ·{" "}
                    {new Date(strategy.generatedAt).toLocaleDateString()}
                    {strategy.tokensUsed && ` · ${strategy.tokensUsed.toLocaleString()} tokens`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Channel badges */}
                {strategy.channels?.slice(0, 3).map((ch) => (
                  <Badge key={ch} variant="outline" className="text-[10px]">
                    {ch}
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={regenerating === strategy.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRegenerate(strategy);
                  }}
                >
                  {regenerating === strategy.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-border p-4">
                {/* Structured fields row */}
                {(strategy.targetAudiences?.length || strategy.kpis) && (
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    {strategy.targetAudiences && strategy.targetAudiences.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <Target className="h-3 w-3" /> Target Audiences
                        </p>
                        <ul className="space-y-1">
                          {strategy.targetAudiences.map((a, i) => (
                            <li key={i} className="text-xs">
                              <span className="font-medium">{a.name}</span>
                              {a.description && (
                                <span className="text-muted-foreground"> — {a.description}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {strategy.kpis && Object.keys(strategy.kpis).length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          KPI Targets
                        </p>
                        <ul className="space-y-1">
                          {Object.entries(strategy.kpis)
                            .slice(0, 5)
                            .map(([k, v]) => (
                              <li key={k} className="text-xs">
                                <span className="font-medium">{k}:</span>{" "}
                                <span className="text-muted-foreground">{v}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Full strategy text rendered as pre-wrap */}
                <div className="max-h-[28rem] overflow-y-auto rounded-md bg-muted/40 p-4">
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {strategy.contentText}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
