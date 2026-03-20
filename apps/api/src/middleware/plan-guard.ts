/**
 * Plan enforcement middleware.
 *
 * Usage:
 *   import { requireTokenQuota, requirePostQuota } from "../middleware/plan-guard.js";
 *
 *   router.post("/generate", requireTokenQuota, async (req, res) => { ... });
 *
 * Returns HTTP 429 Too Many Requests when the org has exhausted their monthly quota.
 * Attaches `res.locals.quota` so downstream handlers can read remaining limits
 * without making a second DB call.
 */

import type { Request, Response, NextFunction } from "express";
import { getOrgQuota, ensureUsageRecord } from "../lib/usage.js";

/**
 * Block requests when the org has used up their AI token budget for the month.
 * Free plan: 50k tokens/month. Pro: 500k. Enterprise: unlimited.
 *
 * Returns HTTP 429 (not 402) so the frontend can distinguish quota errors from
 * payment errors and render the appropriate upgrade prompt.
 *
 * New users (no usage_records row yet) are treated as zero usage and allowed
 * through — getOrgQuota handles null records safely. After a successful check
 * we fire-and-forget an upsert so the row exists for observability.
 */
export async function requireTokenQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const orgId = req.headers["x-org-id"] as string | undefined;

  if (!orgId) {
    // No org context — let the auth middleware handle this
    return next();
  }

  try {
    const quota = await getOrgQuota(orgId);
    // Store on locals so route handlers don't need to re-fetch
    res.locals.quota = quota;

    if (quota.tokensLimit !== Infinity && quota.tokensUsed >= quota.tokensLimit) {
      res.status(429).json({
        error: "Monthly limit reached",
        plan: quota.plan,
        limit: quota.tokensLimit,
        used: quota.tokensUsed,
        month: quota.month,
      });
      return;
    }

    // Quota OK — ensure a usage row exists for this month so new users are
    // visible in the usage_records table. ON CONFLICT DO NOTHING makes this
    // safe under concurrent requests.
    ensureUsageRecord(orgId).catch((err) => {
      console.warn("[plan-guard] ensureUsageRecord failed (non-fatal):", err);
    });

    next();
  } catch (err) {
    // If quota check fails, degrade gracefully — don't block the user
    console.error("[plan-guard] quota check failed:", err);
    next();
  }
}

/**
 * Block publish requests when the org has exceeded their monthly post limit.
 * Free plan: 10 posts/month. Pro: 500. Enterprise: unlimited.
 */
export async function requirePostQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const orgId = req.headers["x-org-id"] as string | undefined;

  if (!orgId) {
    return next();
  }

  try {
    const quota = res.locals.quota ?? (await getOrgQuota(orgId));
    res.locals.quota = quota;

    if (quota.postsLimit !== Infinity && quota.postsPublished >= quota.postsLimit) {
      res.status(402).json({
        error: "post_quota_exceeded",
        message: `Your ${quota.plan} plan allows ${quota.postsLimit} published posts per month. You have published ${quota.postsPublished}. Upgrade to Pro to publish more.`,
        quota: {
          plan: quota.plan,
          postsPublished: quota.postsPublished,
          postsLimit: quota.postsLimit,
          postsRemaining: 0,
          month: quota.month,
        },
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[plan-guard] post quota check failed:", err);
    next();
  }
}
