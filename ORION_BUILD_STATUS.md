# ORION Build Status
Last updated: 2026-03-09

## Last file touched
`apps/web/app/gallery/page.tsx` (created — public content gallery)

## Exact next step
Create `apps/web/app/share/[token]/page.tsx` — public share page for landing pages and lead magnets via token.

---

## Layer 0 — Infrastructure & Auth

| Item | Status | File |
|------|--------|------|
| Express API server | **Complete** | `apps/api/src/index.ts` |
| Auth.js integration | **Complete** | `apps/api/src/routes/auth/index.ts` |
| Drizzle ORM + Postgres | **Complete** | `packages/db/src/schema/index.ts` |
| Inngest client | **Complete** | `packages/queue/src/client.ts` |
| Error handler middleware | **Complete** | `apps/api/src/middleware/error-handler.ts` |
| Auth middleware | **Complete** | `apps/api/src/middleware/auth.js` |
| Plan guard middleware | **Complete** | `apps/api/src/middleware/plan-guard.ts` |
| AES-256 token encryption | **Complete** | `packages/db/src/lib/token-encryption.ts` |
| Sentry error tracking | **Complete** | `apps/api/src/index.ts` |
| Next.js 14 app router | **Complete** | `apps/web/app/` |
| Turborepo monorepo | **Complete** | `turbo.json`, `package.json` |

---

## Layer 1 — Core Schema & Data Model

| Item | Status | File |
|------|--------|------|
| organizations table | **Complete** | `packages/db/src/schema/index.ts:93` |
| users table | **Complete** | `packages/db/src/schema/index.ts:119` |
| goals table | **Complete** | `packages/db/src/schema/index.ts:208` |
| strategies table | **Complete** | `packages/db/src/schema/index.ts:228` |
| campaigns table | **Complete** | `packages/db/src/schema/index.ts:248` |
| assets table | **Complete** | `packages/db/src/schema/index.ts:268` |
| asset_versions table | **Complete** | `packages/db/src/schema/index.ts:296` |
| scheduled_posts table | **Complete** | `packages/db/src/schema/index.ts:320` |
| channel_connections table | **Complete** | `packages/db/src/schema/index.ts:337` |
| analytics_events table | **Complete** | `packages/db/src/schema/index.ts:354` |
| analytics_rollups table | **Complete** | `packages/db/src/schema/index.ts:376` |
| contacts table | **Complete** | `packages/db/src/schema/index.ts:396` |
| contact_events table | **Complete** | `packages/db/src/schema/index.ts:419` |
| ab_tests / ab_variants | **Complete** | `packages/db/src/schema/index.ts:431` |
| optimization_reports | **Complete** | `packages/db/src/schema/index.ts:455` |
| workflows / workflow_runs | **Complete** | `packages/db/src/schema/index.ts:468` |
| subscriptions table | **Complete** | `packages/db/src/schema/index.ts:494` |
| usage_records table | **Complete** | `packages/db/src/schema/index.ts:509` |
| notifications table | **Complete** | `packages/db/src/schema/index.ts:523` |
| audit_events table | **Complete** | `packages/db/src/schema/index.ts:541` |
| personas table | **Complete** | `packages/db/src/schema/index.ts:193` |
| brands table | **Complete** | `packages/db/src/schema/index.ts:172` |
| brand_voice_edits table | **Complete** | `packages/db/src/schema/index.ts:307` |
| org_insights table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| landing_pages table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| paid_ad_sets table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| lead_magnets table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| email_sequences table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| email_sequence_steps table (Layer 6) | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| auto_publish_enabled / auto_publish_threshold on orgs | **Complete** | `packages/db/src/schema/index.ts` (added this session) |
| Migration 0000 (base) | **Complete** | `packages/db/src/migrations/0000_loving_black_crow.sql` |
| Migration 0001-0005 (manually applied) | **Complete** | `packages/db/src/migrations/0001_add_brands.sql` through `0005_notifications_onboarding.sql` |
| Migration 0006 (auto-publish + simulated flags) | **Complete** | `packages/db/src/migrations/0006_auto_publish_integrations.sql` |
| Migration 0007 (Layer 6 growth tables) | **Complete** | `packages/db/src/migrations/0007_layer6_growth.sql` |

