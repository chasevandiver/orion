import { serverApi } from "@/lib/server-api";
import { CampaignsList } from "./campaigns-list";

export const metadata = { title: "Campaigns" };

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  createdAt: Date | string;
  goal?: { id: string; type: string; brandName: string };
  assets?: Array<{ id: string; channel: string; type: string; status: string }>;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: { goalId?: string };
}) {
  const goalId = searchParams?.goalId;
  let campaigns: Campaign[] = [];
  try {
    const res = await serverApi.get<{ data: Campaign[] }>("/campaigns");
    campaigns = res.data;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Organize your marketing efforts into trackable campaigns.
        </p>
      </div>
      <CampaignsList initialCampaigns={campaigns} {...(goalId ? { goalId } : {})} />
    </div>
  );
}
