import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { emailSequences, emailSequenceSteps } from "@orion/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { Metadata } from "next";
import { SequenceEditClient } from "./sequence-edit-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Edit Sequence` };
}

export default async function EditSequencePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const sequence = await db.query.emailSequences.findFirst({
    where: and(
      eq(emailSequences.id, params.id),
      eq(emailSequences.orgId, session.user.orgId),
    ),
    with: {
      steps: { orderBy: asc(emailSequenceSteps.stepNumber) },
    },
  });

  if (!sequence) notFound();

  return <SequenceEditClient sequence={sequence} />;
}
