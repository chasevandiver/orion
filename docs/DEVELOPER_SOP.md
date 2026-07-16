# ORION — Developer SOP

Standard operating procedure for developing, debugging, and shipping changes to ORION (AI Marketing OS). Written for a developer returning to the codebase after time away.

---

## 1. What you're working on

ORION takes a marketing **goal** from brief to published content. A chain of Claude-powered agents generates a strategy, per-channel copy, and composited images; content is reviewed, scheduled, and published to LinkedIn / Twitter / Facebook / Instagram / email / SMS; analytics flow back in and feed the next strategy.

```
Browser ──► apps/web (Next.js 14, port 3000)
              │  /api/[...proxy] adds x-user-id / x-org-id / x-internal-secret
              ▼
            apps/api (Express, port 3001)  ──► PostgreSQL (Drizzle ORM)
              │ inngest.send(...)
              ▼
            Inngest dev server (port 8288) ──► packages/queue jobs
              │                                  │
              ▼                                  ▼
            packages/agents (Claude)        packages/integrations
            packages/compositor (images)    (LinkedIn/Twitter/Meta/Resend/Twilio)
```

| Piece | Path | Role |
|---|---|---|
| Web app | `apps/web` | Next.js App Router UI + auth (Auth.js) + API proxy + compositor render endpoint |
| API | `apps/api` | Express REST API — all data operations |
| Agents | `packages/agents` | One class per AI agent (strategist, content-creator, image-generator, …) |
| Jobs | `packages/queue` | Inngest job definitions — the pipeline lives in `src/jobs/orchestrate-pipeline.ts` |
| DB | `packages/db` | Drizzle schema (`src/schema/index.ts`), migrations, seed data |
| Compositor | `packages/compositor` | Satori/Resvg JSX→PNG social-card rendering |
| Integrations | `packages/integrations` | Platform API clients |

### The auth model (read this before touching API routes)

The browser **never** calls the Express API directly. Every client-side `api.get/post(...)` call goes to the Next.js catch-all proxy at `apps/web/app/api/[...proxy]/route.ts`, which:

1. Verifies the NextAuth session,
2. Injects `x-user-id`, `x-org-id`, `x-user-role`, and `x-internal-secret` headers,
3. Forwards to `INTERNAL_API_URL` (Express).

Express `authMiddleware` (`apps/api/src/middleware/auth.ts`) rejects anything without a valid `x-internal-secret` (or a Bearer session token). **Consequence:** any Express route that a browser must reach directly (OAuth callbacks, public webhooks, tracking redirects) must be mounted *before* `app.use(authMiddleware)` in `apps/api/src/index.ts`.

### Routing convention (important)

There are two page trees under `apps/web/app/(dashboard)/`:

- `dashboard/*` — **canonical**. The sidebar links here. New pages go here.
- Top-level (`campaigns/`, `settings/`, `strategy/`, …) — legacy tree. The canonical pages are mostly thin wrappers importing components from here. Don't add new links to this tree; see `docs/SITE_AUDIT.md` for the consolidation plan.

---

## 2. First-time setup

```bash
# Prereqs: Node 20+, PostgreSQL (local/Supabase/Neon), an Anthropic API key
npm install

cp .env.example .env.local
# Fill in, at minimum:
#   DATABASE_URL, ANTHROPIC_API_KEY,
#   NEXTAUTH_SECRET   (openssl rand -base64 32)
#   INTERNAL_API_SECRET, INTERNAL_RENDER_SECRET, TOKEN_ENCRYPTION_KEY  (openssl rand -hex 32)
#   INNGEST_DEV=1
# INNGEST_DEV=1 must be present in root, apps/api, and apps/web .env.local files —
# without it, events route to Inngest Cloud and the pipeline silently never runs.

npm run validate-env      # catches missing/placeholder vars (also runs as predev)
npm run db:migrate
npm run db:seed           # demo org: "Bloom Coffee Co." fixtures
```

## 3. Daily dev loop

```bash
# Terminal 1 — Inngest dev server (REQUIRED for the pipeline to run at all)
npx inngest-cli@latest dev

# Terminal 2 — web + api together via turbo
npm run dev
```

| URL | What |
|---|---|
| http://localhost:3000 | App (login → `/dashboard`) |
| http://localhost:3001/health | API health (DB check) |
| http://localhost:8288 | Inngest dashboard — watch pipeline runs & step failures here |
| `npm run db:studio` | Drizzle Studio GUI |

Before pushing:

```bash
npm run typecheck    # note: @orion/api currently has pre-existing strictness errors (see audit)
npm run lint
cd apps/web && npx next build   # strongest signal that all pages compile
```

## 4. How a campaign actually flows (for debugging)

