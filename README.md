# ORION — AI Marketing OS

ORION is a multi-agent AI marketing platform that takes a goal from brief to published content across LinkedIn, Twitter, Instagram, Facebook, TikTok, and email. A pipeline of specialized AI agents handles strategy, copywriting, image generation, and compositing. An Express API manages data and scheduling. A Next.js frontend provides campaign management, real-time pipeline monitoring, CRM, analytics, and distribution controls.

---

## Monorepo Structure

```
orion/
├── apps/
│   ├── web/          Next.js 14 (App Router) — frontend + SSE streams + compositor API
│   └── api/          Express — REST API for all data operations
├── packages/
│   ├── agents/       @orion/agents — AI agent classes (Claude Sonnet 4.6)
│   ├── queue/        @orion/queue — Inngest job definitions
│   ├── db/           @orion/db — Drizzle ORM schema + migrations
│   ├── compositor/   @orion/compositor — Satori/Resvg image rendering
│   └── integrations/ @orion/integrations — LinkedIn, Twitter, Meta, Resend clients
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui |
| Backend | Express.js, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Auth.js (Google OAuth, GitHub OAuth, email/password) |
| AI | Anthropic Claude Sonnet 4.6 (server-side only, streaming SSE) |
| Image Generation | Pollinations.ai (Flux model, no key required) |
| Image Compositing | Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG) + Sharp |
| Queue / Orchestration | Inngest v3 |
| Email | Resend |
| Billing | Stripe (subscriptions + webhooks) |
| Storage | Supabase Storage or AWS S3 |
| Monitoring | Sentry, Pino structured logging, PostHog |
| Monorepo | Turborepo + npm workspaces |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (local, Supabase, or Neon)
- Redis (local or Upstash)
- Inngest CLI (`npx inngest-cli@latest dev`)
- An Anthropic API key

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the values. Minimum required for a working local setup:

| Variable | How to generate |
|---|---|
| `DATABASE_URL` | Your Postgres connection string |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `INTERNAL_API_SECRET` | `openssl rand -hex 32` |
| `INTERNAL_RENDER_SECRET` | `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `INNGEST_DEV` | Set to `1` |

> **CRITICAL:** `INNGEST_DEV=1` must be set in **all** `.env.local` files (root, `apps/api`, `apps/web`). Without it, Inngest events route to Inngest Cloud instead of your local dev server and the pipeline will silently never run.

### 2b. Validate your environment

Run the env validator to check for missing or placeholder variables before starting the dev server:

```bash
npm run validate-env
```

Output example:
```
✅ DATABASE_URL: configured
✅ ANTHROPIC_API_KEY: configured
✅ INNGEST_DEV: configured
⚠️  FAL_KEY: not set
   ↳ Falls back to Pollinations.ai (free); then to branded gradient backgrounds
⚠️  SUPABASE_URL: not set
   ↳ Org logo uploads fail; pipeline images can't be saved to cloud storage
```

The validator runs automatically as a `predev` step when you run `npm run dev`. It exits with code 1 if any **REQUIRED** variable is unset, so you catch misconfigurations before the server starts. Missing optional variables only print warnings and don't block startup.

The full variable catalogue with impact descriptions lives in `.env.example`.

### 3. Run migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

### 4. Start development

```bash
# Terminal 1: Inngest dev server
npx inngest-cli@latest dev

# Terminal 2: Everything else
npm run dev
```

**Dev URLs:**
- App: `http://localhost:3000`
- API: `http://localhost:3001`
- Inngest dashboard: `http://localhost:8288`
- DB Studio: `npm run db:studio`

---

## Database

Managed by Drizzle ORM. All tables defined in `packages/db/src/schema/index.ts`.

```bash
npm run db:generate    # Introspect schema changes → new migration file
npm run db:migrate     # Apply pending migrations
npm run db:seed        # Seed development fixtures
npm run db:seed:reset  # Drop all data and re-seed
npm run db:studio      # Open Drizzle Studio GUI
```

### Tables

