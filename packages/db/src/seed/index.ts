/**
 * Seed script — populates the database with development fixtures.
 * Run: npm run db:seed --filter=@orion/db
 */

import { db } from "../index.js";
import {
  organizations,
  users,
  goals,
  strategies,
  campaigns,
  assets,
  contacts,
  scheduledPosts,
  analyticsEvents,
} from "../schema/index.js";
import { eq } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import { createHash } from "crypto";

/** Replicates the deterministic variant group ID used by orchestrate-pipeline.ts */
function variantGroupIdFor(campaignId: string, channel: string): string {
  const h = createHash("md5").update(`${campaignId}:${channel}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function seed() {
  console.log("🌱 Seeding database...");

  // Organization
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Corp (Dev)", slug: "acme-dev", plan: "pro" })
    .returning();

  console.log(`  ✓ Organization: ${org.id}`);

  // Admin user
  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "dev@acme.com",
      name: "Dev User",
      passwordHash: hashSync("password123", 12),
      role: "owner",
    })
    .returning();

  console.log(`  ✓ User: ${user.email}`);

  // Goal
  const [goal] = await db
    .insert(goals)
    .values({
      orgId: org.id,
      userId: user.id,
      type: "leads",
      brandName: "Acme Corp",
      brandDescription: "B2B SaaS productivity tool for remote teams",
      timeline: "1_month",
      budget: 5000,
    })
    .returning();

  console.log(`  ✓ Goal: ${goal.id}`);

  // Strategy
  const [strategy] = await db
    .insert(strategies)
    .values({
      goalId: goal.id,
      orgId: org.id,
      contentText: "Sample strategy content for development...",
      contentJson: {
        audiences: ["startup founders", "remote team managers"],
        channels: ["linkedin", "email", "blog"],
        kpis: { leads: 100, cpa: 30, roi: 200 },
      },
      modelVersion: "claude-sonnet-4-6",
    })
    .returning();

  // Campaign
  const [campaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal.id,
      strategyId: strategy.id,
      name: "Q1 Lead Gen Campaign",
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      budget: 5000,
    })
    .returning();

  console.log(`  ✓ Campaign: ${campaign.id}`);

  // Sample asset (variant A linkedin — approved)
  const linkedinGroupId = variantGroupIdFor(campaign.id, "linkedin");
  const [linkedinAsset] = await db.insert(assets).values({
    orgId: org.id,
    campaignId: campaign.id,
    channel: "linkedin",
    type: "social_post",
    contentText:
      "🚀 Exciting news for remote teams! We just launched a feature that saves 3 hours per week...",
    status: "approved",
    variant: "a",
    variantGroupId: linkedinGroupId,
    generatedByAgent: "content_creator",
    modelVersion: "claude-sonnet-4-6",
  }).returning();

  // Sample contacts
  await db.insert(contacts).values([
    {
      orgId: org.id,
      email: "sarah@techflow.com",
      name: "Sarah Chen",
      company: "TechFlow Inc",
      title: "VP of Engineering",
      sourceChannel: "linkedin",
      sourceCampaignId: campaign.id,
      leadScore: 94,
      status: "hot",
    },
    {
      orgId: org.id,
      email: "marcus@growthlabs.io",
      name: "Marcus Rivera",
      company: "GrowthLabs",
      title: "CEO",
      sourceChannel: "blog",
      sourceCampaignId: campaign.id,
      leadScore: 78,
      status: "warm",
    },
    {
      orgId: org.id,
      email: "priya@cloudscale.dev",
      name: "Priya Patel",
      company: "CloudScale",
      title: "CTO",
      sourceChannel: "email",
      sourceCampaignId: campaign.id,
      leadScore: 91,
      status: "hot",
    },
  ]);

  console.log("  ✓ Contacts seeded");

  // ── Scenario 1: Draft campaign for review/approval flow testing ───────────

  const [draftCampaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal.id,
      strategyId: strategy.id,
      name: "Spring Product Launch (Draft)",
      status: "draft",
      budget: 3000,
    })
    .returning();

  const draftAssets = await db.insert(assets).values([
    {
      orgId: org.id,
      campaignId: draftCampaign.id,
      channel: "linkedin",
      type: "social_post",
      contentText:
        "Remote teams run on trust — and data. Our latest feature gives managers the visibility they actually need, without the micromanagement. Here's how 200+ teams are using it to build better culture:",
      status: "draft",
      variant: "a",
      variantGroupId: variantGroupIdFor(draftCampaign.id, "linkedin"),
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    {
      orgId: org.id,
      campaignId: draftCampaign.id,
      channel: "twitter",
      type: "social_post",
      contentText:
        "We asked 200 remote managers what kills team productivity. The #1 answer wasn't meetings. #RemoteWork",
      status: "draft",
      variant: "a",
      variantGroupId: variantGroupIdFor(draftCampaign.id, "twitter"),
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    {
      orgId: org.id,
      campaignId: draftCampaign.id,
      channel: "email",
      type: "social_post",
      contentText:
        "SUBJECT: How CloudScale cut status meetings by 80%\nPREVIEW: Real numbers from a 45-person remote team\n---\nHi there,\n\nWhen CloudScale's CTO told me they'd eliminated their daily standups, I assumed their team was struggling. Three months later, they'd shipped more features than any previous quarter.\n\nHere's exactly what changed — and how you can replicate it:\n\n[Read the full breakdown →]",
      status: "draft",
      variant: "a",
      variantGroupId: variantGroupIdFor(draftCampaign.id, "email"),
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
  ]).returning();

  console.log(`  ✓ Scenario 1: Draft campaign (${draftCampaign.id}) with ${draftAssets.length} draft assets`);

  // ── Scenario 2: A/B variant B for the existing linkedin asset ────────────

  await db.insert(assets).values({
    orgId: org.id,
    campaignId: campaign.id,
    channel: "linkedin",
    type: "social_post",
    contentText:
      "Most productivity tools promise to save you time. They add 4 new dashboards and 2 weekly syncs to your calendar instead.\n\nWe built something different — because the teams we talked to didn't have a software problem. They had a signal problem.\n\nHere's what that means in practice:",
    status: "draft",
    variant: "b",
    variantGroupId: linkedinGroupId,
    generatedByAgent: "ContentCreatorAgent",
    modelVersion: "claude-sonnet-4-6",
  });

  console.log(`  ✓ Scenario 2: LinkedIn variant B added to campaign ${campaign.id}`);

  // ── Scenario 3: Failed scheduled post ─────────────────────────────────────

  await db.insert(scheduledPosts).values({
    orgId: org.id,
    assetId: linkedinAsset.id,
    channel: "linkedin",
    scheduledFor: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: "failed",
    retryCount: 3,
    errorMessage: "LinkedIn API rate limit exceeded — dev test fixture",
  });

  console.log("  ✓ Scenario 3: Failed scheduled post");

  // ── Scenario 4: Published post with analytics events ──────────────────────

  const publishedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [publishedPost] = await db.insert(scheduledPosts).values({
    orgId: org.id,
    assetId: linkedinAsset.id,
    channel: "linkedin",
    scheduledFor: publishedAt,
    publishedAt,
    platformPostId: "dev_published_post_001",
    status: "published",
  }).returning();

  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  await db.insert(analyticsEvents).values([
    // 10 impressions spread across the last 48 hours
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(48) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(44) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(40) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(36) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(32) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(28) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(24) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(18) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(12) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "impression", value: 1, occurredAt: hoursAgo(6) },
    // 3 clicks
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "click", value: 1, occurredAt: hoursAgo(42) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "click", value: 1, occurredAt: hoursAgo(26) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "click", value: 1, occurredAt: hoursAgo(10) },
    // 2 engagements
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "engagement", value: 1, occurredAt: hoursAgo(38) },
    { orgId: org.id, campaignId: campaign.id, assetId: linkedinAsset.id, channel: "linkedin", eventType: "engagement", value: 1, occurredAt: hoursAgo(14) },
  ]);

  console.log(`  ✓ Scenario 4: Published post (${publishedPost.id}) with 15 analytics events`);

  // ── Scenario 5: Cold contact with no events ───────────────────────────────

  await db.insert(contacts).values({
    orgId: org.id,
    email: "unengaged@example.com",
    name: "Jordan Kim",
    company: "Unengaged Co",
    title: "Product Manager",
    sourceChannel: "linkedin",
    sourceCampaignId: campaign.id,
    leadScore: 0,
    status: "cold",
  });

  console.log("  ✓ Scenario 5: Cold contact with no events");

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n✅ Seed complete!");
  console.log("\n📊 Entities created:");
  console.log("   1 organization");
  console.log("   1 user");
  console.log("   1 goal");
  console.log("   1 strategy");
  console.log("   2 campaigns (1 active, 1 draft)");
  console.log("   6 assets (1 linkedin approved variant A, 1 linkedin draft variant B,");
  console.log("             3 draft assets on draft campaign, 1 twitter, 1 email)");
  console.log("   2 scheduled posts (1 failed, 1 published)");
  console.log("  15 analytics events (10 impressions, 3 clicks, 2 engagements)");
  console.log("   4 contacts (2 hot, 1 warm, 1 cold with no events)");
  console.log("\n🔑 Dev login: dev@acme.com / password123");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
