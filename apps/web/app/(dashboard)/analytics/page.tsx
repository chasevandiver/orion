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
}

export default async function AnalyticsPage() {
  let totals: Totals = { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 };
  let rollups: Rollup[] = [];

  try {
    const res = await serverApi.get<{ data: { totals: Totals; rollups: Rollup[] } }>(
      "/analytics/overview",
    );
    totals = res.data.totals;
    rollups = res.data.rollups;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Performance data rolled up hourly. Click Optimize to get AI recommendations.
        </p>
      </div>
      <AnalyticsDashboard initialTotals={totals} initialRollups={rollups} />
    </div>
  );
}