| Table | Description |
|---|---|
| `organizations` | Org profile, brand colors, font preference, logo position, brand voice JSON |
| `users` | Org members with roles: owner \| admin \| editor \| viewer |
| `personas` | Audience personas (max 3 per org): demographics, psychographics, pain points, preferred channels |
| `goals` | Campaign briefs: type, brand info, target audience, timeline, budget, optional source photo URL |
| `strategies` | AI-generated strategy JSON + markdown, linked to a goal |
| `campaigns` | Campaign records bundling goal + strategy + assets; statuses: draft \| active \| paused \| completed \| archived |
| `assets` | Content pieces per channel with copy, imageUrl (generated), compositedImageUrl (final render), variant (a/b) |
| `assetVersions` | Edit history per asset |
| `brandVoiceEdits` | Before/after copy pairs for brand voice learning |
| `scheduledPosts` | Publish schedule records: status scheduled \| queued \| published \| failed \| cancelled |
| `channelConnections` | OAuth tokens per channel, AES-256 encrypted at rest |
| `analyticsEvents` | Raw impression/click/conversion/engagement events |
| `analyticsRollups` | Daily aggregates per org/campaign/channel |
| `contacts` | CRM leads with lead score, status (cold \| warm \| hot \| customer \| churned), source campaign |
| `contactEvents` | Contact interaction history |
| `abTests` / `abVariants` | A/B test records and variant stats |
| `optimizationReports` | AI-generated optimization recommendations |
| `workflows` / `workflowRuns` | Automation workflow definitions and execution history |
| `orionSubscriptions` | Stripe subscription state per org |
| `usageRecords` | Monthly token + post usage for plan enforcement |
| `notifications` | In-app notification log |
| `auditEvents` | Compliance audit trail |
| `orgInsights` | Post-campaign AI insight reports |
| `landingPages` | Generated landing pages with share tokens |
| `paidAdSets` | Paid advertising sets (Google/Meta/LinkedIn copy) |

Plus Auth.js tables: `accounts`, `sessions`, `verificationTokens`.

---

## AI Agent System

All AI calls are server-side only. `ANTHROPIC_API_KEY` is never in the browser.

All agents extend `BaseAgent` (`packages/agents/src/agents/base.ts`), which provides `complete()` and `stream()` methods via the Anthropic SDK. Every agent call tracks token usage.

### Agents

| Agent | File | Model | What it does |
|---|---|---|---|
| `MarketingStrategistAgent` | `strategist.ts` | Claude Sonnet 4.6 | Produces a full 30-day marketing strategy with channels, KPIs, budget allocation, content calendar, and messaging themes |
| `ContentCreatorAgent` | `content-creator.ts` | Claude Sonnet 4.6 | Generates platform-native copy per channel (LinkedIn, Twitter, Instagram, Facebook, TikTok, email, blog). Respects character limits, banned words, brand voice profile, persona context, and A/B variant instructions. Supports SSE streaming |
| `ImageGeneratorAgent` | `image-generator.ts` | Pollinations.ai (Flux) | Generates background images for social cards. Builds deterministic prompts from brand + channel. Falls back to gradient on failure. Returns `imageUrl` |
| `DistributionAgent` | `distribution.ts` | Claude Sonnet 4.6 | Pre-flight checks (character limits, brand safety, tone, spam signals) before delegating to platform clients (LinkedIn, Twitter, Meta, Resend) |
| `OptimizationAgent` | `optimizer.ts` | Claude Sonnet 4.6 | Generates markdown optimization report from analytics data: quick wins, A/B tests, schedule improvements, 30-day forecast. Returns `insufficientData: true` if < 100 impressions or < 3 channels |
| `CompetitorIntelligenceAgent` | `competitor-intelligence.ts` | Claude Sonnet 4.6 | Analyzes competitor URLs, identifies whitespace opportunities and positioning recommendations |
| `CRMIntelligenceAgent` | `crm-intelligence.ts` | Claude Sonnet 4.6 | Scores leads 0–100 with tier + confidence, enriches contact metadata (company size, buying intent, personality type), generates next-best-action recommendations |
| `AnalyticsAgent` | `analytics-intelligence.ts` | Claude Sonnet 4.6 | Produces analytics reports with benchmarks, channel insights, and 30-day forecast from raw analytics data. Supports multi-turn conversation via Redis state |
| `SEOAgent` | `seo.ts` | Claude Sonnet 4.6 | Produces keyword targeting, meta tags, heading structure, internal linking suggestions, and content brief |
| `LandingPageAgent` | `landing-page.ts` | Claude Sonnet 4.6 | Generates complete landing page JSON: hero, benefits, social proof, FAQ, CTA, meta tags |
| `PaidAdsAgent` | `paid-ads.ts` | Claude Sonnet 4.6 | Generates Google Ads (15 headlines, 4 descriptions), Meta Ads (5 variants), LinkedIn Ads copy |
| `LeadMagnetAgent` | `lead-magnet.ts` | Claude Sonnet 4.6 | Generates full lead magnet content: benchmark report, ROI calculator, checklist, swipe file, or mini-guide |
| `BrandVoiceAgent` | `brand-voice.ts` | Claude Sonnet 4.6 | Learns brand voice from before/after copy edits; outputs tone, vocabulary, banned phrases, CTA style, formality profile |

