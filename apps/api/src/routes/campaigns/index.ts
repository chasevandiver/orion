import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { campaigns, assets, scheduledPosts, assetVersions, goals, analyticsRollups, organizations } from "@orion/db/schema";
import { eq, and, desc, count, inArray, gte, lt } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { DistributionAgent } from "@orion/agents";
import { getOrgQuota } from "../../lib/usage.js";
import PDFDocument from "pdfkit";
import { buildClientReportPDF, type ReportSettings } from "../../lib/pdf-report.js";

export const campaignsRouter = Router();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goalId: z.string().uuid().optional(),
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
  actualSpend: z.number().min(0).optional(),
  spendByChannel: z.record(z.string(), z.number().min(0)).optional(),
});

// GET /campaigns — list campaigns for the org
campaignsRouter.get("/", async (req, res, next) => {
  try {
    const { status, goalId } = req.query;

    const results = await db.query.campaigns.findMany({
      where: and(
        eq(campaigns.orgId, req.user.orgId),
        status ? eq(campaigns.status, status as string) : undefined,
        goalId ? eq(campaigns.goalId, goalId as string) : undefined,
      ),
      orderBy: desc(campaigns.createdAt),
      with: {
        goal: { columns: { id: true, type: true, brandName: true } },
        assets: { columns: { id: true, channel: true, type: true, status: true } },
      },
      limit: 50,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns — create a new campaign
campaignsRouter.post("/", async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        orgId: req.user.orgId,
        name: body.name,
        description: body.description,
        goalId: body.goalId,
        strategyId: body.strategyId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        budget: body.budget,
        status: "draft",
      })
      .returning();

    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id/assets — list assets with version counts
campaignsRouter.get("/:id/assets", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const assetList = await db.query.assets.findMany({
      where: and(eq(assets.campaignId, campaign.id), eq(assets.orgId, req.user.orgId)),
      orderBy: desc(assets.createdAt),
    });

    let countMap = new Map<string, number>();
    if (assetList.length > 0) {
      const versionCounts = await db
        .select({ assetId: assetVersions.assetId, cnt: count() })
        .from(assetVersions)
        .where(inArray(assetVersions.assetId, assetList.map((a) => a.id)))
        .groupBy(assetVersions.assetId);
      countMap = new Map(versionCounts.map((r) => [r.assetId, Number(r.cnt)]));
    }

    res.json({ data: assetList.map((a) => ({ ...a, _versionCount: countMap.get(a.id) ?? 0 })) });
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id — get a campaign with its strategy, assets, and analytics
campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: {
        goal: true,
        strategy: true,
        assets: { orderBy: (a: any, { desc: d }: any) => [d(a.createdAt)] },
      },
    });

    if (!campaign) throw new AppError(404, "Campaign not found");
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// PATCH /campaigns/:id — update campaign fields or status
campaignsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateCampaignSchema.parse(req.body);

    const [updated] = await db
      .update(campaigns)
      .set({
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Campaign not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns/:id/launch — approve assets, confirm scheduled posts, activate campaign
campaignsRouter.post("/:id/launch", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const { approvedAssetIds } = z.object({
      approvedAssetIds: z.array(z.string().uuid()).optional().default([]),
    }).parse(req.body);

    const campaignAssets = await db.query.assets.findMany({
      where: and(eq(assets.campaignId, campaign.id), eq(assets.orgId, req.user.orgId)),
    });

    // If no approved IDs passed, use all approved assets in campaign
    const assetIds = approvedAssetIds.length > 0
      ? approvedAssetIds
      : campaignAssets.filter((a: any) => a.status === "approved").map((a: any) => a.id);

    if (assetIds.length === 0) {
      throw new AppError(409, "No approved assets. Please review and approve content before launching.");
    }

    // Check monthly post quota before creating scheduled posts
    const quota = await getOrgQuota(req.user.orgId);
    if (quota.postsRemaining <= 0) {
      return res.status(402).json({
        error: "Monthly post limit reached",
        upgradeUrl: "/billing",
      });
    }

    let launched = 0;
    let failed = 0;
    const createdPosts: any[] = [];

    const agent = new DistributionAgent();

    for (const assetId of assetIds) {
      const asset = campaignAssets.find((a: any) => a.id === assetId);
      if (!asset) continue;

      try {
        // Run pre-flight check (deterministic, no AI call)
        const preflight = await agent.preflight(asset.channel, asset.contentText);

        if (!preflight.passed) {
          console.warn(`[launch] Pre-flight issues for asset ${assetId}: ${preflight.issues.map((i) => i.message).join(", ")}`);
          // Continue anyway — let user decide at distribution stage
        }

        // Check if a scheduled post already exists from pipeline auto-scheduling
        const existing = await db.query.scheduledPosts.findFirst({
          where: eq(scheduledPosts.assetId, assetId),
        });

        if (existing) {
          createdPosts.push(existing);
          launched++;
        } else {
          // Compute optimal send time and create new scheduled post
          const scheduledFor = computeOptimalSendTime(asset.channel, new Date());
          const [sp] = await db
            .insert(scheduledPosts)
            .values({
              orgId: req.user.orgId,
              assetId,
              channel: asset.channel,
              scheduledFor,
              status: "scheduled",
            })
            .returning();
          if (sp) { createdPosts.push(sp); launched++; }
        }
      } catch (err) {
        console.error(`[launch] Failed for asset ${assetId}:`, (err as Error).message);
        failed++;
      }
    }

    // Activate campaign
    await db
      .update(campaigns)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    res.json({ data: { launched, failed, scheduledPosts: createdPosts } });
  } catch (err) {
    next(err);
  }
});

function computeOptimalSendTime(channel: string, from: Date): Date {
  const d = new Date(from);
  switch (channel) {
    case "linkedin":
    case "email":
      return nextWeekday(d, [2, 3, 4], 9);
    case "instagram":
      return nextWeekday(d, [0, 6], 18);
    case "twitter":
      return nextWeekday(d, [1, 2, 3, 4, 5], 12);
    case "facebook":
      return nextWeekday(d, [1, 2, 3, 4, 5], 12);
    case "tiktok":
      return nextWeekday(d, [1, 2, 3, 4, 5], 19);
    case "blog":
      return nextWeekday(d, [1, 2], 10);
    default:
      return nextWeekday(d, [1, 2, 3, 4, 5], 9);
  }
}

function nextWeekday(from: Date, weekdays: number[], hour: number): Date {
  const d = new Date(from);
  d.setUTCHours(hour, 0, 0, 0);
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (weekdays.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// POST /campaigns/:id/duplicate — create a new goal pre-filled from this campaign's goal + strategy
campaignsRouter.post("/:id/duplicate", async (req, res, next) => {
  try {
    const { description, channels } = z.object({
      description: z.string().min(1).max(500),
      channels: z.array(z.string()).max(7).optional(),
    }).parse(req.body);

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: { goal: true, strategy: true },
    });
    if (!campaign) throw new AppError(404, "Campaign not found");
    if (!campaign.goal) throw new AppError(400, "Campaign has no goal to duplicate");

    const strategyChannels = campaign.strategy?.channels as string[] | null | undefined;
    const resolvedChannels = channels ?? strategyChannels ?? undefined;

    const [newGoal] = await db
      .insert(goals)
      .values({
        orgId: req.user.orgId,
        userId: req.user.id,
        type: campaign.goal.type,
        brandName: campaign.goal.brandName,
        brandDescription: description,
        targetAudience: campaign.goal.targetAudience ?? undefined,
        timeline: campaign.goal.timeline,
        budget: campaign.goal.budget ?? undefined,
        status: "active",
      })
      .returning();

    res.status(201).json({ data: { goalId: newGoal!.id, channels: resolvedChannels ?? [] } });
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id/client-report — generate a polished branded PDF report
campaignsRouter.get("/:id/client-report", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to as string) : new Date();

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: {
        goal: true,
        strategy: true,
        assets: { orderBy: (a: any, { desc: d }: any) => [d(a.createdAt)] },
      },
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, req.user.orgId),
    });

    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        eq(analyticsRollups.campaignId, campaign.id),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
      ),
    });

    const reportSettings: ReportSettings = {
      logoUrl: org?.reportLogoUrl || org?.logoUrl || undefined,
      accentColor: org?.reportAccentColor || org?.brandPrimaryColor || undefined,
      sections: (org?.reportSections as string[] | null) ?? undefined,
      footerText: org?.reportFooterText || undefined,
      orgName: org?.name ?? "",
    };

    const pdfBuffer = await buildClientReportPDF({
      campaigns: [campaign],
      rollups,
      fromDate,
      toDate,
      settings: reportSettings,
      title: `${campaign.name} — Marketing Performance Report`,
    });
    const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="client-report-${slug}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id/report — generate a PDF performance report (legacy)
