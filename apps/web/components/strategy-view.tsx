"use client";

/**
 * StrategyView — renders an AI-generated marketing strategy as readable
 * sections (executive summary, channels/KPIs, audiences, 30-day plan,
 * messaging themes, budget allocation).
 *
 * The strategist agent returns raw JSON which the pipeline stores in
 * `contentText` (and parsed in `contentJson` when validation succeeds).
 * This component prefers `contentJson`, falls back to parsing
 * `contentText` (stripping ```json fences), and only shows plain prose
 * when nothing parses — so users never see a wall of JSON.
 *
 * Shared by /dashboard/strategy (list) and /dashboard/campaigns/[id]/strategy.
 */

import { Badge } from "@/components/ui/badge";
import {
  Target,
  Users,
  BarChart2,
  Calendar,
  MessageSquare,
  DollarSign,
  TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StrategyJSON {
  executiveSummary?: string;
  keyMessagesByChannel?: Record<string, string>;
  kpis?: Record<string, string | number>;
  audiences?: Array<{ name: string; description: string; painPoint?: string }>;
  thirtyDayPlan?: Array<string | { week?: string; actions?: string[]; focus?: string }>;
  messagingThemes?: string[];
  budgetAllocation?: Record<string, string | number>;
  informedByReports?: number;
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

/** Strip markdown code fences that models sometimes emit: ```json ... ``` */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Resolve the best renderable strategy from contentJson/contentText.
 * Returns the parsed JSON when it has at least one expected field, plus the
 * raw prose fallback (fence-stripped) for when it doesn't.
 */
export function parseStrategy(input: {
  contentJson?: StrategyJSON | null;
  contentText?: string | null;
}): { json: StrategyJSON | null; rawText: string | null } {
  let json: StrategyJSON | null = input.contentJson ?? null;

  // Fall back to parsing contentText if it looks like JSON
  if (!json && input.contentText) {
    const stripped = stripCodeFences(input.contentText);
    if (stripped.startsWith("{")) {
      try { json = JSON.parse(stripped) as StrategyJSON; } catch { /* keep null */ }
    }
  }

  // If contentJson is the {raw, runId} fallback shape, try parsing the raw field
  if (json && !(json as any).executiveSummary && (json as any).raw) {
    const stripped = stripCodeFences((json as any).raw as string);
    if (stripped.startsWith("{")) {
      try { json = JSON.parse(stripped) as StrategyJSON; } catch { /* keep shape */ }
    }
  }

  const isValid = !!(
    json &&
    (json.executiveSummary ||
      (json.audiences && json.audiences.length > 0) ||
      json.messagingThemes?.length)
  );

  const rawSource = (json as any)?.raw ?? input.contentText ?? null;
  return {
    json: isValid ? json : null,
    rawText: rawSource ? stripCodeFences(rawSource) : null,
  };
}

// ── Section wrapper ───────────────────────────────────────────────────────────

export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StrategyView({
  contentJson,
  contentText,
}: {
  contentJson?: StrategyJSON | null;
  contentText?: string | null;
}) {
  const { json: strategyJson, rawText } = parseStrategy({ contentJson, contentText });

  if (!strategyJson) {
    return (
      <Section title="Strategy" icon={<Target className="h-4 w-4" />}>
        <div className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
          {rawText ?? "No strategy content available."}
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Feedback loop indicator */}
      {(strategyJson.informedByReports ?? 0) > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-primary">
            This strategy was informed by{" "}
            <span className="font-semibold">
              {strategyJson.informedByReports}{" "}
              {strategyJson.informedByReports === 1 ? "previous campaign analysis" : "previous campaign analyses"}
            </span>
            .
          </p>
        </div>
      )}

      {/* Executive Summary */}
      {strategyJson.executiveSummary && (
        <Section title="Executive Summary" icon={<Target className="h-4 w-4" />}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {strategyJson.executiveSummary}
          </p>
        </Section>
      )}

      {/* Channels + KPIs */}
      {(strategyJson.keyMessagesByChannel || strategyJson.kpis) && (
        <Section title="Channels & KPIs" icon={<BarChart2 className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Channel</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Key Message</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">KPI Target</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(strategyJson.keyMessagesByChannel ?? {}).map(([channel, message]) => (
                  <tr key={channel} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className="capitalize">{channel}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground max-w-xs">{message}</td>
                    <td className="py-3 text-muted-foreground">
                      {(strategyJson.kpis as any)?.[channel] ??
                        Object.values(strategyJson.kpis ?? {})[0] ??
                        "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Audience Segments */}
      {strategyJson.audiences && strategyJson.audiences.length > 0 && (
        <Section title="Audience Segments" icon={<Users className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {strategyJson.audiences.map((audience, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-background p-4"
              >
                <p className="font-semibold text-sm mb-1">{audience.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  {audience.description}
                </p>
                {audience.painPoint && (
                  <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                    Pain: {audience.painPoint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 30-Day Plan */}
      {strategyJson.thirtyDayPlan && strategyJson.thirtyDayPlan.length > 0 && (
        <Section title="30-Day Plan" icon={<Calendar className="h-4 w-4" />}>
          <ol className="space-y-3">
            {strategyJson.thirtyDayPlan.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="text-sm text-muted-foreground pt-0.5">
                  {typeof item === "string" ? (
                    item
                  ) : (
                    <div>
                      {item.week && <span className="font-medium text-foreground">{item.week}: </span>}
                      {item.focus && <span>{item.focus}</span>}
                      {item.actions && (
                        <ul className="mt-1 space-y-1 list-disc list-inside">
                          {item.actions.map((action, ai) => (
                            <li key={ai}>{action}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Messaging Themes */}
      {strategyJson.messagingThemes && strategyJson.messagingThemes.length > 0 && (
        <Section title="Messaging Themes" icon={<MessageSquare className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-2">
            {strategyJson.messagingThemes.map((theme, idx) => (
              <Badge
                key={idx}
                className="bg-primary/10 text-primary border-primary/20 px-3 py-1 text-sm"
              >
                {theme}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Budget Allocation */}
      {strategyJson.budgetAllocation &&
        Object.keys(strategyJson.budgetAllocation).length > 0 && (
          <Section title="Budget Allocation" icon={<DollarSign className="h-4 w-4" />}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Category</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(strategyJson.budgetAllocation).map(([category, amount]) => (
                  <tr key={category} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-muted-foreground capitalize">{category}</td>
                    <td className="py-2.5 text-right font-medium">{String(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
    </div>
  );
}
