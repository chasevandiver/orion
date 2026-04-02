import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { eq, desc } from "drizzle-orm";
import { Metadata } from "next";
import { LandingPagesClient } from "./landing-pages-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Landing Pages" };

export default async function LandingPagesPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const pages = await db.query.landingPages.findMany({
    where: eq(landingPages.orgId, session.user.orgId),
    orderBy: [desc(landingPages.createdAt)],
    limit: 50,
    with: {
      goal: { columns: { type: true, brandName: true } },
      campaign: { columns: { id: true, name: true } },
    },
  });

  return <LandingPagesClient pages={pages} />;
}
