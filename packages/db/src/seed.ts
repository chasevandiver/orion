/**
 * Bloom Coffee Co. Demo Seed
 *
 * Populates a complete, realistic demo environment for the Bloom Coffee Co.
 * brand. Designed to power the /demo route and showcase every dashboard feature.
 *
 * Idempotent — exits cleanly if the demo org (slug "bloom-coffee-demo") already exists.
 *
 * Run:  npm run db:seed-bloom  (from packages/db or repo root)
 */

import { db } from "./index.js";
import {
  organizations,
  brands,
  users,
  personas,
  goals,
  strategies,
  campaigns,
  assets,
  scheduledPosts,
  analyticsRollups,
  contacts,
  contactEvents,
  orgInsights,
} from "./schema/index.js";
import { eq } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import { createHash } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

/** Deterministic pseudo-random float in [0, 1) — reproducible across runs. */
function dr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Integer between lo and hi (inclusive) seeded by s. */
function ri(lo: number, hi: number, s: number): number {
  return Math.floor(dr(s) * (hi - lo + 1)) + lo;
}

function variantGroupId(campaignId: string, channel: string): string {
  const h = createHash("md5").update(`${campaignId}:${channel}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("☕  Seeding Bloom Coffee Co. demo environment…\n");

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "bloom-coffee-demo"))
    .limit(1);

  if (existing.length > 0) {
    console.log("✅  Demo org already exists — nothing to do.");
    process.exit(0);
  }

  // ── 1. Organization ───────────────────────────────────────────────────────
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Bloom Coffee Co.",
      slug: "bloom-coffee-demo",
      logoUrl: "/placeholder-logo.svg",
      website: "https://bloomcoffee.example.com",
      plan: "pro",
      brandPrimaryColor: "#8B4513",
      brandSecondaryColor: "#D2691E",
      fontPreference: "serif",
      logoPosition: "top-left",
      onboardingCompleted: true,
      brandVoiceProfile: {
        tone: "warm",
        tagline: "Artisan coffee roasted with care since 2019",
        adjectives: ["inviting", "authentic", "craft-focused", "community-driven"],
      },
    })
    .returning();

  console.log(`  ✓ Organization: ${org.name} (${org.id})`);

  // ── 2. Brand ──────────────────────────────────────────────────────────────
  const [brand] = await db
    .insert(brands)
    .values({
      orgId: org.id,
      name: "Bloom Coffee Co.",
      tagline: "Artisan coffee roasted with care since 2019",
      description:
        "Bloom Coffee Co. is a specialty coffee roastery and café based in Portland, OR. " +
        "We source single-origin beans directly from farmers, roast in small batches, and " +
        "serve our community with warmth. Every cup tells the story of its origin.",
      logoUrl: "/placeholder-logo.svg",
      websiteUrl: "https://bloomcoffee.example.com",
      primaryColor: "#8B4513",
      voiceTone: "warm",
      targetAudience: "Coffee lovers, remote workers, and local families who value quality and community.",
      products: [
        { name: "Single-Origin Espresso Blend", description: "Ethiopia Yirgacheffe + Colombia Huila, bright and fruity" },
        { name: "Cold Brew Concentrate", description: "24-hour steep, smooth and low-acid, ready to dilute" },
        { name: "Seasonal Pour-Over Flight", description: "Three rotating single-origins, tasting notes included" },
        { name: "Coffee Subscription Box", description: "Monthly curated 250g bags with roaster notes" },
      ],
      isActive: true,
    })
    .returning();

  console.log(`  ✓ Brand: ${brand.name}`);

  // ── 3. Demo user ──────────────────────────────────────────────────────────
  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "demo@bloomcoffee.example.com",
      name: "Maya Bloom",
      passwordHash: hashSync("demo1234", 12),
      role: "owner",
    })
    .returning();

  console.log(`  ✓ User: ${user.email} / demo1234`);

  // ── 4. Personas ───────────────────────────────────────────────────────────
  await db.insert(personas).values([
    {
      orgId: org.id,
      name: "Remote Workers",
      demographics: "Ages 25–40, primarily urban professionals working from home or cafés 3+ days/week. Mix of freelancers, startup employees, and corporate remote staff. Household income $60k–$120k.",
      psychographics:
        "Values focused work environments, quality over quantity, and the ritual of a good coffee break. Sees a great café as a productivity tool and social anchor. Instagram-active, aesthetics-conscious.",
      painPoints:
        "Boring home coffee routines. Overcrowded chain cafés with poor Wi-Fi. Overpriced mediocre coffee. Missing the social aspect of office life.",
      preferredChannels: ["instagram", "twitter", "email"],
    },
    {
      orgId: org.id,
      name: "Coffee Enthusiasts",
      demographics: "Ages 30–55, roughly even gender split. Includes hobbyist home baristas, specialty café regulars, and food-and-beverage professionals. Income varies widely.",
      psychographics:
        "Deeply curious about origin, processing method, and roast profile. Willing to pay premium for transparency and quality. Reads Sprudge and follows roasters on social. May own a V60, Chemex, or espresso machine.",
      painPoints:
        "Roasters that don't share origin detail. Inconsistent roast quality. Difficulty sourcing interesting single-origins locally. Subscription boxes that send mediocre coffee.",
      preferredChannels: ["instagram", "blog", "email"],
    },
    {
      orgId: org.id,
      name: "Local Families",
      demographics: "Ages 30–50, parents with children at home in the Portland metro area. Dual-income households, income $80k–$160k. Visit cafés on weekends for brunch and family outings.",
      psychographics:
        "Community-focused, values local businesses, appreciates a welcoming kid-friendly space. Coffee is a weekend treat tied to family rituals. Word-of-mouth and neighbourhood recommendations drive decisions.",
      painPoints:
        "Cafés with no space for strollers or high chairs. Noisy or unwelcoming environments. Limited food menu alongside coffee. Hard to justify premium pricing without a clear story.",
      preferredChannels: ["facebook", "instagram", "email"],
    },
  ]);

  console.log("  ✓ 3 personas (Remote Workers, Coffee Enthusiasts, Local Families)");

  // ─────────────────────────────────────────────────────────────────────────
  // ── GOAL 1: AWARENESS CAMPAIGN ───────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const [goal1] = await db
    .insert(goals)
    .values({
      orgId: org.id,
      userId: user.id,
      type: "awareness",
      brandName: "Bloom Coffee Co.",
      brandDescription:
        "Artisan coffee roastery and café in Portland, OR. We source single-origin beans directly from farmers, roast in small batches, and serve our community with warmth since 2019.",
      targetAudience:
        "Portland-area coffee lovers, remote workers aged 25–40, and local families looking for a weekend spot.",
      timeline: "1_month",
      budget: 3500,
      status: "active",
    })
    .returning();

  const [strategy1] = await db
    .insert(strategies)
    .values({
      goalId: goal1.id,
      orgId: org.id,
      contentText: `# Bloom Coffee Co. — Spring Awareness Strategy

## Objective
Grow brand recognition across Portland and online coffee communities. Reach 50,000 new people in 30 days.

## Positioning
Lead with warmth and craft: "Every cup is a handshake with the farmer who grew it."

## Channel Mix
- **Instagram (35%)** — Visual storytelling: roasting process, latte art, origin stories
- **Facebook (20%)** — Community engagement, event promotion, family-audience targeting
- **LinkedIn (15%)** — B2B angle: coffee subscriptions for remote teams, thought leadership
- **Twitter (10%)** — Quick takes, coffee culture conversation, barista tips
- **Email (10%)** — Newsletter: roaster notes, origin stories, seasonal highlights
- **Blog (7%)** — Long-form: origin deep-dives, brewing guides, sustainability reports
- **TikTok (3%)** — Behind-the-scenes roasting, café culture, day-in-the-life

## Creative Direction
Warm, earthy aesthetic. Saddle brown and sienna tones. Photography over illustration. Authentic over polished.

## KPIs
| Metric | Target |
|---|---|
| Reach | 50,000+ |
| Instagram follower growth | +800 |
| Email list growth | +300 subscribers |
| Blog sessions | 2,500 |
| Brand sentiment | ≥ 85% positive |
`,
      contentJson: {
        audiences: ["Remote Workers", "Coffee Enthusiasts", "Local Families"],
        channels: ["instagram", "facebook", "linkedin", "twitter", "email", "blog", "tiktok"],
        kpis: { reach: 50000, igFollowerGrowth: 800, emailListGrowth: 300, blogSessions: 2500 },
        hooks: [
          "Every cup is a handshake with the farmer who grew it.",
          "Small batch. Big story.",
          "Your morning ritual, rooted in something real.",
        ],
        contentCalendar: "3× Instagram/week, 2× Facebook/week, 1× LinkedIn/week, 1× email/week, 2× blog/month",
      },
      modelVersion: "claude-sonnet-4-6",
      tokensUsed: 4820,
    })
    .returning();

  const [campaign1] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal1.id,
      strategyId: strategy1.id,
      name: "Spring Bloom Awareness",
      description: "Multi-channel brand awareness push for spring 2026 targeting Portland area and online coffee communities.",
      status: "active",
      startDate: daysAgo(32),
      endDate: daysAgo(2),
      budget: 3500,
      pipelineStage: "complete",
    })
    .returning();

  console.log(`  ✓ Goal 1 (awareness) + Strategy + Campaign: ${campaign1.name}`);

  // ── Goal 1 Assets — 7 channels ────────────────────────────────────────────

  const c1LiGroupId = variantGroupId(campaign1.id, "linkedin");
  const c1TwGroupId = variantGroupId(campaign1.id, "twitter");
  const c1IgGroupId = variantGroupId(campaign1.id, "instagram");
  const c1FbGroupId = variantGroupId(campaign1.id, "facebook");
  const c1EmGroupId = variantGroupId(campaign1.id, "email");
  const c1BlGroupId = variantGroupId(campaign1.id, "blog");
  const c1TkGroupId = variantGroupId(campaign1.id, "tiktok");

  const [
    c1LinkedIn,
    c1Twitter,
    c1Instagram,
    c1Facebook,
    c1Email,
    c1Blog,
    c1TikTok,
  ] = await db
    .insert(assets)
    .values([
      // LinkedIn
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "linkedin",
        type: "social_post",
        contentText:
          "There's a farm in Ethiopia's Yirgacheffe region where coffee cherries are still hand-sorted by the farmers who planted them.\n\nWe visited last October. We shook hands, tasted the harvest, and made a commitment: to pay above fair-trade prices every year we work together.\n\nThat relationship is in every shot of espresso we pour.\n\nAt Bloom Coffee Co., we believe transparency isn't a marketing term — it's a supply chain practice.\n\nThis spring, come in and taste the story. We'll have tasting notes on the counter and a QR code that takes you straight to the farm.\n\n#SpecialtyCoffee #DirectTrade #Portland",
        status: "published",
        variant: "a",
        variantGroupId: c1LiGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-linkedin-spring.png",
        imageUrl: "/generated/images/bloom-ethiopia-farm.png",
        metadata: { imageSource: "brand-graphic" },
        tokensUsed: 312,
      },
      // Twitter
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "twitter",
        type: "social_post",
        contentText:
          "hot take: the best coffee you've ever had was probably at a place you almost didn't walk into\n\na slightly scruffy door. no corporate logo. maybe a hand-painted sign.\n\nthat's us. come find out why Portland keeps coming back ☕",
        status: "published",
        variant: "a",
        variantGroupId: c1TwGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-twitter-spring.png",
        metadata: { imageSource: "brand-graphic" },
        tokensUsed: 198,
      },
      // Instagram
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "instagram",
        type: "social_post",
        contentText:
          "Spring in the roaster. 🌸\n\nWe just finished our first batch of the new Ethiopia Yirgacheffe and the notes are wild — jasmine, lemon curd, and a finish like fresh strawberries.\n\nIt'll be on the pour-over bar starting Thursday. First 20 orders get tasting notes from the farm.\n\nLink in bio to pre-order a 250g bag before it sells out (last batch went in 48 hours).\n\n#BloomCoffeeCo #SpecialtyCoffee #YirgacheffeEthiopia #Portland #CoffeeRoaster #ThirdWaveCoffee",
        status: "published",
        variant: "a",
        variantGroupId: c1IgGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-instagram-spring.png",
        imageUrl: "/generated/images/bloom-roaster-spring.png",
        metadata: { imageSource: "pollinations" },
        tokensUsed: 267,
      },
      // Facebook
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "facebook",
        type: "social_post",
        contentText:
          "🌷 Spring is here — and so is our new seasonal menu!\n\nWe've added three new drinks to celebrate the season:\n\n☕ Lavender Oat Latte — our most-requested seasonal return\n🧊 Cold Brew Lemonade — bright, citrusy, and dangerously refreshing\n🍓 Strawberry Matcha — local strawberry syrup, ceremonial grade matcha\n\nPlus our Easter Family Brunch is back: April 20th, 9am–2pm. Kids eat free with any adult entrée purchase.\n\nTag a friend who needs a coffee date this weekend 👇",
        status: "published",
        variant: "a",
        variantGroupId: c1FbGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-facebook-spring.png",
        metadata: { imageSource: "brand-graphic" },
        tokensUsed: 289,
      },
      // Email
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "email",
        type: "email",
        contentText:
          "SUBJECT: The spring harvest is in (and it's our best yet)\nPREVIEW: Ethiopia Yirgacheffe, lavender lattes, and a note from Maya\n---\nHi {{first_name}},\n\nEvery spring, we wait for this moment.\n\nThe new harvest from our friends at Daye Bensa farm in Ethiopia's Yirgacheffe region has arrived. We tasted it last week and the room went quiet — jasmine, citrus, a long bright finish. It's the kind of coffee that makes you stop mid-sip and just appreciate it.\n\n**What's new this season:**\n\n• Ethiopia Yirgacheffe (Daye Bensa) — available Thursday on pour-over and as whole beans\n• Lavender Oat Latte is back — our most-requested seasonal drink\n• Cold Brew Lemonade — new this year, bright and citrusy\n• Easter Family Brunch — April 20th, kids eat free\n\n**For subscribers:** You get first access to the Yirgacheffe before it hits the shelf. Reply to this email with SPRING and we'll hold a 250g bag for you at the counter.\n\nWith warmth,\nMaya Bloom\nBloom Coffee Co.\n\nPS: We're donating 50¢ from every seasonal drink sold this month to the Portland Coffee Community Fund.",
        status: "published",
        variant: "a",
        variantGroupId: c1EmGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 431,
      },
      // Blog
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "blog",
        type: "blog",
        contentText:
          "# From Cherry to Cup: Our 2026 Ethiopia Yirgacheffe Story\n\nSomething happens when you shake hands with the person who grew your coffee.\n\nLast October, we flew to Ethiopia's Sidama region to visit the Daye Bensa cooperative and their 1,800-meter washing station in Yirgacheffe. It was our third visit in four years — but this time felt different. The rains had been perfect. The harvest was early and abundant. Farmers were cautiously optimistic in a way we hadn't seen since 2022.\n\n## The Farm\n\nDaye Bensa sits at 1,800 meters above sea level in an area known for its rich volcanic soil and natural forest shade. The cooperative works with 1,200 smallholder farmers across 12 villages. Average farm size is 1.5 hectares — small by any measure, but managed with extraordinary care.\n\nCoffee cherries are handpicked at peak ripeness (no strip-picking here), sorted twice before processing, and fermented in open-air raised beds for 10–14 days under shade cloth. It's labor-intensive and slow. It's also why the cup tastes the way it does.\n\n## The Taste\n\nOur head roaster Theo spent three days profiling the new harvest before he was happy with the roast. His tasting notes: jasmine, bergamot, lemon curd, and a finish like fresh strawberries. It has the brightness and floral quality Yirgacheffe is famous for, with a body and sweetness that surprises people who've only had inferior examples of the region.\n\nWe're offering it as a light-medium pour-over starting Thursday, and in 250g whole bean bags for home brewing.\n\n## What We Pay, and Why It Matters\n\nWe pay Daye Bensa 40% above the Fair Trade floor price. We've been transparent about this since our first purchase in 2021 because we think the specialty coffee industry needs to be more honest about economics.\n\nFarm gate prices vary enormously. What a roaster pays per pound directly determines whether farming families can afford school fees, healthcare, and equipment upgrades. We're not the biggest buyer Daye Bensa works with — but we try to be the most consistent and most communicative.\n\n## Brewing at Home\n\nFor the full floral experience, we recommend:\n\n- **Brew method:** V60 or Chemex pour-over\n- **Grind:** Medium-fine (like coarse sea salt)\n- **Ratio:** 1:15 coffee to water\n- **Water temp:** 92°C / 198°F (let your kettle cool for 45 seconds after boiling)\n- **Total brew time:** 3:00–3:30\n\nThe jasmine notes open up as the cup cools — don't rush it.\n\n---\n\n*The 2026 Yirgacheffe harvest is available at our café bar and online in 250g bags. We expect to sell through by mid-April.*",
        status: "published",
        variant: "a",
        variantGroupId: c1BlGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 892,
      },
      // TikTok
      {
        orgId: org.id,
        campaignId: campaign1.id,
        channel: "tiktok",
        type: "video_script",
        contentText:
          "HOOK (0–3s): [Close-up of coffee cherries being poured] \"This is what $22/lb looks like before it's coffee.\"\n\nSETUP (3–15s): [Roastery b-roll] \"We just got in our spring harvest from Ethiopia. Let me show you what happens next.\"\n\nROAST SEQUENCE (15–30s): [Time-lapse of roasting drum] \"Our head roaster Theo is running a 10-minute light-medium profile. You can actually hear the first crack — that's the moment moisture is leaving the bean.\"\n\nCUPPING (30–45s): [Slurping sound, reaction] \"Jasmine. Lemon curd. And something like fresh strawberries at the finish. I'm not kidding.\"\n\nCTA (45–55s): [Point at camera] \"It's available Thursday at Bloom Coffee Co. in Portland — or we'll ship you 250g. Link in bio. Don't sleep on this one.\"\n\n#CoffeeTikTok #SpecialtyCoffee #Portland #BloomCoffee #CoffeeRoaster",
        status: "published",
        variant: "a",
        variantGroupId: c1TkGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 356,
      },
    ])
    .returning();

  console.log("  ✓ 7 assets for Campaign 1 (all channels, all published)");

  // ── Goal 1 Scheduled Posts (all published) ────────────────────────────────
  await db.insert(scheduledPosts).values([
    {
      orgId: org.id,
      assetId: c1LinkedIn.id,
      channel: "linkedin",
      scheduledFor: daysAgo(28),
      publishedAt: daysAgo(28),
      platformPostId: "bloom_li_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1Twitter.id,
      channel: "twitter",
      scheduledFor: daysAgo(27),
      publishedAt: daysAgo(27),
      platformPostId: "bloom_tw_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1Instagram.id,
      channel: "instagram",
      scheduledFor: daysAgo(25),
      publishedAt: daysAgo(25),
      platformPostId: "bloom_ig_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1Facebook.id,
      channel: "facebook",
      scheduledFor: daysAgo(24),
      publishedAt: daysAgo(24),
      platformPostId: "bloom_fb_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1Email.id,
      channel: "email",
      scheduledFor: daysAgo(22),
      publishedAt: daysAgo(22),
      platformPostId: "bloom_em_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1Blog.id,
      channel: "blog",
      scheduledFor: daysAgo(20),
      publishedAt: daysAgo(20),
      platformPostId: "bloom_bl_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    {
      orgId: org.id,
      assetId: c1TikTok.id,
      channel: "tiktok",
      scheduledFor: daysAgo(18),
      publishedAt: daysAgo(18),
      platformPostId: "bloom_tk_spring_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
  ]);

  console.log("  ✓ 7 published scheduled posts for Campaign 1");

  // ─────────────────────────────────────────────────────────────────────────
  // ── GOAL 2: LEAD GENERATION ───────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const [goal2] = await db
    .insert(goals)
    .values({
      orgId: org.id,
      userId: user.id,
      type: "leads",
      brandName: "Bloom Coffee Co.",
      brandDescription:
        "Specialty coffee roastery offering direct-trade beans, café experiences, and a monthly subscription box for coffee lovers who want to go deeper.",
      targetAudience:
        "Coffee enthusiasts aged 30–55 who care about origin and roast quality, and remote workers looking for a premium subscription.",
      timeline: "1_month",
      budget: 2500,
      status: "active",
    })
    .returning();

  const [strategy2] = await db
    .insert(strategies)
    .values({
      goalId: goal2.id,
      orgId: org.id,
      contentText: `# Bloom Coffee Co. — Coffee Club Lead Generation Strategy

## Objective
Generate 80 qualified leads for the Bloom Coffee Club subscription in 30 days.

## Positioning
"The subscription that pays respect to the farmer." Focus on the story, the provenance, the ritual.

## Channel Mix
- **LinkedIn (40%)**: Target corporate remote teams and office managers. Pitch: "Elevate your team's coffee."
- **Email (40%)**: Nurture existing newsletter subscribers with a 3-touch conversion sequence.
- **Blog (20%)**: SEO-driven content — "best coffee subscription Portland", "single origin subscription box".

## A/B Testing Plan
Run A/B on LinkedIn: Variant A (origin story angle) vs Variant B (productivity angle).
Run A/B on Email: Variant A (emotional/story) vs Variant B (value/savings).

## KPIs
| Metric | Target |
|---|---|
| Subscription sign-ups | 80 |
| Email conversion rate | ≥ 4% |
| LinkedIn CTR | ≥ 1.8% |
| Blog organic sessions | 1,200 |
| Cost per acquisition | ≤ $31 |
`,
      contentJson: {
        audiences: ["Coffee Enthusiasts", "Remote Workers"],
        channels: ["linkedin", "email", "blog"],
        kpis: { leads: 80, emailCvr: 4, linkedinCtr: 1.8, blogSessions: 1200, cpa: 31 },
        abTests: [
          { channel: "linkedin", variantA: "origin story", variantB: "productivity angle" },
          { channel: "email", variantA: "emotional/story", variantB: "value/savings" },
        ],
      },
      modelVersion: "claude-sonnet-4-6",
      tokensUsed: 5140,
    })
    .returning();

  const [campaign2] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      goalId: goal2.id,
      strategyId: strategy2.id,
      name: "Coffee Club Lead Gen",
      description: "Drive subscriptions to the Bloom Coffee Club via LinkedIn A/B test, email nurture sequence, and SEO blog content.",
      status: "active",
      startDate: daysAgo(14),
      endDate: daysFromNow(16),
      budget: 2500,
      pipelineStage: "complete",
    })
    .returning();

  console.log(`  ✓ Goal 2 (leads) + Strategy + Campaign: ${campaign2.name}`);

  // ── Goal 2 Assets — LinkedIn A/B, Email A/B, Blog ──────────────────────

  const c2LiGroupId = variantGroupId(campaign2.id, "linkedin");
  const c2EmGroupId = variantGroupId(campaign2.id, "email");
  const c2BlGroupId = variantGroupId(campaign2.id, "blog");

  const [c2LiA, c2LiB, c2EmA, c2EmB, c2Blog] = await db
    .insert(assets)
    .values([
      // LinkedIn Variant A — origin story (published)
      {
        orgId: org.id,
        campaignId: campaign2.id,
        channel: "linkedin",
        type: "social_post",
        contentText:
          "A bag of specialty coffee takes 18 months from seed to your cup.\n\nThe farmer plants. Waits two years for the tree to fruit. Hand-picks at peak ripeness. Sun-dries on raised beds. Ships green.\n\nThen it sits in our warehouse for 4–6 weeks while we develop a roast profile.\n\nThen it ships to you.\n\n18 months of care. Gone in 15 minutes.\n\nThe Bloom Coffee Club is our way of making sure you taste the whole story — not just the last 15 minutes.\n\nMonthly single-origin drops. Roaster notes. Farm coordinates. A price that actually gets back to the people who did the 18 months.\n\nFirst bag ships free. → bloomcoffee.example.com/club",
        status: "published",
        variant: "a",
        variantGroupId: c2LiGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-li-leadgen-a.png",
        metadata: { imageSource: "brand-graphic" },
        tokensUsed: 387,
      },
      // LinkedIn Variant B — productivity angle (draft, A/B test running)
      {
        orgId: org.id,
        campaignId: campaign2.id,
        channel: "linkedin",
        type: "social_post",
        contentText:
          "Your team's best thinking happens over coffee.\n\nMost office coffee is an afterthought — capsule machines, burnt filter, a can of grocery-store ground that's been open since February.\n\nWe built the Bloom Coffee Club for remote teams who want something better.\n\nEvery month: a freshly roasted single-origin from a farm we've visited personally. Whole bean or ground. Delivered to the door of every team member.\n\n$18/person/month. Cancel any time. First round on us.\n\nYour team deserves coffee that actually tastes like care was taken.\n\n→ bloomcoffee.example.com/club/teams",
        status: "approved",
        variant: "b",
        variantGroupId: c2LiGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        compositedImageUrl: "/generated/composited/bloom-li-leadgen-b.png",
        metadata: { imageSource: "brand-graphic" },
        tokensUsed: 401,
      },
      // Email Variant A — story (published)
      {
        orgId: org.id,
        campaignId: campaign2.id,
        channel: "email",
        type: "email",
        contentText:
          "SUBJECT: The coffee subscription that starts at the farm\nPREVIEW: 18 months of work. Delivered to your door.\n---\nHi {{first_name}},\n\nThere's a sentence I think about a lot:\n\n*\"The farmer spends 18 months growing this coffee. The drinker spends 15 minutes with it.\"*\n\nMost coffee subscriptions focus on the 15 minutes. We built Bloom Coffee Club around the 18 months.\n\nEvery month you'll receive:\n✦ A 250g bag of freshly roasted single-origin — picked for that month's harvest\n✦ A roaster note from Theo explaining the profile and what to taste for\n✦ Farm coordinates and a brief origin story\n✦ A brewing recipe designed specifically for that coffee\n\n**What it costs:** $26/month for individuals. $18/person/month for teams of 3+.\n**What it pays:** 40% above Fair Trade floor price to every farm we source from.\n\nFirst bag ships free. No contracts.\n\n→ Join the Bloom Coffee Club\n\nWith warmth,\nMaya\nBloom Coffee Co.\n\nPS: We only take 200 subscribers per harvest batch to maintain quality. We're at 147 now.",
        status: "published",
        variant: "a",
        variantGroupId: c2EmGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 528,
      },
      // Email Variant B — value/savings (scheduled)
      {
        orgId: org.id,
        campaignId: campaign2.id,
        channel: "email",
        type: "email",
        contentText:
          "SUBJECT: $26/month for coffee you'll actually remember\nPREVIEW: Better than your current café habit. Here's the math.\n---\nHi {{first_name}},\n\nQuick math:\n\nPortland café latte: $6.50 × 20 days/month = **$130/month**\nBloom Coffee Club: **$26/month**\n\nFor $26 you get a 250g bag of freshly roasted single-origin — enough for about 16 cups brewed at home.\n\nYes, it's not the same as sitting in the café. But it's a lot closer than you'd expect, especially with the brewing guide we include with every shipment.\n\n**What's included:**\n• 250g freshly roasted single-origin (roasted the week it ships)\n• Brewing recipe calibrated for that specific coffee\n• Roaster's tasting notes\n• Direct farm sourcing — 40% above Fair Trade prices\n\nFirst bag free. Cancel any time.\n\n→ Try the Bloom Coffee Club\n\nMaya & the Bloom team",
        status: "approved",
        variant: "b",
        variantGroupId: c2EmGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 476,
      },
      // Blog — SEO article (published)
      {
        orgId: org.id,
        campaignId: campaign2.id,
        channel: "blog",
        type: "blog",
        contentText:
          "# Best Coffee Subscriptions in Portland (2026 Guide)\n\nPortland has a stronger specialty coffee culture than almost anywhere in the US. So it makes sense that a few local roasters have built subscription programs worth your attention.\n\nThis guide covers our honest take on what makes a great coffee subscription — and yes, we're one of them, so we'll explain upfront why we think we're worth considering alongside the others.\n\n## What Makes a Coffee Subscription Worth It?\n\nNot all subscriptions are equal. The key variables:\n\n**Freshness** — Coffee peaks at 7–21 days post-roast. Any subscription that roasts-to-order and ships quickly wins here. Beware of services that warehouse pre-roasted coffee for weeks.\n\n**Origin transparency** — Can you find out where the coffee came from? Which farm? Which harvest year? The best subscriptions let you trace the bean.\n\n**Pricing to the farmer** — This one is rarely disclosed, which is a red flag. Look for roasters who publish what they pay above Fair Trade floor prices.\n\n**Customization** — Whole bean vs. ground. Roast level. Frequency. The more flexibility, the better.\n\n## Our Subscription: Bloom Coffee Club\n\nWe'd be doing you a disservice if we didn't explain our own program first.\n\nThe Bloom Coffee Club ships a fresh 250g single-origin every month. We choose the coffee based on what's at peak harvest — so January might be a washed Ethiopian, July a natural Brazilian. You get:\n\n- Freshly roasted within 5 days of shipping\n- A two-page roaster note with tasting profile, brewing recipe, and farm story\n- GPS coordinates of the source farm\n- Pricing transparency: we publish what we paid, every shipment\n\nCost: $26/month individual. $18/person/month for teams of 3+.\n\nWe cap at 200 subscribers per harvest batch to maintain quality consistency. → Join the waitlist\n\n## How to Choose\n\nIf you care most about **price**: look for a larger-volume subscription service.\nIf you care most about **story and transparency**: Bloom or a similar direct-trade roaster.\nIf you care most about **variety and discovery**: a multi-roaster curation service.\nIf you're buying for a **team or office**: Bloom's team tier is hard to beat on value.\n\n---\n\n*We update this guide seasonally. Last updated March 2026.*",
        status: "published",
        variant: "a",
        variantGroupId: c2BlGroupId,
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        tokensUsed: 1024,
      },
    ])
    .returning();

  console.log("  ✓ 5 assets for Campaign 2 (LinkedIn A/B, Email A/B, Blog)");

  // ── Goal 2 Scheduled Posts ────────────────────────────────────────────────
  await db.insert(scheduledPosts).values([
    // LinkedIn A — published
    {
      orgId: org.id,
      assetId: c2LiA.id,
      channel: "linkedin",
      scheduledFor: daysAgo(12),
      publishedAt: daysAgo(12),
      platformPostId: "bloom_li_club_a_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    // LinkedIn B — scheduled (A/B still running)
    {
      orgId: org.id,
      assetId: c2LiB.id,
      channel: "linkedin",
      scheduledFor: daysFromNow(2),
      status: "scheduled",
      isSimulated: true,
      preflightStatus: "passed",
    },
    // Email A — published
    {
      orgId: org.id,
      assetId: c2EmA.id,
      channel: "email",
      scheduledFor: daysAgo(10),
      publishedAt: daysAgo(10),
      platformPostId: "bloom_em_club_a_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
    // Email B — scheduled
    {
      orgId: org.id,
      assetId: c2EmB.id,
      channel: "email",
      scheduledFor: daysFromNow(4),
      status: "scheduled",
      isSimulated: true,
      preflightStatus: "passed",
    },
    // Blog — published
    {
      orgId: org.id,
      assetId: c2Blog.id,
      channel: "blog",
      scheduledFor: daysAgo(8),
      publishedAt: daysAgo(8),
      platformPostId: "bloom_bl_club_001",
      status: "published",
      isSimulated: true,
      preflightStatus: "passed",
    },
  ]);

  console.log("  ✓ 5 scheduled posts for Campaign 2 (3 published, 2 scheduled)");

  // ─────────────────────────────────────────────────────────────────────────
  // ── 5. ANALYTICS ROLLUPS — 30 days ───────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  //
  // One row per (campaign, channel, day). Using deterministic pseudo-random
  // numbers so values look realistic but are reproducible across seed runs.
  //
  // Channels per campaign:
  //   Campaign 1 (awareness): instagram, facebook, linkedin, twitter, email
  //   Campaign 2 (leads):     linkedin, email, blog
  //
  // Zero-data days sprinkled in to simulate real gaps.

  const rollupRows: Array<{
    orgId: string;
    campaignId: string;
    channel: string;
    date: Date;
    impressions: number;
    clicks: number;
    conversions: number;
    engagements: number;
    spend: number;
    revenue: number;
    isSimulated: boolean;
  }> = [];

  // Helper: start-of-day UTC for N days ago
  const dayStart = (daysBack: number): Date => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d;
  };

  for (let day = 30; day >= 1; day--) {
    const date = dayStart(day);
    const s = day * 17; // base seed for this day

    // ── Campaign 1 channels ────────────────────────────────────────────────

    // Instagram: 300–800 impressions, 1–3% engagement, occasional zero day
    if (day % 7 !== 3) { // skip every 7th-3rd day to simulate gaps
      const imp = ri(300, 800, s + 1);
      const eng = Math.round(imp * (dr(s + 2) * 0.02 + 0.01)); // 1–3%
      const clk = Math.round(imp * (dr(s + 3) * 0.008 + 0.004)); // 0.4–1.2%
      rollupRows.push({
        orgId: org.id, campaignId: campaign1.id, channel: "instagram", date,
        impressions: imp, clicks: clk, engagements: eng, conversions: 0,
        spend: parseFloat((imp * 0.002).toFixed(2)), revenue: 0, isSimulated: true,
      });
    }

    // Facebook: 200–600 impressions, 0.5–1.5% CTR
    if (day % 11 !== 5) {
      const imp = ri(200, 600, s + 10);
      const clk = Math.round(imp * (dr(s + 11) * 0.01 + 0.005)); // 0.5–1.5%
      const eng = Math.round(imp * (dr(s + 12) * 0.015 + 0.005));
      rollupRows.push({
        orgId: org.id, campaignId: campaign1.id, channel: "facebook", date,
        impressions: imp, clicks: clk, engagements: eng, conversions: 0,
        spend: parseFloat((imp * 0.0015).toFixed(2)), revenue: 0, isSimulated: true,
      });
    }

    // LinkedIn (Campaign 1): 200–500 impressions, 0.4–1.2% CTR
    if (day % 5 !== 2) {
      const imp = ri(200, 500, s + 20);
      const clk = Math.round(imp * (dr(s + 21) * 0.008 + 0.004)); // 0.4–1.2%
      rollupRows.push({
        orgId: org.id, campaignId: campaign1.id, channel: "linkedin", date,
        impressions: imp, clicks: clk, engagements: clk, conversions: day < 10 ? 1 : 0,
        spend: parseFloat((imp * 0.003).toFixed(2)), revenue: 0, isSimulated: true,
      });
    }

    // Twitter (Campaign 1): 100–350 impressions, 0.8–2% engagement
    if (day % 9 !== 4) {
      const imp = ri(100, 350, s + 30);
      const eng = Math.round(imp * (dr(s + 31) * 0.012 + 0.008));
      const clk = Math.round(imp * (dr(s + 32) * 0.006 + 0.002));
      rollupRows.push({
        orgId: org.id, campaignId: campaign1.id, channel: "twitter", date,
        impressions: imp, clicks: clk, engagements: eng, conversions: 0,
        spend: 0, revenue: 0, isSimulated: true,
      });
    }

    // Email (Campaign 1): ~450 sends, 20–25% open rate, 2–3% CTR
    if (day === 22) { // Email was sent on day 22 ago
      const sends = 450;
      const opens = Math.round(sends * (dr(s + 40) * 0.05 + 0.20)); // 20–25%
      const clicks = Math.round(sends * (dr(s + 41) * 0.01 + 0.02)); // 2–3%
      rollupRows.push({
        orgId: org.id, campaignId: campaign1.id, channel: "email", date,
        impressions: opens, clicks, engagements: 0, conversions: Math.round(clicks * 0.15),
        spend: 0, revenue: parseFloat((clicks * 26).toFixed(2)), isSimulated: true,
      });
    }

    // ── Campaign 2 channels (started 14 days ago) ──────────────────────────
    if (day > 14) continue;

    // LinkedIn (Campaign 2): 150–400 impressions, 0.8–2% CTR (more targeted)
    if (day % 6 !== 1) {
      const imp = ri(150, 400, s + 50);
      const clk = Math.round(imp * (dr(s + 51) * 0.012 + 0.008)); // 0.8–2%
      const cvr = day < 5 ? 2 : (day < 10 ? 1 : 0);
      rollupRows.push({
        orgId: org.id, campaignId: campaign2.id, channel: "linkedin", date,
        impressions: imp, clicks: clk, engagements: clk, conversions: cvr,
        spend: parseFloat((imp * 0.004).toFixed(2)), revenue: parseFloat((cvr * 26).toFixed(2)), isSimulated: true,
      });
    }

    // Email (Campaign 2): sent day 10 ago
    if (day === 10) {
      const sends = 380;
      const opens = Math.round(sends * (dr(s + 60) * 0.05 + 0.21)); // 21–26%
      const clicks = Math.round(sends * (dr(s + 61) * 0.01 + 0.025)); // 2.5–3.5%
      rollupRows.push({
        orgId: org.id, campaignId: campaign2.id, channel: "email", date,
        impressions: opens, clicks, engagements: 0, conversions: Math.round(clicks * 0.18),
        spend: 0, revenue: parseFloat((Math.round(clicks * 0.18) * 26).toFixed(2)), isSimulated: true,
      });
    }

    // Blog (Campaign 2): organic sessions growing over time
    if (day % 3 !== 0) {
      const sessions = ri(30, 120, s + 70);
      const clicks = Math.round(sessions * (dr(s + 71) * 0.02 + 0.01));
      rollupRows.push({
        orgId: org.id, campaignId: campaign2.id, channel: "blog", date,
        impressions: sessions, clicks, engagements: 0, conversions: day < 6 ? 1 : 0,
        spend: 0, revenue: 0, isSimulated: true,
      });
    }
  }

  // Insert rollups in batches of 50
  for (let i = 0; i < rollupRows.length; i += 50) {
    await db.insert(analyticsRollups).values(rollupRows.slice(i, i + 50));
  }

  console.log(`  ✓ ${rollupRows.length} analytics rollup rows (30 days, multi-channel)`);

  // ─────────────────────────────────────────────────────────────────────────
  // ── 6. CRM CONTACTS — 20 contacts ────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const contactData = [
    // ── 2 customers ────────────────────────────────────────────────────────
    {
      email: "eleanor.voss@portlanddesign.co",
      name: "Eleanor Voss",
      company: "Portland Design Co.",
      title: "Creative Director",
      sourceChannel: "email" as const,
      leadScore: 98,
      status: "customer" as const,
      notes: "Coffee Club subscriber since Jan 2026. Gifted 3 team subscriptions.",
    },
    {
      email: "marcus.okafor@cascadedev.io",
      name: "Marcus Okafor",
      company: "Cascade Dev",
      title: "Engineering Lead",
      sourceChannel: "linkedin" as const,
      leadScore: 95,
      status: "customer" as const,
      notes: "Team subscription for 8 engineers. High-value account.",
    },
    // ── 5 hot ───────────────────────────────────────────────────────────────
    {
      email: "priya.mehta@freelancepdx.com",
      name: "Priya Mehta",
      company: "Freelance PDX",
      title: "UX Consultant",
      sourceChannel: "instagram" as const,
      leadScore: 91,
      status: "hot" as const,
      notes: "Clicked Coffee Club CTA twice. Replied to email asking about whole bean vs ground.",
    },
    {
      email: "james.harrington@remotefirst.xyz",
      name: "James Harrington",
      company: "RemoteFirst Co.",
      title: "Head of Operations",
      sourceChannel: "linkedin" as const,
      leadScore: 88,
      status: "hot" as const,
      notes: "Interested in team tier. Asked about minimum order for 15 people.",
    },
    {
      email: "sofia.lindqvist@bloomseo.com",
      name: "Sofia Lindqvist",
      company: "Bloom SEO",
      title: "Founder",
      sourceChannel: "blog" as const,
      leadScore: 85,
      status: "hot" as const,
      notes: "Found us via blog. Read the Yirgacheffe origin piece and signed up for newsletter.",
    },
    {
      email: "daniel.park@upstreamstudio.io",
      name: "Daniel Park",
      company: "Upstream Studio",
      title: "Co-Founder",
      sourceChannel: "instagram" as const,
      leadScore: 82,
      status: "hot" as const,
      notes: "DM'd on Instagram asking about wholesale pricing.",
    },
    {
      email: "amara.nwosu@nwcreatives.com",
      name: "Amara Nwosu",
      company: "NW Creatives",
      title: "Art Director",
      sourceChannel: "email" as const,
      leadScore: 80,
      status: "hot" as const,
      notes: "Opened email 4 times. Clicked link to Coffee Club page.",
    },
    // ── 8 warm ─────────────────────────────────────────────────────────────
    {
      email: "tom.gallagher@pdxstartups.com",
      name: "Tom Gallagher",
      company: "PDX Startups",
      title: "Community Manager",
      sourceChannel: "twitter" as const,
      leadScore: 68,
      status: "warm" as const,
      notes: "Retweeted our spring launch tweet. Engaged with two Instagram posts.",
    },
    {
      email: "lily.nguyen@cascademarketing.co",
      name: "Lily Nguyen",
      company: "Cascade Marketing",
      title: "Content Strategist",
      sourceChannel: "linkedin" as const,
      leadScore: 65,
      status: "warm" as const,
      notes: "Liked LinkedIn post. Connected on LinkedIn.",
    },
    {
      email: "raj.patel@techpdx.dev",
      name: "Raj Patel",
      company: "TechPDX",
      title: "Backend Engineer",
      sourceChannel: "instagram" as const,
      leadScore: 62,
      status: "warm" as const,
      notes: "Saved Instagram post. Visited website but didn't convert.",
    },
    {
      email: "claire.beaumont@nativeplants.com",
      name: "Claire Beaumont",
      company: "Native Plants NW",
      title: "Owner",
      sourceChannel: "facebook" as const,
      leadScore: 60,
      status: "warm" as const,
      notes: "Attended Easter Brunch event. Left glowing Facebook comment.",
    },
    {
      email: "evan.brooks@mountaintrail.co",
      name: "Evan Brooks",
      company: "Mountain Trail Co.",
      title: "Marketing Manager",
      sourceChannel: "email" as const,
      leadScore: 57,
      status: "warm" as const,
      notes: "Newsletter subscriber since 2024. Opens consistently, hasn't bought yet.",
    },
    {
      email: "nina.kostov@studioink.pdx",
      name: "Nina Kostov",
      company: "Studio Ink",
      title: "Illustrator",
      sourceChannel: "instagram" as const,
      leadScore: 54,
      status: "warm" as const,
    },
    {
      email: "omar.hassan@greenbridgetech.io",
      name: "Omar Hassan",
      company: "Greenbridge Tech",
      title: "Product Manager",
      sourceChannel: "linkedin" as const,
      leadScore: 52,
      status: "warm" as const,
    },
    {
      email: "jessica.wu@localfoodpdx.com",
      name: "Jessica Wu",
      company: "Local Food PDX",
      title: "Editor",
      sourceChannel: "blog" as const,
      leadScore: 50,
      status: "warm" as const,
      notes: "Read two blog posts. Shared Yirgacheffe article on Twitter.",
    },
    // ── 5 cold ─────────────────────────────────────────────────────────────
    {
      email: "kyle.marsh@example.com",
      name: "Kyle Marsh",
      company: "Marsh Consulting",
      title: "Consultant",
      sourceChannel: "linkedin" as const,
      leadScore: 22,
      status: "cold" as const,
    },
    {
      email: "anna.petrov@designblocks.co",
      name: "Anna Petrov",
      company: "Design Blocks",
      title: "Junior Designer",
      sourceChannel: "instagram" as const,
      leadScore: 18,
      status: "cold" as const,
    },
    {
      email: "ben.carter@bncreative.com",
      name: "Ben Carter",
      company: "BN Creative",
      title: "Photographer",
      sourceChannel: "instagram" as const,
      leadScore: 15,
      status: "cold" as const,
    },
    {
      email: "sarah.wolfe@inbox-only.io",
      name: "Sarah Wolfe",
      company: "Inbox Only",
      title: "Newsletter Editor",
      sourceChannel: "email" as const,
      leadScore: 12,
      status: "cold" as const,
    },
    {
      email: "michael.adkins@placeholder.dev",
      name: "Michael Adkins",
      company: "Placeholder Dev",
      title: "Developer",
      sourceChannel: "twitter" as const,
      leadScore: 8,
      status: "cold" as const,
    },
  ];

  const insertedContacts = await db
    .insert(contacts)
    .values(
      contactData.map((c) => ({
        orgId: org.id,
        sourceCampaignId: c.status === "customer" || c.status === "hot" ? campaign2.id : campaign1.id,
        ...c,
      }))
    )
    .returning();

  console.log(`  ✓ ${insertedContacts.length} contacts (2 customer, 5 hot, 8 warm, 5 cold)`);

  // ── Contact Events — 2–3 per contact ─────────────────────────────────────
  const eventRows: Array<{
    contactId: string;
    eventType: string;
    metadataJson: object;
    occurredAt: Date;
  }> = [];

  for (const [i, contact] of insertedContacts.entries()) {
    // Determine event count based on status
    const eventCount = contact.status === "customer" ? 3
      : contact.status === "hot" ? 3
      : contact.status === "warm" ? 2
      : 1;

    if (contact.status === "customer") {
      eventRows.push(
        { contactId: contact.id, eventType: "email_open", metadataJson: { subject: "The spring harvest is in", campaign: "Spring Bloom Awareness" }, occurredAt: daysAgo(ri(20, 28, i * 7)) },
        { contactId: contact.id, eventType: "link_click", metadataJson: { url: "/club", campaign: "Coffee Club Lead Gen" }, occurredAt: daysAgo(ri(10, 18, i * 7 + 1)) },
        { contactId: contact.id, eventType: "form_submit", metadataJson: { form: "coffee_club_signup", plan: "individual" }, occurredAt: daysAgo(ri(5, 12, i * 7 + 2)) },
      );
    } else if (contact.status === "hot") {
      eventRows.push(
        { contactId: contact.id, eventType: "email_open", metadataJson: { subject: "The coffee subscription that starts at the farm" }, occurredAt: daysAgo(ri(8, 14, i * 7)) },
        { contactId: contact.id, eventType: "link_click", metadataJson: { url: "/club", source: contact.sourceChannel }, occurredAt: daysAgo(ri(4, 9, i * 7 + 1)) },
        { contactId: contact.id, eventType: "page_view", metadataJson: { page: "/club", duration_seconds: ri(45, 180, i * 7 + 2) }, occurredAt: daysAgo(ri(2, 5, i * 7 + 3)) },
      );
    } else if (contact.status === "warm") {
      eventRows.push(
        { contactId: contact.id, eventType: "email_open", metadataJson: { subject: "The spring harvest is in" }, occurredAt: daysAgo(ri(15, 25, i * 7)) },
        { contactId: contact.id, eventType: "page_view", metadataJson: { page: "/blog/yirgacheffe-2026", duration_seconds: ri(20, 90, i * 7 + 1) }, occurredAt: daysAgo(ri(5, 14, i * 7 + 2)) },
      );
    } else {
      eventRows.push(
        { contactId: contact.id, eventType: "email_open", metadataJson: { subject: "The spring harvest is in" }, occurredAt: daysAgo(ri(20, 30, i * 7)) },
      );
    }
  }

  for (let i = 0; i < eventRows.length; i += 50) {
    await db.insert(contactEvents).values(eventRows.slice(i, i + 50));
  }

  console.log(`  ✓ ${eventRows.length} contact events`);

  // ─────────────────────────────────────────────────────────────────────────
  // ── 7. ORG INSIGHTS ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  await db.insert(orgInsights).values([
    {
      orgId: org.id,
      campaignId: campaign1.id,
      insightType: "post_campaign",
      title: "Spring Bloom Awareness — Post-Campaign Analysis",
      period: "2026-02",
      summary:
        "The Spring Bloom Awareness campaign exceeded reach targets by 23%, with Instagram and blog delivering the strongest ROI. Email drove disproportionate downstream conversions. LinkedIn underperformed vs. benchmarks but generated the highest-quality traffic by time-on-site.",
      dataJson: {
        totalReach: 61400,
        targetReach: 50000,
        channelPerformance: {
          instagram: { impressions: 14200, engagementRate: 2.1, score: "A" },
          facebook: { impressions: 9800, engagementRate: 1.2, score: "B+" },
          linkedin: { impressions: 7600, ctr: 0.7, avgTimeOnSite: "4:12", score: "B-" },
          twitter: { impressions: 5200, engagementRate: 1.8, score: "B" },
          email: { sends: 450, openRate: 22.4, ctr: 2.8, conversionRate: 3.1, score: "A-" },
          blog: { sessions: 3100, avgDuration: "5:43", conversionRate: 1.4, score: "A" },
          tiktok: { views: 21600, watchTime: "0:34 avg", score: "B+" },
        },
        topInsights: [
          "Instagram Reels outperformed static images by 3.2× on reach — prioritize video in next campaign.",
          "Email subscribers who opened the spring newsletter were 4.7× more likely to visit the Coffee Club page.",
          "The Yirgacheffe blog post generated 1,240 organic sessions — 40% of total blog traffic. Expand origin content series.",
          "LinkedIn CTR (0.7%) was below the 1.2% target — test shorter copy and stronger CTAs in Campaign 2.",
          "Facebook post with Easter Brunch event had 2.4× engagement rate vs average — local event content resonates strongly.",
        ],
        recommendations: [
          { priority: "high", action: "Launch a second origin story blog post (Colombia or Guatemala) within 2 weeks" },
          { priority: "high", action: "Repurpose Yirgacheffe email content into a LinkedIn carousel post" },
          { priority: "medium", action: "Test Instagram Reel (roasting b-roll) vs static post for Coffee Club campaign" },
          { priority: "medium", action: "Increase email send frequency from weekly to twice-weekly during active campaigns" },
          { priority: "low", action: "Add UTM tracking to TikTok bio link to better measure conversion attribution" },
        ],
      },
      generatedAt: daysAgo(1),
    },
  ]);

  console.log("  ✓ 1 org insight (post-campaign analysis for Campaign 1)");

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n✅  Bloom Coffee Co. demo seed complete!\n");
  console.log("📊  Entities created:");
  console.log("    1 organization  — Bloom Coffee Co. (slug: bloom-coffee-demo)");
  console.log("    1 brand         — Bloom Coffee Co. with products");
  console.log("    1 user          — demo@bloomcoffee.example.com / demo1234");
  console.log("    3 personas      — Remote Workers, Coffee Enthusiasts, Local Families");
  console.log("    2 goals         — awareness + leads");
  console.log("    2 strategies");
  console.log("    2 campaigns     — Spring Bloom Awareness (completed) + Coffee Club Lead Gen (active)");
  console.log("   12 assets        — 7 channels (Campaign 1) + 5 with A/B variants (Campaign 2)");
  console.log("   12 scheduled posts (7 published, 3 published, 2 scheduled)");
  console.log(`  ${rollupRows.length} analytics rollup rows — 30 days, multi-channel`);
  console.log("   20 contacts      — 2 customer, 5 hot, 8 warm, 5 cold");
  console.log(`  ${eventRows.length} contact events   — 2–3 per contact`);
  console.log("    1 org insight   — post-campaign analysis");
  console.log("\n🔑  Demo login: demo@bloomcoffee.example.com / demo1234");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
