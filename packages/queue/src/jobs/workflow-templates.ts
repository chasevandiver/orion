/**
 * Inngest functions for pre-built workflow templates.
 *
 * Each function:
 *  1. Checks whether the triggering org has the template activated (i.e. an
 *     active workflow DB record with stepsJson[0].templateId matching).
 *  2. Creates a workflowRun record for audit/history.
 *  3. Executes the template logic.
 *  4. Marks the run completed (or failed).
 *
 * Cron-based templates (weekly digest, stale reactivation) iterate over all
 * orgs that have the template active. Event-based templates check the single
 * org from the event payload.
 */

import { inngest } from "../client.js";
import { db } from "@orion/db";
import {
  workflows,
  workflowRuns,
  contacts,
  contactEvents,
  campaigns,
  assets,
  scheduledPosts,
  notifications,
  organizations,
  channelConnections,
  users,
} from "@orion/db/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { AnalyticsAgent, CRMIntelligenceAgent } from "@orion/agents";
import { ResendClient } from "@orion/integrations";
import { decryptTokenSafe } from "@orion/db/lib/token-encryption";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the active workflow record for a given org + template.
 * Filters by stepsJson[0].templateId in JavaScript (JSONB filter).
 */
async function findActiveTemplateWorkflow(orgId: string, templateId: string) {
  const all = await db.query.workflows.findMany({
    where: and(eq(workflows.orgId, orgId), eq(workflows.status, "active")),
    columns: { id: true, stepsJson: true },
  });
  return (
    all.find((w: { id: string; stepsJson: unknown }) => {
      const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
      return steps[0]?.templateId === templateId;
    }) ?? null
  );
}

/**
 * Find all active workflow records for a given template across all orgs.
 */
async function findAllActiveTemplateWorkflows(templateId: string) {
  const all = await db.query.workflows.findMany({
    where: eq(workflows.status, "active"),
    columns: { id: true, orgId: true, stepsJson: true },
  });
  return all.filter((w: { id: string; orgId: string; stepsJson: unknown }) => {
    const steps = Array.isArray(w.stepsJson) ? (w.stepsJson as any[]) : [];
    return steps[0]?.templateId === templateId;
  });
}

/** Create a workflowRun record and return it. */
async function createRun(workflowId: string) {
  const [run] = await db
    .insert(workflowRuns)
    .values({ workflowId, status: "running", startedAt: new Date() })
    .returning();
  return run!;
}

/** Mark a run completed or failed. */
async function finalizeRun(
  runId: string,
  success: boolean,
  log: Record<string, unknown>,
) {
  await db
    .update(workflowRuns)
    .set({
      status: success ? "completed" : "failed",
      completedAt: new Date(),
      logJson: log,
    })
    .where(eq(workflowRuns.id, runId));

  // Also bump the parent workflow's runCount + lastRunAt
  const run = await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, runId),
    columns: { workflowId: true },
  });
  if (run) {
    const wf = await db.query.workflows.findFirst({
      where: eq(workflows.id, run.workflowId),
      columns: { id: true, runCount: true },
    });
    if (wf) {
      await db
        .update(workflows)
        .set({ runCount: wf.runCount + 1, lastRunAt: new Date(), updatedAt: new Date() })
        .where(eq(workflows.id, wf.id));
    }
  }
}

/** Get the org's email ResendClient if configured, otherwise null. */
async function getEmailClient(orgId: string) {
  const conn = await db.query.channelConnections.findFirst({
    where: and(
      eq(channelConnections.orgId, orgId),
      eq(channelConnections.channel, "email"),
      eq(channelConnections.isActive, true),
    ),
  });
  if (!conn) return null;
  const apiKey = decryptTokenSafe(conn.accessTokenEnc);
  if (!apiKey) return null;
  return { client: new ResendClient(orgId, apiKey), connection: conn };
}

/** Get the org owner's email (first user with role="owner"). */
async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
  const owner = await db.query.users.findFirst({
    where: and(eq(users.orgId, orgId), eq(users.role, "owner")),
    columns: { email: true },
  });
  return owner?.email ?? null;
}

