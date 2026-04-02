import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { leadMagnets } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Magnet, ExternalLink, Download } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Magnets" };

// ── Badge color by magnet type ───────────────────────────────────────────────

const MAGNET_TYPE_STYLES: Record<string, string> = {
  ebook:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  checklist: "bg-orion-green/10 text-orion-green border-orion-green/20",
  template:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  webinar:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  quiz:      "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const MAGNET_TYPE_LABELS: Record<string, string> = {
  ebook:     "eBook",
  checklist: "Checklist",
  template:  "Template",
  webinar:   "Webinar",
  quiz:      "Quiz",
};

export default async function LeadMagnetsPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const magnets = await db.query.leadMagnets.findMany({
    where: eq(leadMagnets.orgId, session.user.orgId),
    orderBy: [desc(leadMagnets.createdAt)],
    limit: 50,
    with: {
      goal: {
        columns: { type: true, brandName: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Lead Magnets</h1>
        <p className="text-sm text-muted-foreground">
          AI-crafted assets to capture qualified leads
        </p>
      </div>

      {/* Empty state */}
      {magnets.length === 0 ? (
        <EmptyState
          icon={Magnet}
          title="No lead magnets yet"
          description="Create downloadable resources that capture leads — checklists, reports, calculators. They're auto-generated when you launch a lead generation campaign."
          actions={[{ label: "Generate Lead Magnet", href: "/dashboard?newGoal=1" }]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {magnets.map((magnet) => {
            const typeStyle =
              MAGNET_TYPE_STYLES[magnet.magnetType] ??
              "bg-muted text-muted-foreground border-border";
            const typeLabel =
              MAGNET_TYPE_LABELS[magnet.magnetType] ?? magnet.magnetType;

            return (
              <div
                key={magnet.id}
                className="flex flex-col rounded-lg border border-border bg-card p-4 space-y-3"
              >
                {/* Type badge */}
                <div>
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${typeStyle}`}
                  >
                    {typeLabel}
                  </span>
                </div>

                {/* Title */}
                <p className="font-semibold leading-tight line-clamp-2">{magnet.title}</p>

                {/* Goal brand name */}
                {magnet.goal && (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground w-fit">
                    {magnet.goal.brandName} &middot; {magnet.goal.type}
                  </span>
                )}

                {/* Download count */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Download className="h-3 w-3" />
                  {magnet.downloadCount} download{magnet.downloadCount !== 1 ? "s" : ""}
                </div>

                {/* Created date */}
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(magnet.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>

                {/* Share link */}
                {magnet.shareToken && (
                  <div className="pt-1 border-t border-border">
                    <Link
                      href={`/share/${magnet.shareToken}`}
                      target="_blank"
                      className="flex items-center gap-1 text-xs text-orion-green hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View share page
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
