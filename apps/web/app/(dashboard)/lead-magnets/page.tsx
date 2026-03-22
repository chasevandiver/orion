import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { leadMagnets } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Magnet, ExternalLink, Download } from "lucide-react";

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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Magnet className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No lead magnets yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Lead magnets (eBooks, checklists, templates) are auto-generated when you create a lead generation campaign. Start one now.
          </p>
          <Link
            href="/dashboard?newGoal=1"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Magnet className="h-4 w-4" />
            Create Lead Gen Campaign
          </Link>
        </div>
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