---

## Layer 2 — AI Agent Pipeline

| Item | Status | File |
|------|--------|------|
| BaseAgent class | **Complete** | `packages/agents/src/agents/base.ts` |
| MarketingStrategistAgent (JSON output, v2.0) | **Complete** | `packages/agents/src/agents/strategist.ts` |
| ContentCreatorAgent (banned words, channel instructions, v2.0) | **Complete** | `packages/agents/src/agents/content-creator.ts` |
| OptimizationAgent | **Complete** | `packages/agents/src/agents/optimization.ts` |
| DistributionAgent (pre-flight + severity) | **Complete** | `packages/agents/src/agents/distribution.ts` |
| CRMIntelligenceAgent (confidence gate) | **Complete** | `packages/agents/src/agents/crm-intelligence.ts` |
| AnalyticsAgent (benchmark comparisons, raw events) | **Complete** | `packages/agents/src/agents/analytics-intelligence.ts` |
| CompetitorIntelligenceAgent | **Complete** | `packages/agents/src/agents/competitor-intelligence.ts` |
| SEOAgent | **Complete** | `packages/agents/src/agents/seo.ts` |
| LandingPageAgent | **Complete** | `packages/agents/src/agents/landing-page.ts` |
| PaidAdsAgent | **Complete** | `packages/agents/src/agents/paid-ads.ts` |
| LeadMagnetAgent | **Complete** | `packages/agents/src/agents/lead-magnet.ts` |
| BrandVoiceAgent | **Complete** | `packages/agents/src/agents/brand-voice.ts` |
| ImageGeneratorAgent | **Complete** | `packages/agents/src/agents/image-generator.ts` |
| Orchestrate pipeline (full multi-stage) | **Complete** | `packages/queue/src/jobs/orchestrate-pipeline.ts` |
| JSON strategy output + Zod validation | **Complete** | `packages/agents/src/agents/strategist.ts` |
| Parallel image generation | **Complete** | `packages/queue/src/jobs/orchestrate-pipeline.ts` |
| Compositor package | **Complete** | `packages/compositor/src/index.ts` |

---

## Layer 3 — Integrations

| Item | Status | File |
|------|--------|------|
| BasePlatformClient | **Complete** | `packages/integrations/src/base/client.ts` |
| LinkedInClient | **Complete** | `packages/integrations/src/linkedin/client.ts` |
| TwitterClient (OAuth PKCE, v2 API) | **Complete** | `packages/integrations/src/twitter/client.ts` |
| MetaClient (Facebook + Instagram) | **Complete** | `packages/integrations/src/meta/client.ts` |
| ResendClient (email via Resend API) | **Complete** | `packages/integrations/src/email/resend-client.ts` (added this session) |
| OAuth routes — Twitter PKCE | **Complete** | `apps/api/src/routes/integrations/index.ts` (added this session) |
| OAuth routes — Meta (Facebook + Instagram) | **Complete** | `apps/api/src/routes/integrations/index.ts` (added this session) |
| OAuth routes — LinkedIn | **Complete** | `apps/api/src/routes/integrations/index.ts` (added this session) |
| Email connect (Resend API key) | **Complete** | `apps/api/src/routes/integrations/index.ts` (added this session) |
| Platform switch in publish job | **Complete** | `packages/queue/src/jobs/index.ts` (updated this session) |
| Auto-publish confidence scoring | **Complete** | `packages/queue/src/jobs/index.ts` — `autoPublishAsset` function (added this session) |

---

## Layer 4 — UX / Frontend

