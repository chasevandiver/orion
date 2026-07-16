# ORION Site Audit — July 2026

> **Status update (same branch):** §1.1–§1.7 and §2.1–§2.10 (except 2.8 breadcrumbs)
> are **fixed** in the commits following this audit. Repo-wide `typecheck` is green
> and a CI workflow now guards it. §3 remains the backlog of missing features —
> minus item 3 (CI), which shipped.

Findings from a full code audit of the web app, API, and pipeline. Ordered by severity. Each broken item includes the root cause and the concrete fix.

Verified during this audit: `npm install` clean, `@orion/web` typecheck **passes**, `next build` **passes** (all 60+ routes compile), `@orion/api` typecheck **fails** (§1.6).

---

## 1. Broken pages & flows

### 1.1 Social connector pages (LinkedIn / Twitter / Facebook / Google Business) — broken at four layers

The "Connect" buttons in Settings and Onboarding cannot ever complete an OAuth flow. Four independent causes, all must be fixed:

**a) The connect link is a dead URL.**
`settings-panel.tsx:1390` builds `href="${NEXT_PUBLIC_API_URL}/integrations/linkedin/connect"`, but `NEXT_PUBLIC_API_URL` is not defined anywhere in `.env.example`, so the link renders as relative `/integrations/linkedin/connect` — a Next.js route that doesn't exist → **404**. The onboarding wizard (`onboarding-wizard.tsx:512`) falls back to `/api/...`, which hits the proxy instead (see b).

**b) The proxy can't do OAuth redirects.**
`apps/web/app/api/[...proxy]/route.ts:93` uses `fetch(targetUrl, init)` with default `redirect: "follow"` — it *follows* the 302 to linkedin.com server-side and returns LinkedIn's HTML as the response body instead of passing the redirect to the browser.

**c) The OAuth callbacks are mounted behind auth — fatal even if a/b were fixed.**
`apps/api/src/index.ts:162,177` mounts `/integrations` **after** `authMiddleware`. When LinkedIn/Twitter/Meta redirect the user's browser back to `${API_BASE_URL}/integrations/<provider>/callback`, that request carries no `x-internal-secret` and no Bearer token → **401 before the handler runs**. No token is ever stored.

**d) OAuth state is stored in a process-local `Map`.**
`apps/api/src/routes/integrations/index.ts:32` (`pkceStore`). Any API restart or second Railway instance between "connect" and "callback" → "Invalid or expired OAuth state".

Also: the LinkedIn scopes requested (`r_basicprofile`, `index.ts:482`) are deprecated by LinkedIn — modern apps must use OpenID Connect scopes (`openid profile email w_member_social`) and fetch identity from `/v2/userinfo` instead of `/v2/me`.

**Fix plan (in order):**
1. Split the integrations router: mount `GET /integrations/*/callback` **before** `authMiddleware` (like `/webhooks` and `/t`).
2. Replace the direct `<a href>` connect links with an authenticated JSON endpoint (`GET /integrations/:channel/connect-url` → `{ url }` via the proxy), then `window.location.href = url` client-side. This removes the `NEXT_PUBLIC_API_URL` dependency and the proxy-redirect problem entirely.
3. Persist OAuth state/PKCE in a DB table (or Redis) with a 10-min TTL instead of the in-memory Map.
4. Update LinkedIn to OpenID Connect scopes + `/v2/userinfo`.
5. After callback, redirect to `/dashboard/settings?integration=x&status=connected` — and make the settings page actually read that query param and show a success/failure toast (it currently ignores it).

### 1.2 Strategy page shows raw JSON

`apps/web/app/(dashboard)/strategy/strategy-list.tsx:206-210` dumps `strategy.contentText` into a `<pre>` block. The strategist agent (`packages/agents/src/agents/strategist.ts`) is *instructed to return only JSON*, and the pipeline stores that raw JSON string as `contentText` (`orchestrate-pipeline.ts:855`). So the sidebar "Strategy" page shows a wall of JSON.

**Fix:** the work is already done elsewhere — `app/(dashboard)/campaigns/[id]/strategy/page.tsx` has a full structured renderer (executive summary, audiences, KPIs, 30-day plan, budget allocation, calendar outline) with code-fence stripping and raw-text fallback. Extract that renderer into a shared component and use it in `strategy-list.tsx`. The API already returns `contentJson` on `GET /strategies` (full row), so no backend change is needed — just add `contentJson` to the frontend `Strategy` interface and render structured-first.

### 1.3 Duplicate route trees — orphaned pages and cross-tree links

Nearly every section exists at **two URLs**: `/campaigns` *and* `/dashboard/campaigns`, `/settings` *and* `/dashboard/settings`, etc. The sidebar links only `/dashboard/*` (plus `/media`, `/system-status`); the `/dashboard/*` pages are mostly wrappers importing components from the legacy top-level tree. Consequences:

