import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { and, eq } from "drizzle-orm";
import { Metadata } from "next";
import { LandingPageEditor } from "./landing-page-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Edit Landing Page" };
}

export default async function EditLandingPagePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const page = await db.query.landingPages.findFirst({
    where: and(
      eq(landingPages.id, params.id),
      eq(landingPages.orgId, session.user.orgId),
    ),
    with: {
      goal: { columns: { type: true, brandName: true } },
      campaign: { columns: { id: true, name: true } },
    },
  });

  if (!page) notFound();

  return <LandingPageEditor page={page} />;
}
