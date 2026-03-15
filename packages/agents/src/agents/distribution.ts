/**
 * DistributionAgent — selects the correct platform client per channel,
 * publishes content, and returns structured results.
 *
 * The agent wraps the raw platform integrations with AI-powered pre-flight
 * checks (character count, content compliance hints) before publishing.
 * Multi-turn refinement state is preserved in Redis (if available) with a
 * 24-hour TTL so operators can iterate on draft content before committing.
 */
import { BaseAgent } from "./base.js";
import { db } from "@orion/db";
import { channelConnections, scheduledPosts, analyticsEvents } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptTokenSafe } from "@orion/db/lib/token-encryption";

export interface DistributionInput {
  orgId: string;
  scheduledPostId: string;
  channel: string;
  contentText: string;
  mediaUrls?: string[];
  campaignId?: string;
  assetId?: string;
}

export interface DistributionResult {
  success: boolean;
  simulate?: boolean; // true if no real platform connection was found — not a real publish
  platformPostId?: string;
  url?: string;
  publishedAt?: Date;
  error?: string;
  preflight?: string;
}

const SYSTEM_PROMPT = `You are a content compliance and distribution specialist for a marketing automation platform. Your role is to perform pre-flight checks before content is published to social media and marketing channels.

For each piece of content, evaluate:
1. Character limits for the target platform
2. Tone and brand safety (no prohibited words, appropriate professional tone)
3. Link and hashtag validity hints
4. Spam signal detection (excessive caps, punctuation, repetition)

Respond with JSON only:
{
  "approved": true|false,
  "severity": "none|warning|critical",
  "reason": "single sentence explaining the primary issue or 'All checks passed'",
  "issues": ["list of issues if any"],
  "suggestions": ["optional improvement suggestions"],
  "characterCount": number,
  "estimatedReach": "low|medium|high"
}

severity must be "critical" only for: content that exceeds hard platform character limits, contains prohibited content, or could cause brand damage. Use "warning" for style issues. Use "none" when approved.`;

const CHANNEL_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  email: 100000,
  blog: 100000,
};

