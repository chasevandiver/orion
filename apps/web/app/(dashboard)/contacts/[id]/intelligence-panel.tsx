"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Zap,
  Brain,
  Target,
  AlertTriangle,
  Mail,
  Linkedin,
  Twitter,
  Phone,
  MessageCircle,
  Clock,
  Building2,
  Tag,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LeadScore {
  score: number;
  tier: "cold" | "warm" | "hot" | "customer";
  confidence: number;
  reasoning: string;
  signals: string[];
  recommendedAction: string;
  urgency: "low" | "medium" | "high";
}

interface Enrichment {
  inferredTitle?: string;
  inferredCompanySize?: string;
  inferredIndustry?: string;
  buyingIntent?: "researching" | "evaluating" | "ready_to_buy" | "not_in_market";
  bestContactTime?: string;
  tags: string[];
  notes: string;
}

interface NextBestAction {
  action: string;
  channel: string;
  timing: string;
}

interface Insights {
  summary: string;
  keyInsights: string[];
  riskFlags: string[];
  opportunities: string[];
  nextBestActions: NextBestAction[];
  lifetimeValueEstimate?: string;
}

interface Intelligence {
  score: LeadScore;
  enrichment: Enrichment;
  insights: Insights;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  cold:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warm:     "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  hot:      "bg-orange-500/10 text-orange-400 border-orange-500/20",
  customer: "bg-orion-green/10 text-orion-green border-orion-green/20",
};

const URGENCY_COLORS: Record<string, string> = {
  low:    "text-muted-foreground",
  medium: "text-yellow-400",
  high:   "text-orange-400",
};

const INTENT_COLORS: Record<string, string> = {
  ready_to_buy:  "bg-orion-green/10 text-orion-green border-orion-green/20",
  evaluating:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  researching:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  not_in_market: "bg-muted text-muted-foreground border-border",
};

function ChannelIcon({ channel }: { channel: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  switch (channel.toLowerCase()) {
    case "email":    return <Mail className={cls} />;
    case "linkedin": return <Linkedin className={cls} />;
    case "twitter":  return <Twitter className={cls} />;
    case "phone":    return <Phone className={cls} />;
    default:         return <MessageCircle className={cls} />;
  }
}

// ── Sub-sections ───────────────────────────────────────────────────────────────

function ScoreSection({ score }: { score: LeadScore }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orion-green/10 border border-orion-green/20">
            <span className="text-xl font-bold tabular-nums text-orion-green">{score.score}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${TIER_COLORS[score.tier] ?? TIER_COLORS.cold}`}
              >
                {score.tier}
              </span>
              <span className={`text-xs font-medium ${URGENCY_COLORS[score.urgency]}`}>
                {score.urgency} urgency
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(score.confidence * 100)}% confidence
            </p>
          </div>
        </div>
        <Zap className="h-4 w-4 text-orion-green shrink-0" />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{score.reasoning}</p>

      {score.signals.length > 0 && (
        <ul className="space-y-1">
          {score.signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orion-green/60 shrink-0" />
              {s}
            </li>
          ))}
        </ul>
      )}

      {/* Recommended action callout */}
      <div className="rounded-lg border border-orion-green/20 bg-orion-green/5 px-4 py-3">
        <p className="text-xs font-semibold text-orion-green mb-0.5">Recommended Action</p>
        <p className="text-sm text-foreground">{score.recommendedAction}</p>
      </div>
    </div>
  );
}

function EnrichmentSection({ enrichment }: { enrichment: Enrichment }) {
  const intentLabel: Record<string, string> = {
    ready_to_buy:  "Ready to Buy",
    evaluating:    "Evaluating",
    researching:   "Researching",
    not_in_market: "Not in Market",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Enrichment</h3>
      </div>

      <div className="grid gap-3">
        {enrichment.inferredIndustry && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Industry:</span>
            <span>{enrichment.inferredIndustry}</span>
          </div>
        )}
        {enrichment.inferredCompanySize && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground pl-5">Company size:</span>
            <span>{enrichment.inferredCompanySize} employees</span>
          </div>
        )}
        {enrichment.buyingIntent && (
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Buying intent:</span>
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] ${INTENT_COLORS[enrichment.buyingIntent] ?? ""}`}
            >
              {intentLabel[enrichment.buyingIntent] ?? enrichment.buyingIntent}
            </span>
          </div>
        )}
        {enrichment.bestContactTime && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Best time:</span>
            <span>{enrichment.bestContactTime}</span>
          </div>
        )}
      </div>

      {enrichment.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {enrichment.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {enrichment.notes && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3 leading-relaxed">
          {enrichment.notes}
        </p>
      )}
    </div>
  );
}

function ActionsSection({ insights }: { insights: Insights }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Next Best Actions</h3>
      </div>

      <ol className="space-y-3">
        {insights.nextBestActions.map((action, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <ChannelIcon channel={action.channel} />
                <span className="text-[10px] font-mono uppercase text-muted-foreground capitalize">
                  {action.channel}
                </span>
              </div>
              <p className="text-sm">{action.action}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{action.timing}</p>
            </div>
          </li>
        ))}
      </ol>

      {insights.lifetimeValueEstimate && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Estimated LTV: <span className="font-semibold text-foreground">{insights.lifetimeValueEstimate}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function IntelligencePanel({ contactId }: { contactId: string }) {
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Intelligence }>(`/contacts/${contactId}/intelligence`);
      setIntelligence(res.data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load intelligence");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">AI Intelligence</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={loading}
          onClick={load}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {loading ? "Analyzing…" : "Re-analyze"}
        </Button>
      </div>

      {/* Loading state */}
      {loading && !intelligence && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Running AI analysis…</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Intelligence sections */}
      {intelligence && (
        <>
          <ScoreSection score={intelligence.score} />
          <EnrichmentSection enrichment={intelligence.enrichment} />
          <ActionsSection insights={intelligence.insights} />
        </>
      )}
    </div>
  );
}
