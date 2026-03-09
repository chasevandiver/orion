import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { emailSequences } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email Sequences" };

// ── Badge styles ─────────────────────────────────────────────────────────────

const TRIGGER_STYLES: Record<string, string> = {
  signup:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  download: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  purchase: "bg-orion-green/10 text-orion-green border-orion-green/20",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  draft:  "bg-muted text-muted-foreground border-border",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
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
        <span
          className="inline-flex items-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed"
          title="Coming soon"
        >
          New Sequence
        </span>
      </div>

      {/* Empty state */}
      {sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Mail className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No email sequences yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a goal pipeline to generate email sequences.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Trigger</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
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
                  <tr key={seq.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground leading-tight">{seq.name}</p>
                        {seq.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {seq.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${triggerStyle}`}
                      >
                        {seq.triggerType}
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
