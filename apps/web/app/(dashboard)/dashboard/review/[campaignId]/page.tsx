import { ReviewScreen } from "@/components/review-screen";

interface Props {
  params: { campaignId: string };
}

export const metadata = { title: "Review Campaign" };

export default function ReviewPage({ params }: Props) {
  return <ReviewScreen campaignId={params.campaignId} />;
}
