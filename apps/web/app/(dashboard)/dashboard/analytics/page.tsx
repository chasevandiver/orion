import { serverApi } from "@/lib/server-api";
import { AnalyticsDashboard } from "@/app/(dashboard)/analytics/analytics-dashboard";

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

  await Promise.allSettled([
    serverApi
      .get<{ data: { totals: Totals; rollups: Rollup[] } }>("/analytics/overview")
      .then((res) => {
        totals = res.data.totals;
        rollups = res.data.rollups;
      }),
    serverApi.get<{ data: Quota }>("/analytics/quota").then((res) => {
      quota = res.data;
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Performance data rolled up hourly. Run Analysis for AI-powered insights and 30-day
          forecasts.
        </p>
      </div>
      <AnalyticsDashboard
        initialTotals={totals}
        initialRollups={rollups}
        initialQuota={quota}
      />
    </div>
  );
}
