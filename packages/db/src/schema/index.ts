import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const roleEnum = pgEnum("role", ["owner", "admin", "editor", "viewer"]);
export const goalTypeEnum = pgEnum("goal_type", [
  "leads",
  "awareness",
  "event",
  "product",
  "traffic",
  "social",
  "conversions",
]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);
export const assetTypeEnum = pgEnum("asset_type", [
  "social_post",
  "email",
  "blog",
  "ad_copy",
  "video_script",
  "landing_page",
  "graphic_prompt",
]);
export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "review",
  "approved",
  "rejected",
  "published",
]);
export const channelEnum = pgEnum("channel", [
  "linkedin",
  "twitter",
  "instagram",
  "facebook",
  "tiktok",
  "email",
  "blog",
  "website",
  "sms",
  "google_business",
]);
export const postStatusEnum = pgEnum("post_status", [
  "scheduled",
  "queued",
  "published",
  "failed",
  "cancelled",
  "preflight_failed",
]);
export const contactStatusEnum = pgEnum("contact_status", ["cold", "warm", "hot", "customer", "churned"]);
export const workflowStatusEnum = pgEnum("workflow_status", ["draft", "active", "paused", "archived"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
]);
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "impression",
  "click",
  "engagement",
  "conversion",
  "open",
  "unsubscribe",
  "publish_success",
]);
export const fontPreferenceEnum = pgEnum("font_preference", ["modern", "serif", "minimal", "bold"]);
export const logoPositionEnum = pgEnum("logo_position", ["auto", "top-left", "top-right", "bottom-left", "bottom-right"]);
export const variantEnum = pgEnum("variant", ["a", "b"]);

// ── Organizations ─────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  website: text("website"),
  plan: planEnum("plan").notNull().default("free"),
  // Brand design fields
  brandPrimaryColor: text("brand_primary_color"),
  brandSecondaryColor: text("brand_secondary_color"),
  fontPreference: fontPreferenceEnum("font_preference"),
  logoPosition: logoPositionEnum("logo_position").default("auto"),
  inspirationImageUrl: text("inspiration_image_url"),
  brandVoiceProfile: jsonb("brand_voice_profile"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  // Auto-publish: when enabled, posts scoring above the threshold are published automatically
  autoPublishEnabled: boolean("auto_publish_enabled").notNull().default(false),
  autoPublishThreshold: integer("auto_publish_threshold").notNull().default(80),
  timezone: varchar("timezone", { length: 50 }).notNull().default("America/Chicago"),
  // UTM attribution: when enabled, URLs in scheduled posts are tagged with utm_* params
  autoUtmEnabled: boolean("auto_utm_enabled").notNull().default(true),
  // Hashtag blocklist — passed to ContentCreatorAgent to prevent usage
  bannedHashtags: jsonb("banned_hashtags").$type<string[]>().default([]),
  // Best posting times per channel — computed by optimization agent from analytics rollups.
  // Shape: [{ channel, dayOfWeek, hourUtc, engagementRate }]
  bestPostingTimes: jsonb("best_posting_times").$type<Array<{ channel: string; dayOfWeek: number; hourUtc: number; engagementRate: number }>>(),
  // Evergreen content recycling — automatically refreshes high-performing posts
  evergreenEnabled: boolean("evergreen_enabled").notNull().default(false),
  evergreenMinAgeDays: integer("evergreen_min_age_days").notNull().default(30),
  evergreenMinEngagementMultiplier: real("evergreen_min_engagement_multiplier").notNull().default(1.5),
  evergreenMaxRecycles: integer("evergreen_max_recycles").notNull().default(3),
  // Monthly marketing budget for budget tracking & ROI
  monthlyMarketingBudget: real("monthly_marketing_budget"),
  // Report customization settings
  reportLogoUrl: text("report_logo_url"),
  reportAccentColor: text("report_accent_color"),
  reportSections: jsonb("report_sections").$type<string[]>().default([
    "cover", "executive_summary", "key_metrics", "channel_breakdown",
    "top_content", "recommendations",
  ]),
  reportFooterText: text("report_footer_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex("orgs_slug_idx").on(t.slug),
}));

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull().default("viewer"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
  orgIdx: index("users_org_idx").on(t.orgId),
}));

