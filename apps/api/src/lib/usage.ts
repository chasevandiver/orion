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
 *
 * Null-safety: both `org` and `record` may be null for brand-new users.
 *   - `org` null  → defaults to "free" plan
 *   - `record` null → defaults to 0 tokens used and 0 posts published
 * This means a brand-new user with no usage_records row is correctly treated
 * as having used nothing and is allowed to proceed. No special-casing needed
 * by callers.
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

  // org null  → free plan (new user whose org row hasn't been created yet)
  const plan = org?.plan ?? "free";
  const tokensLimit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.free;
  const postsLimit = PLAN_POSTS_LIMITS[plan] ?? PLAN_POSTS_LIMITS.free;
  // record null → treat as zero usage (new user, no activity this month yet)
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

// ── Usage record initialisation ───────────────────────────────────────────────

/**
 * Creates a zero-counter usage record for the current month if one doesn't
 * already exist. Safe for concurrent requests — uses ON CONFLICT DO NOTHING
 * so parallel calls cannot create duplicate rows.
 *
 * Call this after a successful quota check so that every org that has ever
 * attempted an action appears in the usage_records table, even with zeroes.
 */
export async function ensureUsageRecord(orgId: string): Promise<void> {
  const month = currentMonth();
  await db
    .insert(usageRecords)
    .values({ orgId, month, aiTokensUsed: 0, postsPublished: 0 })
    .onConflictDoNothing();
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
