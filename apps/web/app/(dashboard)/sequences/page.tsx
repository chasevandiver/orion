import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { emailSequences } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import { Mail, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email Sequences" };

// ── Badge styles ─────────────────────────────────────────────────────────────

const TRIGGER_STYLES: Record<string, string> = {
  welcome:       "bg-orion-blue/10 text-orion-blue border-orion-blue/20",
  nurture:       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  re_engagement: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  signup:        "bg-blue-500/10 text-blue-400 border-blue-500/20",
  download:      "bg-pink-500/10 text-pink-400 border-pink-500/20",
  purchase:      "bg-orion-green/10 text-orion-green border-orion-green/20",
  trial_ending:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  manual:        "bg-muted text-muted-foreground border-border",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  draft:  "bg-muted text-muted-foreground border-border",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const TRIGGER_LABELS: Record<string, string> = {
  welcome: "Welcome",
  nurture: "Nurture",
  re_engagement: "Re-engagement",
  signup: "Signup",
  download: "Download",
  purchase: "Purchase",
  trial_ending: "Trial Ending",
  manual: "Manual",
};

export default async function SequencesPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const sequences = await db.query.emailSequences.findMany({
    where: eq(emailSequences.orgId, session.user.orgId),
    orderBy: [desc(emailSequences.createdAt)],
    with: {
      steps: {
        columns: { id: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Sequences</h1>
          <p className="text-sm text-muted-foreground">
            Automated nurture sequences for every stage
          </p>
        </div>
        <Link
          href="/sequences/new"
          className="inline-flex items-center gap-2 rounded-md bg-orion-green px-4 py-2 text-sm font-medium text-black hover:bg-orion-green/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Sequence
        </Link>
      </div>

      {/* Empty state */}
      {sequences.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No sequences yet"
          description="Build automated email sequences that nurture leads over time — from welcome flows to re-engagement campaigns."
          actions={[{ label: "Create Sequence", href: "/sequences/new" }]}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Trigger</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Enrolled</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Avg Open</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sequences.map((seq) => {
                const triggerStyle =
                  TRIGGER_STYLES[seq.triggerType] ??
                  "bg-muted text-muted-foreground border-border";
                const statusStyle =
                  STATUS_STYLES[seq.status] ??
                  "bg-muted text-muted-foreground border-border";
                const stepCount = seq.steps.length;

                return (
                  <tr
                    key={seq.id}
                    className="hover:bg-muted/10 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/sequences/${seq.id}`} className="block">
                        <p className="font-medium text-foreground leading-tight">{seq.name}</p>
                        {seq.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {seq.description}
                          </p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${triggerStyle}`}
                      >
                        {TRIGGER_LABELS[seq.triggerType] ?? seq.triggerType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${statusStyle}`}
                      >
                        {seq.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">
                        {stepCount} step{stepCount !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {/* Enrolled count — requires sequenceEnrollments table (future) */}
                      <span className="text-muted-foreground/50">—</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {/* Open rate — requires analytics events per step (future) */}
                      <span className="text-muted-foreground/50">—</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(seq.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