- Users get bounced between trees: the Library page (`content/page.tsx:683`) pushes to `/campaigns/{id}/review`, review-dashboard pushes to `/campaigns/{id}/strategy` — pages where the sidebar highlights nothing and the URL scheme changes.
- `analytics-dashboard.tsx:2060` and `campaigns/[id]/performance/page.tsx:281` link to `/settings` instead of `/dashboard/settings`.
- Orphaned pages that are reachable but unlinked and stale: `/assets`, `/notifications` (header links it, sidebar doesn't), `/onboarding` vs `/dashboard/onboarding`, `/gallery`.
- **Actually broken link:** `app/(dashboard)/assets/page.tsx:147` → `/dashboard/campaigns/{id}/review`, a route that does not exist (review lives at `/dashboard/review/{campaignId}`) → 404.

**Fix:** pick `/dashboard/*` as canonical (it already is, per the sidebar). Move the shared components out of the legacy tree (e.g. into `components/` or co-located under `dashboard/*`), update all cross-tree links, and add permanent redirects in `next.config.js` from every top-level legacy path to its `/dashboard/*` equivalent so old bookmarks keep working.

### 1.4 No campaign detail route at `/dashboard/campaigns/[id]`

Only `/dashboard/campaigns/[id]/summary` exists. Anyone hitting `/dashboard/campaigns/{id}` (hand-edited URL, external link) gets a 404. **Fix:** add a `page.tsx` that redirects to `./summary`.

### 1.5 Settings "Connect" buttons rely on a silently-failing capability check

`settings-panel.tsx:357-363` fetches `${NEXT_PUBLIC_API_URL}/health/integrations` to grey out unconfigured providers — with the env var unset this 404s, the error is swallowed, and all buttons render enabled ("optimistic") even when no provider credentials exist. Users click Connect and land on an error. **Fix:** route the health check through the proxy (`/api/health/integrations`) and default to *disabled with a tooltip* when the check fails.

### 1.6 `@orion/api` typecheck fails (~30 errors)

`npx turbo run typecheck` fails in `apps/api` — implicit-`any` parameters and `exactOptionalPropertyTypes` violations in `packages/queue/src/jobs/*` (e.g. `orchestrate-pipeline.ts:812,1043,1306,1395`). These don't break runtime today (the API runs via `tsx`, not `tsc`), but they hide real bugs and block CI. Also the monorepo `package.json` was missing the `packageManager` field, which breaks `turbo` entirely on current versions (added during this audit).

### 1.7 Stray patch-instruction comment in production entrypoint

`apps/api/src/index.ts:1-14` still contains "patch instructions" prose from a past edit. Harmless but confusing — delete it.

---

## 2. Usability improvements (make it easier to use)

1. **Structured strategy everywhere** (§1.2) — the single highest-leverage readability fix. Add a "Download as Markdown" button on the sidebar Strategy page too (the export endpoint `GET /campaigns/:id/strategy/export` already exists).
2. **One URL scheme** (§1.3) — users should never see the sidebar deselect itself as they navigate.
3. **OAuth feedback loop** — after connecting a channel, show a success toast and refresh the integrations list (the `?integration=x&status=connected` param is already sent but never read). On failure, show *why* (the API currently returns raw JSON errors to the browser).
4. **Replace `window.confirm()`** (disconnect integration, remove member, delete persona, revoke invite in `settings-panel.tsx`) with the app's own dialog component — native confirms look broken and can't be styled/tested.
5. **Regenerate strategy UX** — the toast says "Refresh in a minute to see the new strategy." Poll or subscribe (the war-room already has SSE infra) and swap the card in place, with a per-card "regenerating…" state.
6. **Empty-state polling forever** — the Strategy page polls `/strategies` every 3s indefinitely when empty, even for users who have no goal yet. Only poll when a pipeline is actually running; otherwise show the "Create a goal" CTA.
7. **Connect buttons during onboarding open in the same tab** and abandon the wizard (`onboarding-wizard.tsx:handleConnectChannel`). Open OAuth in a popup and message back, or save wizard state before navigation.
8. **Breadcrumbs on deep pages** (campaign → review/strategy/performance) so users can navigate up without the browser back button.
9. **Surface token expiry proactively** — `channelConnections.tokenExpiresAt` is stored and displayed only in Settings. Show a dashboard banner ("LinkedIn disconnects in 5 days — reconnect") and fire a notification; a stale token is the most common silent-publish-failure cause.
10. **`.env.example` hygiene** — add `NEXT_PUBLIC_API_URL` (or remove all references to it after fix §1.1), and mark `API_BASE_URL`/`WEB_BASE_URL` as REQUIRED-in-production rather than OPTIONAL, since OAuth is impossible without them.

---

## 3. Missing pieces to add

**Platform / reliability**
1. **Public callback mounting + persistent OAuth state** (§1.1c/d) — prerequisite for any social publishing.
2. **Proactive token refresh job** — an Inngest cron that refreshes tokens nearing `tokenExpiresAt` (Twitter refresh tokens are stored; LinkedIn/Meta need re-auth flows). Currently tokens just die.
3. **CI pipeline** — no GitHub Actions workflow exists. Minimum: `typecheck` + `next build` + `lint` on PR (requires fixing §1.6 first).
4. **Tests for the money paths** — there are almost no tests (`packages/integrations/src/__tests__`, one API usage test). Priority order: pipeline JSON parsing/fallbacks, proxy auth header injection, OAuth callback handlers, publish job platform switch.
5. **Redis-backed rate limiting / PKCE** — both are in-memory today; either breaks with a second API instance.

**Product**
6. **TikTok organic posting** (flagged "no public API" in build status — revisit: TikTok Content Posting API is now generally available) and **blog/CMS publishing** (Webflow/WordPress/Ghost adapters) — both are advertised channels the strategist is allowed to pick, but nothing can publish to them, so strategies recommend channels the product can't deliver.
7. **Strategy editing** — strategies are generate-only. Allow inline editing/approval of the structured fields (channels, budget allocation, calendar) before the pipeline consumes them; regeneration currently discards any human judgment.
8. **Campaign-level connector warnings** — when a strategy selects channels with no active `channelConnection`, warn at review time ("2 of 4 selected channels aren't connected") instead of failing at publish time.
9. **Notifications page in the sidebar** — it exists (`/notifications`) and the header links it, but it's invisible in the main nav.
10. **Billing/usage visibility** — `usageRecords` tracks tokens per org but nothing shows spend vs. plan limits until a hard failure; add a usage meter to Settings/Billing.
