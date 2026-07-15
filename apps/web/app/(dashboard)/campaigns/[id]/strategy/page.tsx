"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { downloadFileFromApi } from "@/lib/api-client";
import Link from "next/link";
import { FirstRunTip } from "@/components/ui/first-run-tip";
import { StrategyView, type StrategyJSON } from "@/components/strategy-view";

interface Strategy {
  id: string;
  title: string;
  contentText?: string;
  contentJson?: StrategyJSON;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  strategy?: Strategy;
}

interface CampaignResponse {
  data: Campaign;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />
  );
}

function SkeletonSection() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadStrategy() {
    if (!id) return;
    setDownloading(true);
    try {
      await downloadFileFromApi(`/campaigns/${id}/strategy/export`, `strategy-${id}.md`);
    } catch {
      // non-critical — user will see browser error
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<CampaignResponse>(`/campaigns/${id}`);
        setCampaign(res.data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-64 mb-1" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6">
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-400">{error ?? "Campaign not found"}</p>
        <Link href="/dashboard/campaigns">
          <Button variant="outline" size="sm">Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  const strategy = campaign.strategy;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link href={`/dashboard/campaigns/${id}/summary`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Campaign
            </Button>
          </Link>
          {strategy && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadStrategy} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Strategy
            </Button>
          )}
        </div>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Marketing Strategy</p>
      </div>

      {!strategy ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border text-muted-foreground">
          <TrendingUp className="h-10 w-10 mb-3" />
          <p>No strategy has been generated yet.</p>
          <p className="text-sm mt-1">Run the campaign pipeline to generate a strategy.</p>
        </div>
      ) : (
        <StrategyView contentJson={strategy.contentJson} contentText={strategy.contentText} />
      )}

      <FirstRunTip
        id="strategy-page"
        title="Your AI campaign strategy"
        body="This page shows your AI-generated marketing strategy. Review the audience insights, messaging themes, and 30-day plan before diving into the content your agents created."
        cta="Got it"
      />
    </div>
  );
}