// Auth.js required tables
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
}, (t) => ({
  providerIdx: uniqueIndex("accounts_provider_idx").on(t.provider, t.providerAccountId),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => ({
  tokenIdx: uniqueIndex("sessions_token_idx").on(t.sessionToken),
}));

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => ({
  tokenIdx: uniqueIndex("verification_tokens_idx").on(t.identifier, t.token),
}));

// ── Brand Profiles ────────────────────────────────────────────────────────────

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  primaryColor: text("primary_color").default("#10b981"),
  voiceTone: text("voice_tone").default("professional"), // professional | casual | bold | playful | authoritative
  targetAudience: text("target_audience"),
  products: jsonb("products").default("[]"), // Array<{ name: string; description: string }>
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("brands_org_idx").on(t.orgId),
}));

// ── Audience Personas ─────────────────────────────────────────────────────────

export const personas = pgTable("personas", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  demographics: text("demographics"),
  psychographics: text("psychographics"),
  painPoints: text("pain_points"),
  preferredChannels: jsonb("preferred_channels").default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("personas_org_idx").on(t.orgId),
}));

// ── Goals ─────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: goalTypeEnum("type").notNull(),
  brandName: text("brand_name").notNull(),
  brandDescription: text("brand_description"),
  targetAudience: text("target_audience"),
  timeline: text("timeline").notNull().default("1_month"),
  budget: real("budget"),
  estimatedValue: real("estimated_value"),
  sourcePhotoUrl: text("source_photo_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("goals_org_idx").on(t.orgId),
}));

// ── Strategies ────────────────────────────────────────────────────────────────

export const strategies = pgTable("strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contentJson: jsonb("content_json").notNull(), // structured strategy output
  contentText: text("content_text").notNull(),  // human-readable version
  targetAudiences: jsonb("target_audiences"),    // array of audience segments
  channels: jsonb("channels"),                   // recommended channels
  kpis: jsonb("kpis"),                           // target KPIs
  competitorContext: jsonb("competitor_context"),   // raw CompetitorIntelligenceAgent output
  seoContext: jsonb("seo_context"),                  // raw SEOAgent output (keywords, brief, meta)
  promptVersion: text("prompt_version"),
  modelVersion: text("model_version"),
  tokensUsed: integer("tokens_used"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  goalIdx: index("strategies_goal_idx").on(t.goalId),
  orgIdx: index("strategies_org_idx").on(t.orgId),
}));

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: campaignStatusEnum("status").notNull().default("draft"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  budget: real("budget"),
  actualSpend: real("actual_spend"),
  spendByChannel: jsonb("spend_by_channel").$type<Record<string, number>>(),
  pipelineError: text("pipeline_error"),
  pipelineErrorAt: timestamp("pipeline_error_at", { withTimezone: true }),
  pipelineStage: varchar("pipeline_stage", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("campaigns_org_idx").on(t.orgId),
  statusIdx: index("campaigns_status_idx").on(t.status),
}));

