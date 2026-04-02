import { serverApi } from "@/lib/server-api";
import { AnalyticsDashboard } from "./analytics-dashboard";

export const metadata = { title: "Analytics" };

interface Totals {
  impressions: number;
  clicks: number;
  conversions: number;
  engagements: number;
  spend: number;
  revenue: number;
}

interface Rollup {
  id: string;
  date: string;
  channel?: string;
  campaignId?: string;
  impressions: number;
  clicks: number;
  conversions: number;
  engagements: number;
  spend: number;
  revenue: number;
}

interface Quota {
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  postsPublished: number;
  postsLimit: number;
  postsRemaining: number;
  month: string;
}

export default async function AnalyticsPage() {
  let totals: Totals = {
    impressions: 0,
    clicks: 0,
    conversions: 0,
    engagements: 0,
    spend: 0,
    revenue: 0,
  };
  let rollups: Rollup[] = [];
  let quota: Quota | undefined;
  let realMetrics: Totals | undefined;
  let simulatedMetrics: Totals | undefined;
  let bannedHashtags: string[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: { totals: Totals; rollups: Rollup[]; realMetrics?: Totals; simulatedMetrics?: Totals } }>("/analytics/overview")
      .then((res) => {
        totals = res.data.totals;
        rollups = res.data.rollups;
        realMetrics = res.data.realMetrics;
        simulatedMetrics = res.data.simulatedMetrics;
      }),
    serverApi.get<{ data: Quota }>("/analytics/quota").then((res) => {
      quota = res.data;
    }),
    serverApi.get<{ data: { bannedHashtags?: string[] } }>("/settings/org").then((res) => {
      bannedHashtags = res.data.bannedHashtags ?? [];
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered insights first, detailed charts below. Generate a fresh analysis to get
          personalized recommendations.
        </p>
      </div>
      <AnalyticsDashboard
        initialTotals={totals}
        initialRollups={rollups}
        initialBannedHashtags={bannedHashtags}
        {...(quota !== undefined ? { initialQuota: quota } : {})}
        {...(realMetrics !== undefined ? { initialRealMetrics: realMetrics } : {})}
        {...(simulatedMetrics !== undefined ? { initialSimulatedMetrics: simulatedMetrics } : {})}
      />
    </div>
  );
}