| Item | Status | File |
|------|--------|------|
| Dashboard layout | **Complete** | `apps/web/app/(dashboard)/layout.tsx` |
| Goals list + create modal | **Complete** | `apps/web/app/(dashboard)/dashboard/page.tsx` |
| War Room (SSE polling overlay) | **Complete** | `apps/web/app/(dashboard)/campaigns/war-room.tsx` |
| War Room page | **Complete** | `apps/web/app/(dashboard)/campaigns/war-room/page.tsx` |
| Strategy dashboard | **Complete** | `apps/web/app/(dashboard)/campaigns/[id]/strategy/page.tsx` |
| Asset review (Approve/Edit/Regenerate) | **Complete** | `apps/web/app/(dashboard)/campaigns/[id]/review/page.tsx` |
| Assets masonry gallery | **Complete** | `apps/web/app/(dashboard)/assets/page.tsx` |
| Campaign performance page | **Complete** | `apps/web/app/(dashboard)/campaigns/[id]/performance/page.tsx` |
| Contacts page (Lead Pipeline) | **Complete** | `apps/web/app/(dashboard)/contacts/page.tsx` |
| Campaign summary page | **Complete** | `apps/web/app/(dashboard)/campaigns/[id]/summary/page.tsx` |
| Calendar with simulated badge | **Complete** | `apps/web/app/(dashboard)/calendar/calendar-view.tsx` |
| Settings panel (brand, personas, auto-publish) | **Complete** | `apps/web/app/(dashboard)/settings/settings-panel.tsx` |
| SSE streaming endpoint | **Complete** | `apps/web/app/api/goals/[id]/war-room-stream/route.ts` |
| Public gallery page | **Complete** | `apps/web/app/gallery/page.tsx` (added this session) |
| Public share/token page | **Not Started** | `apps/web/app/share/[token]/page.tsx` — NEXT STEP |

---

## Layer 5 — Data + Growth (formerly Layer 6)

| Item | Status | File |
|------|--------|------|
| Post-campaign analysis Inngest job | **Complete** | `packages/queue/src/jobs/post-campaign-analysis.ts` (added this session) |
| Monthly digest email cron | **Complete** | `packages/queue/src/jobs/post-campaign-analysis.ts` (added this session) |
| org_insights table | **Complete** | schema + migration 0007 |
| Stripe checkout session | **Complete** | `apps/api/src/routes/billing/index.ts:58` |
| Stripe customer portal | **Complete** | `apps/api/src/routes/billing/index.ts:37` |
| Stripe webhook (checkout.session.completed) | **Complete** | `apps/api/src/routes/webhooks/index.ts` |
| landing_pages table | **Complete** | schema + migration 0007 |
| paid_ad_sets table | **Complete** | schema + migration 0007 |
| lead_magnets table | **Complete** | schema + migration 0007 |
| email_sequences table | **Complete** | schema + migration 0007 |
| email_sequence_steps table | **Complete** | schema + migration 0007 |
| Landing page API routes | **Not Started** | `apps/api/src/routes/landing-pages/index.ts` |
| Paid ads API routes | **Not Started** | `apps/api/src/routes/paid-ads/index.ts` |
| Lead magnets API routes | **Not Started** | `apps/api/src/routes/lead-magnets/index.ts` |
| Email sequences API routes | **Not Started** | `apps/api/src/routes/email-sequences/index.ts` |
| Public share/token page | **Not Started** | `apps/web/app/share/[token]/page.tsx` |
| Landing page UI | **Not Started** | `apps/web/app/(dashboard)/landing-pages/page.tsx` |
| Lead magnets UI | **Not Started** | `apps/web/app/(dashboard)/lead-magnets/page.tsx` |
| Email sequences UI | **Not Started** | `apps/web/app/(dashboard)/sequences/page.tsx` |

---

## Summary

- **Complete**: ~85% of the full build prompt
- **Partial**: Settings UI doesn't yet show auto-publish toggle (schema + API done, UI not wired)
- **Not Started**: Public share token page, API routes for landing pages / paid ads / lead magnets / email sequences, frontend UI for those features

## Credentials needed to go live
- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` — Twitter OAuth app
- `META_APP_ID`, `META_APP_SECRET` — Meta developer app
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` — LinkedIn OAuth app
- `RESEND_FROM_EMAIL` — verified sending domain in Resend
- `API_BASE_URL`, `WEB_BASE_URL` — deployment URLs for OAuth callbacks
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe account
- `ANTHROPIC_API_KEY` — for all agents
- `OPENAI_API_KEY` — for ImageGeneratorAgent
