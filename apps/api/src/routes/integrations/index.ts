/**
 * Integration OAuth routes — connect and disconnect platform channels.
 *
 * GET  /integrations                     — list connected channels for org
 * DELETE /integrations/:channel          — disconnect a channel
 * POST /integrations/email/connect       — store Resend API key
 *
 * Twitter OAuth 2.0 PKCE:
 * GET  /integrations/twitter/connect     — redirect to Twitter OAuth
 * GET  /integrations/twitter/callback    — exchange code for tokens
 *
 * Meta (Facebook + Instagram) OAuth:
 * GET  /integrations/meta/connect        — redirect to Meta OAuth
 * GET  /integrations/meta/callback       — exchange code for Page/IG tokens
 *
 * LinkedIn OAuth:
 * GET  /integrations/linkedin/connect    — redirect to LinkedIn OAuth
 * GET  /integrations/linkedin/callback   — exchange code for tokens
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { channelConnections } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { encryptToken, decryptTokenSafe } from "@orion/db/lib/token-encryption";
import crypto from "crypto";

export const integrationsRouter = Router();

// ── In-memory PKCE state store (replace with Redis in production) ─────────────
const pkceStore = new Map<string, {
  codeVerifier: string;
  orgId: string;
  userId: string;
  expiresAt: number;
}>();

function cleanExpiredPkce() {
  const now = Date.now();
  for (const [key, val] of pkceStore) {
    if (val.expiresAt < now) pkceStore.delete(key);
  }
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── GET /integrations — list all channel connections ─────────────────────────

integrationsRouter.get("/", async (req, res, next) => {
  try {
    const connections = await db.query.channelConnections.findMany({
      where: eq(channelConnections.orgId, req.user.orgId),
      columns: {
        id: true,
        channel: true,
        accountName: true,
        accountId: true,
        scopes: true,
        isActive: true,
        connectedAt: true,
        tokenExpiresAt: true,
        // Never expose encrypted tokens
        accessTokenEnc: false,
        refreshTokenEnc: false,
      },
    });
    res.json({ data: connections });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /integrations/:channel — disconnect a channel ──────────────────────

integrationsRouter.delete("/:channel", async (req, res, next) => {
  try {
    const { channel } = req.params;
    const [deleted] = await db
      .delete(channelConnections)
      .where(and(
        eq(channelConnections.orgId, req.user.orgId),
        eq(channelConnections.channel, channel as any),
      ))
      .returning({ id: channelConnections.id });

    if (!deleted) throw new AppError(404, "Channel connection not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /integrations/email/connect — store Resend API key ──────────────────

integrationsRouter.post("/email/connect", async (req, res, next) => {
  try {
    const { apiKey, listId, fromName } = z.object({
      apiKey: z.string().min(10),
      listId: z.string().optional(),
      fromName: z.string().optional(),
    }).parse(req.body);

    const encryptedKey = encryptToken(apiKey);

    await db
      .insert(channelConnections)
      .values({
        orgId: req.user.orgId,
        channel: "email",
        accessTokenEnc: encryptedKey,
        accountName: fromName ?? "Email",
        accountId: listId ?? null,
        scopes: "send,broadcast",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [channelConnections.orgId, channelConnections.channel],
        set: {
          accessTokenEnc: encryptedKey,
          accountName: fromName ?? "Email",
          accountId: listId ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    res.json({ data: { channel: "email", connected: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /integrations/sms/connect — store Twilio credentials ─────────────────

integrationsRouter.post("/sms/connect", async (req, res, next) => {
  try {
    const { accountSid, authToken, fromPhone } = z.object({
      accountSid: z.string().min(10),
      authToken: z.string().min(10),
      fromPhone: z.string().min(7),
    }).parse(req.body);

    const encryptedToken = encryptToken(authToken);

    await db
      .insert(channelConnections)
      .values({
        orgId: req.user.orgId,
        channel: "sms",
        accessTokenEnc: encryptedToken,
        accountId: accountSid,
        accountName: fromPhone,
        scopes: "send",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [channelConnections.orgId, channelConnections.channel],
        set: {
          accessTokenEnc: encryptedToken,
          accountId: accountSid,
          accountName: fromPhone,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    res.json({ data: { channel: "sms", connected: true } });
  } catch (err) {
    next(err);
  }
});

// ── Twitter OAuth 2.0 PKCE ────────────────────────────────────────────────────

integrationsRouter.get("/twitter/connect", async (req, res, next) => {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) throw new AppError(500, "TWITTER_CLIENT_ID not configured");

    cleanExpiredPkce();
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    pkceStore.set(state, {
      codeVerifier,
      orgId: req.user.orgId,
      userId: req.user.id,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
    });

    const redirectUri = `${process.env.API_BASE_URL}/integrations/twitter/callback`;
    const scopes = "tweet.read tweet.write users.read offline.access";

    const url = new URL("https://twitter.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get("/twitter/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new AppError(400, `Twitter OAuth error: ${error}`);
    if (!code || !state) throw new AppError(400, "Missing code or state");

    const pkce = pkceStore.get(state);
    if (!pkce) throw new AppError(400, "Invalid or expired OAuth state");
    pkceStore.delete(state);

    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const redirectUri = `${process.env.API_BASE_URL}/integrations/twitter/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: pkce.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new AppError(400, `Twitter token exchange failed: ${body}`);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope: string;
    };

    // Fetch Twitter user ID
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as { data: { id: string; username: string } };
    const twitterUserId = userData.data?.id;
    const username = userData.data?.username;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    await db
      .insert(channelConnections)
      .values({
        orgId: pkce.orgId,
        channel: "twitter",
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        accountName: username ? `@${username}` : "Twitter",
        accountId: twitterUserId,
        scopes: tokens.scope,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [channelConnections.orgId, channelConnections.channel],
        set: {
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          tokenExpiresAt: expiresAt,
          accountName: username ? `@${username}` : "Twitter",
          accountId: twitterUserId,
          scopes: tokens.scope,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    // Redirect back to the settings/integrations page
    res.redirect(`${process.env.WEB_BASE_URL}/dashboard/settings?integration=twitter&status=connected`);
  } catch (err) {
    next(err);
  }
});

// ── Meta (Facebook + Instagram) OAuth ────────────────────────────────────────

integrationsRouter.get("/meta/connect", async (req, res, next) => {
  try {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new AppError(500, "META_APP_ID not configured");

    cleanExpiredPkce();
    const state = crypto.randomBytes(16).toString("hex");

    pkceStore.set(state, {
      codeVerifier: "", // Meta uses server-side secret, not PKCE
      orgId: req.user.orgId,
      userId: req.user.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${process.env.API_BASE_URL}/integrations/meta/callback`;
    const scopes = [
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
    ].join(",");

    const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");

    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get("/meta/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new AppError(400, `Meta OAuth error: ${error}`);
    if (!code || !state) throw new AppError(400, "Missing code or state");

    const pkce = pkceStore.get(state);
    if (!pkce) throw new AppError(400, "Invalid or expired OAuth state");
    pkceStore.delete(state);

    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const redirectUri = `${process.env.API_BASE_URL}/integrations/meta/callback`;

    // Exchange code for short-lived user token
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString());
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new AppError(400, `Meta token exchange failed: ${body}`);
    }
    const shortLived = await tokenResponse.json() as { access_token: string };

    // Exchange for long-lived user token
    const longLivedUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", appId);
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLived.access_token);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLived = await longLivedResponse.json() as {
      access_token: string;
      expires_in?: number;
    };

    // Fetch managed pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${longLived.access_token}`,
    );
    const pagesData = await pagesResponse.json() as {
      data: Array<{ id: string; name: string; access_token: string }>;
    };

    const firstPage = pagesData.data?.[0];

    // Store Facebook page connection
    if (firstPage) {
      await db
        .insert(channelConnections)
        .values({
          orgId: pkce.orgId,
          channel: "facebook",
          accessTokenEnc: encryptToken(firstPage.access_token),
          accountName: firstPage.name,
          accountId: firstPage.id,
          scopes: "pages_manage_posts,pages_read_engagement",
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [channelConnections.orgId, channelConnections.channel],
          set: {
            accessTokenEnc: encryptToken(firstPage.access_token),
            accountName: firstPage.name,
            accountId: firstPage.id,
            isActive: true,
            updatedAt: new Date(),
          },
        });

      // Fetch Instagram Business Account linked to the page
      const igResponse = await fetch(
        `https://graph.facebook.com/v20.0/${firstPage.id}?fields=instagram_business_account&access_token=${firstPage.access_token}`,
      );
      const igData = await igResponse.json() as {
        instagram_business_account?: { id: string };
      };

      if (igData.instagram_business_account?.id) {
        await db
          .insert(channelConnections)
          .values({
            orgId: pkce.orgId,
            channel: "instagram",
            accessTokenEnc: encryptToken(firstPage.access_token),
            accountName: `${firstPage.name} (Instagram)`,
            accountId: igData.instagram_business_account.id,
            scopes: "instagram_basic,instagram_content_publish",
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [channelConnections.orgId, channelConnections.channel],
            set: {
              accessTokenEnc: encryptToken(firstPage.access_token),
              accountName: `${firstPage.name} (Instagram)`,
              accountId: igData.instagram_business_account.id,
              isActive: true,
              updatedAt: new Date(),
            },
          });
      }
    }

    res.redirect(`${process.env.WEB_BASE_URL}/dashboard/settings?integration=meta&status=connected`);
  } catch (err) {
    next(err);
  }
});

// ── LinkedIn OAuth ────────────────────────────────────────────────────────────

integrationsRouter.get("/linkedin/connect", async (req, res, next) => {
  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) throw new AppError(500, "LINKEDIN_CLIENT_ID not configured");

    cleanExpiredPkce();
    const state = crypto.randomBytes(16).toString("hex");

    pkceStore.set(state, {
      codeVerifier: "",
      orgId: req.user.orgId,
      userId: req.user.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${process.env.API_BASE_URL}/integrations/linkedin/callback`;

    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "w_member_social r_basicprofile r_organization_social w_organization_social");
    url.searchParams.set("state", state);

    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get("/linkedin/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new AppError(400, `LinkedIn OAuth error: ${error}`);
    if (!code || !state) throw new AppError(400, "Missing code or state");

    const pkce = pkceStore.get(state);
    if (!pkce) throw new AppError(400, "Invalid or expired OAuth state");
    pkceStore.delete(state);

    const clientId = process.env.LINKEDIN_CLIENT_ID!;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
    const redirectUri = `${process.env.API_BASE_URL}/integrations/linkedin/callback`;

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new AppError(400, `LinkedIn token exchange failed: ${body}`);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    // Fetch LinkedIn profile to get org/person URN
    const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as {
      id: string;
      localizedFirstName?: string;
      localizedLastName?: string;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const displayName = profile.localizedFirstName && profile.localizedLastName
      ? `${profile.localizedFirstName} ${profile.localizedLastName}`
      : "LinkedIn";

    await db
      .insert(channelConnections)
      .values({
        orgId: pkce.orgId,
        channel: "linkedin",
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        accountName: displayName,
        accountId: `urn:li:person:${profile.id}`,
        scopes: "w_member_social r_basicprofile",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [channelConnections.orgId, channelConnections.channel],
        set: {
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          tokenExpiresAt: expiresAt,
          accountName: displayName,
          accountId: `urn:li:person:${profile.id}`,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    res.redirect(`${process.env.WEB_BASE_URL}/dashboard/settings?integration=linkedin&status=connected`);
  } catch (err) {
    next(err);
  }
});