/** Get all org admin/owner emails. */
async function getOrgAdminEmails(orgId: string): Promise<string[]> {
  const admins = await db.query.users.findMany({
    where: eq(users.orgId, orgId),
    columns: { email: true, role: true },
  });
  return admins
    .filter((u: { email: string; role: string }) => u.role === "owner" || u.role === "admin")
    .map((u: { email: string; role: string }) => u.email);
}

// ── Template 1: Welcome New Lead ──────────────────────────────────────────────
// Trigger: orion/crm.contact_created
// Steps:   send welcome email → wait 2 days → send product overview → score lead

export const templateWelcomeNewLead = inngest.createFunction(
  {
    id: "template-welcome-new-lead",
    name: "Template: Welcome New Lead",
    retries: 1,
  },
  { event: "orion/crm.contact_created" },
  async ({ event, step }) => {
    const { contactId, orgId } = event.data as { contactId: string; orgId: string };

    // Check template is active for this org
    const workflow = await step.run("check-template-active", () =>
      findActiveTemplateWorkflow(orgId, "welcome-new-lead"),
    );
    if (!workflow) return { skipped: true, reason: "template not active for org" };

    const run = await step.run("create-run", () => createRun(workflow.id));

    try {
      // ── Step 1: Send welcome email ──────────────────────────────────────────
      const sendWelcomeResult = await step.run("send-welcome-email", async () => {
        const contact = await db.query.contacts.findFirst({
          where: eq(contacts.id, contactId),
          columns: { id: true, email: true, name: true },
        });
        if (!contact?.email) return { sent: false, reason: "no email on contact" };

        const emailCtx = await getEmailClient(orgId);
        if (emailCtx) {
          const greeting = contact.name ? `Hi ${contact.name},` : "Hi there,";
          await emailCtx.client
            .sendToAddress({
              toEmail: contact.email,
              subject: "Welcome — glad you're here!",
              contentText: [
                greeting,
                "",
                "Thank you for joining us. We're excited to have you.",
                "",
                "Over the next couple of days we'll share a quick overview of what you can do on our platform.",
                "",
                "In the meantime, feel free to reach out if you have any questions.",
                "",
                "Welcome aboard!",
              ].join("\n"),
              fromName: "ORION Marketing",
            })
            .catch(() => {}); // non-critical — log but don't fail
        }

        // Always create an in-app notification
        await db.insert(notifications).values({
          orgId,
          type: "workflow_template",
          title: "Welcome email sent to new lead",
          body: `Sent to ${contact.email}`,
          resourceType: "contact",
          resourceId: contactId,
        });

        // Log enrollment event
        await db.insert(contactEvents).values({
          contactId,
          eventType: "email_sent",
          metadataJson: { template: "welcome-new-lead", step: 1, subject: "Welcome" },
        });

        return { sent: true, email: contact.email };
      });

      // ── Wait 2 days ─────────────────────────────────────────────────────────
      await step.sleep("wait-2-days", "2d");

      // ── Step 2: Send product overview email ─────────────────────────────────
      await step.run("send-product-overview", async () => {
        const contact = await db.query.contacts.findFirst({
          where: eq(contacts.id, contactId),
          columns: { id: true, email: true, name: true },
        });
        if (!contact?.email) return { sent: false };

        const emailCtx = await getEmailClient(orgId);
        if (emailCtx) {
          const greeting = contact.name ? `Hi ${contact.name},` : "Hi there,";
          await emailCtx.client
            .sendToAddress({
              toEmail: contact.email,
              subject: "A quick look at what ORION can do for you",
              contentText: [
                greeting,
                "",
                "Here's a quick overview of what our platform offers:",
                "",
                "• AI-powered content generation across every channel",
                "• Automated campaign scheduling and distribution",
                "• Real-time analytics and optimization recommendations",
                "• Lead scoring and CRM intelligence",
                "",
                "Log in to explore everything — and let us know if we can help!",
              ].join("\n"),
              fromName: "ORION Marketing",
            })
            .catch(() => {});
        }

        await db.insert(contactEvents).values({
          contactId,
          eventType: "email_sent",
          metadataJson: { template: "welcome-new-lead", step: 2, subject: "Product overview" },
        });

        return { sent: true };
      });

      // ── Step 3: Score lead ───────────────────────────────────────────────────
      await step.run("score-lead", async () => {
        await inngest.send({
          name: "orion/crm.score",
          data: { contactId, orgId },
        });
        return { dispatched: true };
      });

      await step.run("finalize-run", () =>
        finalizeRun(run.id, true, {
          template: "welcome-new-lead",
          contactId,
          welcomeEmailSent: sendWelcomeResult?.sent ?? false,
        }),
      );

      return { success: true, contactId };
    } catch (err) {
      await step.run("finalize-run-failed", () =>
        finalizeRun(run.id, false, {
          template: "welcome-new-lead",
          error: (err as Error).message,
        }),
      );
      throw err;
    }
  },
);

