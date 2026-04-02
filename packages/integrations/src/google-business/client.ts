/**
 * GoogleBusinessClient — Google Business Profile API v4 integration.
 *
 * STATUS: Stub implementation.
 * Full implementation requires:
 *   - Google Cloud project with "My Business Business Information API" enabled
 *   - OAuth 2.0 credentials with scope: https://www.googleapis.com/auth/business.manage
 *   - GBP API access approval (separate from standard Google Cloud access)
 *   - GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET env vars
 *
 * The publish() and getPostMetrics() methods contain the correct API shapes
 * so wiring the real credentials will make them functional immediately.
 *
 * API reference: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
 */

import {
  BasePlatformClient,
  type PublishPayload,
  type PublishResult,
  type ChannelMetrics,
  type OAuthTokens,
} from "../base/client.js";

const GBP_API = "https://mybusiness.googleapis.com/v4";

export type GbpCtaType =
  | "LEARN_MORE"
  | "RESERVE"
  | "SIGN_UP"
  | "CALL"
  | "GET_OFFER";

/** Map from human-readable CTA text (as produced by the content creator) to the API enum value. */
const CTA_LABEL_MAP: Record<string, GbpCtaType> = {
  "learn more":  "LEARN_MORE",
  "reserve":     "RESERVE",
  "sign up":     "SIGN_UP",
  "call now":    "CALL",
  "get offer":   "GET_OFFER",
};

export interface GbpPublishPayload extends PublishPayload {
  /** GBP CTA button action type. Defaults to LEARN_MORE if not provided. */
  ctaType?: GbpCtaType;
  /** URL for the CTA button. Required for LEARN_MORE, RESERVE, SIGN_UP, GET_OFFER. */
  ctaUrl?: string;
}

interface GbpLocalPostResponse {
  name: string;         // "accounts/{accountId}/locations/{locationId}/localPosts/{postId}"
  state: string;        // "LIVE" | "REJECTED" | "PROCESSING"
  createTime: string;
  updateTime: string;
}

interface GbpInsightsResponse {
  localPostMetrics: Array<{
    localPostName: string;
    metricValues: Array<{
      metric: string;   // "LOCAL_POST_VIEWS_SEARCH" | "LOCAL_POST_ACTIONS_CALL_TO_ACTION"
      dimensionalValues: Array<{ value: string }>;
    }>;
  }>;
}

/**
 * Extract the CTA type from content text.
 * The ContentCreatorAgent appends a line like "CTA: Learn more" to GBP posts.
 */
function extractCtaFromContent(content: string): { cleanContent: string; ctaType: GbpCtaType } {
  const ctaLineRegex = /\n\nCTA:\s*(.+)$/i;
  const match = content.match(ctaLineRegex);

  if (match) {
    const label = match[1]!.trim().toLowerCase();
    const ctaType = CTA_LABEL_MAP[label] ?? "LEARN_MORE";
    const cleanContent = content.replace(ctaLineRegex, "").trim();
    return { cleanContent, ctaType };
  }

  return { cleanContent: content, ctaType: "LEARN_MORE" };
}

export class GoogleBusinessClient extends BasePlatformClient {
  /** Google Business Profile Account ID, e.g. "accounts/123456789" */
  private accountId: string;
  /** Google Business Profile Location ID, e.g. "locations/987654321" */
  private locationId: string;

  constructor(
    orgId: string,
    tokens: OAuthTokens,
    accountId: string,
    locationId: string,
  ) {
    super(orgId, tokens);
    this.accountId = accountId;
    this.locationId = locationId;
  }

  get channelName() {
    return "google_business";
  }

  /**
   * Create a local post via POST accounts/{accountId}/locations/{locationId}/localPosts.
   * Parses CTA type from the content text if not explicitly provided in payload.
   */
  async publish(payload: GbpPublishPayload): Promise<PublishResult> {
    const { cleanContent, ctaType } = extractCtaFromContent(payload.content);
    const resolvedCtaType = payload.ctaType ?? ctaType;

    const body: Record<string, unknown> = {
      languageCode: "en-US",
      summary: cleanContent.slice(0, 1500),
      topicType: "STANDARD",
      callToAction: {
        actionType: resolvedCtaType,
        ...(payload.ctaUrl ? { url: payload.ctaUrl } : {}),
      },
    };

    // Attach optional media (first URL only — GBP supports one media item per local post)
    if (payload.mediaUrls?.length) {
      body.media = [
        {
          mediaFormat: "PHOTO",
          sourceUrl: payload.mediaUrls[0],
        },
      ];
    }

    const path = `${this.accountId}/locations/${this.locationId}/localPosts`;
    const response = await this.request<GbpLocalPostResponse>(
      `${GBP_API}/${path}`,
      { method: "POST", body: JSON.stringify(body) },
    );

    // Extract the short post ID from the full resource name
    const postName = response.name ?? path;
    const postId = postName.split("/").pop() ?? postName;

    return {
      platformPostId: postId,
      url: `https://business.google.com/n/${postId}`,
      publishedAt: new Date(),
    };
  }

  /**
   * Fetch post-level insights via POST accounts/{accountId}/locations/{locationId}/localPosts:reportInsights.
   * Requires the business.manage scope.
   */
  async getPostMetrics(platformPostId: string): Promise<ChannelMetrics> {
    const postName = `${this.accountId}/locations/${this.locationId}/localPosts/${platformPostId}`;

    const body = {
      localPostNames: [postName],
      basicRequest: {
        metricRequests: [
          { metric: "LOCAL_POST_VIEWS_SEARCH" },
          { metric: "LOCAL_POST_ACTIONS_CALL_TO_ACTION" },
        ],
        timeRange: {
          // Last 30 days
          startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date().toISOString(),
        },
      },
    };

    const data = await this.request<GbpInsightsResponse>(
      `${GBP_API}/${this.accountId}/locations/${this.locationId}/localPosts:reportInsights`,
      { method: "POST", body: JSON.stringify(body) },
    );

    const metricsForPost = data.localPostMetrics?.[0]?.metricValues ?? [];

    let impressions = 0;
    let clicks = 0;

    for (const mv of metricsForPost) {
      const total = mv.dimensionalValues?.reduce(
        (sum, dv) => sum + (parseInt(dv.value, 10) || 0),
        0,
      ) ?? 0;

      if (mv.metric === "LOCAL_POST_VIEWS_SEARCH") impressions = total;
      if (mv.metric === "LOCAL_POST_ACTIONS_CALL_TO_ACTION") clicks = total;
    }

    return {
      impressions,
      clicks,
      engagements: clicks,
      fetchedAt: new Date(),
    };
  }

  /**
   * Refresh OAuth 2.0 tokens via the Google token endpoint.
   */
  async refreshTokens(): Promise<OAuthTokens> {
    if (!this.tokens.refreshToken) {
      throw new Error("No refresh token available for Google Business");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
        client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,
      }),
    });

    const data: any = await response.json();
    if (data.error) throw new Error(`Google token refresh error: ${data.error_description}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      scopes: data.scope?.split(" "),
    };
  }

  /**
   * Validate tokens by fetching the account list.
   */
  async validateTokens(): Promise<boolean> {
    try {
      await this.request(`${GBP_API}/accounts`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate OAuth 2.0 authorization URL for Google Business Profile.
   */
  static getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-business/callback`,
      scope: "https://www.googleapis.com/auth/business.manage",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  static async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-business/callback`,
        client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,
      }),
    });

    const data: any = await response.json();
    if (data.error) throw new Error(`Google OAuth error: ${data.error_description}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      scopes: data.scope?.split(" "),
    };
  }
}
