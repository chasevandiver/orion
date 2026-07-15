import { redirect } from "next/navigation";

// Bare campaign URL — the detail view lives at ./summary.
export default function CampaignDetailIndex({ params }: { params: { id: string } }) {
  redirect(`/dashboard/campaigns/${params.id}/summary`);
}