campaignsRouter.get("/:id/report", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to as string) : new Date();

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: {
        goal: true,
        strategy: true,
        assets: { orderBy: (a: any, { desc: d }: any) => [d(a.createdAt)] },
      },
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const rollups = await db.query.analyticsRollups.findMany({
      where: and(
        eq(analyticsRollups.orgId, req.user.orgId),
        eq(analyticsRollups.campaignId, campaign.id),
        gte(analyticsRollups.date, fromDate),
        lt(analyticsRollups.date, toDate),
      ),
    });

    const pdfBuffer = await buildCampaignPDF(campaign, rollups, fromDate, toDate);
    const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report-${slug}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id/strategy/export — download strategy as Markdown
campaignsRouter.get("/:id/strategy/export", async (req, res, next) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)),
      with: { strategy: true },
    });
    if (!campaign) throw new AppError(404, "Campaign not found");
    if (!campaign.strategy) throw new AppError(404, "No strategy found for this campaign");

    const s = campaign.strategy;
    let md = `# ${campaign.name} — Marketing Strategy\n\n`;

    const sj = (s.contentJson ?? null) as any;
    if (sj && typeof sj === "object") {
      if (sj.executiveSummary) md += `## Executive Summary\n\n${sj.executiveSummary}\n\n`;
      if (sj.audiences?.length) {
        md += `## Target Audiences\n\n`;
        for (const a of sj.audiences) {
          md += `### ${a.name}\n${a.description ?? ""}\n`;
          if (a.painPoint) md += `- Pain Point: ${a.painPoint}\n`;
          md += "\n";
        }
      }
      if (sj.keyMessagesByChannel) {
        md += `## Key Messages by Channel\n\n`;
        for (const [ch, msg] of Object.entries(sj.keyMessagesByChannel)) {
          md += `### ${ch.charAt(0).toUpperCase() + ch.slice(1)}\n${msg}\n\n`;
        }
      }
      if (sj.kpis && Object.keys(sj.kpis).length) {
        md += `## KPI Targets\n\n`;
        for (const [k, v] of Object.entries(sj.kpis)) md += `- **${k}**: ${v}\n`;
        md += "\n";
      }
      if (sj.messagingThemes?.length) {
        md += `## Messaging Themes\n\n`;
        for (const t of sj.messagingThemes) md += `- ${t}\n`;
        md += "\n";
      }
      if (sj.thirtyDayPlan?.length) {
        md += `## 30-Day Plan\n\n`;
        sj.thirtyDayPlan.forEach((item: any, i: number) => {
          if (typeof item === "string") {
            md += `${i + 1}. ${item}\n`;
          } else {
            md += `${i + 1}. **${item.week ?? `Week ${i + 1}`}**: ${item.focus ?? ""}\n`;
            if (item.actions?.length) for (const a of item.actions) md += `   - ${a}\n`;
          }
        });
        md += "\n";
      }
      if (sj.budgetAllocation && Object.keys(sj.budgetAllocation).length) {
        md += `## Budget Allocation\n\n`;
        for (const [k, v] of Object.entries(sj.budgetAllocation)) md += `- **${k}**: ${v}\n`;
        md += "\n";
      }
    } else {
      md += s.contentText ?? "*No strategy content available.*\n";
    }

    const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="strategy-${slug}.md"`);
    res.send(md);
  } catch (err) {
    next(err);
  }
});

// DELETE /campaigns/:id — soft-delete by archiving
campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(campaigns)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(campaigns.id, req.params.id!), eq(campaigns.orgId, req.user.orgId)))
      .returning({ id: campaigns.id });

    if (!updated) throw new AppError(404, "Campaign not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── PDF report builder ────────────────────────────────────────────────────────

function buildCampaignPDF(
  campaign: any,
  rollups: any[],
  fromDate: Date,
  toDate: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const GREEN = "#16a34a";
    const DARK = "#111827";
    const MUTED = "#6b7280";

    // ── Cover ──────────────────────────────────────────────────────────
    doc.fillColor(DARK).fontSize(24).font("Helvetica-Bold").text("Campaign Report", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor(GREEN).fontSize(16).text(campaign.name, { align: "center" });
    doc.moveDown(0.3);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    doc.fillColor(MUTED).fontSize(10).font("Helvetica")
      .text(`${fmt(fromDate)} – ${fmt(toDate)}`, { align: "center" });
    doc.moveDown(0.2);
    doc.fillColor(MUTED).fontSize(9)
      .text(`Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, { align: "center" });
    doc.moveDown(1);
    doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // ── Campaign Overview ──────────────────────────────────────────────
    pdfSection(doc, "Campaign Overview", GREEN);
    const { goal, strategy, assets: campaignAssets } = campaign;
    const allAssets = (campaignAssets ?? []) as any[];
    const approvedCount = allAssets.filter((a: any) => a.status === "approved").length;
    [
      ["Brand", goal?.brandName ?? "—"],
      ["Goal Type", goal?.type?.replace(/_/g, " ") ?? "—"],
      ["Timeline", goal?.timeline?.replace(/_/g, " ") ?? "—"],
      ["Status", campaign.status],
      ["Total Assets", String(allAssets.length)],
      ["Approved Assets", String(approvedCount)],
      ...(campaign.budget ? [["Budget", `$${Number(campaign.budget).toLocaleString()}`]] : []),
    ].forEach(([l, v]) => pdfRow(doc, l, v, DARK, MUTED));
    doc.moveDown(0.8);

    // ── Strategy Summary ───────────────────────────────────────────────
    if (strategy) {
      pdfSection(doc, "Strategy Summary", GREEN);
      const sj = (strategy.contentJson ?? null) as any;
      if (sj?.executiveSummary) {
        doc.fillColor(DARK).fontSize(10).font("Helvetica")
          .text(String(sj.executiveSummary).slice(0, 700), { lineGap: 2 });
        doc.moveDown(0.6);
      }
      if (sj?.messagingThemes?.length) {
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text("Messaging Themes");
        doc.moveDown(0.2);
        doc.fillColor(MUTED).fontSize(10).font("Helvetica")
          .text(sj.messagingThemes.slice(0, 6).join(" · "));
        doc.moveDown(0.6);
      }
      if (sj?.kpis && Object.keys(sj.kpis).length) {
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text("KPI Targets");
        doc.moveDown(0.2);
        Object.entries(sj.kpis).slice(0, 5).forEach(([k, v]) => pdfRow(doc, k, String(v), DARK, MUTED));
        doc.moveDown(0.6);
      }
    }

    // ── Performance Metrics ────────────────────────────────────────────
    pdfSection(doc, "Performance Metrics", GREEN);
    const combined = rollups.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        conversions: acc.conversions + r.conversions,
        engagements: acc.engagements + r.engagements,
        spend: acc.spend + r.spend,
        revenue: acc.revenue + r.revenue,
      }),
      { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0, revenue: 0 },
    );
    const ctr = combined.impressions > 0 ? ((combined.clicks / combined.impressions) * 100).toFixed(2) : "0.00";
    const convRate = combined.clicks > 0 ? ((combined.conversions / combined.clicks) * 100).toFixed(2) : "0.00";
    const engRate = combined.impressions > 0 ? ((combined.engagements / combined.impressions) * 100).toFixed(2) : "0.00";
    const metricRows: [string, string][] = [
      ["Impressions", combined.impressions.toLocaleString()],
      ["Clicks", combined.clicks.toLocaleString()],
      ["Click-Through Rate (CTR)", `${ctr}%`],
      ["Conversions", combined.conversions.toLocaleString()],
      ["Conversion Rate", `${convRate}%`],
      ["Engagements", combined.engagements.toLocaleString()],
      ["Engagement Rate", `${engRate}%`],
    ];
    if (combined.spend > 0) {
      metricRows.push(["Spend", `$${combined.spend.toFixed(2)}`]);
      metricRows.push(["Revenue", `$${combined.revenue.toFixed(2)}`]);
      metricRows.push(["ROI", `${(((combined.revenue - combined.spend) / combined.spend) * 100).toFixed(1)}%`]);
    }
    metricRows.forEach(([l, v]) => pdfRow(doc, l, v, DARK, MUTED));
    doc.moveDown(0.8);

    // ── Per-Channel Breakdown ──────────────────────────────────────────
    const channelMap = new Map<string, { impressions: number; clicks: number; conversions: number }>();
    for (const r of rollups) {
      const ch = r.channel ?? "unknown";
      const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0 };
      channelMap.set(ch, {
        impressions: prev.impressions + r.impressions,
        clicks: prev.clicks + r.clicks,
        conversions: prev.conversions + r.conversions,
      });
    }
    if (channelMap.size > 0) {
      pdfSection(doc, "Channel Breakdown", GREEN);
      for (const [ch, data] of channelMap.entries()) {
        const chCtr = data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) : "0.00";
        doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold")
          .text(ch.charAt(0).toUpperCase() + ch.slice(1));
        doc.moveDown(0.1);
        pdfRow(doc, "  Impressions", data.impressions.toLocaleString(), DARK, MUTED);
        pdfRow(doc, "  Clicks", data.clicks.toLocaleString(), DARK, MUTED);
        pdfRow(doc, "  CTR", `${chCtr}%`, DARK, MUTED);
        doc.moveDown(0.4);
      }
    }

    // ── Content Previews ──────────────────────────────────────────────
    if (allAssets.length > 0) {
      pdfSection(doc, "Content Previews", GREEN);
      const topAssets = allAssets.filter((a: any) => ["approved", "published"].includes(a.status)).slice(0, 5);
      const preview = topAssets.length > 0 ? topAssets : allAssets.slice(0, 3);
      preview.forEach((a: any, i: number) => {
        const label = `${i + 1}. ${a.channel.charAt(0).toUpperCase() + a.channel.slice(1)}${a.variant ? ` (Variant ${a.variant.toUpperCase()})` : ""}  [${a.status}]`;
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(label);
        doc.fillColor(MUTED).fontSize(9).font("Helvetica")
          .text(String(a.contentText ?? "").slice(0, 350) + (String(a.contentText ?? "").length > 350 ? "…" : ""), { lineGap: 1 });
        doc.moveDown(0.6);
      });
    }

    // ── Next Steps ────────────────────────────────────────────────────
    pdfSection(doc, "Next Steps & Recommendations", GREEN);
    const nextSteps: string[] = [];
    if (rollups.length === 0) {
      nextSteps.push("Launch the campaign to begin capturing real performance data.");
      nextSteps.push("Connect social accounts in Settings to enable automated publishing.");
    } else {
      const ctrNum = parseFloat(ctr);
      if (ctrNum < 1.5) nextSteps.push("CTR is below average — A/B test headlines and CTAs to improve click-through rates.");
      else if (ctrNum > 3.5) nextSteps.push("Excellent CTR — scale budget on top-performing channels.");
      if (channelMap.size > 1) {
        const topCh = [...channelMap.entries()].sort((a, b) => b[1].clicks - a[1].clicks)[0];
        if (topCh) nextSteps.push(`${topCh[0].charAt(0).toUpperCase() + topCh[0].slice(1)} drives the most clicks — prioritize this channel next quarter.`);
      }
      const approvedRatio = allAssets.length > 0 ? approvedCount / allAssets.length : 0;
      if (approvedRatio < 0.6) nextSteps.push(`Only ${Math.round(approvedRatio * 100)}% of assets are approved — review pending content to maximize reach.`);
      nextSteps.push("Run AI Optimization on the Analytics page for deeper AI-generated insights.");
      nextSteps.push("Duplicate this campaign to build on its learnings for the next launch.");
    }
    nextSteps.forEach((s) => {
      doc.fillColor(DARK).fontSize(10).font("Helvetica").text(`• ${s}`, { lineGap: 1 });
      doc.moveDown(0.35);
    });

    doc.end();
  });
}

function pdfSection(doc: any, title: string, color: string) {
  doc.fillColor(color).fontSize(13).font("Helvetica-Bold").text(title);
  const y = doc.y + 2;
  doc.strokeColor(color).lineWidth(0.5).moveTo(50, y).lineTo(562, y).stroke();
  doc.moveDown(0.7);
}

function pdfRow(doc: any, label: string, value: string, dark: string, muted: string) {
  const y = doc.y;
  doc.fillColor(muted).fontSize(9.5).font("Helvetica").text(label, 50, y, { width: 200, lineBreak: false });
  doc.fillColor(dark).fontSize(9.5).font("Helvetica-Bold").text(value, 260, y, { width: 300, lineBreak: false });
  doc.moveDown(0.38);
}
