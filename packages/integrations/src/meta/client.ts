/**
 * MetaClient — Facebook & Instagram Graph API integration.
 *
 * STATUS: Stub implementation.
 * Full implementation requires:
 *   - Facebook App with `pages_manage_posts`, `instagram_basic`,
 *     `instagram_content_publish` permissions
 *   - META_APP_ID, META_APP_SECRET env vars
 *   - Page Access Token (exchanged from user token via /me/accounts)
 *
 * Supports both Facebook Page posts and Instagram media publish flows.
 * The publish() method routes automatically based on `platform` constructor arg.
 */

import {
  BasePlatformClient,
  type PublishPayload,
  type PublishResult,
  type ChannelMetrics,
  type OAuthTokens,
} from "../base/client.js";

const GRAPH_API = "https://graph.facebook.com/v20.0";

export type MetaPlatform = "facebook" | "instagram";

interface GraphPostResponse {
  id: string;
  post_id?: string;
}

interface GraphInsightsResponse {
  data: Array<{
    name: string;
    period: string;
    values: Array<{ value: number }>;
  }>;
}

export class MetaClient extends BasePlatformClient {
  private platform: MetaPlatform;
  /** Facebook Page ID or Instagram Business Account ID */
  private accountId: string;

  constructor(
    orgId: string,
    tokens: OAuthTokens,
    platform: MetaPlatform,
    accountId: string,
  ) {
    super(orgId, tokens);
    this.platform = platform;
    this.accountId = accountId;
  }

  get channelName(): string {
    return this.platform;
  }

  /**
   * Publish to Facebook Page or Instagram Business Account.
   *
   * Facebook: POST /{page-id}/feed
   * Instagram: Two-step — create media container, then publish
   */
  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (this.platform === "facebook") {
      return this.publishFacebook(payload);
    }
    return this.publishInstagram(payload);
  }

  private async publishFacebook(payload: PublishPayload): Promise<PublishResult> {
    const body: Record<string, string> = { message: payload.content };
    if (payload.mediaUrls?.[0]) {
      body.link = payload.mediaUrls[0];
    }

    const result = await this.request<GraphPostResponse>(
      `${GRAPH_API}/${this.accountId}/feed`,
      { method: "POST", body: JSON.stringify(body) },
    );

    return {
      platformPostId: result.id,
      url: `https://www.facebook.com/${result.id}`,
      publishedAt: new Date(),
    };
  }

  private async publishInstagram(payload: PublishPayload): Promise<PublishResult> {
    if (!payload.mediaUrls?.[0]) {
      throw new Error("Instagram requires at least one media URL");
    }

    // Step 1: Create media container
    const containerResult = await this.request<{ id: string }>(
      `${GRAPH_API}/${this.accountId}/media`,
      {
        method: "POST",
        body: JSON.stringify({
          image_url: payload.mediaUrls[0],
          caption: payload.content,
        }),
      },
    );

    // Step 2: Publish the container
    const publishResult = await this.request<{ id: string }>(
      `${GRAPH_API}/${this.accountId}/media_publish`,
      {
        method: "POST",
        body: JSON.stringify({ creation_id: containerResult.id }),
      },
    );

    return {
      platformPostId: publishResult.id,
      url: `https://www.instagram.com/p/${publishResult.id}`,
      publishedAt: new Date(),
    };
  }

  /**
   * Fetch post insights via /{post-id}/insights.
   */
  async getPostMetrics(platformPostId: string): Promise<ChannelMetrics> {
    const metrics = this.platform === "facebook"
      ? "post_impressions,post_clicks,post_reactions_by_type_total,post_shares"
      : "impressions,reach,likes_count,comments_count";

    const data = await this.request<GraphInsightsResponse>(
      `${GRAPH_API}/${platformPostId}/insights?metric=${metrics}&period=lifetime`,
    );

    const getValue = (name: string): number => {
      const entry = data.data?.find((d) => d.name === name);
      return entry?.values?.[0]?.value ?? 0;
    };

    return {
      impressions: getValue("post_impressions") || getValue("impressions"),
      clicks: getValue("post_clicks"),
      engagements:
        getValue("post_reactions_by_type_total") ||
        getValue("likes_count") + getValue("comments_count"),
      shares: getValue("post_shares"),
      comments: getValue("comments_count"),
      fetchedAt: new Date(),
    };
  }

  /**
   * Refresh a long-lived user token.
   * Facebook long-lived tokens last 60 days and can be refreshed before expiry.
   */
  async refreshTokens(): Promise<OAuthTokens> {
    const response = await fetch(
      `${GRAPH_API}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: this.tokens.accessToken,
        }),
    );

    const data: any = await response.json();
    if (data.error) throw new Error(`Meta token refresh error: ${data.error.message}`);

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000),
    };
  }

  /**
   * Validate tokens by fetching the account's basic info.
   */
  async validateTokens(): Promise<boolean> {
    try {
      await this.request(`${GRAPH_API}/${this.accountId}?fields=id,name`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate OAuth dialog URL for Facebook Login.
   */
  static getAuthUrl(state: string, platform: MetaPlatform): string {
    const scope =
      platform === "instagram"
        ? "instagram_basic,instagram_content_publish,pages_read_engagement"
        : "pages_manage_posts,pages_read_engagement,pages_show_list";

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`,
      scope,
      response_type: "code",
      state: `${platform}:${state}`,
    });
    return `https://www.facebook.com/v20.0/dialog/oauth?${params}`;
  }

  /**
   * Exchange authorization code for a short-lived token, then extend to long-lived.
   */
  static async exchangeCode(code: string): Promise<OAuthTokens> {
    // Step 1: Get short-lived token
    const shortRes = await fetch(
      `${GRAPH_API}/oauth/access_token?` +
        new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`,
          code,
        }),
    );

    const shortData: any = await shortRes.json();
    if (shortData.error) throw new Error(`Meta OAuth error: ${shortData.error.message}`);

    // Step 2: Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `${GRAPH_API}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: shortData.access_token,
        }),
    );

    const longData: any = await longRes.json();
    if (longData.error) throw new Error(`Meta token exchange error: ${longData.error.message}`);

    return {
      accessToken: longData.access_token,
      expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
      scopes: shortData.scope?.split(","),
    };
  }
}
