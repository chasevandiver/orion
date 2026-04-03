import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { SettingsPanel } from "@/app/(dashboard)/settings/settings-panel";
import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

interface OrgData {
  id: string;
  name: string;
  slug: string;
  website?: string;
  logoUrl?: string;
  plan: string;
  createdAt: Date | string;
}

interface Member {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: string;
  createdAt: Date | string;
}

interface Integration {
  id: string;
  channel: string;
  accountName?: string;
  accountId?: string;
  isActive: boolean;
  connectedAt: string;
  tokenExpiresAt?: string;
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { id: string; orgId?: string; role?: string };

  let org: OrgData | null = null;
  let members: Member[] = [];
  let integrations: Integration[] = [];

  await Promise.allSettled([
    serverApi
      .get<{ data: OrgData }>("/settings/org")
      .then((r) => { org = r.data; })
      .catch(() => {}),
    serverApi
      .get<{ data: Member[] }>("/settings/members")
      .then((r) => { members = r.data; })
      .catch(() => {}),
    serverApi
      .get<{ data: Integration[] }>("/settings/integrations")
      .then((r) => { integrations = r.data; })
      .catch(() => {}),
  ]);

  if (!org) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your organization settings.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Unable to load organization settings. Please refresh or contact support.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization, team, and channel integrations.
        </p>
      </div>

      <SettingsPanel
        org={org}
        members={members}
        integrations={integrations}
        currentUserId={user.id}
        currentUserRole={user.role ?? "member"}
      />
    </div>
  );
}