// ── Assets (Content) ──────────────────────────────────────────────────────────

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  type: assetTypeEnum("type").notNull(),
  contentText: text("content_text").notNull(),
  contentHtml: text("content_html"),
  mediaUrls: jsonb("media_urls").default("[]"),
  imageUrl: text("image_url"),
  compositedImageUrl: text("composited_image_url"),
  trackingUrl: text("tracking_url"),
  variant: variantEnum("variant").notNull().default("a"),
  variantGroupId: uuid("variant_group_id"),
  status: assetStatusEnum("status").notNull().default("draft"),
  generatedByAgent: text("generated_by_agent"),
  modelVersion: text("model_version"),
  promptSnapshot: text("prompt_snapshot"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  tokensUsed: integer("tokens_used"),
  /** Pipeline metadata — e.g. { imageSource: "fal" | "pollinations" | "brand-graphic" } */
  metadata: jsonb("metadata").default("{}"),
  /** Hashtags extracted from this asset's content (social channels only) */
  hashtagsUsed: jsonb("hashtags_used").$type<string[]>().default([]),
  /** Evergreen recycling — true when asset qualifies for periodic reuse */
  recyclable: boolean("recyclable").notNull().default(false),
  /** Timestamp of the last time this asset was recycled into a new variant */
  lastRecycledAt: timestamp("last_recycled_at", { withTimezone: true }),
  /** How many times this asset has been recycled */
  recycleCount: integer("recycle_count").notNull().default(0),
  /** For recycled assets: points back to the original source asset */
  sourceAssetId: uuid("source_asset_id").references((): any => assets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("assets_org_idx").on(t.orgId),
  campaignIdx: index("assets_campaign_idx").on(t.campaignId),
  channelIdx: index("assets_channel_idx").on(t.channel),
}));

// ── Tracking Links ────────────────────────────────────────────────────────────
// Short-URL records that bridge published content (email CTAs, blog links) back
// to the contact-capture endpoint. Org-scoped to prevent cross-org data injection.

export const trackingLinks = pgTable("tracking_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Short URL-safe identifier embedded in /t/:trackingId paths
  trackingId: text("tracking_id").notNull().unique(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  channel: text("channel"),
  // Where the user lands after the tracking redirect
  destinationUrl: text("destination_url").notNull().default("/"),
  clickCount: integer("click_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  trackingIdIdx: uniqueIndex("tracking_links_tracking_id_idx").on(t.trackingId),
  orgIdx: index("tracking_links_org_idx").on(t.orgId),
  campaignIdx: index("tracking_links_campaign_idx").on(t.campaignId),
}));

export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  versionNum: integer("version_num").notNull(),
  contentText: text("content_text").notNull(),
  editedBy: uuid("edited_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Brand Voice Edits ─────────────────────────────────────────────────────────

export const brandVoiceEdits = pgTable("brand_voice_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  originalText: text("original_text").notNull(),
  editedText: text("edited_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("brand_voice_edits_org_idx").on(t.orgId),
}));

// ── Scheduled Posts ───────────────────────────────────────────────────────────

export const scheduledPosts = pgTable("scheduled_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  platformPostId: text("platform_post_id"),
  status: postStatusEnum("status").notNull().default("scheduled"),
  isSimulated: boolean("is_simulated").notNull().default(false),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  preflightStatus: text("preflight_status"),       // "passed" | "warning" | "failed"
  preflightErrors: jsonb("preflight_errors").$type<Array<{ code: string; message: string; severity: "warning" | "critical" }>>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("scheduled_posts_org_idx").on(t.orgId),
  scheduledIdx: index("scheduled_posts_scheduled_idx").on(t.scheduledFor, t.status),
}));

// ── Channel Connections (OAuth tokens) ────────────────────────────────────────

export const channelConnections = pgTable("channel_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  channel: channelEnum("channel").notNull(),
  accountName: text("account_name"),
  accountId: text("account_id"),
  accessTokenEnc: text("access_token_enc").notNull(), // AES-256 encrypted
  refreshTokenEnc: text("refresh_token_enc"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  isActive: boolean("is_active").notNull().default(true),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgChannelIdx: uniqueIndex("channel_connections_org_channel_idx").on(t.orgId, t.channel),
}));

// ── Analytics Events ──────────────────────────────────────────────────────────

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  channel: text("channel"),
  eventType: analyticsEventTypeEnum("event_type").notNull(),
  value: real("value").notNull().default(1),
  isSimulated: boolean("is_simulated").notNull().default(false),
  metadataJson: jsonb("metadata_json").default("{}"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("analytics_events_org_idx").on(t.orgId),
  occurredIdx: index("analytics_events_occurred_idx").on(t.occurredAt),
  campaignIdx: index("analytics_events_campaign_idx").on(t.campaignId),
}));

