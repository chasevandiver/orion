"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { StrategyView, type StrategyJSON } from "@/components/strategy-view";

interface Strategy {
  id: string;
  goalId: string;
  contentText: string;
  contentJson?: StrategyJSON | null;
  channels?: string[];
  kpis?: Record<string, string>;
  targetAudiences?: Array<{ name: string; description: string }>;
  tokensUsed?: number;
  generatedAt: string;
  goal?: { id: string; type: string; brandName: string };
}

export function StrategyList({ initialStrategies }: { initialStrategies: Strategy[] }) {
  const toast = useAppToast();
  const [strategies, setStrategies] = useState(initialStrategies);
  const [expanded, setExpanded] = useState<string | null>(
    initialStrategies[0]?.id ?? null,
  );
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [polling, setPolling] = useState(initialStrategies.length === 0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bounded empty-state polling: a strategy takes ~30s to generate, so give it
  // ~2 minutes (40 × 3s) and then stop — an account with no goal yet would
  // otherwise poll forever.
  const MAX_POLLS = 40;

  useEffect(() => {
    if (strategies.length > 0) {
      setPolling(false);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_POLLS) {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await api.get<{ data: Strategy[] }>("/strategies");
        if (res.data.length > 0) {
          setStrategies(res.data);
          setExpanded(res.data[0]?.id ?? null);
          setPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [strategies.length]);

  async function handleRegenerate(strategy: Strategy) {
    setRegenerating(strategy.id);
    const previousGeneratedAt = strategy.generatedAt;
    try {
      await api.post(`/strategies/${strategy.id}/regenerate`, {});
    } catch (err: any) {
      toast.error(err.message ?? "Failed to regenerate strategy");
      setRegenerating(null);
      return;
    }

    // Poll until the strategy for this goal has a newer generatedAt (the
    // pipeline replaces it in place), then swap the card content live.
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await api.get<{ data: Strategy[] }>("/strategies");
        const updated = res.data.find(
          (s) => s.goalId === strategy.goalId && s.generatedAt !== previousGeneratedAt,
        );
        if (updated) {
          setStrategies(res.data);
          setExpanded(updated.id);
          setRegenerating(null);
          toast.success("Strategy regenerated", "The new strategy is ready below.");
          return;
        }
      } catch {
        // transient poll error — keep trying
      }
    }
    setRegenerating(null);
    toast.info(
      "Still generating",
      "Regeneration is taking longer than usual — refresh the page in a minute.",
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        {polling ? (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orion-green/10">
              <Loader2 className="h-7 w-7 animate-spin text-orion-green" />
            </div>
            <p className="font-semibold">Generating your strategy…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              STELOS is analyzing your goal and crafting a tailored marketing strategy. This takes about 30 seconds.
            </p>
            <p className="mt-3 font-mono text-xs text-orion-green animate-pulse">
              AI agent running · auto-refreshing
            </p>
          </>
        ) : (
          <>
            <Brain className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">No strategies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a goal and STELOS will generate a full 30-day marketing strategy automatically.
            </p>
            <div className="mt-6">
              <Button size="sm" asChild>
                <Link href="/dashboard">Create Goal</Link>
              </Button>
            </div>
          </>
        )}
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

            {/* Expanded content — structured sections, raw prose only as fallback */}
            {isOpen && (
              <div className="max-h-[36rem] overflow-y-auto border-t border-border p-4">
                <StrategyView
                  contentJson={strategy.contentJson}
                  contentText={strategy.contentText}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
