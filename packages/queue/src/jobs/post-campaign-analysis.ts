/**
 * Post-Campaign Analysis Job — triggered after a campaign completes.
 *
 * Runs the AnalyticsAgent over the campaign's full data window, stores
 * the report as an org_insight, and sends a digest notification.
 *
 * Also runs as a monthly cron to generate cross-campaign performance
 * digests and send email summaries via Resend.
 */
import { inngest } from "../client.js";
import { db } from "@orion/db";
import {
  campaigns,
  orgInsights,
  notifications,
  organizations,
  channelConnections,
} from "@orion/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { AnalyticsAgent } from "@orion/agents";
import { ResendClient } from "@orion/integrations";
import { decryptTokenSafe } from "@orion/db/lib/token-encryption";

// ── Post-Campaign Analysis ─────────────────────────────────────────────────────

export const runPostCampaignAnalysis = inngest.createFunction(
  {
    id: "run-post-campaign-analysis",
    name: "Post-Campaign Analysis",
    retries: 2,
  },
  { event: "orion/campaign.completed" },
  async ({ event, step }) => {
    const { campaignId, orgId } = event.data as { campaignId: string; orgId: string };

    const campaign = await step.run("fetch-campaign", async () =>
      db.query.campaigns.findFirst({
        where: and(
          eq(campaigns.id, campaignId),
          eq(campaigns.orgId, orgId),
        ),
        with: {
          goal: { columns: { type: true, brandName: true, createdAt: true } },
        },
      }),
    );

    if (!campaign) return { skipped: true, reason: "campaign not found" };

    const report = await step.run("run-analytics-agent", async () => {
      const agent = new AnalyticsAgent();
      return agent.analyze({
        orgId,
        campaignId,
        compareWithPreviousPeriod: true,
      });
    });

    const [insight] = await step.run("save-insight", async () =>
      db
        .insert(orgInsights)
        .values({
          orgId,
          campaignId,
          insightType: "post_campaign",
          title: `Campaign Report: ${campaign.name}`,
          summary: report.report.headline,
          dataJson: {
            report: report.report,
            campaignName: campaign.name,
            tokensUsed: report.tokensUsed,
          },
        })
        .returning(),
    );

    // Create in-app notification
    await step.run("notify", async () => {
      try {
        await db.insert(notifications).values({
          orgId,
          type: "info",
          title: "Campaign Analysis Ready",
          body: report.report.headline,
          resourceType: "campaign",
          resourceId: campaignId,
        });
      } catch { /* non-critical */ }
    });

    return { insightId: insight?.id, performanceRating: report.report.performanceRating };
  },
);

// ── Monthly Performance Digest ─────────────────────────────────────────────────

export const sendMonthlyDigest = inngest.createFunction(
  {
    id: "send-monthly-digest",
    name: "Monthly Performance Digest",
    retries: 1,
  },
  { cron: "0 9 1 * *" }, // 9 AM on the 1st of every month
  async ({ step }) => {
    // Fetch all orgs that have had any campaign activity this past month
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activeOrgs = await step.run("fetch-active-orgs", async () =>
      db.query.campaigns.findMany({
        where: gte(campaigns.createdAt, thirtyDaysAgo),
        columns: { orgId: true },
      }).then((rows) => [...new Set(rows.map((r) => r.orgId))]),
    );

    if (activeOrgs.length === 0) return { sent: 0 };

    const period = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7); // "YYYY-MM"

    let sent = 0;

    for (const orgId of activeOrgs.slice(0, 50)) {
      await step.run(`digest-${orgId.slice(0, 8)}`, async () => {
        try {
          // Skip if digest already generated this month
          const existing = await db.query.orgInsights.findFirst({
            where: and(
              eq(orgInsights.orgId, orgId),
              eq(orgInsights.insightType, "monthly_digest"),
              eq(orgInsights.period, period),
            ),
          });
          if (existing) return { skipped: true };

          // Run analytics for the last 30 days
          const agent = new AnalyticsAgent();
          const report = await agent.analyze({ orgId, compareWithPreviousPeriod: true });

          // Store as org insight
          await db.insert(orgInsights).values({
            orgId,
            insightType: "monthly_digest",
            title: `Monthly Performance Digest — ${period}`,
            summary: report.report.headline,
            dataJson: { report: report.report, tokensUsed: report.tokensUsed },
            period,
          });

          // Send digest email if org has email connection
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, orgId),
            columns: { name: true },
          });

          const emailConnection = await db.query.channelConnections.findFirst({
            where: and(
              eq(channelConnections.orgId, orgId),
              eq(channelConnections.channel, "email"),
              eq(channelConnections.isActive, true),
            ),
          });

          if (emailConnection) {
            const apiKey = decryptTokenSafe(emailConnection.accessTokenEnc);
            if (apiKey) {
              const emailClient = new ResendClient(orgId, apiKey);
              const { report: r } = report;

              const contentText = [
                `Monthly Marketing Performance — ${period}`,
                ``,
                `Headline: ${r.headline}`,
                ``,
                `Performance Rating: ${r.performanceRating.toUpperCase()}`,
                ``,
                `Key Metrics:`,
                `  Impressions: ${r.keyMetrics.impressions.toLocaleString()}`,
                `  Clicks: ${r.keyMetrics.clicks.toLocaleString()}`,
                `  CTR: ${r.keyMetrics.ctr}%`,
                `  Conversions: ${r.keyMetrics.conversions.toLocaleString()}`,
                `  Conversion Rate: ${r.keyMetrics.conversionRate}%`,
                ``,
                `Top Findings:`,
                ...r.topFindings.map((f) => `  • ${f}`),
                ``,
                `Next Month Outlook: ${r.forecast.thirtyDayOutlook}`,
                ``,
                `View full report in your ORION dashboard.`,
              ].join("\n");

              await emailClient.publish({
                subject: `[ORION] ${org?.name ?? "Your"} Monthly Marketing Report — ${period}`,
                contentText,
                listId: emailConnection.accountId ?? undefined,
                fromName: "ORION Marketing Intelligence",
              });

              sent++;
            }
          }
        } catch (err) {
          console.error(`[monthlyDigest] Failed for org ${orgId}:`, (err as Error).message);
        }
      });
    }

    return { processed: activeOrgs.length, emailsSent: sent };
  },
);