export const analyticsRollups = pgTable("analytics_rollups", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  channel: text("channel"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  engagements: integer("engagements").notNull().default(0),
  spend: real("spend").notNull().default(0),
  revenue: real("revenue").notNull().default(0),
  isSimulated: boolean("is_simulated").notNull().default(false),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgDateIdx: index("analytics_rollups_org_date_idx").on(t.orgId, t.date),
  // NOTE: The deduplication unique index is a COALESCE-based functional index
  // managed by raw SQL migration 0013_analytics_rollup_dedup.sql.
  // Drizzle ORM cannot express functional/expression-based unique indexes, so
  // it is intentionally omitted here to prevent drizzle-kit from overwriting it
  // with a plain column-list index that would not handle NULL campaign_id/channel.
  //
  // Effective index (created by migration 0013):
  //   UNIQUE (org_id, COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'),
  //           COALESCE(channel, ''), date, is_simulated)
}));

// ── CRM: Contacts ─────────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  company: text("company"),
  title: text("title"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  sourceChannel: channelEnum("source_channel"),
  sourceCampaignId: uuid("source_campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  leadScore: integer("lead_score").notNull().default(0),
  status: contactStatusEnum("status").notNull().default("cold"),
  revenue: real("revenue"),
  dealClosedAt: timestamp("deal_closed_at", { withTimezone: true }),
  attributionJson: jsonb("attribution_json").$type<{
    sourceCampaignId: string | null;
    sourceCampaignName: string | null;
    sourceChannel: string | null;
    firstTouchAt: string | null;
    conversionAt: string | null;
    daysToConvert: number | null;
    touchpoints: number;
  }>(),
  notes: text("notes"),
  customFields: jsonb("custom_fields").default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgEmailIdx: uniqueIndex("contacts_org_email_idx").on(t.orgId, t.email),
  orgIdx: index("contacts_org_idx").on(t.orgId),
  scoreIdx: index("contacts_score_idx").on(t.leadScore),
}));

export const contactEvents = pgTable("contact_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // email_open, link_click, form_submit, etc.
  metadataJson: jsonb("metadata_json").default("{}"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contactIdx: index("contact_events_contact_idx").on(t.contactId),
}));

// ── A/B Tests ─────────────────────────────────────────────────────────────────

export const abTests = pgTable("ab_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  hypothesis: text("hypothesis"),
  status: text("status").notNull().default("running"),
  winningVariantId: uuid("winning_variant_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  concludedAt: timestamp("concluded_at", { withTimezone: true }),
});

export const abVariants = pgTable("ab_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  testId: uuid("test_id").notNull().references(() => abTests.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  contentText: text("content_text").notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
});

// ── Optimization Reports ──────────────────────────────────────────────────────

export const optimizationReports = pgTable("optimization_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  reportJson: jsonb("report_json").notNull(),
  reportText: text("report_text").notNull(),
  modelVersion: text("model_version"),
  tokensUsed: integer("tokens_used"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Automation Workflows ──────────────────────────────────────────────────────

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(), // manual | schedule | event
  triggerConfigJson: jsonb("trigger_config_json").default("{}"),
  stepsJson: jsonb("steps_json").notNull().default("[]"),
  status: workflowStatusEnum("status").notNull().default("draft"),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // running | completed | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  logJson: jsonb("log_json").default("[]"),
});

// ── Billing ───────────────────────────────────────────────────────────────────

export const orionSubscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: uniqueIndex("subscriptions_org_idx").on(t.orgId),
  stripeIdx: uniqueIndex("subscriptions_stripe_idx").on(t.stripeCustomerId),
}));

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // "2024-01"
  aiTokensUsed: integer("ai_tokens_used").notNull().default(0),
  postsPublished: integer("posts_published").notNull().default(0),
  contactsCount: integer("contacts_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgMonthIdx: uniqueIndex("usage_records_org_month_idx").on(t.orgId, t.month),
}));

