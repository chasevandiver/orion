import { serverApi } from "@/lib/server-api";
import { CompetitorsDashboard } from "./competitors-dashboard";

export const metadata = { title: "Competitors" };

interface CompetitorProfile {
  id: string;
  orgId: string;
  competitorName: string;
  websiteUrl?: string | null;
  analysisJson?: {
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
  } | null;
  competitorChanges?: {
    detectedAt: string;
    changes: Array<{ field: string; previous: string; current: string }>;
  } | null;
  lastAnalyzedAt?: string | null;
  createdAt: string;
}

export default async function CompetitorsPage() {
  let competitors: CompetitorProfile[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: CompetitorProfile[] }>("/competitors")
      .then((res: { data: CompetitorProfile[] }) => { competitors = res.data; })
      .catch(() => {}),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Competitor Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Track competitors, monitor positioning changes, and discover whitespace opportunities.
        </p>
      </div>
      <CompetitorsDashboard initialCompetitors={competitors} />
    </div>
  );
}
