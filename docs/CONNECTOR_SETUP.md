# Connector Setup Guide

How to connect social accounts to Stelos for real publishing. Everything here is one-time setup; after it, the Connect buttons in **Settings → Channel Integrations** work with a couple of clicks.

> **How connecting works:** each provider needs (1) an app you create in that provider's developer console, (2) two env vars on the **API service** (Railway), and (3) the Stelos callback URL whitelisted in the provider console. The callback URL is always `<API_BASE_URL>/integrations/<provider>/callback` — Settings shows your exact URL with a copy button once `API_BASE_URL` is set.

## Before anything: two base env vars

On the Railway **API** service, set (then redeploy):

| Variable | Value |
|---|---|
| `API_BASE_URL` | The API's public URL, e.g. `https://your-api.up.railway.app` — no trailing slash |
| `WEB_BASE_URL` | The web app's public URL, e.g. `https://stelos.yourdomain.com` |

Without `API_BASE_URL`, no OAuth connect can work (the Settings page will tell you this too).

---

## Instagram (and Facebook)

Instagram publishing goes through Meta's Graph API, which reaches an Instagram account **only via a linked Facebook Page**. A personal Instagram account cannot connect — this is Meta's rule, not ours. Do these in order:

### 1. Convert your Instagram to a Professional account (free)
In the Instagram app: **Settings and privacy → Account type and tools → Switch to professional account** → choose **Business** (or Creator). Nothing visible changes for your followers; you can switch back anytime.

### 2. Create a Facebook Page
Go to [facebook.com/pages/create](https://www.facebook.com/pages/create) and create a Page for your brand (e.g. "Fairway Picks"). It doesn't need content — it's the API anchor for your Instagram.

### 3. Link the Instagram account to the Page
On the Page: **Settings → Linked accounts → Instagram → Connect account** and log in with the Instagram account. (In the new Pages experience this may live under **Meta Business Suite → Settings → Business assets**.)

### 4. Create a Meta developer app
1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → use case: **Other** → type: **Business**.
2. In the app dashboard, add the **Facebook Login for Business** product.
3. Under **Facebook Login → Settings**, add to **Valid OAuth Redirect URIs**:
   `<API_BASE_URL>/integrations/meta/callback`
4. Copy **App ID** and **App Secret** from **App settings → Basic**.

> **Development mode is fine.** While the app is in Development mode it works for accounts/Pages owned by you (the app admin) — which is exactly this use case. App Review is only needed to publish on behalf of *other* people.

### 5. Set the env vars on Railway (API service)

| Variable | Value |
|---|---|
| `META_APP_ID` | App ID from step 4 |
| `META_APP_SECRET` | App Secret from step 4 |

Redeploy the API.

### 6. Connect in Stelos
**Settings → Channel Integrations → Connect Instagram** → approve in the Meta dialog. This stores both the Facebook Page connection and the Instagram connection. If Stelos reports that no Instagram account is linked to your Page, revisit step 3.

---

## LinkedIn

1. [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) → **Create app** (requires a LinkedIn Page to associate; create one if needed).
2. Under **Products**, enable **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. Under **Auth**, add redirect URL: `<API_BASE_URL>/integrations/linkedin/callback`.
4. Railway env vars: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` → redeploy.
5. Stelos → Settings → **Connect LinkedIn**.

## Twitter / X

1. [developer.x.com](https://developer.x.com/en/portal/dashboard) → create a project + app (free tier allows posting).
2. **User authentication settings**: enable OAuth 2.0, type **Web App**, callback URL: `<API_BASE_URL>/integrations/twitter/callback`, and request **Read and write** permissions.
3. Copy the OAuth 2.0 **Client ID** and **Client Secret**.
4. Railway env vars: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` → redeploy.
5. Stelos → Settings → **Connect Twitter**.

## Email (Resend)

1. [resend.com/api-keys](https://resend.com/api-keys) → create an API key (verify your sending domain under Domains for real deliverability).
2. Either set `RESEND_API_KEY` on Railway (org-wide default), or paste the key in **Settings → Email** in Stelos (per-org).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Connect button greyed out: "provider credentials not configured" | The provider's env vars aren't set on the API service — see the tables above, then redeploy |
| Settings warns `API_BASE_URL is not set` | Set it on the Railway API service; OAuth callbacks can't be built without it |
| Provider console rejects the redirect URI | It must match `<API_BASE_URL>/integrations/<provider>/callback` exactly (scheme, host, no trailing slash) |
| "Invalid or expired OAuth state" | The connect attempt is older than 10 minutes or was already used — click Connect again |
| Instagram error: "no Instagram account linked to your Page" | Steps 1–3 above: Professional account + created Page + linked |
| Connected but posts don't publish | Check **System Status** and the token-expiry banner; tokens can be revalidated per-integration in Settings |
