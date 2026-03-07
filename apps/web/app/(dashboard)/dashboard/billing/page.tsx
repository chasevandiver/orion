import { serverApi } from "@/lib/server-api";
import { BillingPanel } from "@/app/(dashboard)/billing/billing-panel";

export const metadata = { title: "Billing" };

interface Subscription {
  id: string;
  plan: string;
  status: string;
  stripeCustomerId: string;
  currentPeriodEnd?: string;
}

interface UsageRecord {
  month: string;
  aiTokensUsed: number;
  postsPublished: number;
  contactsCount: number;
}

export default async function BillingPage() {
  let subscription: Subscription | null = null;
  let usage: UsageRecord | null = null;

  try {
    const res = await serverApi.get<{
      data: { subscription: Subscription | null; usage: UsageRecord | null };
    }>("/billing");
    subscription = res.data.subscription;
    usage = res.data.usage;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, usage, and payment method.
        </p>
      </div>
      <BillingPanel subscription={subscription} usage={usage} />
    </div>
  );
}