// ── Notifications ─────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(), // pipeline_complete | publish_success | publish_failed | optimization_ready | crm_scored
  title: text("title").notNull(),
  body: text("body"),
  resourceType: text("resource_type"),
  resourceId: uuid("resource_id"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("notifications_org_idx").on(t.orgId),
  readIdx: index("notifications_read_idx").on(t.orgId, t.read),
}));

// ── Audit Log ─────────────────────────────────────────────────────────────────

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. "asset.approved", "campaign.published"
  resourceType: text("resource_type"),
  resourceId: uuid("resource_id"),
  metadataJson: jsonb("metadata_json").default("{}"),
  ipAddress: text("ip_address"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("audit_events_org_idx").on(t.orgId),
  occurredIdx: index("audit_events_occurred_idx").on(t.occurredAt),
}));

// ── Layer 6: Org Insights (post-campaign AI analysis) ─────────────────────────

export const orgInsights = pgTable("org_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  insightType: text("insight_type").notNull(), // "post_campaign" | "monthly_digest" | "growth_opportunity"
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  dataJson: jsonb("data_json").default("{}"),
  period: text("period"), // e.g. "2024-01" for monthly
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("org_insights_org_idx").on(t.orgId),
  periodIdx: index("org_insights_period_idx").on(t.orgId, t.period),
}));

// ── Layer 6: Landing Pages ─────────────────────────────────────────────────────

export const landingPages = pgTable("landing_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  // Full structured JSON from LandingPageAgent
  contentJson: jsonb("content_json").notNull().default("{}"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  // Share token for public gallery
  shareToken: text("share_token"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgSlugIdx: uniqueIndex("landing_pages_org_slug_idx").on(t.orgId, t.slug),
  shareTokenIdx: index("landing_pages_share_token_idx").on(t.shareToken),
}));

// ── Layer 6: Paid Ad Sets ─────────────────────────────────────────────────────

export const paidAdSets = pgTable("paid_ad_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  platform: text("platform").notNull(), // "google" | "meta" | "linkedin"
  adType: text("ad_type").notNull(), // "search" | "display" | "social"
  // Structured ad content from PaidAdsAgent
  contentJson: jsonb("content_json").notNull().default("{}"),
  status: text("status").notNull().default("draft"), // "draft" | "submitted" | "active" | "paused"
  budget: integer("budget"), // daily budget in cents
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("paid_ad_sets_org_idx").on(t.orgId),
}));

// ── Layer 6: Lead Magnets ─────────────────────────────────────────────────────

export const leadMagnets = pgTable("lead_magnets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  magnetType: text("magnet_type").notNull(), // "ebook" | "checklist" | "template" | "webinar" | "quiz"
  title: text("title").notNull(),
  // Full structured JSON from LeadMagnetAgent
  contentJson: jsonb("content_json").notNull().default("{}"),
  shareToken: text("share_token"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("lead_magnets_org_idx").on(t.orgId),
  shareTokenIdx: index("lead_magnets_share_token_idx").on(t.shareToken),
}));

// ── Layer 6: Email Sequences ──────────────────────────────────────────────────

export const emailSequences = pgTable("email_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().default("signup"), // "signup" | "download" | "purchase"
  status: text("status").notNull().default("draft"), // "draft" | "active" | "paused"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("email_sequences_org_idx").on(t.orgId),
}));

export const emailSequenceSteps = pgTable("email_sequence_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  subject: text("subject").notNull(),
  contentText: text("content_text").notNull(),
  contentHtml: text("content_html"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seqStepIdx: uniqueIndex("email_seq_steps_seq_step_idx").on(t.sequenceId, t.stepNumber),
}));

// ── Media Assets (Brand Library) ──────────────────────────────────────────────

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  altText: text("alt_text"),
  width: integer("width"),
  height: integer("height"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("media_assets_org_idx").on(t.orgId),
}));

// ── Hashtag Performance ───────────────────────────────────────────────────────
// Aggregated per-hashtag analytics across all campaigns for an org.
// Updated by the post-campaign analysis job whenever a campaign completes.

