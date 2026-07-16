/**
 * Integration OAuth routes — connect and disconnect platform channels.
 *
 * Authenticated router (mounted behind authMiddleware):
 * GET  /integrations                        — list connected channels for org
 * DELETE /integrations/:channel             — disconnect a channel
 * POST /integrations/email/connect          — store Resend API key
 * POST /integrations/sms/connect            — store Twilio credentials
 * GET  /integrations/:channel/connect-url   — build provider OAuth URL, return { url }
 *
 * Public router (mounted BEFORE authMiddleware — providers redirect the user's
 * browser here with no session, so these must be reachable unauthenticated;
 * they are protected by the single-use `state` persisted in oauth_states):
 * GET  /integrations/twitter/callback
 * GET  /integrations/meta/callback
 * GET  /integrations/linkedin/callback
 *
 * Flow: the frontend calls connect-url through the Next.js proxy, then does a
 * full-page navigation to the returned provider URL. The provider redirects
 * back to `${API_BASE_URL}/integrations/<provider>/callback`, which exchanges
 * the code, stores encrypted tokens, and redirects to the settings page with
 * `?integration=<channel>&status=connected|error`.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { channelConnections, oauthStates } from "@orion/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { encryptToken } from "@orion/db/lib/token-encryption";
import crypto from "crypto";

export const integrationsRouter = Router();
export const integrationsPublicRouter = Router();

// ── DB-backed OAuth state (replaces the old in-memory Map) ────────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function createOauthState(params: {
  orgId: string;
  userId: string;
  channel: string;
  codeVerifier?: string | undefined;
  returnTo?: string | undefined;
}): Promise<string> {
  // Opportunistic cleanup of expired rows — cheap thanks to the expires index.
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));

  const state = crypto.randomBytes(16).toString("hex");
  await db.insert(oauthStates).values({
    state,
    orgId: params.orgId,
    userId: params.userId,
    channel: params.channel,
    codeVerifier: params.codeVerifier ?? null,
    returnTo: params.returnTo ?? null,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return state;
}

/** Single-use: returns and deletes the row, or null if missing/expired. */
async function consumeOauthState(state: string) {
  const [row] = await db
    .delete(oauthStates)
    .where(eq(oauthStates.state, state))
    .returning();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) throw new AppError(500, "API_BASE_URL not configured — required for OAuth callbacks");
  return url.replace(/\/$/, "");
}

/**
 * Where the browser lands after the OAuth dance. Defaults to the settings
 * page; a stored returnTo (same-origin path only) overrides it so flows like
 * onboarding can resume where they left off.
 */
