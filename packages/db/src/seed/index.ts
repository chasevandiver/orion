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
} from "../schema/index.js";
import { hashSync } from "bcryptjs";

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

  // Sample asset
  await db.insert(assets).values({
    orgId: org.id,
    campaignId: campaign.id,
    channel: "linkedin",
    type: "social_post",
    contentText:
      "🚀 Exciting news for remote teams! We just launched a feature that saves 3 hours per week...",
    status: "approved",
    generatedByAgent: "content_creator",
    modelVersion: "claude-sonnet-4-6",
  });

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
  console.log("\n✅ Seed complete!");
  console.log(`\n🔑 Dev login: dev@acme.com / password123`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