export const hashtagPerformance = pgTable("hashtag_performance", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  hashtag: text("hashtag").notNull(), // e.g. "#smallbusiness"
  channel: text("channel").notNull(), // "instagram" | "twitter" | etc.
  timesUsed: integer("times_used").notNull().default(0),
  totalImpressions: integer("total_impressions").notNull().default(0),
  totalEngagement: integer("total_engagement").notNull().default(0),
  avgEngagementRate: real("avg_engagement_rate").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgHashtagChannelIdx: uniqueIndex("hashtag_perf_org_hashtag_channel_idx").on(t.orgId, t.hashtag, t.channel),
  orgIdx: index("hashtag_perf_org_idx").on(t.orgId),
}));

// ── Relations ─────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  goals: many(goals),
  campaigns: many(campaigns),
  assets: many(assets),
  contacts: many(contacts),
  brands: many(brands),
  personas: many(personas),
  brandVoiceEdits: many(brandVoiceEdits),
  notifications: many(notifications),
}));

export const personasRelations = relations(personas, ({ one }) => ({
  organization: one(organizations, { fields: [personas.orgId], references: [organizations.id] }),
}));

export const brandVoiceEditsRelations = relations(brandVoiceEdits, ({ one }) => ({
  organization: one(organizations, { fields: [brandVoiceEdits.orgId], references: [organizations.id] }),
}));

