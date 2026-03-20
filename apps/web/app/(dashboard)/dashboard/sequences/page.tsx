import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { emailSequences, emailSequenceSteps } from "@orion/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { SequencesList } from "./sequences-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email Sequences" };

export default async function SequencesPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  const sequences = await db.query.emailSequences.findMany({
    where: eq(emailSequences.orgId, session.user.orgId),
    orderBy: [desc(emailSequences.createdAt)],
    with: {
      steps: {
        orderBy: [asc(emailSequenceSteps.stepNumber)],
      },
    },
  });

  return <SequencesList initialSequences={sequences} />;
}