// ── Template 2: Hot Lead Alert ────────────────────────────────────────────────
// Trigger: orion/crm.lead_hot
// Steps:   notify org owner → log note on contact

export const templateHotLeadAlert = inngest.createFunction(
  {
    id: "template-hot-lead-alert",
    name: "Template: Hot Lead Alert",
    retries: 1,
  },
  { event: "orion/crm.lead_hot" },
  async ({ event, step }) => {
    const { contactId, orgId, score } = event.data as {
      contactId: string;
      orgId: string;
      score: number;
    };

    const workflow = await step.run("check-template-active", () =>
      findActiveTemplateWorkflow(orgId, "hot-lead-alert"),
    );
    if (!workflow) return { skipped: true, reason: "template not active for org" };

    const run = await step.run("create-run", () => createRun(workflow.id));

    try {
      // ── Step 1: Notify org owner ─────────────────────────────────────────────
      await step.run("notify-org-owner", async () => {
        const contact = await db.query.contacts.findFirst({
          where: eq(contacts.id, contactId),
          columns: { id: true, email: true, name: true, leadScore: true },
        });

        const contactName = contact?.name ?? contact?.email ?? contactId;
        const actualScore = contact?.leadScore ?? score;

        // In-app notification (org-level, no userId)
        await db.insert(notifications).values({
          orgId,
          type: "workflow_template",
          title: "Hot Lead Alert 🔥",
          body: `${contactName} just crossed a lead score of ${actualScore}. They're ready to buy.`,
          resourceType: "contact",
          resourceId: contactId,
        });

        // Email the org owner if Resend is configured
        const ownerEmail = await getOrgOwnerEmail(orgId);
        if (ownerEmail) {
          const emailCtx = await getEmailClient(orgId);
          if (emailCtx) {
            await emailCtx.client
              .sendToAddress({
                toEmail: ownerEmail,
                subject: `🔥 Hot Lead Alert: ${contactName} (score ${actualScore})`,
                contentText: [
                  "A lead just entered your hot zone.",
                  "",
                  `Contact: ${contactName}`,
                  `Lead Score: ${actualScore}`,
                  `Contact ID: ${contactId}`,
                  "",
                  "This contact is highly engaged and may be ready to convert. Follow up now.",
                  "",
                  "Log in to ORION to see their full profile and activity.",
                ].join("\n"),
                fromName: "ORION CRM",
              })
              .catch(() => {});
          }
        }

        return { notified: true, contactName, score: actualScore };
      });

      // ── Step 2: Log note on contact ──────────────────────────────────────────
      await step.run("log-contact-note", async () => {
        await db.insert(contactEvents).values({
          contactId,
          eventType: "note",
          metadataJson: {
            note: `Hot lead alert triggered at score ${score}. Workflow: hot-lead-alert.`,
            addedBy: "workflow-automation",
          },
        });
        return { logged: true };
      });

      await step.run("finalize-run", () =>
        finalizeRun(run.id, true, {
          template: "hot-lead-alert",
          contactId,
          score,
        }),
      );

      return { success: true, contactId, score };
    } catch (err) {
      await step.run("finalize-run-failed", () =>
        finalizeRun(run.id, false, {
          template: "hot-lead-alert",
          error: (err as Error).message,
        }),
      );
      throw err;
    }
  },
);

// ── Template 3: Weekly Performance Digest ────────────────────────────────────
// Trigger: cron every Monday 9 AM UTC
// Steps:   for each active org → run AnalyticsAgent (7 days) → send summary email

