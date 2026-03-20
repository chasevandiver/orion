/**
 * DistributionAgent — selects the correct platform client per channel,
 * publishes content, and returns structured results.
 *
 * Pre-flight checks are deterministic (no AI call) to keep the publish
 * cron fast: character limits, Twitter thread validation, brand safety
 * keyword scan, and lightweight link reachability checks.
 */
import { BaseAgent } from "./base.js";
import { db } from "@orion/db";
import { channelConnections, scheduledPosts, analyticsEvents } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptTokenSafe } from "@orion/db/lib/token-encryption";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PreflightIssue {
  code: string;
  message: string;
  severity: "warning" | "critical";
}

export interface PreflightResult {
  /** True when there are no critical failures (warnings are OK to publish). */
  passed: boolean;
  hasCritical: boolean;
  hasWarnings: boolean;
  issues: PreflightIssue[];
}

export interface DistributionInput {
  orgId: string;
  scheduledPostId: string;
  channel: string;
  contentText: string;
  mediaUrls?: string[];
  campaignId?: string;
  assetId?: string;
  /** When true, skip preflight and publish regardless of content issues. */
  force?: boolean;
  /** Optional banned-word list to override the default for brand safety. */
  bannedWords?: string[];
}

export interface DistributionResult {
  success: boolean;
  simulate?: boolean;
  platformPostId?: string;
  url?: string;
  publishedAt?: Date;
  error?: string;
  preflight?: PreflightResult;
}

// ── Channel limits ─────────────────────────────────────────────────────────────

export const CHANNEL_LIMITS: Record<string, number> = {
  twitter:   280,
  linkedin:  3_000,
  instagram: 2_200,
  facebook:  63_206,
  tiktok:    2_200,
  email:     10_000,
  blog:      50_000,
};

// ── Default brand-safety word list ────────────────────────────────────────────
// Conservative — only include terms that would cause clear brand damage.
// Orgs can supply their own list via DistributionInput.bannedWords.

const DEFAULT_BANNED_WORDS: string[] = [
  "fuck", "shit", "asshole", "bitch", "bastard",
  "scam", "fraud", "illegal", "guaranteed money",
];

// ── Preflight helpers ──────────────────────────────────────────────────────────

function checkCharacterLimit(channel: string, text: string): PreflightIssue[] {
  const limit = CHANNEL_LIMITS[channel];
  if (!limit || text.length <= limit) return [];
  return [{
    code: "char_limit_exceeded",
    message: `Content is ${text.length} chars, exceeds ${channel} limit of ${limit}`,
    severity: "critical",
  }];
}

function checkTwitterThread(text: string): PreflightIssue[] {
  // Treat double-newline or bare "---" line as tweet separator.
  const tweets = text.split(/\n{2,}|(?:^|\n)---(?:\n|$)/).map((t) => t.trim()).filter(Boolean);
  if (tweets.length <= 1) return [];

  const issues: PreflightIssue[] = [];
  tweets.forEach((tweet, i) => {
    if (tweet.length > 280) {
      issues.push({
        code: "twitter_tweet_too_long",
        message: `Tweet ${i + 1}/${tweets.length} is ${tweet.length} chars (max 280)`,
        severity: "critical",
      });
    }
  });
  return issues;
}

function checkBrandSafety(text: string, bannedWords: string[]): PreflightIssue[] {
  const lower = text.toLowerCase();
  const hit = bannedWords.find((w) => lower.includes(w.toLowerCase()));
  if (!hit) return [];
  return [{
    code: "brand_safety",
    message: `Content contains a flagged term: "${hit}"`,
    severity: "warning",
  }];
}

async function checkLinks(text: string): Promise<PreflightIssue[]> {
  const urlRegex = /https?:\/\/[^\s"'<>)\]]+/g;
  // Deduplicate and cap at 3 to bound latency
  const urls = Array.from(new Set(text.match(urlRegex) ?? [])).slice(0, 3);
  if (urls.length === 0) return [];

  const issues: PreflightIssue[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3_000);
        const res = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        // 405 Method Not Allowed → URL exists, server just doesn't support HEAD
        if (!res.ok && res.status !== 405) {
          issues.push({
            code: "broken_link",
            message: `Link returned HTTP ${res.status}: ${url}`,
            severity: "warning",
          });
        }
      } catch {
        issues.push({
          code: "broken_link",
          message: `Link unreachable (timeout or DNS): ${url}`,
          severity: "warning",
        });
      }
    }),
  );
  return issues;
}

