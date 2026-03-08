import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import {
  assets,
  brandVoiceEdits,
  organizations,
  campaigns,
  brands,
  strategies,
} from "@orion/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { ContentCreatorAgent, ImageGeneratorAgent, anthropic } from "@orion/agents";
import { rateLimit } from "express-rate-limit";

export const assetsRouter = Router();

// Stricter rate limit for AI generation endpoints
const generationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many generation requests. Please wait." },
  keyGenerator: (req) => req.user.id,
});

const generateSchema = z.object({
  campaignId: z.string().uuid().optional(),
  goalId: z.string().uuid(),
  channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"]),
  brandName: z.string(),
  brandDescription: z.string().optional(),
  goalType: z.string(),
  strategyContext: z.string().optional(),
});

// GET /assets — list assets for org
assetsRouter.get("/", async (req, res, next) => {
  try {
    const { campaignId, channel, status } = req.query;

    const results = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, req.user.orgId),
        campaignId ? eq(assets.campaignId, campaignId as string) : undefined,
        channel ? eq(assets.channel, channel as string) : undefined,
        status ? eq(assets.status, status as string) : undefined,
      ),
      orderBy: desc(assets.createdAt),
      limit: 50,
    });

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /assets/generate — SSE streaming content generation
assetsRouter.post("/generate", generationLimiter, async (req, res, next) => {
  try {
    const body = generateSchema.parse(req.body);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("status", { message: "Content Creator Agent initializing..." });

    const agent = new ContentCreatorAgent();

    let fullContent = "";
    await agent.generate(
      {
        channel: body.channel,
        goalType: body.goalType,
        brandName: body.brandName,
        brandDescription: body.brandDescription,
        strategyContext: body.strategyContext,
      },
      (chunk) => {
        fullContent += chunk;
        sendEvent("chunk", { text: chunk });
      },
    );

    // Persist to database
    const [asset] = await db
      .insert(assets)
      .values({
        orgId: req.user.orgId,
        campaignId: body.campaignId,
        channel: body.channel,
        type: body.channel === "email" ? "email" : body.channel === "blog" ? "blog" : "social_post",
        contentText: fullContent,
        status: "draft",
        generatedByAgent: "content_creator",
        modelVersion: "claude-sonnet-4-6",
      })
      .returning();

    sendEvent("done", { assetId: asset.id, content: fullContent });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Generation failed" })}\n\n`);
      res.end();
    }
  }
});