export const templateWeeklyPerformanceDigest = inngest.createFunction(
  {
    id: "template-weekly-performance-digest",
    name: "Template: Weekly Performance Digest",
    retries: 1,
  },
  { cron: "TZ=UTC 0 9 * * 1" },
  async ({ step }) => {
    const activeWorkflows = await step.run("find-active-orgs", () =>
      findAllActiveTemplateWorkflows("weekly-performance-digest"),
    );

    if (activeWorkflows.length === 0) return { skipped: true, reason: "no active orgs" };

    let processed = 0;
    let emailsSent = 0;

    for (const wf of activeWorkflows) {
      const { orgId } = wf;

      await step.run(`digest-org-${orgId.slice(0, 8)}`, async () => {
        const run = await createRun(wf.id);

        try {
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, orgId),
            columns: { id: true, name: true },
          });

          // Run Analytics Agent for last 7 days
          const agent = new AnalyticsAgent();
          const report = await agent.analyze({ orgId, compareWithPreviousPeriod: false });
          const r = report.report;

          // In-app notification
          await db.insert(notifications).values({
            orgId,
            type: "workflow_template",
            title: "Weekly Performance Digest",
            body: r.headline,
            resourceType: "org",
            resourceId: orgId,
          });

          // Send email to org owner if Resend configured
          const ownerEmail = await getOrgOwnerEmail(orgId);
          if (ownerEmail) {
            const emailCtx = await getEmailClient(orgId);
            if (emailCtx) {
              const week = new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              const contentText = [
                `Weekly Performance Digest — ${week}`,
                `${org?.name ?? "Your Org"} | ORION Marketing Intelligence`,
                "",
                `Headline: ${r.headline}`,
                "",
                `Performance Rating: ${r.performanceRating.toUpperCase()}`,
                "",
                "Key Metrics (last 7 days):",
                `  Impressions:     ${r.keyMetrics.impressions.toLocaleString()}`,
                `  Clicks:          ${r.keyMetrics.clicks.toLocaleString()}`,
                `  CTR:             ${r.keyMetrics.ctr}%`,
                `  Conversions:     ${r.keyMetrics.conversions.toLocaleString()}`,
                "",
                "Top Findings:",
                ...r.topFindings.map((f) => `  • ${f}`),
                "",
                `30-Day Outlook: ${r.forecast.thirtyDayOutlook}`,
                "",
                "View full analytics in your ORION dashboard.",
              ].join("\n");

              await emailCtx.client
                .sendToAddress({
                  toEmail: ownerEmail,
                  subject: `[ORION] Weekly Digest — ${week}`,
                  contentText,
                  fromName: "ORION Marketing Intelligence",
                })
                .catch(() => {});

              emailsSent++;
            }
          }

          await finalizeRun(run.id, true, {
            template: "weekly-performance-digest",
            orgId,
            performanceRating: r.performanceRating,
          });

          processed++;
        } catch (err) {
          await finalizeRun(run.id, false, {
            template: "weekly-performance-digest",
            orgId,
            error: (err as Error).message,
          }).catch(() => {});
        }
      });
    }

    return { processed, emailsSent, totalOrgs: activeWorkflows.length };
  },
);

// ── Template 4: Stale Campaign Reactivation ───────────────────────────────────
// Trigger: cron daily 8 AM UTC
// Steps:   find campaigns inactive 30+ days → send reactivation notification