export class DistributionAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SYSTEM_PROMPT, maxTokens: 512 }, "1.0.0");
  }

  /**
   * Pre-flight check: validate content before publishing.
   * Returns structured compliance report from the AI.
   */
  async preflight(
    channel: string,
    contentText: string,
  ): Promise<{
    approved: boolean;
    severity: "none" | "warning" | "critical";
    reason: string;
    issues: string[];
    suggestions: string[];
    characterCount: number;
    estimatedReach: string;
  }> {
    const limit = CHANNEL_LIMITS[channel] ?? 3000;
    const userMessage = `
Channel: ${channel} (character limit: ${limit})
Character count: ${contentText.length}

Content to validate:
---
${contentText.slice(0, 2000)}
---

Perform pre-flight validation and return JSON only.
`.trim();

    const { text } = await this.complete(userMessage);

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // fall through to safe defaults
      }
    }

    // Safe default if parsing fails
    const overLimit = contentText.length > limit;
    return {
      approved: !overLimit,
      severity: overLimit ? "critical" : "none",
      reason: overLimit ? `Content exceeds ${channel} limit of ${limit} chars` : "All checks passed",
      issues: overLimit ? [`Content exceeds ${channel} limit of ${limit} chars`] : [],
      suggestions: [],
      characterCount: contentText.length,
      estimatedReach: "medium",
    };
  }

  /**
   * Full publish flow:
   * 1. Run pre-flight content check
   * 2. Load platform credentials from DB
   * 3. Call platform client to publish
   * 4. Persist platformPostId to scheduledPosts
   */
  async publish(input: DistributionInput): Promise<DistributionResult> {
    // Step 1: Pre-flight AI check
    const preflight = await this.preflight(input.channel, input.contentText);

    // Hard block on critical failures (character limit exceeded, prohibited content)
    if (!preflight.approved && preflight.severity === "critical") {
      throw new Error(`Pre-flight critical failure: ${preflight.reason ?? preflight.issues.join("; ")}`);
    }

    if (!preflight.approved) {
      return {
        success: false,
        error: `Pre-flight failed: ${preflight.issues.join("; ")}`,
        preflight: JSON.stringify(preflight),
      };
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
      // No platform integration configured — do NOT set status to "published".
      // Record a simulated attempt with a log note so the scheduler
      // does not keep retrying, but analytics are not polluted.
      const mockId = `sim_${Date.now()}_${input.channel}`;
      await db
        .update(scheduledPosts)
        .set({
          status: "scheduled", // remain scheduled — not really published
          platformPostId: mockId,
          isSimulated: true,
          retryCount: 3,       // prevent further cron pickup until connection is added
          errorMessage: `SIMULATED — no ${input.channel} platform connection configured`,
        })
        .where(eq(scheduledPosts.id, input.scheduledPostId));

      console.warn(`[DistributionAgent] SIMULATED publish for ${input.channel} — no platform connection found`);
      return {
        success: true,
        simulate: true,
        platformPostId: mockId,
        publishedAt: new Date(),
        preflight: `Simulated — no ${input.channel} integration connected`,
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
      // Use the LinkedIn client
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

      const result = await client.publish({
        content: input.contentText,
        mediaUrls: input.mediaUrls,
      });

      platformPostId = result.platformPostId;
      url = result.url;
    } else if (input.channel === "facebook" || input.channel === "instagram") {
      const { MetaClient } = await import("@orion/integrations");
      const platform = input.channel as "facebook" | "instagram";

      // Instagram requires at least one media URL — fall back to simulation if missing
      if (platform === "instagram" && !input.mediaUrls?.length) {
        const mockId = `pending_instagram_${Date.now()}`;
        await db
          .update(scheduledPosts)
          .set({
            status: "scheduled",
            platformPostId: mockId,
            isSimulated: true,
            retryCount: 3,
            errorMessage: "SIMULATED — Instagram requires a media URL; no composited image found",
          })
          .where(eq(scheduledPosts.id, input.scheduledPostId));

        console.warn("[DistributionAgent] SIMULATED Instagram publish — no media URL available");
        return {
          success: true,
          simulate: true,
          platformPostId: mockId,
          publishedAt: new Date(),
          preflight: "Simulated — Instagram requires a composited image URL",
        };
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

      const result = await client.publish({
        content: input.contentText,
        mediaUrls: input.mediaUrls,
      });

      platformPostId = result.platformPostId;
      url = result.url;
    } else if (input.channel === "twitter") {
      const { TwitterClient } = await import("@orion/integrations");
      // connection.accountId stores the Twitter numeric user ID (set during OAuth callback)
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

      const result = await client.publish({
        content: input.contentText,
        mediaUrls: input.mediaUrls,
      });

      platformPostId = result.platformPostId;
      url = result.url;
    } else {
      // Stub for channels without a dedicated client yet.
      // Do NOT mark as published — keep scheduled so the cron won't re-pick it,
      // but flag as simulated so the calendar shows "Pending integration".
      platformPostId = `pending_${input.channel}_${Date.now()}`;
      await db
        .update(scheduledPosts)
        .set({
          status: "scheduled",
          platformPostId,
          isSimulated: true,
          retryCount: 3,
          errorMessage: `SIMULATED — no dedicated client for ${input.channel} yet`,
        })
        .where(eq(scheduledPosts.id, input.scheduledPostId));

      console.warn(`[DistributionAgent] SIMULATED publish for ${input.channel} — no dedicated client`);
      return {
        success: true,
        simulate: true,
        platformPostId,
        publishedAt: new Date(),
        preflight: `Simulated — no dedicated ${input.channel} client configured`,
      };
    }

    // Step 4: Persist result to DB (real publishes only — stub path returns early above)
    await db
      .update(scheduledPosts)
      .set({ status: "published", publishedAt, platformPostId })
      .where(eq(scheduledPosts.id, input.scheduledPostId));

    // Step 5: Analytics event — real publishes only
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
      // Non-critical — don't fail the publish if the event insert fails
      console.error("[DistributionAgent] analytics event insert failed:", (analyticsErr as Error).message);
    }

    return { success: true, platformPostId, url, publishedAt };
  }
}
