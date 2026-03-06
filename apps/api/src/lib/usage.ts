/**
 * AI token usage tracking and plan limit enforcement.
 *
 * Plan limits (tokens per calendar month):
 *   free:       50,000  tokens
 *   pro:        500,000 tokens
 *   enterprise: unlimited (no cap)
 *
 * Limits are enforced by the planGuard middleware before expensive agent calls.
 * After every agent run, callers should call trackTokenUsage() to record spend.
 */

import { db } from "@orion/db";
import { usageRecords, organizations, orionSubscriptions } from "@orion/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PLAN_TOKEN_LIMITS: Record<string, number> = {
  free: 50_000,
  pro: 500_000,
  enterprise: Infinity,
};

export const PLAN_POSTS_LIMITS: Record<string, number> = {
  free: 10,
  pro: 500,
  enterprise: Infinity,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "2024-01"
}

// ── Quota queries ─────────────────────────────────────────────────────────────

export interface OrgQuota {
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  postsPublished: number;
  postsLimit: number;
  postsRemaining: number;
  month: string;
}

/**
 * Fetch the current month's quota for an organisation.
 * Returns nulls as zeros — callers don't need to handle missing records.
 */
export async function getOrgQuota(orgId: string): Promise<OrgQuota> {
  const month = currentMonth();

  const [org, record] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { plan: true },
    }),
    db.query.usageRecords.findFirst({
      where: and(eq(usageRecords.orgId, orgId), eq(usageRecords.month, month)),
    }),
  ]);

  const plan = org?.plan ?? "free";
  const tokensLimit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.free;
  const postsLimit = PLAN_POSTS_LIMITS[plan] ?? PLAN_POSTS_LIMITS.free;
  const tokensUsed = record?.aiTokensUsed ?? 0;
  const postsPublished = record?.postsPublished ?? 0;

  return {
    plan,
    tokensUsed,
    tokensLimit,
    tokensRemaining: Math.max(0, tokensLimit === Infinity ? Infinity : tokensLimit - tokensUsed),
    postsPublished,
    postsLimit,
    postsRemaining: Math.max(0, postsLimit === Infinity ? Infinity : postsLimit - postsPublished),
    month,
  };
}

// ── Usage recording ───────────────────────────────────────────────────────────

/**
 * Increment AI token usage for the current month.
 * Uses an upsert so the first call creates the record.
 */
export async function trackTokenUsage(orgId: string, tokensUsed: number): Promise<void> {
  if (tokensUsed <= 0) return;
  const month = currentMonth();

  await db
    .insert(usageRecords)
    .values({ orgId, month, aiTokensUsed: tokensUsed })
    .onConflictDoUpdate({
      target: [usageRecords.orgId, usageRecords.month],
      set: {
        aiTokensUsed: sql`${usageRecords.aiTokensUsed} + ${tokensUsed}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Increment published posts count for the current month.
 */
export async function trackPostPublished(orgId: string): Promise<void> {
  const month = currentMonth();

  await db
    .insert(usageRecords)
    .values({ orgId, month, postsPublished: 1 })
    .onConflictDoUpdate({
      target: [usageRecords.orgId, usageRecords.month],
      set: {
        postsPublished: sql`${usageRecords.postsPublished} + 1`,
        updatedAt: new Date(),
      },
    });
}

// ── Limit checks ──────────────────────────────────────────────────────────────

/**
 * Returns true if the org is under their token limit for the current month.
 * Enterprise orgs always return true.
 */
export async function isUnderTokenLimit(orgId: string): Promise<boolean> {
  const quota = await getOrgQuota(orgId);
  if (quota.tokensLimit === Infinity) return true;
  return quota.tokensUsed < quota.tokensLimit;
}

/**
 * Returns true if the org is under their post publish limit for the current month.
 */
export async function isUnderPostLimit(orgId: string): Promise<boolean> {
  const quota = await getOrgQuota(orgId);
  if (quota.postsLimit === Infinity) return true;
  return quota.postsPublished < quota.postsLimit;
}
