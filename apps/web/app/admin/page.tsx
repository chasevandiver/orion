import { db } from "@orion/db";
import { organizations, users, goals, campaigns, assets } from "@orion/db/schema";
import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const [
    [orgsCount],
    [usersCount],
    [goalsCount],
    [assetsCount],
    [campaignsCount],
    recentOrgs,
    recentUsers,
    recentGoals,
  ] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(goals),
    db.select({ value: count() }).from(assets),
    db.select({ value: count() }).from(campaigns),
    db.select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      createdAt: organizations.createdAt,
    }).from(organizations).orderBy(desc(organizations.createdAt)).limit(20),
    db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      orgId: users.orgId,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt)).limit(30),
    db.select({
      id: goals.id,
      brandName: goals.brandName,
      type: goals.type,
      status: goals.status,
      orgId: goals.orgId,
      createdAt: goals.createdAt,
    }).from(goals).orderBy(desc(goals.createdAt)).limit(30),
  ]);

  const stats = [
    { label: "Organizations", value: orgsCount.value, color: "text-violet-400" },
    { label: "Users", value: usersCount.value, color: "text-blue-400" },
    { label: "Goals Run", value: goalsCount.value, color: "text-green-400" },
    { label: "Campaigns", value: campaignsCount.value, color: "text-yellow-400" },
    { label: "Assets Generated", value: assetsCount.value, color: "text-pink-400" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-white/50 mt-1 text-sm">Platform overview — visible to you only</p>
          </div>
          <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            ← Back to App
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-4xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Recent Organizations */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Organizations</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-left border-b border-white/10">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentOrgs.map((org) => (
                    <tr key={org.id} className="hover:bg-white/5">
                      <td className="py-2.5 pr-4 font-medium truncate max-w-[180px]">{org.name}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          org.plan === "enterprise" ? "bg-yellow-500/20 text-yellow-400" :
                          org.plan === "pro"        ? "bg-violet-500/20 text-violet-400" :
                                                     "bg-white/10 text-white/50"
                        }`}>
                          {org.plan}
                        </span>
                      </td>
                      <td className="py-2.5 text-white/40 text-xs whitespace-nowrap">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent Goals/Pipeline Runs */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Pipeline Runs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-left border-b border-white/10">
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentGoals.map((g) => (
                    <tr key={g.id} className="hover:bg-white/5">
                      <td className="py-2.5 pr-4 font-medium truncate max-w-[120px]">{g.brandName}</td>
                      <td className="py-2.5 pr-4 text-white/50 text-xs capitalize">{g.type}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          g.status === "complete" ? "bg-green-500/20 text-green-400" :
                          g.status === "failed"   ? "bg-red-500/20 text-red-400" :
                                                   "bg-white/10 text-white/50"
                        }`}>
                          {g.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-white/40 text-xs whitespace-nowrap">
                        {new Date(g.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* All Users */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-4">All Users ({usersCount.value})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-left border-b border-white/10">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Org ID</th>
                  <th className="pb-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="py-2.5 pr-6 font-medium">{u.email}</td>
                    <td className="py-2.5 pr-6 text-white/60">{u.name ?? "—"}</td>
                    <td className="py-2.5 pr-6">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        u.role === "owner" ? "bg-violet-500/20 text-violet-400" :
                        u.role === "admin" ? "bg-blue-500/20 text-blue-400" :
                                            "bg-white/10 text-white/40"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-6 text-white/30 text-xs font-mono">{u.orgId?.slice(0, 8)}…</td>
                    <td className="py-2.5 text-white/40 text-xs whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