// ── Public preflight function (used by cron + agent) ──────────────────────────

/**
 * Run all preflight checks for a piece of content destined for `channel`.
 * All checks are deterministic or use a short HTTP HEAD request — no AI calls.
 * Completes in < 5 seconds even with link validation enabled.
 */
export async function runPreflightChecks(
  channel: string,
  contentText: string,
  options?: { bannedWords?: string[]; skipLinkCheck?: boolean },
): Promise<PreflightResult> {
  // Hard-block on empty content immediately
  if (!contentText.trim()) {
    return {
      passed: false,
      hasCritical: true,
      hasWarnings: false,
      issues: [{ code: "empty_content", message: "Content is empty", severity: "critical" }],
    };
  }

  const banned = options?.bannedWords ?? DEFAULT_BANNED_WORDS;

  // Sync checks run in parallel (all instant)
  const syncIssues: PreflightIssue[] = [
    ...checkCharacterLimit(channel, contentText),
    ...(channel === "twitter" ? checkTwitterThread(contentText) : []),
    ...checkBrandSafety(contentText, banned),
  ];

  // Async link check (bounded to 3s per URL, max 3 URLs)
  const linkIssues = options?.skipLinkCheck
    ? []
    : await checkLinks(contentText);

  const issues = [...syncIssues, ...linkIssues];
  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  return { passed: !hasCritical, hasCritical, hasWarnings, issues };
}

// ── DistributionAgent ──────────────────────────────────────────────────────────

export class DistributionAgent extends BaseAgent {
  constructor() {
    // System prompt kept minimal — the agent is now used only for the publish
    // routing step, not for AI-based preflight checks.
    super(
      { systemPrompt: "You are a content distribution specialist.", maxTokens: 256 },
      "2.0.0",
    );
  }

  /**
   * Run deterministic pre-flight checks for the given channel and content.
   * Returns structured results — no AI call.
   */
  async preflight(
    channel: string,
    contentText: string,
    options?: { bannedWords?: string[]; skipLinkCheck?: boolean },
  ): Promise<PreflightResult> {
    return runPreflightChecks(channel, contentText, options);
  }

