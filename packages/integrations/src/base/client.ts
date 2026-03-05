/**
 * Base interface for all marketing platform integrations.
 * Every integration must implement these methods.
 */

export interface PublishPayload {
  content: string;
  mediaUrls?: string[];
  scheduledFor?: Date;
}

export interface PublishResult {
  platformPostId: string;
  url: string;
  publishedAt: Date;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface ChannelMetrics {
  impressions: number;
  clicks: number;
  engagements: number;
  shares?: number;
  comments?: number;
  fetchedAt: Date;
}

export abstract class BasePlatformClient {
  protected orgId: string;
  protected tokens: OAuthTokens;

  constructor(orgId: string, tokens: OAuthTokens) {
    this.orgId = orgId;
    this.tokens = tokens;
  }

  abstract get channelName(): string;

  /**
   * Publish a post to the platform.
   */
  abstract publish(payload: PublishPayload): Promise<PublishResult>;

  /**
   * Fetch metrics for a specific post.
   */
  abstract getPostMetrics(platformPostId: string): Promise<ChannelMetrics>;

  /**
   * Refresh the OAuth access token using the refresh token.
   */
  abstract refreshTokens(): Promise<OAuthTokens>;

  /**
   * Validate that the current tokens are still valid.
   */
  abstract validateTokens(): Promise<boolean>;

  /**
   * Helper: make an authenticated API request.
   */
  protected async request<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new Error("UNAUTHORIZED: Token may be expired");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${this.channelName} API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }
}
