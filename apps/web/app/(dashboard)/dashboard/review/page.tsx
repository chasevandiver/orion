import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { CheckSquare, GitBranch } from "lucide-react";

export const metadata = { title: "Review" };

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: Date | string;
  goal?: { brandName: string; type: string };
  assets?: Array<{ id: string; status: string }>;
}

export default async function ReviewLandingPage() {
  let campaigns: Campaign[] = [];
  try {
    const res = await serverApi.get<{ data: Campaign[] }>("/campaigns");
    // Only show draft/active campaigns that have assets waiting review
    campaigns = res.data.filter((c) => ["draft", "active"].includes(c.status));
  } catch {
    // empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="text-sm text-muted-foreground">
          Approve content and launch campaigns after pipeline generation.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <CheckSquare className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No campaigns to review</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a goal to generate a campaign, then review content here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const approved = campaign.assets?.filter((a) => a.status === "approved").length ?? 0;
            const total = campaign.assets?.length ?? 0;
            return (
              <Link
                key={campaign.id}
                href={`/dashboard/review/${campaign.id}`}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-orion-green/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight group-hover:text-orion-green transition-colors">
                    {campaign.name}
                  </h3>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                      campaign.status === "active"
                        ? "border-orion-green/30 bg-orion-green/10 text-orion-green"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
                {campaign.goal && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {campaign.goal.brandName} · {campaign.goal.type}
                  </p>
                )}
                {total > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{approved} of {total} approved</span>
                      <GitBranch className="h-3 w-3" />
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-orion-green transition-all"
                        style={{ width: `${(approved / total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
