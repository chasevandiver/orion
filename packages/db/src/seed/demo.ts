/**
 * Demo seed — populates the database with a polished, realistic demo organisation.
 * Idempotent: if the demo org (slug "orion-demo") already exists the script exits
 * without making any changes so it is safe to run multiple times.
 *
 * Run: npm run db:seed-demo --filter=@orion/db
 *      — or from the repo root: npm run db:seed-demo
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

function variantGroupId(campaignId: string, channel: string): string {
  const h = createHash("md5").update(`${campaignId}:${channel}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const daysAgo  = (d: number) => new Date(Date.now() - d  * 24 * 60 * 60 * 1000);
const hoursAgo = (h: number) => new Date(Date.now() - h  * 60 * 60 * 1000);

async function seedDemo() {
  console.log("🎬 Seeding demo organisation...\n");

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "orion-demo"))
    .limit(1);

  if (existing.length > 0) {
    console.log("✅ Demo org already exists — nothing to do.");
    process.exit(0);
  }

  // ── Organisation ──────────────────────────────────────────────────────────
  const [org] = await db
    .insert(organizations)
    .values({
      name: "NovaSpark (Demo)",
      slug: "orion-demo",
      plan: "pro",
      brandPrimaryColor: "#6366f1",
      brandSecondaryColor: "#8b5cf6",
      fontPreference: "modern",
    })
    .returning();

  console.log(`  ✓ Organisation: ${org.name} (${org.id})`);

  // ── Demo user ──────────────────────────────────────────────────────────────
  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "demo@novaspark.io",
      name: "Alex Rivera",
      passwordHash: hashSync("demo1234", 12),
      role: "owner",
    })
    .returning();

  console.log(`  ✓ User: ${user.email} / demo1234`);

  // ── Goal ───────────────────────────────────────────────────────────────────
  const [goal] = await db
    .insert(goals)
    .values({
      orgId: org.id,
      userId: user.id,
      type: "leads",
      brandName: "NovaSpark",
      brandDescription:
        "AI-powered analytics platform that turns raw data into actionable growth insights for SaaS companies. Trusted by 500+ teams.",
      targetAudience:
        "Growth-focused SaaS founders and heads of marketing at Series A–C startups who need faster insight-to-action loops.",
      timeline: "1_month",
      budget: 8000,
      channels: ["linkedin", "twitter", "email"],
      status: "active",
    })
    .returning();

  console.log(`  ✓ Goal: ${goal.id}`);

  // ── Strategy ───────────────────────────────────────────────────────────────
  const [strategy] = await db
    .insert(strategies)
    .values({
      goalId: goal.id,
      orgId: org.id,
      contentText: `# NovaSpark Q2 Lead Generation Strategy

## Overview
Drive 150 qualified leads in 30 days targeting SaaS growth teams via LinkedIn, Twitter, and email.

## Positioning
Lead with data story: "Your competitors moved faster because they saw the signal first."

## Channels
- **LinkedIn (40%)**: Thought-leadership posts, founder story, case study snippets
- **Twitter (30%)**: Bite-sized data insights, community engagement, meme-adjacent stats
- **Email (30%)**: Cold outreach to ICP list, 3-touch nurture sequence

## KPIs
| Metric | Target |
|--------|--------|
| MQLs | 150 |
| Cost per lead | ≤ $53 |
| Email open rate | ≥ 40% |
| LinkedIn CTR | ≥ 2.5% |
`,
      contentJson: {
        audiences: ["SaaS founders Series A-C", "Heads of Growth", "VP Marketing"],
        channels: ["linkedin", "twitter", "email"],
        kpis: { leads: 150, cpa: 53, emailOpenRate: 40, linkedinCtr: 2.5 },
        hooks: [
          "Your competitors are moving faster because they see the signal first.",
          "Most SaaS teams are drowning in data but starving for insight.",
          "The best growth decisions happen in minutes, not meetings.",
        ],
      },
      modelVersion: "claude-sonnet-4-6",
    })
    .returning();

  // ── Active campaign ────────────────────────────────────────────────────────
  const [campaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal.id,
      strategyId: strategy.id,
      name: "Q2 Pipeline Accelerator",
      status: "active",
      startDate: daysAgo(7),
      endDate: daysAgo(-23),
      budget: 8000,
    })
    .returning();

  console.log(`  ✓ Active campaign: ${campaign.name} (${campaign.id})`);

  // ── Assets ─────────────────────────────────────────────────────────────────
  const linkedinGroupId = variantGroupId(campaign.id, "linkedin");
  const twitterGroupId  = variantGroupId(campaign.id, "twitter");
  const emailGroupId    = variantGroupId(campaign.id, "email");

  const [liAssetA, , , emailAsset] = await db.insert(assets).values([
    // LinkedIn variant A — approved
    {
      orgId: org.id,
      campaignId: campaign.id,
      channel: "linkedin",
      type: "social_post",
      contentText:
        "The SaaS teams growing fastest in 2025 aren't spending more on ads.\n\nThey're spending less time guessing.\n\nWe analysed 500 growth experiments. The top 10% shared one trait: they got from signal → decision in under 4 hours.\n\nNovaSpark cuts that window to 30 minutes. Here's how →",
      status: "approved",
      variant: "a",
      variantGroupId: linkedinGroupId,
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    // LinkedIn variant B — draft
    {
      orgId: org.id,
      campaignId: campaign.id,
      channel: "linkedin",
      type: "social_post",
      contentText:
        "Hot take: dashboards are ruining your growth strategy.\n\nNot because the data is wrong — because no one has time to find the signal inside 47 charts.\n\nWe built NovaSpark to do that one job incredibly well. One feed. One insight. One action.\n\nWhat would you do with 3 extra hours every week?",
      status: "draft",
      variant: "b",
      variantGroupId: linkedinGroupId,
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    // Twitter — approved
    {
      orgId: org.id,
      campaignId: campaign.id,
      channel: "twitter",
      type: "social_post",
      contentText:
        "unpopular opinion: your analytics tool is making you slower\n\n→ more tabs = more meetings\n→ more meetings = fewer experiments\n\nnot all data needs a dashboard thread 🧵",
      status: "approved",
      variant: "a",
      variantGroupId: twitterGroupId,
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    // Email — approved
    {
      orgId: org.id,
      campaignId: campaign.id,
      channel: "email",
      type: "social_post",
      contentText:
        "SUBJECT: The 4-hour advantage your competitors have\nPREVIEW: (and how to close the gap this week)\n---\nHi {{first_name}},\n\nLast quarter, the fastest-growing SaaS teams in our cohort shared one unusual habit: they reviewed growth signals every morning — and made a decision before 10am.\n\nNot a meeting. A decision.\n\nNovaSpark is built for exactly that workflow. Connect your stack in 5 minutes and your first insight brief lands in your inbox tomorrow morning.\n\nWant to see it?\n\n→ Start free trial (no card required)\n\nAlex Rivera\nCo-founder, NovaSpark",
      status: "approved",
      variant: "a",
      variantGroupId: emailGroupId,
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
  ]).returning();

  console.log("  ✓ 4 assets (LinkedIn A+B, Twitter, Email)");

  // ── Contacts ───────────────────────────────────────────────────────────────
  await db.insert(contacts).values([
    {
      orgId: org.id,
      email: "jamie.lee@hyperscale.io",
      name: "Jamie Lee",
      company: "HyperScale",
      title: "Head of Growth",
      sourceChannel: "linkedin",
      sourceCampaignId: campaign.id,
      leadScore: 96,
      status: "hot",
      tags: ["icp", "linkedin", "q2"],
    },
    {
      orgId: org.id,
      email: "priya.k@launchpad.vc",
      name: "Priya Krishnamurthy",
      company: "Launchpad Ventures",
      title: "Portfolio Growth Lead",
      sourceChannel: "email",
      sourceCampaignId: campaign.id,
      leadScore: 88,
      status: "hot",
      tags: ["icp", "email"],
    },
    {
      orgId: org.id,
      email: "dan.morriss@stackshift.co",
      name: "Dan Morris",
      company: "StackShift",
      title: "CEO",
      sourceChannel: "twitter",
      sourceCampaignId: campaign.id,
      leadScore: 74,
      status: "warm",
      tags: ["twitter", "founder"],
    },
    {
      orgId: org.id,
      email: "sofia.b@pixelmetric.ai",
      name: "Sofia Bergström",
      company: "PixelMetric AI",
      title: "VP Marketing",
      sourceChannel: "linkedin",
      sourceCampaignId: campaign.id,
      leadScore: 81,
      status: "warm",
      tags: ["linkedin", "icp"],
    },
    {
      orgId: org.id,
      email: "chen.w@buildfast.dev",
      name: "Wei Chen",
      company: "BuildFast",
      title: "Co-founder",
      sourceChannel: "email",
      sourceCampaignId: campaign.id,
      leadScore: 22,
      status: "cold",
    },
  ]);

  console.log("  ✓ 5 contacts (2 hot, 2 warm, 1 cold)");

  // ── Published posts + analytics ───────────────────────────────────────────
  const liPublishedAt = daysAgo(5);
  const twPublishedAt = daysAgo(3);

  const [liPost] = await db.insert(scheduledPosts).values({
    orgId: org.id,
    assetId: liAssetA.id,
    channel: "linkedin",
    scheduledFor: liPublishedAt,
    publishedAt: liPublishedAt,
    platformPostId: "demo_li_001",
    status: "published",
  }).returning();

  const [twPost] = await db.insert(scheduledPosts).values({
    orgId: org.id,
    assetId: emailAsset.id,
    channel: "email",
    scheduledFor: twPublishedAt,
    publishedAt: twPublishedAt,
    platformPostId: "demo_email_001",
    status: "published",
  }).returning();

  // LinkedIn analytics: strong engagement
  const liEvents = [];
  for (let i = 0; i < 320; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: liAssetA.id,
      channel: "linkedin" as const,
      eventType: "impression" as const,
      value: 1,
      occurredAt: hoursAgo(120 - i * 0.35),
    });
  }
  for (let i = 0; i < 24; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: liAssetA.id,
      channel: "linkedin" as const,
      eventType: "click" as const,
      value: 1,
      occurredAt: hoursAgo(110 - i * 4),
    });
  }
  for (let i = 0; i < 18; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: liAssetA.id,
      channel: "linkedin" as const,
      eventType: "engagement" as const,
      value: 1,
      occurredAt: hoursAgo(115 - i * 5),
    });
  }
  for (let i = 0; i < 3; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: liAssetA.id,
      channel: "linkedin" as const,
      eventType: "conversion" as const,
      value: 1,
      occurredAt: hoursAgo(80 - i * 20),
    });
  }

  // Email analytics: solid open rate
  for (let i = 0; i < 180; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: emailAsset.id,
      channel: "email" as const,
      eventType: "impression" as const, // = open
      value: 1,
      occurredAt: hoursAgo(72 - i * 0.38),
    });
  }
  for (let i = 0; i < 42; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: emailAsset.id,
      channel: "email" as const,
      eventType: "click" as const,
      value: 1,
      occurredAt: hoursAgo(70 - i * 1.5),
    });
  }
  for (let i = 0; i < 2; i++) {
    liEvents.push({
      orgId: org.id,
      campaignId: campaign.id,
      assetId: emailAsset.id,
      channel: "email" as const,
      eventType: "conversion" as const,
      value: 1,
      occurredAt: hoursAgo(60 - i * 12),
    });
  }

  // Insert in batches of 100 to avoid parameter limits
  for (let i = 0; i < liEvents.length; i += 100) {
    await db.insert(analyticsEvents).values(liEvents.slice(i, i + 100));
  }

  console.log(`  ✓ ${liEvents.length} analytics events (LinkedIn + Email)`);

  // ── Draft campaign (review flow) ──────────────────────────────────────────
  const [draftCampaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal.id,
      strategyId: strategy.id,
      name: "Product Hunt Launch Prep",
      status: "draft",
      budget: 2000,
    })
    .returning();

  await db.insert(assets).values([
    {
      orgId: org.id,
      campaignId: draftCampaign.id,
      channel: "twitter",
      type: "social_post",
      contentText:
        "We're launching on Product Hunt tomorrow.\n\nNovaSpark started as a spreadsheet obsession and turned into the tool I wish existed when I was running growth at my last startup.\n\nSupport would mean everything 🙏 link in bio",
      status: "draft",
      variant: "a",
      variantGroupId: variantGroupId(draftCampaign.id, "twitter"),
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
    {
      orgId: org.id,
      campaignId: draftCampaign.id,
      channel: "linkedin",
      type: "social_post",
      contentText:
        "Today we launched NovaSpark on Product Hunt.\n\nThe story behind it: I spent 14 months manually stitching together data from 6 different tools every Monday morning. By the time I had the insight, the moment had passed.\n\nNovaSpark automates that entire Monday ritual. It works in the background, then surfaces exactly one thing to act on — before you've had your second coffee.\n\nWe'd love your support and feedback today.",
      status: "draft",
      variant: "a",
      variantGroupId: variantGroupId(draftCampaign.id, "linkedin"),
      generatedByAgent: "ContentCreatorAgent",
      modelVersion: "claude-sonnet-4-6",
    },
  ]);

  console.log(`  ✓ Draft campaign: ${draftCampaign.name} with 2 draft assets`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Demo seed complete!\n");
  console.log("📊 Entities created:");
  console.log("   1 organisation  (NovaSpark, slug: orion-demo)");
  console.log("   1 user");
  console.log("   1 goal          (leads, 1 month, $8k budget)");
  console.log("   1 strategy");
  console.log("   2 campaigns     (1 active, 1 draft)");
  console.log("   6 assets        (LinkedIn A+B, Twitter, Email on active; Twitter+LinkedIn on draft)");
  console.log("   2 scheduled posts (published)");
  console.log(`   ${liEvents.length} analytics events`);
  console.log("   5 contacts      (2 hot, 2 warm, 1 cold)");
  console.log("\n🔑 Demo login: demo@novaspark.io / demo1234");

  process.exit(0);
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
