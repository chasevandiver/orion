import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/command-palette";
import { ErrorBoundary } from "@/components/error-boundary";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import { db } from "@orion/db";
import { organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Only redirect to onboarding if the user has no org AND is not already on the onboarding page
  // (prevents infinite redirect loop for users whose org provisioning failed)
  const headersList = headers();
  const currentPath = headersList.get("x-pathname") ?? "";

  if ((session.user as any).needsOnboarding && !currentPath.includes("/onboarding")) {
    redirect("/dashboard/onboarding");
  }

  // Fetch onboarding status for tour
  let onboardingCompleted = true;
  if (session.user.orgId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, session.user.orgId),
      columns: { onboardingCompleted: true },
    });
    onboardingCompleted = org?.onboardingCompleted ?? true;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
      <CommandPalette />
      <OnboardingTour onboardingCompleted={onboardingCompleted} />
    </div>
  );
}