export const brandsRelations = relations(brands, ({ one }) => ({
  organization: one(organizations, { fields: [brands.orgId], references: [organizations.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  organization: one(organizations, { fields: [goals.orgId], references: [organizations.id] }),
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  strategies: many(strategies),
  campaigns: many(campaigns),
}));

export const strategiesRelations = relations(strategies, ({ one }) => ({
  goal: one(goals, { fields: [strategies.goalId], references: [goals.id] }),
  organization: one(organizations, { fields: [strategies.orgId], references: [organizations.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, { fields: [campaigns.orgId], references: [organizations.id] }),
  goal: one(goals, { fields: [campaigns.goalId], references: [goals.id] }),
  strategy: one(strategies, { fields: [campaigns.strategyId], references: [strategies.id] }),
  assets: many(assets),
  analyticsEvents: many(analyticsEvents),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  organization: one(organizations, { fields: [assets.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [assets.campaignId], references: [campaigns.id] }),
  approver: one(users, { fields: [assets.approvedBy], references: [users.id] }),
  versions: many(assetVersions),
  scheduledPosts: many(scheduledPosts),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowRuns.workflowId], references: [workflows.id] }),
}));

export const scheduledPostsRelations = relations(scheduledPosts, ({ one }) => ({
  organization: one(organizations, { fields: [scheduledPosts.orgId], references: [organizations.id] }),
  asset: one(assets, { fields: [scheduledPosts.assetId], references: [assets.id] }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.orgId], references: [organizations.id] }),
  sourceCampaign: one(campaigns, { fields: [contacts.sourceCampaignId], references: [campaigns.id] }),
  events: many(contactEvents),
}));

export const contactEventsRelations = relations(contactEvents, ({ one }) => ({
  contact: one(contacts, { fields: [contactEvents.contactId], references: [contacts.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(orionSubscriptions, ({ one }) => ({
  organization: one(organizations, { fields: [orionSubscriptions.orgId], references: [organizations.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, { fields: [notifications.orgId], references: [organizations.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const orgInsightsRelations = relations(orgInsights, ({ one }) => ({
  organization: one(organizations, { fields: [orgInsights.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [orgInsights.campaignId], references: [campaigns.id] }),
}));

export const landingPagesRelations = relations(landingPages, ({ one }) => ({
  organization: one(organizations, { fields: [landingPages.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [landingPages.campaignId], references: [campaigns.id] }),
  goal: one(goals, { fields: [landingPages.goalId], references: [goals.id] }),
}));

export const paidAdSetsRelations = relations(paidAdSets, ({ one }) => ({
  organization: one(organizations, { fields: [paidAdSets.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [paidAdSets.campaignId], references: [campaigns.id] }),
}));

export const leadMagnetsRelations = relations(leadMagnets, ({ one }) => ({
  organization: one(organizations, { fields: [leadMagnets.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [leadMagnets.campaignId], references: [campaigns.id] }),
  goal: one(goals, { fields: [leadMagnets.goalId], references: [goals.id] }),
}));

export const emailSequencesRelations = relations(emailSequences, ({ one, many }) => ({
  organization: one(organizations, { fields: [emailSequences.orgId], references: [organizations.id] }),
  campaign: one(campaigns, { fields: [emailSequences.campaignId], references: [campaigns.id] }),
  goal: one(goals, { fields: [emailSequences.goalId], references: [goals.id] }),
  steps: many(emailSequenceSteps),
}));

export const emailSequenceStepsRelations = relations(emailSequenceSteps, ({ one }) => ({
  sequence: one(emailSequences, { fields: [emailSequenceSteps.sequenceId], references: [emailSequences.id] }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  organization: one(organizations, { fields: [mediaAssets.orgId], references: [organizations.id] }),
  uploader: one(users, { fields: [mediaAssets.uploadedBy], references: [users.id] }),
}));

// ── Invitations ───────────────────────────────────────────────────────────────

export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "revoked"]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("viewer"),
  token: text("token").notNull(),
  status: invitationStatusEnum("status").notNull().default("pending"),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx: uniqueIndex("invitations_token_idx").on(t.token),
  orgEmailIdx: index("invitations_org_email_idx").on(t.orgId, t.email),
  orgStatusIdx: index("invitations_org_status_idx").on(t.orgId, t.status),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, { fields: [invitations.orgId], references: [organizations.id] }),
  invitedBy: one(users, { fields: [invitations.invitedByUserId], references: [users.id] }),
}));

export const hashtagPerformanceRelations = relations(hashtagPerformance, ({ one }) => ({
  organization: one(organizations, { fields: [hashtagPerformance.orgId], references: [organizations.id] }),
}));

// ── Recommendations ─────────────────────────────────────────────────────────

export const recommendationTypeEnum = pgEnum("recommendation_type", [
  "content_gap",
  "performance_drop",
  "stale_campaign",
  "top_performer",
  "audience_growth",
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "pending",
  "acted",
  "dismissed",
]);

export const recommendationActionTypeEnum = pgEnum("recommendation_action_type", [
  "create_campaign",
  "repurpose",
  "adjust_schedule",
  "review_content",
]);

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: recommendationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actionType: recommendationActionTypeEnum("action_type").notNull(),
  actionPayload: jsonb("action_payload").notNull().default("{}"),
  priority: integer("priority").notNull().default(3),
  status: recommendationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => ({
  orgIdx: index("recommendations_org_idx").on(t.orgId),
  orgActiveIdx: index("recommendations_org_active_idx").on(t.orgId, t.status, t.expiresAt),
}));

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  organization: one(organizations, { fields: [recommendations.orgId], references: [organizations.id] }),
}));

// ── Competitor Profiles ──────────────────────────────────────────────────────

export const competitorProfiles = pgTable("competitor_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  competitorName: text("competitor_name").notNull(),
  websiteUrl: text("website_url"),
  analysisJson: jsonb("analysis_json").$type<{
    competitors: Array<{
      name: string;
      headline: string;
      mainClaim: string;
      pricingStrategy: string;
      contentAngles: string[];
    }>;
    whitespace: string[];
    differentiators: string[];
    messagingWarnings: string[];
    recommendedPositioning: string;
  }>(),
  competitorChanges: jsonb("competitor_changes").$type<{
    detectedAt: string;
    changes: Array<{ field: string; previous: string; current: string }>;
  } | null>(),
  lastAnalyzedAt: timestamp("last_analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("competitor_profiles_org_idx").on(t.orgId),
  orgNameIdx: uniqueIndex("competitor_profiles_org_name_idx").on(t.orgId, t.competitorName),
}));

export const competitorProfilesRelations = relations(competitorProfiles, ({ one }) => ({
  organization: one(organizations, { fields: [competitorProfiles.orgId], references: [organizations.id] }),
}));
