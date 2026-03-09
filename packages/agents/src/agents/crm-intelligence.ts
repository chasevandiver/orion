/**
 * CRMIntelligenceAgent — AI-powered lead scoring, contact enrichment,
 * and relationship insights for the ORION CRM.
 *
 * Uses structured JSON output from Claude to produce deterministic,
 * schema-validated results. Conversation history is preserved for
 * multi-turn enrichment refinement.
 */
import { BaseAgent } from "./base.js";
import { db } from "@orion/db";
import { contacts, contactEvents } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

// ── Output schemas ────────────────────────────────────────────────────────────

export const LeadScoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["cold", "warm", "hot", "customer"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  signals: z.array(z.string()),
  recommendedAction: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
});

export const EnrichmentResultSchema = z.object({
  inferredTitle: z.string().optional(),
  inferredCompanySize: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]).optional(),
  inferredIndustry: z.string().optional(),
  buyingIntent: z.enum(["researching", "evaluating", "ready_to_buy", "not_in_market"]).optional(),
  personalityType: z.enum(["analytical", "driver", "expressive", "amiable"]).optional(),
  bestContactTime: z.string().optional(),
  tags: z.array(z.string()),
  notes: z.string(),
});

export const InsightResultSchema = z.object({
  summary: z.string(),
  keyInsights: z.array(z.string()),
  riskFlags: z.array(z.string()),
  opportunities: z.array(z.string()),
  nextBestActions: z.array(z.object({
    action: z.string(),
    channel: z.string(),
    timing: z.string(),
  })),
  lifetimeValueEstimate: z.string().optional(),
});

export type LeadScoreResult = z.infer<typeof LeadScoreResultSchema>;
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;
export type InsightResult = z.infer<typeof InsightResultSchema>;

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface ContactContext {
  email: string;
  name?: string;
  company?: string;
  title?: string;
  phone?: string;
  linkedinUrl?: string;
  sourceChannel?: string;
  currentLeadScore: number;
  currentStatus: string;
  notes?: string;
  customFields?: Record<string, unknown>;
  recentEvents?: Array<{ eventType: string; occurredAt: string }>;
}

const SCORE_SYSTEM_PROMPT = `You are an expert B2B sales intelligence agent specializing in lead qualification and scoring. You analyze contact data and behavioral signals to produce accurate lead scores.

Lead scoring criteria (0-100):
- 90-100: Hot leads — decision makers, high intent signals, recent engagement, budget authority
- 70-89: Warm leads — relevant title/company, some engagement, fits ICP
- 40-69: Cold leads — limited signals, wrong stage, needs nurturing
- 0-39: Unqualified — wrong fit, no intent, churn risk

Respond with JSON only (no markdown code fences, just raw JSON):
{
  "score": number (0-100),
  "tier": "cold"|"warm"|"hot"|"customer",
  "confidence": number (0.0-1.0, how confident you are given available data — low if missing email/company/events),
  "reasoning": "2-3 sentences explaining the score",
  "signals": ["list of key positive/negative signals observed"],
  "recommendedAction": "specific next step for sales/marketing",
  "urgency": "low"|"medium"|"high"
}`;

const ENRICH_SYSTEM_PROMPT = `You are a B2B data enrichment specialist. Based on contact information provided, infer missing details to help sales teams personalize their outreach.

Use the email domain, title, company name, and behavioral signals to make educated inferences.

Respond with JSON only (no markdown code fences, just raw JSON):
{
  "inferredTitle": "string or omit if uncertain",
  "inferredCompanySize": "1-10"|"11-50"|"51-200"|"201-1000"|"1000+" or omit,
  "inferredIndustry": "string or omit",
  "buyingIntent": "researching"|"evaluating"|"ready_to_buy"|"not_in_market" or omit,
  "personalityType": "analytical"|"driver"|"expressive"|"amiable" or omit,
  "bestContactTime": "e.g. Tuesday-Thursday 10am-2pm ET",
  "tags": ["array of relevant tags"],
  "notes": "2-3 sentences with enrichment context"
}`;

