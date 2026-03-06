/**
 * TwitterClient — X/Twitter API v2 integration.
 *
 * STATUS: Stub implementation.
 * Full implementation requires:
 *   - Twitter Developer App with OAuth 2.0 PKCE enabled
 *   - Scopes: tweet.read tweet.write users.read offline.access
 *   - TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_BEARER_TOKEN env vars
 *
 * The publish() and getPostMetrics() methods contain the correct API shapes
 * so wiring the real credentials will make them functional immediately.
 */

import {
  BasePlatformClient,
  type PublishPayload,
  type PublishResult,
  type ChannelMetrics,
  type OAuthTokens,
} from "../base/client.js";

const TWITTER_API = "https://api.twitter.com/2";

interface TwitterTweetResponse {
  data: { id: string; text: string };
}

interface TwitterTweetMetrics {
  data: {
    public_metrics: {
      impression_count: number;
      like_count: number;
      reply_count: number;
      retweet_count: number;
      url_link_clicks: number;
    };
  };
}

export class TwitterClient extends BasePlatformClient {
  /** Twitter user ID, used as the author when creating tweets. */
  private twitterUserId: string;

  constructor(orgId: string, tokens: OAuthTokens, twitterUserId: string) {
    super(orgId, tokens);
    this.twitterUserId = twitterUserId;
  }

  get channelName() {
    return "twitter";
  }

  /**
   * Post a tweet via POST /2/tweets.
   * Supports thread format if content contains "1/ " markers.
   */
  async publish(payload: PublishPayload): Promise<PublishResult> {
    // Parse thread format: "1/ tweet\n\n2/ tweet\n\n3/ tweet"
    const threadParts = payload.content
      .split(/\n\n(?=\d+\/)/)
      .map((t) => t.replace(/^\d+\/\s*/, "").trim())
      .filter(Boolean);

    const tweets = threadParts.length > 1 ? threadParts : [payload.content];

    let lastTweetId: string | undefined;
    let firstTweetId: string | undefined;

    for (const tweetText of tweets) {
      const body: Record<string, unknown> = { text: tweetText.slice(0, 280) };
      if (lastTweetId) {
        body.reply = { in_reply_to_tweet_id: lastTweetId };
      }

      const response = await this.request<TwitterTweetResponse>(`${TWITTER_API}/tweets`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!firstTweetId) firstTweetId = response.data.id;
      lastTweetId = response.data.id;
    }

    return {
      platformPostId: firstTweetId!,
      url: `https://x.com/i/web/status/${firstTweetId}`,
      publishedAt: new Date(),
    };
  }

  /**
   * Fetch tweet-level metrics via GET /2/tweets/:id.
   * Requires the tweet.read scope.
   */
  async getPostMetrics(platformPostId: string): Promise<ChannelMetrics> {
    const data = await this.request<TwitterTweetMetrics>(
      `${TWITTER_API}/tweets/${platformPostId}?tweet.fields=public_metrics`,
    );

    const m = data?.data?.public_metrics ?? {};
    return {
      impressions: m.impression_count ?? 0,
      clicks: m.url_link_clicks ?? 0,
      engagements: (m.like_count ?? 0) + (m.reply_count ?? 0) + (m.retweet_count ?? 0),
      shares: m.retweet_count ?? 0,
      comments: m.reply_count ?? 0,
      fetchedAt: new Date(),
    };
  }

  /**
   * Refresh OAuth 2.0 PKCE tokens via the token endpoint.
   */
  async refreshTokens(): Promise<OAuthTokens> {
    if (!this.tokens.refreshToken) {
      throw new Error("No refresh token available for Twitter");
    }

    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
        client_id: process.env.TWITTER_CLIENT_ID!,
      }),
    });

    const data: any = await response.json();
    if (data.error) throw new Error(`Twitter token refresh error: ${data.error_description}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
      scopes: data.scope?.split(" "),
    };
  }

  /**
   * Validate tokens by fetching the authenticated user's profile.
   */
  async validateTokens(): Promise<boolean> {
    try {
      await this.request(`${TWITTER_API}/users/me`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate OAuth 2.0 PKCE authorization URL.
   * The caller must generate and store `codeVerifier` for the code exchange step.
   */
  static getAuthUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.TWITTER_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/twitter/callback`,
      scope: "tweet.read tweet.write users.read offline.access",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params}`;
  }

  /**
   * Exchange authorization code + PKCE verifier for tokens.
   */
  static async exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/twitter/callback`,
        code_verifier: codeVerifier,
      }),
    });

    const data: any = await response.json();
    if (data.error) throw new Error(`Twitter OAuth error: ${data.error_description}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
      scopes: data.scope?.split(" "),
    };
  }
}
