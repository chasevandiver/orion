import { serverApi } from "@/lib/server-api";
import { DistributeList } from "@/app/(dashboard)/distribute/distribute-list";

export const metadata = { title: "Distribute" };

interface ScheduledPost {
  id: string;
  channel: string;
  status: string;
  scheduledFor: string;
  publishedAt?: string;
  platformPostId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  asset?: {
    id: string;
    contentText: string;
    channel: string;
    status: string;
  };
}

interface Connection {
  id: string;
  channel: string;
  accountName?: string;
  isActive: boolean;
  connectedAt: string;
}

export default async function DistributePage() {
  let posts: ScheduledPost[] = [];
  let connections: Connection[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: ScheduledPost[] }>("/distribute")
      .then((r) => { posts = r.data; })
      .catch(() => {}),
    serverApi
      .get<{ data: Connection[] }>("/distribute/connections")
      .then((r) => { connections = r.data; })
      .catch(() => {}),
  ]);

  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;
  const failed = posts.filter((p) => p.status === "failed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Distribution</h1>
        <p className="text-sm text-muted-foreground">
          Schedule and publish content across your connected channels.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Scheduled</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-400">{scheduled}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Published</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orion-green">{published}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-400">{failed}</p>
        </div>
      </div>

      <DistributeList initialPosts={posts} initialConnections={connections} />
    </div>
  );
}