const INSIGHT_SYSTEM_PROMPT = `You are a CRM intelligence analyst who produces actionable relationship insights from contact data and interaction history.

Analyze the full contact history and produce strategic recommendations for how to move this contact toward becoming a customer (or retaining them if already a customer).

Respond with JSON only (no markdown code fences, just raw JSON):
{
  "summary": "2-sentence relationship health summary",
  "keyInsights": ["3-5 specific insights based on the data"],
  "riskFlags": ["warning signs or concerns, or empty array"],
  "opportunities": ["specific growth/conversion opportunities"],
  "nextBestActions": [
    {
      "action": "specific action to take",
      "channel": "email|phone|linkedin|in-person",
      "timing": "e.g. within 48 hours"
    }
  ],
  "lifetimeValueEstimate": "rough LTV estimate with reasoning, e.g. $5,000-$15,000/yr (mid-market SaaS)"
}`;

// ── Agent class ───────────────────────────────────────────────────────────────

export class CRMIntelligenceAgent extends BaseAgent {
  constructor() {
    super({ systemPrompt: SCORE_SYSTEM_PROMPT, maxTokens: 768 }, "1.0.0");
  }

  private buildContactSummary(contact: ContactContext): string {
    const events = contact.recentEvents?.slice(0, 10) ?? [];
    return `
Contact Profile:
- Email: ${contact.email}
- Name: ${contact.name ?? "Unknown"}
- Company: ${contact.company ?? "Unknown"}
- Title: ${contact.title ?? "Unknown"}
- Phone: ${contact.phone ?? "Not provided"}
- LinkedIn: ${contact.linkedinUrl ?? "Not provided"}
- Source Channel: ${contact.sourceChannel ?? "Unknown"}
- Current Lead Score: ${contact.currentLeadScore}/100
- Current Status: ${contact.currentStatus}
- Notes: ${contact.notes ?? "None"}
${Object.keys(contact.customFields ?? {}).length > 0 ? `- Custom Fields: ${JSON.stringify(contact.customFields)}` : ""}

Recent Activity (last 10 events):
${events.length > 0
  ? events.map((e) => `  - ${e.eventType} at ${e.occurredAt}`).join("\n")
  : "  No recent activity recorded"}
`.trim();
  }