export const templateStaleCampaignReactivation = inngest.createFunction(
  {
    id: "template-stale-campaign-reactivation",
    name: "Template: Stale Campaign Reactivation",
    retries: 1,
  },
  { cron: "TZ=UTC 0 8 * * *" },
  async ({ step }) => {
    const activeWorkflows = await step.run("find-active-orgs", () =>
      findAllActiveTemplateWorkflows("stale-campaign-reactivation"),
    );

    if (activeWorkflows.length === 0) return { skipped: true, reason: "no active orgs" };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let totalNotifications = 0;

    for (const wf of activeWorkflows) {
      const { orgId } = wf;

      await step.run(`stale-check-${orgId.slice(0, 8)}`, async () => {
        const run = await createRun(wf.id);

        try {
          // Find active campaigns not updated in 30+ days
          const staleCampaigns = await db.query.campaigns.findMany({
            where: and(
              eq(campaigns.orgId, orgId),
              eq(campaigns.status, "active"),
              lt(campaigns.updatedAt, thirtyDaysAgo),
            ),
            columns: { id: true, name: true, updatedAt: true },
            orderBy: desc(campaigns.updatedAt),
            limit: 5,
          });

          if (staleCampaigns.length === 0) {
            await finalizeRun(run.id, true, {
              template: "stale-campaign-reactivation",
              orgId,
              staleCampaigns: 0,
            });
            return { staleCampaigns: 0 };
          }

          // Topic suggestions for notification
          const topicSuggestions = [
            "a customer success story",
            "a how-to guide for your main product",
            "an industry trends roundup",
            "a behind-the-scenes look at your team",
            "a comparison of your product vs. alternatives",
          ];
          const suggestion =
            topicSuggestions[Math.floor(Math.random() * topicSuggestions.length)];

          const campaignList = staleCampaigns
            .map(
              (c: { id: string; name: string; updatedAt: Date }) =>
                `"${c.name}" (last updated ${new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
            )
            .join(", ");

          await db.insert(notifications).values({
            orgId,
            type: "workflow_template",
            title: `${staleCampaigns.length} campaign${staleCampaigns.length > 1 ? "s" : ""} need fresh content`,
            body: `${campaignList}. Consider publishing content about ${suggestion}.`,
            resourceType: "org",
            resourceId: orgId,
          });

          totalNotifications += staleCampaigns.length;

          await finalizeRun(run.id, true, {
            template: "stale-campaign-reactivation",
            orgId,
            staleCampaigns: staleCampaigns.length,
          });

          return { staleCampaigns: staleCampaigns.length };
        } catch (err) {
          await finalizeRun(run.id, false, {
            template: "stale-campaign-reactivation",
            orgId,
            error: (err as Error).message,
          }).catch(() => {});
        }
      });
    }

    return { processed: activeWorkflows.length, notifications: totalNotifications };
  },
);

// ── Template 5: Content Approval Pipeline ────────────────────────────────────
// Trigger: orion/asset.created
// Steps:   notify admins → wait for approval → auto-schedule if approved

export const templateContentApprovalPipeline = inngest.createFunction(
  {
    id: "template-content-approval-pipeline",
    name: "Template: Content Approval Pipeline",
    retries: 1,
    timeouts: { finish: "7d" }, // allow up to 7 days for approval
  },
  { event: "orion/asset.created" },
  async ({ event, step }) => {
    const { assetId, orgId } = event.data as { assetId: string; orgId: string };

    const workflow = await step.run("check-template-active", () =>
      findActiveTemplateWorkflow(orgId, "content-approval-pipeline"),
    );
    if (!workflow) return { skipped: true, reason: "template not active for org" };

    const run = await step.run("create-run", () => createRun(workflow.id));

    try {
      // ── Step 1: Notify admins ─────────────────────────────────────────────────
      await step.run("notify-admins", async () => {
        const asset = await db.query.assets.findFirst({
          where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
          columns: { id: true, channel: true, contentText: true },
        });

        if (!asset) return { skipped: true, reason: "asset not found" };

        const preview = (asset.contentText ?? "").slice(0, 120);
        const channelLabel = asset.channel ?? "content";

        // In-app notification for all org users to see
        await db.insert(notifications).values({
          orgId,
          type: "workflow_template",
          title: "New asset pending approval",
          body: `A new ${channelLabel} asset needs review: "${preview}${preview.length >= 120 ? "…" : ""}"`,
          resourceType: "asset",
          resourceId: assetId,
        });

        // Email all admins/owners if Resend is configured
        const adminEmails = await getOrgAdminEmails(orgId);
        if (adminEmails.length > 0) {
          const emailCtx = await getEmailClient(orgId);
          if (emailCtx) {
            for (const adminEmail of adminEmails) {
              await emailCtx.client
                .sendToAddress({
                  toEmail: adminEmail,
                  subject: `[ORION] New ${channelLabel} asset needs your approval`,
                  contentText: [
                    "A new content asset is waiting for your review.",
                    "",
                    `Channel: ${channelLabel}`,
                    `Asset ID: ${assetId}`,
                    "",
                    "Preview:",
                    preview || "(no preview available)",
                    "",
                    "Log in to ORION to approve or reject this asset.",
                  ].join("\n"),
                  fromName: "ORION Content Pipeline",
                })
                .catch(() => {});
            }
          }
        }

        return { notified: adminEmails.length };
      });

      // ── Step 2: Wait for approval decision (up to 7 days) ────────────────────
      const approvalEvent = await step.waitForEvent("wait-for-approval", {
        event: "orion/asset.approval_decision",
        timeout: "7d",
        match: "data.assetId",
      });

      // ── Step 3: Auto-schedule if approved ────────────────────────────────────
      if (approvalEvent?.data?.decision === "approved") {
        await step.run("auto-schedule", async () => {
          const asset = await db.query.assets.findFirst({
            where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
            columns: { id: true, channel: true, status: true },
          });

          if (!asset) return { skipped: true };

          // Don't schedule if already scheduled
          const existing = await db.query.scheduledPosts.findFirst({
            where: eq(scheduledPosts.assetId, assetId),
            columns: { id: true },
          });
          if (existing) return { skipped: true, reason: "already scheduled" };

          const channel = asset.channel ?? "linkedin";
          // Schedule in the near future (next business day at 9am)
          const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
          scheduledFor.setUTCHours(9, 0, 0, 0);

          await db.insert(scheduledPosts).values({
            orgId,
            assetId,
            channel: channel as any,
            status: "scheduled",
            scheduledFor,
          });

          await db.insert(notifications).values({
            orgId,
            type: "workflow_template",
            title: "Asset approved and scheduled",
            body: `Your ${channel} asset has been approved and scheduled for publishing.`,
            resourceType: "asset",
            resourceId: assetId,
          });

          return { scheduled: true, channel };
        });
      } else {
        // Timeout or rejected — log it
        await step.run("log-no-approval", async () => {
          const decision = approvalEvent?.data?.decision ?? "timeout";
          await db.insert(notifications).values({
            orgId,
            type: "workflow_template",
            title: `Asset approval ${decision === "timeout" ? "timed out" : "rejected"}`,
            body: `The content approval pipeline for asset ${assetId} ended with: ${decision}.`,
            resourceType: "asset",
            resourceId: assetId,
          });
          return { decision };
        });
      }

      await step.run("finalize-run", () =>
        finalizeRun(run.id, true, {
          template: "content-approval-pipeline",
          assetId,
          decision: approvalEvent?.data?.decision ?? "timeout",
        }),
      );

      return { success: true, assetId };
    } catch (err) {
      await step.run("finalize-run-failed", () =>
        finalizeRun(run.id, false, {
          template: "content-approval-pipeline",
          error: (err as Error).message,
        }),
      );
      throw err;
    }
  },
);

// ── Fire orion/crm.lead_hot when a scored contact crosses 80 ─────────────────
// This helper function is called by scoreCapturedContact. It's exported so the
// main jobs/index.ts can fire it after a contact is scored.

export const checkAndFireHotLeadEvent = inngest.createFunction(
  {
    id: "check-hot-lead-threshold",
    name: "Check Hot Lead Score Threshold",
    retries: 0,
  },
  { event: "orion/crm.contact_scored" },
  async ({ event, step }) => {
    const { contactId, orgId } = event.data as { contactId: string; orgId: string };

    const contact = await step.run("fetch-contact-score", async () =>
      db.query.contacts.findFirst({
        where: eq(contacts.id, contactId),
        columns: { id: true, leadScore: true },
      }),
    );

    if (!contact || (contact.leadScore ?? 0) < 80) {
      return { skipped: true, score: contact?.leadScore };
    }

    await step.run("fire-hot-lead-event", async () => {
      await inngest.send({
        name: "orion/crm.lead_hot",
        data: { contactId, orgId, score: contact.leadScore },
      });
    });

    return { fired: true, score: contact.leadScore };
  },
);

// ── Fire orion/asset.created when a new asset is created ─────────────────────
// This is dispatched from the assets API route after asset creation.
// The function itself just re-routes so the event can be consumed by the template.
// (No Inngest function needed — the event is fired directly via inngest.send.)