---

## Inngest Jobs

Jobs live in `packages/queue/src/jobs/` and are served by the Next.js Inngest handler at `POST /api/inngest`.

### `orchestrate-pipeline` — event: `orion/pipeline.run`

Triggered when a goal is created (`POST /goals`). Runs the full multi-agent pipeline.

**Pipeline stages:**

1. **fetch-goal** — load goal from DB
2. **fetch-org-context** — load org record + all personas; build `brandBrief` from org brand fields + incoming `event.data.brandBrief`; build `personaContext` string
3. **strategy** — run `MarketingStrategistAgent`; store result to `strategies` table
4. **create-campaign** — create campaign record linked to goal + strategy
5. For each requested channel:
   - **generate-content-{channel}** — run `ContentCreatorAgent`; store copy asset
   - *(user-photo flow only)* **analyze-source-photo** — Claude vision analyzes `sourcePhotoUrl`; `photoContext` passed to copy agent
6. *(generate flow only)* **generate-image-{channel}** — run `ImageGeneratorAgent` in parallel, batched in groups of 2 with 500 ms delay; updates `assets.imageUrl`
7. **composite-image-{channel}** — calls `POST /api/render/{channel}`; updates `assets.compositedImageUrl`
8. **mark-campaign-ready** — sets `campaigns.status = "active"`

All steps are idempotent — they check the DB before re-running agents, making retries safe.

**Key helpers in pipeline file:**
- `extractHeadlineAndCta(copyText, channel)` — extracts short headline + CTA from full copy for compositor
- `stripMarkdown()`, `stripEmoji()`, `cleanCopyText()` — text sanitization applied to all agent output
- `variantGroupIdFor(campaignId, channel)` — deterministic UUID for linking A/B asset pairs

### `post-campaign-analysis` — event: `orion/campaign.completed`

Runs after a campaign completes. Fetches analytics data, runs `AnalyticsAgent`, saves result as `orgInsights` record, optionally sends email digest via Resend.

---

## Image Compositing

`packages/compositor/src/index.ts` exports `compositeImage(params)`.

**Flow:**
1. Fetch background image (remote URL or local file) as base64
2. Fetch org logo; analyze brightness with Sharp to determine text color (white or black)
3. Determine logo corner: if `logoPosition = "auto"`, find darkest corner of background via pixel sampling; otherwise use explicit position
4. Render overlay via Satori: headline text (scaled by length), CTA button, logo — all brand-styled
5. Convert SVG → PNG via Resvg
6. Write PNG to `apps/web/public/generated/composited/`

**Channel dimensions:**

| Channel | Width | Height |
|---|---|---|
| Instagram | 1080 | 1080 |
| LinkedIn | 1200 | 627 |
| Twitter | 1600 | 900 |
| Facebook | 1200 | 630 |
| Email | 600 | 200 |

If the background image fetch fails, falls back to a solid brand-color SVG.

---

## Platform Integrations

All clients in `packages/integrations/src/` implement `BasePlatformClient`:

| Client | Channels | Auth | Publish method |
|---|---|---|---|
| `LinkedInClient` | LinkedIn | OAuth 2.0 bearer | `POST /ugcPosts` to LinkedIn API v2 |
| `TwitterClient` | Twitter | OAuth 2.0 bearer | Twitter API v2 tweet creation |
| `MetaClient` | Facebook, Instagram | OAuth 2.0 bearer | Graph API v18.0 feed post |
| `ResendClient` | Email | API key | `POST https://api.resend.com/emails` |

OAuth tokens are stored AES-256 encrypted in `channelConnections.accessTokenEnc`. The `DistributionAgent` looks up the active connection for the channel and delegates to the appropriate client.

---

## Frontend Pages

All dashboard routes are under `app/(dashboard)/dashboard/` and are protected by auth middleware. Unauthenticated requests redirect to `/auth/login`. Incomplete onboarding redirects to `/dashboard/onboarding`.

### Implemented and active

