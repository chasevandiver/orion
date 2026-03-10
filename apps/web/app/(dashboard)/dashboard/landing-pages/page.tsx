import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Rocket, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Landing Pages" };

export default async function LandingPagesPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const pages = await db.query.landingPages.findMany({
    where: eq(landingPages.orgId, session.user.orgId),
    orderBy: [desc(landingPages.createdAt)],
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
        <h1 className="text-2xl font-bold">Landing Pages</h1>
        <p className="text-sm text-muted-foreground">AI-generated conversion pages</p>
      </div>

      {/* Empty state */}
      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Rocket className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No landing pages yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a goal pipeline to generate one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4 space-y-3"
            >
              {/* Title */}
              <div>
                <p className="font-semibold leading-tight line-clamp-2">{page.title}</p>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Goal badge */}
                {page.goal && (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {page.goal.brandName} &middot; {page.goal.type}
                  </span>
                )}

                {/* Status badge */}
                {page.publishedAt ? (
                  <span className="inline-flex items-center rounded border border-orion-green/30 bg-orion-green/10 px-2 py-0.5 text-xs font-medium text-orion-green">
                    Published
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Draft
                  </span>
                )}
              </div>

              {/* Meta title */}
              {page.metaTitle && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  <span className="font-medium">Meta:</span> {page.metaTitle}
                </p>
              )}

              {/* Created date */}
              <p className="text-xs text-muted-foreground">
                Created{" "}
                {new Date(page.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>

              {/* Links */}
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                {page.shareToken ? (
                  <Link
                    href={`/share/${page.shareToken}`}
                    target="_blank"
                    className="flex items-center gap-1 text-xs text-orion-green hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">No share link</span>
                )}
                <span className="text-xs text-muted-foreground cursor-not-allowed">
                  Edit
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
