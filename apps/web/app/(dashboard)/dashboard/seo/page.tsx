import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SEOAnalyzer } from "./seo-analyzer";
import { db } from "@orion/db";
import { organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "SEO" };

export default async function SEOPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.user.orgId),
    columns: { name: true, website: true },
  });

  return (
    <SEOAnalyzer
      brandName={org?.name ?? ""}
      website={org?.website ?? ""}
    />
  );
}