| Route | What it does |
|---|---|
| `/dashboard` | Goals list, setup checklist (brand/personas/goals), onboarding redirect |
| `/dashboard/onboarding` | First-time setup wizard |
| `/dashboard/campaigns` | Campaign list with status filters |
| `/dashboard/campaigns/war-room` | Real-time SSE pipeline monitor: agent status, readiness score (0–100), stage progress. Navigates to review on completion |
| `/dashboard/campaigns/[id]/summary` | Campaign summary: strategy overview, content calendar, publish readiness, composited image thumbnails, A/B results |
| `/dashboard/campaigns/[id]/strategy` | View/edit strategy markdown |
| `/dashboard/campaigns/[id]/performance` | Campaign analytics and performance metrics |
| `/dashboard/campaigns/[id]/review` | Asset review and approval for a specific campaign |
| `/dashboard/review` | Review all org assets across campaigns |
| `/dashboard/review/[campaignId]` | Asset detail with composited image lightbox |
| `/dashboard/pipeline/[goalId]` | Pipeline execution detail view |
| `/dashboard/content` | Content library and asset management |
| `/dashboard/distribute` | Scheduled posts list with channel connections, stats (scheduled/published/failed) |
| `/dashboard/analytics` | Analytics dashboard |
| `/dashboard/contacts` | CRM contacts table (lead score, status, source channel) |
| `/dashboard/settings` | Org settings: brand colors, logo, font, logo position, personas CRUD |
| `/dashboard/billing` | Subscription plan, usage (tokens/posts/contacts), Stripe checkout link |
| `/dashboard/workflows` | Workflow list with run history |
| `/dashboard/calendar` | Content calendar view |
| `/dashboard/brands` | Brand profiles |
| `/dashboard/strategy` | Strategy overview |

### Public routes

| Route | What it does |
|---|---|
| `/auth/login` | Email/password login + Google/GitHub OAuth |
| `/auth/register` | New user registration |
| `/gallery` | Public gallery of generated landing pages |
| `/share/[token]` | Public landing page view (share token access) |

### Pages that exist but have thin implementations

| Route | Status |
|---|---|
| `/dashboard/landing-pages` | Page exists, fetches from API; landing page generator agents are built but UI editing is minimal |
| `/dashboard/lead-magnets` | Page exists, fetches from API; full generation agent is built |
| `/dashboard/sequences` | Page exists; email sequence data model is in DB but sequence builder UI is not built |

---

## API Routes (Express — `apps/api`)

All routes require session authentication unless noted. All queries are scoped by `orgId` from the session.

### Auth — `/auth`
- `POST /auth/register` — create user + org
- `POST /auth/login` — email/password login
- `POST /auth/logout`
- `GET /auth/session`
- `POST /auth/forgot-password`

### Goals — `/goals`
- `GET /goals` — list org goals with strategies and campaigns
- `POST /goals` — create goal + trigger `orion/pipeline.run` Inngest event
- `GET /goals/:id` — goal detail with strategy and campaign history
- `PATCH /goals/:id`
- `POST /goals/:id/run-pipeline` — re-trigger pipeline manually

### Campaigns — `/campaigns`
- `GET /campaigns` — list (filterable by status, goalId)
- `POST /campaigns`
- `GET /campaigns/:id` — includes goal, strategy, assets, analytics
- `PATCH /campaigns/:id`
- `DELETE /campaigns/:id` — archive

### Assets — `/assets`
- `GET /assets` — list (filterable by campaign, channel, status)
- `POST /assets/generate` — SSE streaming content generation via `ContentCreatorAgent`
- `GET /assets/:id`
- `PATCH /assets/:id` — update status (approve, reject, publish) or content
- `POST /assets/:id/variants` — generate A/B variant

### Analytics — `/analytics`
- `GET /analytics/overview` — aggregated metrics over date range (impressions, clicks, conversions, spend, revenue)
- `GET /analytics/variant-comparison?assetIdA=X&assetIdB=Y` — A/B comparison
- `GET /analytics/:campaignId`

### Distribution — `/distribute`
- `GET /distribute` — list scheduled posts
- `POST /distribute` — schedule a post
- `PATCH /distribute/:id` — reschedule or update status
- `DELETE /distribute/:id` — cancel

### Settings — `/settings`
- `GET /settings/org` / `PATCH /settings/org` — org profile, brand fields (owner/admin only for mutations)
- `GET /settings/members` / `POST /settings/members/invite` / `DELETE /settings/members/:userId`
- `GET /settings/personas` / `POST /settings/personas` (max 3) / `PATCH /settings/personas/:id` / `DELETE /settings/personas/:id`