function settingsRedirect(
  channel: string,
  status: "connected" | "error",
  message?: string,
  returnTo?: string | null,
): string {
  const base = (process.env.WEB_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const path = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard/settings";
  const params = new URLSearchParams({ integration: channel, status });
  if (message) params.set("message", message.slice(0, 200));
  return `${base}${path}?${params.toString()}`;
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

// ── GET /integrations/:channel/connect-url — start an OAuth flow ─────────────
// Returns { url } as JSON instead of redirecting: browser navigations to the
// Express API carry no session, and the Next.js proxy follows redirects
// server-side, so a 302 can never reach the provider. The frontend calls this
// through the authenticated proxy and then sets window.location itself.

integrationsRouter.get("/:channel/connect-url", async (req, res, next) => {
  try {
    const { channel } = req.params;
    // Optional same-origin path to land on after the callback (e.g. the
    // onboarding wizard). Anything that isn't a plain path is ignored.
    const returnToRaw = req.query.returnTo;
    const returnTo =
      typeof returnToRaw === "string" && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
        ? returnToRaw
        : undefined;
    let url: string;

    switch (channel) {
      case "twitter": {
        const clientId = process.env.TWITTER_CLIENT_ID;
        if (!clientId) throw new AppError(400, "Twitter is not configured (TWITTER_CLIENT_ID missing)");

        const codeVerifier = generateCodeVerifier();
        const state = await createOauthState({
          orgId: req.user.orgId,
          userId: req.user.id,
          channel: "twitter",
          codeVerifier,
          returnTo,
        });

        const u = new URL("https://twitter.com/i/oauth2/authorize");
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", clientId);
        u.searchParams.set("redirect_uri", `${apiBaseUrl()}/integrations/twitter/callback`);
        u.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
        u.searchParams.set("state", state);
        u.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
        u.searchParams.set("code_challenge_method", "S256");
        url = u.toString();
        break;
      }

      case "meta":
      case "facebook":
      case "instagram": {
        // Instagram connects through the same Meta OAuth dialog — the Graph API
        // reaches an IG Business account via its linked Facebook Page. We store
        // the user's intent in the state row so the callback can tell them when
        // no Instagram account is linked instead of silently connecting only
        // Facebook.
        const appId = process.env.META_APP_ID;
        if (!appId) throw new AppError(400, "Facebook/Instagram is not configured (META_APP_ID missing)");

        const state = await createOauthState({
          orgId: req.user.orgId,
          userId: req.user.id,
          channel: channel === "instagram" ? "instagram" : "meta",
          returnTo,
        });

        const u = new URL("https://www.facebook.com/v20.0/dialog/oauth");
        u.searchParams.set("client_id", appId);
        u.searchParams.set("redirect_uri", `${apiBaseUrl()}/integrations/meta/callback`);
        u.searchParams.set("scope", [
          "pages_manage_posts",
          "pages_read_engagement",
          "instagram_basic",
          "instagram_content_publish",
          "pages_show_list",
        ].join(","));
        u.searchParams.set("state", state);
        u.searchParams.set("response_type", "code");
        url = u.toString();
        break;
      }

      case "linkedin": {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) throw new AppError(400, "LinkedIn is not configured (LINKEDIN_CLIENT_ID missing)");

        const state = await createOauthState({
          orgId: req.user.orgId,
          userId: req.user.id,
          channel: "linkedin",
          returnTo,
        });

        // OpenID Connect scopes — LinkedIn deprecated r_basicprofile/r_liteprofile.
        // Requires the "Sign In with LinkedIn using OpenID Connect" and
        // "Share on LinkedIn" products enabled on the LinkedIn app.
        const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", clientId);
        u.searchParams.set("redirect_uri", `${apiBaseUrl()}/integrations/linkedin/callback`);
        u.searchParams.set("scope", "openid profile email w_member_social");
        u.searchParams.set("state", state);
        url = u.toString();
        break;
      }

      default:
        throw new AppError(400, `OAuth connect is not supported for channel "${channel}"`);
    }

    res.json({ data: { url } });
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

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC CALLBACKS — mounted before authMiddleware in apps/api/src/index.ts.
// Provider redirects arrive as plain unauthenticated browser navigations; the
// single-use `state` row ties the request back to the initiating org/user.
// All outcomes redirect to the settings page so the user never sees raw JSON.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Twitter OAuth 2.0 PKCE callback ───────────────────────────────────────────

integrationsPublicRouter.get("/twitter/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new Error(`Twitter OAuth error: ${error}`);
    if (!code || !state) throw new Error("Missing code or state");

    const stored = await consumeOauthState(state);
    if (!stored) {
      return res.redirect(settingsRedirect("twitter", "error", "Invalid or expired OAuth state — please try connecting again"));
    }

    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const redirectUri = `${apiBaseUrl()}/integrations/twitter/callback`;

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
        code_verifier: stored.codeVerifier ?? "",
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Twitter token exchange failed: ${body}`);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope: string;
    };

    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as { data?: { id: string; username: string } };
    const twitterUserId = userData.data?.id;
    const username = userData.data?.username;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    await db
      .insert(channelConnections)
      .values({
        orgId: stored.orgId,
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

    res.redirect(settingsRedirect("twitter", "connected", undefined, stored.returnTo));
  } catch (err) {
    console.error("[integrations] Twitter callback failed:", (err as Error).message);
    res.redirect(settingsRedirect("twitter", "error", (err as Error).message));
  }
});

// ── Meta (Facebook + Instagram) OAuth callback ────────────────────────────────

integrationsPublicRouter.get("/meta/callback", async (req, res) => {
  // Which button started the flow — "instagram" or "meta" (Facebook). Both run
  // the same Meta OAuth dance; the intent decides the redirect target and lets
  // us surface a precise error when no Instagram account is linked.
  let intent: "facebook" | "instagram" = "facebook";
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new Error(`Meta OAuth error: ${error}`);
    if (!code || !state) throw new Error("Missing code or state");

    const stored = await consumeOauthState(state);
    if (!stored) {
      return res.redirect(settingsRedirect("facebook", "error", "Invalid or expired OAuth state — please try connecting again"));
    }
    if (stored.channel === "instagram") intent = "instagram";

    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const redirectUri = `${apiBaseUrl()}/integrations/meta/callback`;

    // Exchange code for short-lived user token
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString());
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Meta token exchange failed: ${body}`);
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
      data?: Array<{ id: string; name: string; access_token: string }>;
    };

    const firstPage = pagesData.data?.[0];
    if (!firstPage) {
      throw new Error(
        intent === "instagram"
          ? "No Facebook Page found on this account. Instagram publishing works through a Facebook Page — create one at facebook.com/pages/create, link your Instagram to it, and try again."
          : "No Facebook Page found on this account — a Page is required for publishing",
      );
    }

    await db
      .insert(channelConnections)
      .values({
        orgId: stored.orgId,
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
          orgId: stored.orgId,
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

    const igConnected = !!igData.instagram_business_account?.id;

    if (intent === "instagram" && !igConnected) {
      // The Facebook connection above is stored and valid, but the thing the
      // user actually asked for didn't happen — tell them exactly why.
      return res.redirect(settingsRedirect(
        "instagram",
        "error",
        `Your Facebook Page "${firstPage.name}" has no Instagram account linked. In the Page's settings, open Linked accounts → Instagram, connect your Instagram (it must be a Professional account), then try again.`,
        stored.returnTo,
      ));
    }

    res.redirect(settingsRedirect(
      intent === "instagram" ? "instagram" : "facebook",
      "connected",
      undefined,
      stored.returnTo,
    ));
  } catch (err) {
    console.error("[integrations] Meta callback failed:", (err as Error).message);
    res.redirect(settingsRedirect(intent, "error", (err as Error).message));
  }
});

// ── LinkedIn OAuth callback (OpenID Connect) ──────────────────────────────────

integrationsPublicRouter.get("/linkedin/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) throw new Error(`LinkedIn OAuth error: ${error}`);
    if (!code || !state) throw new Error("Missing code or state");

    const stored = await consumeOauthState(state);
    if (!stored) {
      return res.redirect(settingsRedirect("linkedin", "error", "Invalid or expired OAuth state — please try connecting again"));
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID!;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
    const redirectUri = `${apiBaseUrl()}/integrations/linkedin/callback`;

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
      throw new Error(`LinkedIn token exchange failed: ${body}`);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    // OpenID Connect userinfo — replaces the deprecated /v2/me endpoint
    const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      const body = await profileResponse.text();
      throw new Error(`LinkedIn userinfo fetch failed: ${body}`);
    }
    const profile = await profileResponse.json() as {
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const displayName =
      profile.name ??
      ([profile.given_name, profile.family_name].filter(Boolean).join(" ") || "LinkedIn");

    await db
      .insert(channelConnections)
      .values({
        orgId: stored.orgId,
        channel: "linkedin",
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        accountName: displayName,
        accountId: `urn:li:person:${profile.sub}`,
        scopes: "openid,profile,email,w_member_social",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [channelConnections.orgId, channelConnections.channel],
        set: {
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          tokenExpiresAt: expiresAt,
          accountName: displayName,
          accountId: `urn:li:person:${profile.sub}`,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    res.redirect(settingsRedirect("linkedin", "connected", undefined, stored.returnTo));
  } catch (err) {
    console.error("[integrations] LinkedIn callback failed:", (err as Error).message);
    res.redirect(settingsRedirect("linkedin", "error", (err as Error).message));
  }
});