// PATCH /assets/:id — update content, status, approval
assetsRouter.patch("/:id", async (req, res, next) => {
  try {
    const allowedFields = ["contentText", "contentHtml", "status", "approvedBy", "approvedAt"];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowedFields.includes(k)),
    );

    // Fetch current asset to detect content edits
    const existing = await db.query.assets.findFirst({
      where: and(eq(assets.id, req.params.id!), eq(assets.orgId, req.user.orgId)),
    });
    if (!existing) throw new AppError(404, "Asset not found");

    const [updated] = await db
      .update(assets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(assets.id, req.params.id!))
      .returning();

    // Log content edit for brand voice learning (fire-and-forget)
    if (updates.contentText && updates.contentText !== existing.contentText) {
      const orgId = req.user.orgId;
      db.insert(brandVoiceEdits).values({
        orgId,
        channel: existing.channel,
        originalText: existing.contentText,
        editedText: updates.contentText as string,
      }).then(async () => {
        // Count edits; synthesize voice every 5th
        const [{ value: editCount }] = await db
          .select({ value: count() })
          .from(brandVoiceEdits)
          .where(eq(brandVoiceEdits.orgId, orgId));
        if (Number(editCount) % 5 === 0) {
          synthesizeVoiceForOrg(orgId).catch(() => {});
        }
      }).catch(() => {});
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /assets/:id
assetsRouter.delete("/:id", async (req, res, next) => {
  try {
    await db
      .delete(assets)
      .where(and(eq(assets.id, req.params.id!), eq(assets.orgId, req.user.orgId)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /assets/synthesize-voice — manually trigger brand voice synthesis
assetsRouter.post("/synthesize-voice", async (req, res, next) => {
  try {
    await synthesizeVoiceForOrg(req.user.orgId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

async function synthesizeVoiceForOrg(orgId: string): Promise<void> {
  const edits = await db.query.brandVoiceEdits.findMany({
    where: eq(brandVoiceEdits.orgId, orgId),
    orderBy: desc(brandVoiceEdits.createdAt),
    limit: 50,
  });
  if (edits.length < 5) return;

  const editPairs = edits
    .map((e, i) => `Edit ${i + 1} (${e.channel}):\nBEFORE: ${e.originalText.slice(0, 300)}\nAFTER: ${e.editedText.slice(0, 300)}`)
    .join("\n\n---\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Analyze these before/after content edits and extract brand voice preferences as a concise JSON object. Focus on: vocabulary preferences, tone shifts, sentence length, formality level, emoji usage, hashtag style, CTA phrasing. Output only valid JSON with keys: tone, formality, sentenceLength, vocabularyNotes, emojiUsage, hashtagStyle, ctaStyle, additionalNotes.\n\n${editPairs}`,
      },
    ],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const profile = { ...JSON.parse(jsonMatch[0]), lastUpdated: new Date().toISOString() };

  await db
    .update(organizations)
    .set({ brandVoiceProfile: profile, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

// ── Regeneration helpers ──────────────────────────────────────────────────────

const VARIANT_INSTRUCTIONS: Record<"a" | "b", string> = {
  a: "Write in a direct, benefit-first style with a clear, concise CTA.",
  b: "Write in a storytelling, curiosity-driven style that leads the reader to the CTA.",
};

function simpleExtractHeadline(text: string): { headline: string; cta: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const subjectLine = lines.find((l) => /^SUBJECT:/i.test(l));
  if (subjectLine) {
    return {
      headline: subjectLine.replace(/^SUBJECT:\s*/i, "").trim(),
      cta: "Learn More",
    };
  }
  const headlineLine = lines.find((l) => /^HEADLINE:/i.test(l));
  if (headlineLine) {
    return { headline: headlineLine.replace(/^HEADLINE:\s*/i, "").trim(), cta: "Read More" };
  }
  const actionWords = ["get", "try", "start", "join", "click", "learn", "discover", "visit", "follow", "buy", "book"];
  const ctaLine = [...lines].reverse().find((l) =>
    actionWords.some((w) => l.toLowerCase().includes(w)),
  );
  return {
    headline: (lines[0] ?? "").slice(0, 80),
    cta: (ctaLine ?? lines[lines.length - 1] ?? "").slice(0, 60),
  };
}

// POST /assets/:id/regen-copy — re-run ContentCreatorAgent for a single asset
assetsRouter.post("/:id/regen-copy", async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const orgId = req.user.orgId;

    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
    });
    if (!asset || !asset.campaignId) throw new AppError(404, "Asset not found");

    const [campaign, brand, org] = await Promise.all([
      db.query.campaigns.findFirst({
        where: eq(campaigns.id, asset.campaignId),
        with: { goal: true, strategy: true },
      }),
      db.query.brands.findFirst({
        where: and(eq(brands.orgId, orgId), eq(brands.isActive, true)),
      }),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { brandVoiceProfile: true },
      }),
    ]);

    if (!campaign?.goal) throw new AppError(422, "Campaign has no linked goal");

    const agent = new ContentCreatorAgent();
    let contentText = "";
    await agent.generate(
      {
        channel: asset.channel,
        goalType: campaign.goal.type,
        brandName: brand?.name ?? campaign.goal.brandName,
        brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
        strategyContext: campaign.strategy?.contentText?.slice(0, 800),
        voiceTone: brand?.voiceTone ?? undefined,
        products: (brand?.products as Array<{ name: string; description: string }> | null) ?? undefined,
        variantInstruction: asset.variant ? VARIANT_INSTRUCTIONS[asset.variant as "a" | "b"] : undefined,
        brandVoiceProfile: org?.brandVoiceProfile ? JSON.stringify(org.brandVoiceProfile) : undefined,
      },
      (chunk) => { contentText += chunk; },
    );

    const [updated] = await db
      .update(assets)
      .set({ contentText, updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .returning();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /assets/:id/regen-image — re-run image gen + compositor for a single asset
assetsRouter.post("/:id/regen-image", async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const orgId = req.user.orgId;

    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
    });
    if (!asset || !asset.campaignId) throw new AppError(404, "Asset not found");

    const [campaign, brand, org] = await Promise.all([
      db.query.campaigns.findFirst({
        where: eq(campaigns.id, asset.campaignId),
        with: { goal: true },
      }),
      db.query.brands.findFirst({
        where: and(eq(brands.orgId, orgId), eq(brands.isActive, true)),
      }),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { logoUrl: true, brandPrimaryColor: true, logoPosition: true },
      }),
    ]);

    if (!campaign?.goal) throw new AppError(422, "Campaign has no linked goal");

    if (!process.env.OPENAI_API_KEY) throw new AppError(503, "Image generation not configured");

    const imageAgent = new ImageGeneratorAgent();
    const { imageUrl, prompt } = await imageAgent.generate({
      brandName: brand?.name ?? campaign.goal.brandName,
      brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
      channel: asset.channel,
      goalType: campaign.goal.type,
      primaryColor: brand?.primaryColor ?? org?.brandPrimaryColor ?? undefined,
      voiceTone: brand?.voiceTone ?? undefined,
    });

    await db.update(assets).set({ imageUrl, promptSnapshot: prompt }).where(eq(assets.id, assetId));

    // Call compositor
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { headline, cta } = simpleExtractHeadline(asset.contentText);

    let compositedImageUrl: string | null = null;
    try {
      const compRes = await fetch(`${appUrl}/api/render/${asset.channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundImageUrl: imageUrl,
          headlineText: headline,
          ctaText: cta,
          logoUrl: org?.logoUrl,
          brandPrimaryColor: org?.brandPrimaryColor,
          channel: asset.channel,
          flowType: "generate",
          logoPosition: org?.logoPosition,
        }),
      });
      if (compRes.ok) {
        const json = (await compRes.json()) as { url: string };
        compositedImageUrl = json.url;
      }
    } catch {}

    const [updated] = await db
      .update(assets)
      .set({ compositedImageUrl: compositedImageUrl ?? undefined, updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .returning();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