### Contacts — `/contacts`
- `POST /contacts/capture` — **public webhook** — upsert contact from external sources; requires `x-orion-webhook-secret` header
- `GET /contacts` — list (searchable, sortable by lead score)
- `GET /contacts/:id` — detail with event history
- `PATCH /contacts/:id`
- `POST /contacts/:id/score` — re-score via `CRMIntelligenceAgent`

### Integrations — `/integrations`
- `GET /integrations` — list channel OAuth status
- `POST /integrations/:channel/connect` — start OAuth flow
- `POST /integrations/:channel/disconnect`

### Billing — `/billing`
- `GET /billing/subscription`
- `POST /billing/checkout-session` — create Stripe checkout for plan upgrade
- `GET /billing/usage`

### Pipeline — `/pipeline`
- `GET /pipeline/:goalId/status` — current stage, progress, agent details for war room

### Other routes
- `POST /organizations/upload-logo`
- `GET /brands`, `POST /brands`, `PATCH /brands/:id`, `DELETE /brands/:id`
- `GET /strategies`, `GET /strategies/:id`
- `GET /notifications`, `PATCH /notifications/:id`
- `GET /workflows`, `POST /workflows`, `PATCH /workflows/:id`, `DELETE /workflows/:id`
- `GET /landing-pages`, `POST /landing-pages`, `GET /landing-pages/:id`, `PATCH /landing-pages/:id`
- `GET /paid-ads`, `POST /paid-ads`
- `GET /lead-magnets`, `POST /lead-magnets`
- `GET /email-sequences`, `POST /email-sequences`
- `POST /webhooks/stripe` — Stripe event handler

### Next.js API Routes — `apps/web/app/api`
- `GET|POST /api/auth/[...nextauth]` — Auth.js handler
- `GET|POST /api/inngest` — Inngest serve handler (all queue jobs are registered here)
- `POST /api/upload` — file upload to Supabase/S3
- `POST /api/render/[channel]` — compositor endpoint: accepts `backgroundImageUrl`, `headlineText`, `ctaText`, `logoUrl`, `brandPrimaryColor`, `logoPosition`, `flowType`; returns `{ url }` path to saved PNG
- `GET /api/goals/[id]/war-room-stream` — SSE stream of pipeline status for the war room UI
- `GET /api/[...proxy]` — proxy to Express API at `INTERNAL_API_URL`

---

## Security

- `ANTHROPIC_API_KEY` is server-side only — `BaseAgent` constructor asserts this
- OAuth tokens stored AES-256 encrypted in `channelConnections.accessTokenEnc`
- All DB queries parameterized via Drizzle ORM
- Every query scoped by `orgId` from validated session
- Stripe webhooks validated by signature before processing
- Rate limiting on AI generation endpoints (10 req/min per user via `requireTokenQuota` middleware)
- CSP headers in `next.config.js`

---

## Environment Variables

See `.env.example` for the full list. Key variables:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
INTERNAL_API_URL=http://localhost:3001
INTERNAL_API_SECRET=          # shared secret: Next.js → Express
INTERNAL_RENDER_SECRET=       # shared secret: pipeline → compositor

# Database
DATABASE_URL=

# AI
ANTHROPIC_API_KEY=            # server-side only, never NEXT_PUBLIC_

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Inngest (REQUIRED for local dev)
INNGEST_DEV=1
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=

# Redis
REDIS_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
STRIPE_PRICE_ENTERPRISE_MONTHLY=

# Email
RESEND_API_KEY=
EMAIL_FROM=

# Storage (Supabase or S3)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STORAGE_BUCKET=orion-assets
# or: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

# Platform OAuth
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# Encryption
TOKEN_ENCRYPTION_KEY=         # AES-256 key for OAuth tokens at rest

# Webhooks
ORION_WEBHOOK_SECRET=         # shared secret for POST /contacts/capture

# Monitoring
NEXT_PUBLIC_POSTHOG_KEY=
SENTRY_DSN=
```

---

## Scripts

```bash
npm run validate-env  # Check .env.local for missing/placeholder variables
npm run dev           # Start all apps in parallel (runs validate-env first)
npm run build         # Build all packages
npm run typecheck     # tsc --noEmit across all packages
npm run lint          # ESLint across all packages
npm run test          # Jest
npm run db:generate   # Generate Drizzle migration from schema changes
npm run db:migrate    # Apply pending migrations
npm run db:seed       # Seed dev fixtures
npm run db:seed:reset # Drop all data and re-seed
npm run db:studio     # Open Drizzle Studio GUI
npm run format        # Prettier
```
