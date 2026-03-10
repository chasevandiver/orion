"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { WarRoom } from "../war-room";

function WarRoomPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const goalId = params.get("goalId") ?? "";
  const campaignIdParam = params.get("campaignId");
  const campaignId: string | undefined = campaignIdParam ?? undefined;

  if (!goalId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No goalId provided. Please launch from a campaign.
      </div>
    );
  }

  function handleComplete(campaignId: string) {
    router.push(`/dashboard/review/${campaignId}`);
  }

  return (
    <WarRoom
      goalId={goalId}
      campaignId={campaignId}
      onComplete={handleComplete}
    />
  );
}

export default function WarRoomPage() {
  return (
    <Suspense fallback={null}>
      <WarRoomPageInner />
    </Suspense>
  );
}