  private parseJsonSafe<T>(text: string, schema: z.ZodType<T>): T | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return schema.parse(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Score a contact's lead quality using AI analysis.
   */
  async scoreContact(contact: ContactContext): Promise<{
    result: LeadScoreResult;
    tokensUsed: number;
  }> {
    const userMessage = `${this.buildContactSummary(contact)}\n\nScore this contact and return JSON only.`;

    // Temporarily switch to score prompt
    const savedConfig = this.config;
    this.config = { ...this.config, systemPrompt: SCORE_SYSTEM_PROMPT };
    const { text, tokensUsed } = await this.complete(userMessage);
    this.config = savedConfig;

    const result = this.parseJsonSafe(text, LeadScoreResultSchema);

    if (!result) {
      // Fallback: derive basic score from data completeness
      const hasCompany = !!contact.company;
      const hasTitle = !!contact.title;
      const hasActivity = (contact.recentEvents?.length ?? 0) > 0;
      const baseScore = (hasCompany ? 25 : 0) + (hasTitle ? 25 : 0) + (hasActivity ? 20 : 0) + 10;

      return {
        result: {
          score: Math.min(baseScore, 100),
          tier: baseScore >= 60 ? "warm" : "cold",
          confidence: 0.3,
          reasoning: "Scored based on profile completeness (AI parsing error).",
          signals: [hasCompany ? "Company known" : "Missing company", hasTitle ? "Title known" : "Missing title"],
          recommendedAction: "Gather more contact information",
          urgency: "low",
        },
        tokensUsed,
      };
    }

    return { result, tokensUsed };
  }

  /**
   * Enrich a contact's profile with inferred data.
   */
  async enrichContact(contact: ContactContext): Promise<{
    result: EnrichmentResult;
    tokensUsed: number;
  }> {
    const userMessage = `${this.buildContactSummary(contact)}\n\nEnrich this contact profile and return JSON only.`;

    this.config = { ...this.config, systemPrompt: ENRICH_SYSTEM_PROMPT };
    const { text, tokensUsed } = await this.complete(userMessage);

    const result = this.parseJsonSafe(text, EnrichmentResultSchema);

    return {
      result: result ?? {
        tags: ["needs-enrichment"],
        notes: "AI enrichment parsing failed — manual review required.",
      },
      tokensUsed,
    };
  }

  /**
   * Generate relationship insights and next-best-action recommendations.
   */
  async generateInsights(contact: ContactContext): Promise<{
    result: InsightResult;
    tokensUsed: number;
  }> {
    const userMessage = `${this.buildContactSummary(contact)}\n\nGenerate relationship insights and return JSON only.`;

    this.config = { ...this.config, systemPrompt: INSIGHT_SYSTEM_PROMPT };
    const { text, tokensUsed } = await this.complete(userMessage);

    const result = this.parseJsonSafe(text, InsightResultSchema);

    return {
      result: result ?? {
        summary: "Unable to generate insights — insufficient contact data.",
        keyInsights: ["Add more contact information to enable insights"],
        riskFlags: [],
        opportunities: ["Complete contact profile"],
        nextBestActions: [{ action: "Update contact profile", channel: "email", timing: "this week" }],
      },
      tokensUsed,
    };
  }

  /**
   * Full enrichment pipeline: score → enrich → insights.
   * Loads contact from DB, runs all three AI passes, persists results.
   */
  async analyzeContact(contactId: string, orgId: string): Promise<{
    score: LeadScoreResult;
    enrichment: EnrichmentResult;
    insights: InsightResult;
    totalTokensUsed: number;
  }> {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)),
      with: {
        events: {
          orderBy: (e: any, { desc: d }: any) => [d(e.occurredAt)],
          limit: 20,
        },
      },
    });

    if (!contact) throw new Error(`Contact ${contactId} not found`);

    const ctx: ContactContext = {
      email: contact.email,
      name: contact.name ?? undefined,
      company: contact.company ?? undefined,
      title: contact.title ?? undefined,
      phone: contact.phone ?? undefined,
      linkedinUrl: contact.linkedinUrl ?? undefined,
      sourceChannel: contact.sourceChannel ?? undefined,
      currentLeadScore: contact.leadScore,
      currentStatus: contact.status,
      notes: contact.notes ?? undefined,
      customFields: contact.customFields as Record<string, unknown> ?? {},
      recentEvents: (contact as any).events?.map((e: any) => ({
        eventType: e.eventType,
        occurredAt: e.occurredAt,
      })) ?? [],
    };

    const [scoreRes, enrichRes, insightRes] = await Promise.all([
      this.scoreContact(ctx),
      this.enrichContact(ctx),
      this.generateInsights(ctx),
    ]);

    const totalTokensUsed = scoreRes.tokensUsed + enrichRes.tokensUsed + insightRes.tokensUsed;

    // Persist score and enrichment back to DB
    // Low-confidence scores (< 0.5) do NOT auto-update contact status — flag for review
    const highConfidence = (scoreRes.result.confidence ?? 0) >= 0.5;
    const enrichUpdate: Record<string, unknown> = {
      leadScore: scoreRes.result.score,
      ...(highConfidence
        ? { status: scoreRes.result.tier === "customer" ? "customer" : scoreRes.result.tier }
        : {}),
      updatedAt: new Date(),
    };

    // Merge enriched tags into custom fields
    const existingCustom = (contact.customFields as Record<string, unknown>) ?? {};
    enrichUpdate.customFields = {
      ...existingCustom,
      crmTags: enrichRes.result.tags,
      enrichedAt: new Date().toISOString(),
      inferredIndustry: enrichRes.result.inferredIndustry,
      buyingIntent: enrichRes.result.buyingIntent,
    };

    await db
      .update(contacts)
      .set(enrichUpdate)
      .where(eq(contacts.id, contactId));

    // Log the analysis as a contact event
    await db.insert(contactEvents).values({
      contactId,
      eventType: "crm_analysis",
      metadataJson: {
        score: scoreRes.result.score,
        tier: scoreRes.result.tier,
        tokensUsed: totalTokensUsed,
      },
      occurredAt: new Date(),
    });

    return {
      score: scoreRes.result,
      enrichment: enrichRes.result,
      insights: insightRes.result,
      totalTokensUsed,
    };
  }
}
