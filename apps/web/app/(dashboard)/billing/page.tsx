import { serverApi } from "@/lib/server-api";
import { BillingClient } from "./billing-client";

export const metadata = { title: "Billing" };

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

export default async function BillingPage() {
  let quota: Quota = {
    plan: "free",
    tokensUsed: 0,
    tokensLimit: 50_000,
    tokensRemaining: 50_000,
    postsPublished: 0,
    postsLimit: 5,
    postsRemaining: 5,
    month: new Date().toLocaleString("default", { month: "long", year: "numeric" }),
  };

  try {
    const res = await serverApi.get<{ data: Quota }>("/analytics/quota");
    quota = res.data;
  } catch {
    // Use defaults
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, usage, and payment method.
        </p>
      </div>
      <BillingClient quota={quota} />
    </div>
  );
}
