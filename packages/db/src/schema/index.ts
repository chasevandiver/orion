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
]);
export const postStatusEnum = pgEnum("post_status", [
  "scheduled",
  "queued",
  "published",
  "failed",
  "cancelled",
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
]);

// ── Organizations ─────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  website: text("website"),
  plan: planEnum("plan").notNull().default("free"),
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
  status: assetStatusEnum("status").notNull().default("draft"),
  generatedByAgent: text("generated_by_agent"),
  modelVersion: text("model_version"),
  promptSnapshot: text("prompt_snapshot"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("assets_org_idx").on(t.orgId),
  campaignIdx: index("assets_campaign_idx").on(t.campaignId),
  channelIdx: index("assets_channel_idx").on(t.channel),
}));

export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  versionNum: integer("version_num").notNull(),
  contentText: text("content_text").notNull(),
  editedBy: uuid("edited_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
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
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgDateIdx: index("analytics_rollups_org_date_idx").on(t.orgId, t.date),
  uniqueRollupIdx: uniqueIndex("analytics_rollups_unique_idx").on(t.orgId, t.campaignId, t.channel, t.date),
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

// ── Relations ─────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  goals: many(goals),
  campaigns: many(campaigns),
  assets: many(assets),
  contacts: many(contacts),
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

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(orionSubscriptions, ({ one }) => ({
  organization: one(organizations, { fields: [orionSubscriptions.orgId], references: [organizations.id] }),
}));