1. **Goal created** on `/dashboard` (or `/dashboard/goals`) → `POST /goals` → API fires Inngest event `orion/goal.created`.
2. **`orchestrate-pipeline.ts`** runs stage by stage: strategist agent → save to `strategies` (raw model output in `contentText`, parsed JSON in `contentJson`) → auto-create campaign → content-creator per channel → image generation (Fal.ai → Pollinations → brand-graphic fallback) → compositor render via `apps/web/app/api/render` (authed by `INTERNAL_RENDER_SECRET`).
3. **Review** at `/dashboard/review/[campaignId]`; approve/edit assets. Edits feed `brandVoiceEdits` (brand voice learning).
4. **Distribute** — assets scheduled into `scheduledPosts`; the `publishScheduledPost` cron job (every 5 min, `packages/queue/src/jobs/index.ts`) publishes via `packages/integrations` clients using tokens from `channelConnections` (AES-256 encrypted; key = `TOKEN_ENCRYPTION_KEY`).
5. **Analytics** events roll up into `analyticsRollups`; optimization reports feed back into the next strategy run.

**Pipeline "did nothing"?** → check Inngest dashboard first, then confirm `INNGEST_DEV=1` in all three `.env.local` files, then API logs (`[pipeline]` prefix).

## 5. Common tasks

### Add a dashboard page
1. Create `apps/web/app/(dashboard)/dashboard/<name>/page.tsx` (server component; fetch via `serverApi` from `@/lib/server-api`).
2. Client interactivity goes in a sibling `"use client"` component using `api` from `@/lib/api-client` (relative `/api/...` paths → proxy).
3. Add a nav item in `apps/web/components/layout/sidebar.tsx`.

### Add an API endpoint
1. Create/extend a router in `apps/api/src/routes/<area>/index.ts`. Always scope queries by `req.user.orgId`.
2. Mount it in `apps/api/src/index.ts` — **after** `authMiddleware` unless it must be publicly reachable.
3. Validate bodies with `zod`; throw `AppError(status, message)`.

### Add a DB column/table
1. Edit `packages/db/src/schema/index.ts`.
2. `npm run db:generate` → review the new migration in `packages/db/src/migrations/` → `npm run db:migrate`.

### Add or modify an agent
1. Agent classes live in `packages/agents/src/agents/`, all extend `BaseAgent` (gives you `complete()` / `stream()` + token tracking).
2. Structured outputs: define a Zod schema, parse with `parseAgentJson`, and always keep a raw-text fallback (see `strategist.ts`).
3. Wire it into a job in `packages/queue/src/jobs/` and track tokens with `trackTokens(orgId, n)`.

### Add a channel integration
1. Client class in `packages/integrations/src/<platform>/` extending `BasePlatformClient`.
2. OAuth routes in `apps/api/src/routes/integrations/index.ts` — the **callback must be publicly mounted** (see §1 auth model; this is the current connector bug).
3. Store tokens encrypted via `encryptToken` into `channelConnections`.
4. Add the channel to the publish switch in `packages/queue/src/jobs/index.ts` and to the settings panel connect buttons.

## 6. Deployment

| Component | Where | Config |
|---|---|---|
| Web | Vercel | `apps/web/vercel.json`, build via `next build` |
| API | Railway | `railway.toml` (nixpacks, `tsx apps/api/src/index.ts`, healthcheck `/health`) |
| DB / Storage | Supabase (or any Postgres + S3) | `DATABASE_URL`, `SUPABASE_URL` + service key |
| Jobs | Inngest Cloud | unset `INNGEST_DEV`, set `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` |

**Migrations in production:** Railway runs no migrate step — idempotent schema
deltas that must reach production automatically go in
`packages/db/src/lib/runtime-migrations.ts`, which the API applies at boot
(keep a matching `.sql` file in `packages/db/src/migrations/` for local setups).

Production env rules:
- `INTERNAL_API_SECRET` must be **identical** in web and api environments.
- `INTERNAL_API_URL` (web → api), `API_BASE_URL` + `WEB_BASE_URL` (OAuth redirect construction) must be set to real hostnames.
- OAuth provider consoles (LinkedIn/Twitter/Meta) must whitelist `${API_BASE_URL}/integrations/<provider>/callback`.

## 7. Debugging playbook

| Symptom | First checks |
|---|---|
| Pipeline never runs | Inngest dev server running? `INNGEST_DEV=1` everywhere? Inngest dashboard for stuck runs |
| Every API call 401s | `INTERNAL_API_SECRET` set and identical in web+api; proxy logs `[proxy]` |
| 403 "Account setup incomplete" | Session has no `orgId` — user skipped onboarding; re-login |
| Strategy shows raw JSON | Known issue — see `docs/SITE_AUDIT.md` §1.2 |
| Connect social account fails | Known issue (multiple root causes) — see `docs/SITE_AUDIT.md` §1.1 |
| Images missing/ugly gradient | `FAL_KEY` unset (fallback chain kicked in); storage unset (`SUPABASE_URL`/S3) |
| Publishing fails silently | `scheduledPosts.status=failed` rows; token expired in `channelConnections` (use Validate button in Settings) |
| Emails not sending | `RESEND_API_KEY` / email connection in Settings |
| Local build "works" but page 404s in prod | Link points into the legacy route tree — audit §1.3 |
