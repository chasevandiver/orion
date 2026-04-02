/**
 * Shared PDF report builder for client-facing reports.
 * Used by both campaign-level and monthly org-level report endpoints.
 */
import PDFDocument from "pdfkit";

export interface ReportSettings {
  logoUrl?: string;
  accentColor?: string;
  sections?: string[];
  footerText?: string;
  orgName: string;
}

interface ReportInput {
  campaigns: any[];
  rollups: any[];
  fromDate: Date;
  toDate: Date;
  settings: ReportSettings;
  title: string;
}

const DEFAULT_SECTIONS = [
  "cover",
  "executive_summary",
  "key_metrics",
  "channel_breakdown",
  "top_content",
  "recommendations",
];

const CHANNEL_BENCHMARKS: Record<string, number> = {
  linkedin: 0.025,
  twitter: 0.018,
  instagram: 0.022,
  facebook: 0.015,
  email: 0.025,
  blog: 0.01,
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildClientReportPDF(input: ReportInput): Promise<Buffer> {
  const { campaigns, rollups, fromDate, toDate, settings, title } = input;

  const ACCENT = settings.accentColor || "#16a34a";
  const DARK = "#111827";
  const MUTED = "#6b7280";
  const LIGHT_BG = "#f9fafb";
  const sections = settings.sections ?? DEFAULT_SECTIONS;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Aggregate all data
    const allAssets: any[] = [];
    const allGoals: any[] = [];
    const allStrategies: any[] = [];

    for (const campaign of campaigns) {
      if (campaign.assets) allAssets.push(...campaign.assets);
      if (campaign.goal) allGoals.push(campaign.goal);
      if (campaign.strategy) allStrategies.push(campaign.strategy);
    }

    const combined = rollups.reduce(
      (acc: any, r: any) => ({
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
    const costPerLead = combined.conversions > 0 && combined.spend > 0
      ? `$${(combined.spend / combined.conversions).toFixed(2)}`
      : null;

    // ── Cover Page ────────────────────────────────────────────────────
    if (sections.includes("cover")) {
      doc.moveDown(4);

      // Accent bar at top
      doc.rect(50, 40, 512, 4).fill(ACCENT);

      if (settings.orgName) {
        doc.fillColor(MUTED).fontSize(12).font("Helvetica").text(settings.orgName.toUpperCase(), { align: "center" });
        doc.moveDown(0.5);
      }

      doc.fillColor(DARK).fontSize(26).font("Helvetica-Bold").text("Marketing Performance Report", { align: "center" });
      doc.moveDown(0.5);

      // Campaign name(s) or title
      const campaignNames = campaigns.map((c: any) => c.name).join(", ");
      if (campaigns.length === 1) {
        doc.fillColor(ACCENT).fontSize(16).font("Helvetica").text(campaignNames, { align: "center" });
      } else if (campaigns.length > 1) {
        doc.fillColor(ACCENT).fontSize(14).font("Helvetica").text(`${campaigns.length} Campaigns`, { align: "center" });
      }
      doc.moveDown(0.5);

      // Brand name
      const brandNames = [...new Set(allGoals.map((g: any) => g.brandName).filter(Boolean))];
      if (brandNames.length > 0) {
        doc.fillColor(MUTED).fontSize(11).font("Helvetica").text(brandNames.join(" · "), { align: "center" });
        doc.moveDown(0.3);
      }

      doc.fillColor(MUTED).fontSize(10).font("Helvetica")
        .text(`${fmt(fromDate)} – ${fmt(toDate)}`, { align: "center" });
      doc.moveDown(0.2);
      doc.fillColor(MUTED).fontSize(9)
        .text(`Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, { align: "center" });

      // Footer on cover
      if (settings.footerText) {
        doc.moveDown(6);
        doc.fillColor(MUTED).fontSize(8).font("Helvetica-Oblique")
          .text(settings.footerText, { align: "center" });
      }

      doc.addPage();
    }

    // ── Executive Summary ────────────────────────────────────────────
    if (sections.includes("executive_summary")) {
      pdfSection(doc, "Executive Summary", ACCENT);

      // Build a summary from strategy data
      const summaries: string[] = [];
      for (const strategy of allStrategies) {
        const sj = (strategy.contentJson ?? null) as any;
        if (sj?.executiveSummary) {
          summaries.push(String(sj.executiveSummary).slice(0, 500));
        }
      }

      if (summaries.length > 0) {
        for (const summary of summaries) {
          doc.fillColor(DARK).fontSize(10).font("Helvetica").text(summary, { lineGap: 2 });
          doc.moveDown(0.5);
        }
      } else {
        // Auto-generate summary from metrics
        const summaryLines: string[] = [];
        if (combined.impressions > 0) {
          summaryLines.push(`During the reporting period, campaigns generated ${combined.impressions.toLocaleString()} impressions and ${combined.clicks.toLocaleString()} clicks, achieving a ${ctr}% click-through rate.`);
        }
        if (combined.conversions > 0) {
          summaryLines.push(`A total of ${combined.conversions.toLocaleString()} conversions were recorded with a ${convRate}% conversion rate.`);
        }
        if (combined.spend > 0) {
          const roi = ((combined.revenue - combined.spend) / combined.spend * 100).toFixed(1);
          summaryLines.push(`With $${combined.spend.toFixed(2)} in spend and $${combined.revenue.toFixed(2)} in attributed revenue, the ROI stands at ${roi}%.`);
        }
        if (summaryLines.length === 0) {
          summaryLines.push("Campaign data is still being collected. Performance metrics will populate as the campaign generates engagement.");
        }
        doc.fillColor(DARK).fontSize(10).font("Helvetica").text(summaryLines.join(" "), { lineGap: 2 });
      }
      doc.moveDown(1);
    }

    // ── Key Metrics ──────────────────────────────────────────────────
    if (sections.includes("key_metrics")) {
      pdfSection(doc, "Key Metrics", ACCENT);

      // Metric boxes (2 columns)
      const metrics: [string, string][] = [
        ["Impressions", combined.impressions.toLocaleString()],
        ["Clicks", combined.clicks.toLocaleString()],
        ["Click-Through Rate", `${ctr}%`],
        ["Conversions", combined.conversions.toLocaleString()],
        ["Conversion Rate", `${convRate}%`],
        ["Engagements", combined.engagements.toLocaleString()],
        ["Engagement Rate", `${engRate}%`],
      ];
      if (costPerLead) {
        metrics.push(["Cost per Lead", costPerLead]);
      }
      if (combined.spend > 0) {
        metrics.push(["Total Spend", `$${combined.spend.toFixed(2)}`]);
        metrics.push(["Revenue", `$${combined.revenue.toFixed(2)}`]);
        const roi = ((combined.revenue - combined.spend) / combined.spend * 100).toFixed(1);
        metrics.push(["ROI", `${roi}%`]);
      }

      const startY = doc.y;
      const colWidth = 240;
      const rowHeight = 28;
      metrics.forEach(([label, value], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 50 + col * (colWidth + 20);
        const y = startY + row * rowHeight;

        // Alternating background for readability
        if (row % 2 === 0) {
          doc.rect(x, y - 2, colWidth, rowHeight - 2).fill(LIGHT_BG);
        }

        doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(label, x + 8, y + 4, { width: 130, lineBreak: false });
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(value, x + 140, y + 4, { width: 90, lineBreak: false, align: "right" });
      });

      doc.y = startY + Math.ceil(metrics.length / 2) * rowHeight + 10;
      doc.moveDown(0.8);
    }

    // ── Channel Breakdown ────────────────────────────────────────────
    if (sections.includes("channel_breakdown")) {
      const channelMap = new Map<string, { impressions: number; clicks: number; conversions: number; engagements: number; spend: number }>();
      for (const r of rollups) {
        const ch = r.channel ?? "unknown";
        const prev = channelMap.get(ch) ?? { impressions: 0, clicks: 0, conversions: 0, engagements: 0, spend: 0 };
        channelMap.set(ch, {
          impressions: prev.impressions + r.impressions,
          clicks: prev.clicks + r.clicks,
          conversions: prev.conversions + r.conversions,
          engagements: prev.engagements + r.engagements,
          spend: prev.spend + r.spend,
        });
      }

      if (channelMap.size > 0) {
        // Check if we need a new page
        if (doc.y > 580) doc.addPage();

        pdfSection(doc, "Per-Channel Breakdown", ACCENT);

        // Table header
        const headerY = doc.y;
        doc.rect(50, headerY - 2, 512, 18).fill(ACCENT);
        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
        doc.text("Channel", 58, headerY + 2, { width: 90, lineBreak: false });
        doc.text("Impressions", 150, headerY + 2, { width: 70, lineBreak: false, align: "right" });
        doc.text("Clicks", 225, headerY + 2, { width: 55, lineBreak: false, align: "right" });
        doc.text("CTR", 285, headerY + 2, { width: 45, lineBreak: false, align: "right" });
        doc.text("Conversions", 335, headerY + 2, { width: 70, lineBreak: false, align: "right" });
        doc.text("Benchmark", 420, headerY + 2, { width: 70, lineBreak: false, align: "right" });
        doc.text("Status", 495, headerY + 2, { width: 60, lineBreak: false, align: "right" });
        doc.y = headerY + 20;

        let rowIdx = 0;
        for (const [ch, data] of channelMap.entries()) {
          const y = doc.y;
          const chCtr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
          const benchmark = (CHANNEL_BENCHMARKS[ch] ?? 0.02) * 100;
          const status = chCtr >= benchmark * 1.1 ? "Above" : chCtr >= benchmark * 0.8 ? "On Track" : "Below";
          const statusColor = status === "Above" ? "#16a34a" : status === "On Track" ? "#ca8a04" : "#dc2626";

          if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 512, 18).fill(LIGHT_BG);
          }

          doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
            .text(ch.charAt(0).toUpperCase() + ch.slice(1), 58, y + 2, { width: 90, lineBreak: false });
          doc.fillColor(DARK).fontSize(9).font("Helvetica");
          doc.text(data.impressions.toLocaleString(), 150, y + 2, { width: 70, lineBreak: false, align: "right" });
          doc.text(data.clicks.toLocaleString(), 225, y + 2, { width: 55, lineBreak: false, align: "right" });
          doc.text(`${chCtr.toFixed(2)}%`, 285, y + 2, { width: 45, lineBreak: false, align: "right" });
          doc.text(data.conversions.toLocaleString(), 335, y + 2, { width: 70, lineBreak: false, align: "right" });
          doc.text(`${benchmark.toFixed(1)}%`, 420, y + 2, { width: 70, lineBreak: false, align: "right" });
          doc.fillColor(statusColor).font("Helvetica-Bold")
            .text(status, 495, y + 2, { width: 60, lineBreak: false, align: "right" });

          doc.y = y + 20;
          rowIdx++;
        }
        doc.moveDown(0.8);
      }
    }

    // ── Top Performing Content ───────────────────────────────────────
    if (sections.includes("top_content") && allAssets.length > 0) {
      if (doc.y > 550) doc.addPage();

      pdfSection(doc, "Top Performing Content", ACCENT);

      const topAssets = allAssets
        .filter((a: any) => ["approved", "published"].includes(a.status))
        .slice(0, 5);
      const preview = topAssets.length > 0 ? topAssets : allAssets.slice(0, 3);

      preview.forEach((a: any, i: number) => {
        if (doc.y > 680) doc.addPage();

        const label = `${i + 1}. ${a.channel.charAt(0).toUpperCase() + a.channel.slice(1)}${a.variant ? ` (Variant ${a.variant.toUpperCase()})` : ""}  [${a.status}]`;
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(label);
        doc.moveDown(0.15);
        doc.fillColor(MUTED).fontSize(9).font("Helvetica")
          .text(String(a.contentText ?? "").slice(0, 350) + (String(a.contentText ?? "").length > 350 ? "..." : ""), { lineGap: 1 });
        doc.moveDown(0.6);
      });
      doc.moveDown(0.5);
    }

    // ── Recommendations ──────────────────────────────────────────────
    if (sections.includes("recommendations")) {
      if (doc.y > 600) doc.addPage();

      pdfSection(doc, "Recommendations for Next Period", ACCENT);

      const nextSteps: string[] = [];
      if (rollups.length === 0) {
        nextSteps.push("Launch the campaign to begin capturing real performance data.");
        nextSteps.push("Connect social accounts in Settings to enable automated publishing.");
      } else {
        const ctrNum = parseFloat(ctr);
        if (ctrNum < 1.5) {
          nextSteps.push("CTR is below average — A/B test headlines and CTAs to improve click-through rates.");
        } else if (ctrNum > 3.5) {
          nextSteps.push("Excellent CTR — scale budget on top-performing channels.");
        }

        const channelMap = new Map<string, number>();
        for (const r of rollups) {
          const ch = r.channel ?? "unknown";
          channelMap.set(ch, (channelMap.get(ch) ?? 0) + r.clicks);
        }
        if (channelMap.size > 1) {
          const topCh = [...channelMap.entries()].sort((a, b) => b[1] - a[1])[0];
          if (topCh) {
            nextSteps.push(`${topCh[0].charAt(0).toUpperCase() + topCh[0].slice(1)} drives the most clicks — prioritize this channel next quarter.`);
          }
        }

        const approvedCount = allAssets.filter((a: any) => a.status === "approved").length;
        const approvedRatio = allAssets.length > 0 ? approvedCount / allAssets.length : 0;
        if (approvedRatio < 0.6) {
          nextSteps.push(`Only ${Math.round(approvedRatio * 100)}% of assets are approved — review pending content to maximize reach.`);
        }

        if (combined.spend > 0 && costPerLead) {
          nextSteps.push(`Current cost per lead is ${costPerLead}. Consider reallocating budget to highest-performing channels to reduce acquisition costs.`);
        }

        nextSteps.push("Run AI Optimization on the Analytics page for deeper AI-generated insights.");
      }

      nextSteps.forEach((s) => {
        doc.fillColor(DARK).fontSize(10).font("Helvetica").text(`  •  ${s}`, { lineGap: 1 });
        doc.moveDown(0.35);
      });
    }

    // ── Footer on last page ──────────────────────────────────────────
    if (settings.footerText) {
      doc.moveDown(2);
      doc.strokeColor("#e5e7eb").lineWidth(0.5).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.4);
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Oblique")
        .text(settings.footerText, { align: "center" });
    }

    doc.end();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pdfSection(doc: any, title: string, color: string) {
  doc.fillColor(color).fontSize(13).font("Helvetica-Bold").text(title);
  const y = doc.y + 2;
  doc.strokeColor(color).lineWidth(0.5).moveTo(50, y).lineTo(562, y).stroke();
  doc.moveDown(0.7);
}
