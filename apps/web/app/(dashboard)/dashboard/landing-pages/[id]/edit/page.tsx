import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { LandingPageEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Landing Page" };

export default async function EditLandingPage({
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
  });

  if (!page) notFound();

  return (
    <LandingPageEditor
      page={{
        id: page.id,
        title: page.title,
        slug: page.slug,
        metaTitle: page.metaTitle ?? "",
        metaDescription: page.metaDescription ?? "",
        contentJson: (page.contentJson ?? {}) as Record<string, unknown>,
        shareToken: page.shareToken ?? null,
        publishedAt: page.publishedAt?.toISOString() ?? null,
      }}
    />
  );
}
