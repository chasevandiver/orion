import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/command-palette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Only redirect to onboarding if the user has no org AND is not already on the onboarding page
  // (prevents infinite redirect loop for users whose org provisioning failed)
  const headersList = headers();
  const currentPath = headersList.get("x-pathname") ?? "";

  if ((session.user as any).needsOnboarding && !session.user.orgId && !currentPath.includes("/onboarding")) {
    redirect("/dashboard/onboarding");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
