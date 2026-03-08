# ORION Project Memory

## Architecture
- Monorepo: `apps/api` (Express), `apps/web` (Next.js 14 App Router), `packages/db`, `packages/agents`
- `@/*` maps to `apps/web/*` in tsconfig paths
- API proxy: `apps/web/app/api/[...proxy]/route.ts` → forwards to Express at port 3001
- Auth: next-auth v5 beta with session cookies

## Routing (IMPORTANT)
- The `(dashboard)` route group in `apps/web/app/(dashboard)/` does NOT add "dashboard" to the URL
- All actual dashboard pages must live under `apps/web/app/(dashboard)/dashboard/` to be at `/dashboard/...` URLs
- `next.config.js` redirects `/` → `/dashboard` for authenticated users
- Middleware redirects unauthenticated users to `/auth/login`
- Old pages exist at `app/(dashboard)/[section]/page.tsx` (wrong URL `/section`) — kept as dead code
- New pages at `app/(dashboard)/dashboard/[section]/page.tsx` (correct URL `/dashboard/section`)

## Dashboard Pages (all at /dashboard/...)
- Goals: `dashboard/page.tsx` → imports `GoalsList` from `../goals-list`
- Strategy: `dashboard/strategy/page.tsx` → imports `StrategyList` from `@/app/(dashboard)/strategy/strategy-list`
- Content: `dashboard/content/page.tsx` → re-exports from `@/app/(dashboard)/content/page`
- Campaigns: `dashboard/campaigns/page.tsx` → imports `CampaignsList`
- Distribute: `dashboard/distribute/page.tsx` → imports `DistributeList`
- Analytics: `dashboard/analytics/page.tsx` → imports `AnalyticsDashboard`
- Contacts: `dashboard/contacts/page.tsx` → imports `ContactsTable`
- Workflows: `dashboard/workflows/page.tsx` → imports `WorkflowsList`
- Settings: `dashboard/settings/page.tsx` → imports `SettingsPanel`
- Billing: `dashboard/billing/page.tsx` → imports `BillingPanel`

## Goal Flow
- After creating a goal, `goals-list.tsx` redirects to `/dashboard/strategy`
- Strategy is generated async in backend via Inngest job

## UI Stack
- Tailwind with dark theme (CSS vars in globals.css)
- Colors: `orion-green`, `orion-blue`, `orion-dark-2` (defined in tailwind.config.js)
- Component library: shadcn/ui style in `apps/web/components/ui/`
- Charts: recharts

## API Client
- Client-side: `@/lib/api-client` (fetch wrapper + SSE stream helper)
- Server-side: `@/lib/server-api` (for Server Components)
- All API calls go through `/api/[...proxy]` which forwards to Express

## Express API Routes
- `/goals`, `/strategies`, `/campaigns`, `/contacts`, `/workflows`
- `/distribute`, `/distribute/connections`
- `/analytics/overview`, `/analytics/quota`, `/analytics/optimize`
- `/settings/org`, `/settings/members`, `/settings/integrations`
- `/billing`, `/billing/portal`, `/billing/checkout`
- `/assets/generate` (SSE streaming for content creation)
