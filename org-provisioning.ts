/**
 * Org provisioning service.
 *
 * Called from the Auth.js `signIn` callback for OAuth users who do not yet
 * have an organization. Without this, new Google/GitHub users have orgId=null
 * and every downstream API call fails silently (empty string passes auth checks
 * but returns no data or crashes on DB foreign key constraints).
 *
 * Flow:
 *   1. User authenticates via Google or GitHub for the first time
 *   2. Auth.js creates the user row (DrizzleAdapter)
 *   3. signIn callback calls provisionOrgForUser()
 *   4. This function creates an org, links the user as "owner", updates the
 *      user row with orgId, and creates a free-tier subscription record
 */
import { db } from "../index.js";
import { organizations, users, orionSubscriptions } from "../schema/index.js";
import { eq } from "drizzle-orm";

export interface OrgProvisionResult {
  orgId: string;
  isNew: boolean;
}

/**
 * Ensures the given user has an associated organization.
 * Idempotent — safe to call multiple times for the same user.
 */
export async function provisionOrgForUser(
  userId: string,
  userEmail: string,
  userName?: string | null,
): Promise<OrgProvisionResult> {
  // Check if user already has an org (handles retries gracefully)
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { orgId: true },
  });

  if (existing?.orgId) {
    return { orgId: existing.orgId, isNew: false };
  }

  // Derive a slug from the email domain or name
  const slug = deriveSlug(userEmail, userName);

  // Create org + link user + create free subscription in a transaction
  const result = await db.transaction(async (tx) => {
    // 1. Create organization
    const [org] = await tx
      .insert(organizations)
      .values({
        name: userName ? `${userName}'s Workspace` : `${userEmail.split("@")[0]}'s Workspace`,
        slug: await ensureUniqueSlug(tx, slug),
        plan: "free",
      })
      .returning();

    // 2. Link user to org and set as owner
    await tx
      .update(users)
      .set({ orgId: org!.id, role: "owner", updatedAt: new Date() })
      .where(eq(users.id, userId));

    // 3. Create a free-tier subscription record (Stripe customer created later)
    await tx.insert(orionSubscriptions).values({
      orgId: org!.id,
      stripeCustomerId: `pending_${org!.id}`, // replaced when Stripe customer is created
      plan: "free",
      status: "trialing",
    });

    return org!;
  });

  return { orgId: result.id, isNew: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveSlug(email: string, name?: string | null): string {
  const base = name
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

async function ensureUniqueSlug(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  slug: string,
): Promise<string> {
  const exists = await tx.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
    columns: { id: true },
  });
  if (!exists) return slug;
  // Append random suffix if collision
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}
