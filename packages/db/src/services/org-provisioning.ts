import { db } from "../index";
import { organizations, users, orionSubscriptions } from "../schema/index";
import { eq } from "drizzle-orm";

export async function provisionOrgForUser(
  userId: string,
  email: string,
  name?: string | null,
) {
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (existing?.orgId) return;

  const slug = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]/g, "-");

  const [org] = await db
    .insert(organizations)
    .values({
      name: name ?? email,
      slug: `${slug}-${Date.now()}`,
      plan: "free",
    })
    .returning();

  await db
    .update(users)
    .set({ orgId: org!.id })
    .where(eq(users.id, userId));
}
