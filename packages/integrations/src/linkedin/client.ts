import { BasePlatformClient, type PublishPayload, type PublishResult, type ChannelMetrics, type OAuthTokens } from "../base/client.js";

const LINKEDIN_API = "https://api.linkedin.com/v2";

interface LinkedInShareResponse {
  id: string;
}

interface LinkedInOrgUrn {
  organizationUrn: string;
}

export class LinkedInClient extends BasePlatformClient {
  private authorUrn: string;

  constructor(orgId: string, tokens: OAuthTokens, authorUrn: string) {
    super(orgId, tokens);
    this.authorUrn = authorUrn;
  }

  get channelName() {
    return "linkedin";
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const body = {
      author: this.authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: payload.content },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const result = await this.request<LinkedInShareResponse>(
      `${LINKEDIN_API}/ugcPosts`,
      { method: "POST", body: JSON.stringify(body) },
    );

    const postUrl = `https://www.linkedin.com/feed/update/${result.id}`;

    return {
      platformPostId: result.id,
      url: postUrl,
      publishedAt: new Date(),
    };
  }

  async getPostMetrics(platformPostId: string): Promise<ChannelMetrics> {
    // LinkedIn Share Statistics API
    const encoded = encodeURIComponent(platformPostId);
    const data = await this.request<any>(
      `${LINKEDIN_API}/organizationalEntityShareStatistics?q=organizationalEntity&shares=List(${encoded})`,
    );

    const stats = data?.elements?.[0]?.totalShareStatistics ?? {};

    return {
      impressions: stats.impressionCount ?? 0,
      clicks: stats.clickCount ?? 0,
      engagements: stats.engagement ?? 0,
      shares: stats.shareCount ?? 0,
      comments: stats.commentCount ?? 0,
      fetchedAt: new Date(),
    };
  }

  async refreshTokens(): Promise<OAuthTokens> {
    if (!this.tokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    const data: any = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async validateTokens(): Promise<boolean> {
    try {
      await this.request(`${LINKEDIN_API}/userinfo`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate the OAuth 2.0 authorization URL.
   */
  static getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/linkedin/callback`,
      state,
      scope: "w_member_social r_organization_social rw_organization_admin",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  static async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/linkedin/callback`,
      }),
    });

    const data: any = await response.json();
    if (data.error) throw new Error(`LinkedIn OAuth error: ${data.error_description}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope?.split(" "),
    };
  }
}