  /**
   * Full publish flow:
   * 1. Run pre-flight checks (unless force=true)
   * 2. Load platform credentials from DB
   * 3. Call platform client to publish
   * 4. Persist platformPostId to scheduledPosts
   */
  async publish(input: DistributionInput): Promise<DistributionResult> {
    let preflight: PreflightResult | undefined;

    if (!input.force) {
      preflight = await this.preflight(input.channel, input.contentText, {
        bannedWords: input.bannedWords,
      });

      if (preflight.hasCritical) {
        // Persist preflight failure to DB so the cron/UI can surface it
        await db
          .update(scheduledPosts)
          .set({
            status: "preflight_failed",
            preflightStatus: "failed",
            preflightErrors: preflight.issues,
            errorMessage: preflight.issues.map((i) => i.message).join("; "),
          })
          .where(eq(scheduledPosts.id, input.scheduledPostId));

        return { success: false, error: preflight.issues[0]!.message, preflight };
      }
    }

    // Step 2: Load channel connection credentials
    const connection = await db.query.channelConnections.findFirst({
      where: and(
        eq(channelConnections.orgId, input.orgId),
        eq(channelConnections.channel, input.channel as any),
        eq(channelConnections.isActive, true),
      ),
    });

    if (!connection) {
      const mockId = `sim_${Date.now()}_${input.channel}`;
      await db
        .update(scheduledPosts)
        .set({
          status: "scheduled",
          platformPostId: mockId,
          isSimulated: true,
          retryCount: 3,
          preflightStatus: preflight?.hasWarnings ? "warning" : "passed",
          preflightErrors: preflight?.issues ?? [],
          errorMessage: `SIMULATED — no ${input.channel} platform connection configured`,
        })
        .where(eq(scheduledPosts.id, input.scheduledPostId));

      console.warn(`[DistributionAgent] SIMULATED publish for ${input.channel} — no platform connection found`);
      return {
        success: true,
        simulate: true,
        platformPostId: mockId,
        publishedAt: new Date(),
        preflight,
      };
    }

    // Step 3: Decrypt tokens and publish via platform client
    const accessToken = decryptTokenSafe(connection.accessTokenEnc);
    if (!accessToken) {
      return { success: false, error: "Failed to decrypt platform access token" };
    }

    let platformPostId: string;
    let url: string;
    const publishedAt = new Date();

    if (input.channel === "linkedin") {
      const { LinkedInClient } = await import("@orion/integrations");
      const client = new LinkedInClient(
        input.orgId,
        {
          accessToken,
          refreshToken: connection.refreshTokenEnc
            ? (decryptTokenSafe(connection.refreshTokenEnc) ?? undefined)
            : undefined,
          expiresAt: connection.tokenExpiresAt ?? undefined,
        },
        connection.accountId ?? `urn:li:organization:${input.orgId}`,
      );
      const result = await client.publish({ content: input.contentText, mediaUrls: input.mediaUrls });
      platformPostId = result.platformPostId;
      url = result.url;
    } else if (input.channel === "facebook" || input.channel === "instagram") {
      const { MetaClient } = await import("@orion/integrations");
      const platform = input.channel as "facebook" | "instagram";

      if (platform === "instagram" && !input.mediaUrls?.length) {
        const mockId = `pending_instagram_${Date.now()}`;
        await db
          .update(scheduledPosts)
          .set({
            status: "scheduled",
            platformPostId: mockId,
            isSimulated: true,
            retryCount: 3,
            preflightStatus: "failed",
            preflightErrors: [{ code: "instagram_no_media", message: "Instagram requires a media URL; no composited image found", severity: "critical" }],
            errorMessage: "SIMULATED — Instagram requires a media URL; no composited image found",
          })
          .where(eq(scheduledPosts.id, input.scheduledPostId));

        console.warn("[DistributionAgent] SIMULATED Instagram publish — no media URL available");
        return { success: true, simulate: true, platformPostId: mockId, publishedAt: new Date(), preflight };
      }

      const client = new MetaClient(
        input.orgId,
        {
          accessToken,
          refreshToken: connection.refreshTokenEnc
            ? (decryptTokenSafe(connection.refreshTokenEnc) ?? undefined)
            : undefined,
          expiresAt: connection.tokenExpiresAt ?? undefined,
        },
        platform,
        connection.accountId ?? "",
      );
      const result = await client.publish({ content: input.contentText, mediaUrls: input.mediaUrls });
      platformPostId = result.platformPostId;
      url = result.url;
    } else if (input.channel === "twitter") {
      const { TwitterClient } = await import("@orion/integrations");
      const client = new TwitterClient(
        input.orgId,
        {
          accessToken,
          refreshToken: connection.refreshTokenEnc
            ? (decryptTokenSafe(connection.refreshTokenEnc) ?? undefined)
            : undefined,
          expiresAt: connection.tokenExpiresAt ?? undefined,
        },
        connection.accountId ?? "",
      );
      const result = await client.publish({ content: input.contentText, mediaUrls: input.mediaUrls });
      platformPostId = result.platformPostId;
      url = result.url;
    } else {
      platformPostId = `pending_${input.channel}_${Date.now()}`;
      await db
        .update(scheduledPosts)
        .set({
          status: "scheduled",
          platformPostId,
          isSimulated: true,
          retryCount: 3,
          preflightStatus: preflight?.hasWarnings ? "warning" : "passed",
          preflightErrors: preflight?.issues ?? [],
          errorMessage: `SIMULATED — no dedicated client for ${input.channel} yet`,
        })
        .where(eq(scheduledPosts.id, input.scheduledPostId));

      console.warn(`[DistributionAgent] SIMULATED publish for ${input.channel} — no dedicated client`);
      return { success: true, simulate: true, platformPostId, publishedAt: new Date(), preflight };
    }

    // Step 4: Persist result
    await db
      .update(scheduledPosts)
      .set({
        status: "published",
        publishedAt,
        platformPostId,
        preflightStatus: preflight?.hasWarnings ? "warning" : "passed",
        preflightErrors: preflight?.issues ?? [],
      })
      .where(eq(scheduledPosts.id, input.scheduledPostId));

    // Step 5: Analytics event
    try {
      await db.insert(analyticsEvents).values({
        orgId: input.orgId,
        campaignId: input.campaignId,
        assetId: input.assetId,
        channel: input.channel,
        eventType: "publish",
        value: 1,
        metadataJson: { platformPostId, publishedAt: publishedAt.toISOString() },
        occurredAt: publishedAt,
      });
    } catch (analyticsErr) {
      console.error("[DistributionAgent] analytics event insert failed:", (analyticsErr as Error).message);
    }

    return { success: true, platformPostId, url, publishedAt, preflight };
  }
}
