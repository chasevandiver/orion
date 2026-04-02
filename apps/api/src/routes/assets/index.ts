import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import {
  assets,
  assetVersions,
  brandVoiceEdits,
  organizations,
  campaigns,
  brands,
  strategies,
  goals,
  users,
  analyticsEvents,
} from "@orion/db/schema";
import { eq, and, desc, count, inArray, gte, lt, sql } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { ContentCreatorAgent, ImageGeneratorAgent, anthropic } from "@orion/agents";
import { rateLimit } from "express-rate-limit";
import { inngest } from "../../lib/inngest.js";

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
  goalId: z.string().uuid().optional(),
  channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"]),
  brandName: z.string(),
  brandDescription: z.string().optional(),
  goalType: z.string(),
  strategyContext: z.string().optional(),
});

const IMAGE_CHANNELS = new Set(["linkedin", "twitter", "instagram", "facebook", "tiktok"]);

// POST /assets/quick-post — synchronous SSE: generate content (+ optional image) and save as asset
assetsRouter.post("/quick-post", generationLimiter, async (req, res, next) => {
  try {
    const { channel, topic, contentDraft, brandId } = z
      .object({
        channel: z.enum(["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"]),
        topic: z.string().min(1).max(1000),
        contentDraft: z.string().max(5000).optional(),
        brandId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const orgId = req.user.orgId;

    // ── SSE setup ──────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // ── Load brand + org context ──────────────────────────────────────────
    sendEvent("status", { message: "Loading brand context…" });

    const [brand, org] = await Promise.all([
      brandId
        ? db.query.brands.findFirst({ where: and(eq(brands.id, brandId), eq(brands.orgId, orgId)) })
        : db.query.brands.findFirst({ where: and(eq(brands.orgId, orgId), eq(brands.isActive, true)) }),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          brandVoiceProfile: true,
          logoUrl: true,
          brandPrimaryColor: true,
          brandSecondaryColor: true,
          logoPosition: true,
        },
      }),
    ]);

    const brandVoiceProfile = org?.brandVoiceProfile
      ? JSON.stringify(org.brandVoiceProfile)
      : undefined;

    // ── Create lightweight campaign (no goal, no strategy) ────────────────
    const campaignName = `Quick Post — ${brand?.name ?? "Brand"} (${channel})`;
    const [campaign] = await db
      .insert(campaigns)
      .values({
        orgId,
        name: campaignName,
        description: `Quick post: ${topic.slice(0, 100)}`,
        status: "active",
        pipelineStage: "complete",
      })
      .returning();

    // ── Stream content generation ─────────────────────────────────────────
    sendEvent("status", { message: "Content Creator Agent writing…" });

    const agent = new ContentCreatorAgent();
    let contentText = "";

    const photoContext = contentDraft
      ? `The user has provided a content draft to refine and adapt. Use this as the core message but optimize it for ${channel}: "${contentDraft}"`
      : undefined;

    await agent.generate(
      {
        channel,
        goalType: "awareness",
        brandName: brand?.name ?? "Brand",
        brandDescription: brand?.description ?? undefined,
        voiceTone: brand?.voiceTone ?? undefined,
        products: (brand?.products as Array<{ name: string; description: string }> | null) ?? undefined,
        strategyContext: `Topic: ${topic}`,
        photoContext,
        brandVoiceProfile,
      },
      (chunk) => {
        contentText += chunk;
        sendEvent("chunk", { text: chunk });
      },
    );

    // ── Image generation + compositing (visual channels only) ─────────────
    let imageUrl: string | null = null;
    let compositedImageUrl: string | null = null;
    let imageSource: string | null = null;

    if (IMAGE_CHANNELS.has(channel)) {
      sendEvent("status", { message: "Generating image…" });
      try {
        const imageAgent = new ImageGeneratorAgent();
        const imageResult = await imageAgent.generate({
          brandName: brand?.name ?? "Brand",
          brandDescription: brand?.description ?? undefined,
          channel,
          goalType: "awareness",
          primaryColor: brand?.primaryColor ?? org?.brandPrimaryColor ?? undefined,
          voiceTone: brand?.voiceTone ?? undefined,
        });
        imageUrl = imageResult.imageUrl;
        imageSource = imageResult.imageSource;

        // Compositor
        sendEvent("status", { message: "Compositing image…" });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const { headline, cta } = simpleExtractHeadline(contentText);
        try {
          const compRes = await fetch(`${appUrl}/api/render/${channel}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": process.env.INTERNAL_RENDER_SECRET ?? "",
            },
            body: JSON.stringify({
              backgroundImageUrl: imageUrl,
              headlineText: headline,
              ctaText: cta,
              logoUrl: org?.logoUrl,
              brandPrimaryColor: org?.brandPrimaryColor,
              brandSecondaryColor: org?.brandSecondaryColor,
              channel,
              flowType: "generate",
              logoPosition: org?.logoPosition,
              imageSource,
            }),
          });
          if (compRes.ok) {
            const json = (await compRes.json()) as { url: string; imageSource?: string };
            compositedImageUrl = json.url;
            if (json.imageSource) imageSource = json.imageSource;
          }
        } catch {}
      } catch {
        // Image gen is best-effort; don't fail the whole request
      }
    }

    // ── Save asset ─────────────────────────────────────────────────────────
    const [asset] = await db
      .insert(assets)
      .values({
        orgId,
        campaignId: campaign!.id,
        channel,
        type: channel === "email" ? "email" : channel === "blog" ? "blog" : "social_post",
        contentText,
        status: "draft",
        generatedByAgent: "ContentCreatorAgent",
        modelVersion: "claude-sonnet-4-6",
        ...(imageUrl ? { imageUrl } : {}),
        ...(compositedImageUrl ? { compositedImageUrl } : {}),
        ...(imageSource ? { metadata: { imageSource } } : {}),
      })
      .returning();

    // Fire asset.created so content-approval-pipeline template can trigger
    inngest.send({
      name: "orion/asset.created",
      data: { assetId: asset!.id, orgId },
    }).catch(() => {}); // non-critical

    sendEvent("done", {
      assetId: asset!.id,
      campaignId: campaign!.id,
      content: contentText,
      imageUrl: compositedImageUrl ?? imageUrl,
    });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Quick post failed" })}\n\n`);
      res.end();
    }
  }
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

// GET /assets/export — CSV export for all org assets
assetsRouter.get("/export", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from as string) : undefined;
    const toDate = to ? new Date(to as string) : undefined;

    const assetList = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, req.user.orgId),
        fromDate ? gte(assets.createdAt, fromDate) : undefined,
        toDate ? lt(assets.createdAt, toDate) : undefined,
      ),
      orderBy: desc(assets.createdAt),
      limit: 10000,
    });

    // Campaign name lookup
    const campaignIds = [...new Set(assetList.map((a) => a.campaignId).filter(Boolean))] as string[];
    const campaignNameMap = new Map<string, string>();
    if (campaignIds.length > 0) {
      const camps = await db.query.campaigns.findMany({
        where: and(eq(campaigns.orgId, req.user.orgId), inArray(campaigns.id, campaignIds)),
        columns: { id: true, name: true },
      });
      camps.forEach((c) => campaignNameMap.set(c.id, c.name));
    }

    // Per-asset impression/click aggregates
    const assetIds = assetList.map((a) => a.id);
    const eventMap = new Map<string, { impressions: number; clicks: number }>();
    if (assetIds.length > 0) {
      const events = await db
        .select({
          assetId: analyticsEvents.assetId,
          eventType: analyticsEvents.eventType,
          total: sql<number>`SUM(${analyticsEvents.value})`,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.orgId, req.user.orgId),
            inArray(analyticsEvents.assetId as any, assetIds),
          ),
        )
        .groupBy(analyticsEvents.assetId, analyticsEvents.eventType);

      for (const e of events) {
        if (!e.assetId) continue;
        const prev = eventMap.get(e.assetId) ?? { impressions: 0, clicks: 0 };
        if (e.eventType === "impression") prev.impressions = Math.round(Number(e.total));
        if (e.eventType === "click") prev.clicks = Math.round(Number(e.total));
        eventMap.set(e.assetId, prev);
      }
    }

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["id", "channel", "status", "contentText", "createdAt", "campaignName", "impressions", "clicks"];
    const rows = assetList.map((a) => [
      a.id,
      a.channel,
      a.status,
      String(a.contentText ?? "").slice(0, 500).replace(/\n/g, " "),
      a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      a.campaignId ? (campaignNameMap.get(a.campaignId) ?? "") : "",
      String(eventMap.get(a.id)?.impressions ?? 0),
      String(eventMap.get(a.id)?.clicks ?? 0),
    ]);

    const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="content-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
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

    // Log content edit for brand voice learning + version history (fire-and-forget)
    if (updates.contentText && updates.contentText !== existing.contentText) {
      const orgId = req.user.orgId;
      const assetId = existing.id;
      const originalText = existing.contentText;
      const editedText = updates.contentText as string;

      // Brand voice edit record
      db.insert(brandVoiceEdits)
        .values({ orgId, assetId, channel: existing.channel, originalText, editedText })
        .then(async () => {
          const [{ value: editCount }] = await db
            .select({ value: count() })
            .from(brandVoiceEdits)
            .where(eq(brandVoiceEdits.orgId, orgId));
          if (Number(editCount) % 5 === 0) {
            synthesizeVoiceForOrg(orgId).catch(() => {});
          }
        })
        .catch(() => {});

      // Asset version snapshot
      db.select({ v: count() })
        .from(assetVersions)
        .where(eq(assetVersions.assetId, assetId))
        .then(([row]) =>
          db.insert(assetVersions).values({
            assetId,
            versionNum: Number(row?.v ?? 0) + 1,
            contentText: originalText,
            editedBy: req.user.id,
          }),
        )
        .catch(() => {});
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /assets/:id/versions — version history with editor info
assetsRouter.get("/:id/versions", async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, req.user.orgId)),
      columns: { id: true },
    });
    if (!asset) throw new AppError(404, "Asset not found");

    const versions = await db
      .select({
        id: assetVersions.id,
        versionNum: assetVersions.versionNum,
        contentText: assetVersions.contentText,
        editorName: users.name,
        editorEmail: users.email,
        createdAt: assetVersions.createdAt,
      })
      .from(assetVersions)
      .leftJoin(users, eq(assetVersions.editedBy, users.id))
      .where(eq(assetVersions.assetId, assetId))
      .orderBy(desc(assetVersions.createdAt));

    res.json({ data: versions });
  } catch (err) {
    next(err);
  }
});

// POST /assets/bulk-approve — batch approve or reject a set of assets
assetsRouter.post("/bulk-approve", async (req, res, next) => {
  try {
    const { assetIds, status } = z.object({
      assetIds: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum(["approved", "rejected"]),
    }).parse(req.body);

    await db
      .update(assets)
      .set({ status, updatedAt: new Date() })
      .where(and(inArray(assets.id, assetIds), eq(assets.orgId, req.user.orgId)));

    res.json({ data: { updated: assetIds.length } });
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
  const capW = (t: string, n: number) => { const w = t.split(/\s+/).filter(Boolean); return w.length <= n ? w.join(" ") : w.slice(0, n).join(" ") + "…"; };
  return {
    headline: capW(lines[0] ?? "", 8),
    cta: capW(ctaLine ?? lines[lines.length - 1] ?? "", 6),
  };
}

// POST /assets/:id/regen-stream — SSE streaming re-generation for a single asset
assetsRouter.post("/:id/regen-stream", generationLimiter, async (req, res, next) => {
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

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("status", { message: "Regenerating content…" });

    const agent = new ContentCreatorAgent();
    let contentText = "";
    await agent.generate(
      {
        channel: asset.channel,
        goalType: campaign.goal.type,
        brandName: brand?.name ?? campaign.goal.brandName,
        brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
        strategyContext: (campaign.strategy as any)?.contentText?.slice(0, 800),
        voiceTone: brand?.voiceTone ?? undefined,
        products: (brand?.products as Array<{ name: string; description: string }> | null) ?? undefined,
        variantInstruction: asset.variant ? VARIANT_INSTRUCTIONS[asset.variant as "a" | "b"] : undefined,
        brandVoiceProfile: org?.brandVoiceProfile ? JSON.stringify(org.brandVoiceProfile) : undefined,
      },
      (chunk) => {
        contentText += chunk;
        sendEvent("chunk", { text: chunk });
      },
    );

    const [updated] = await db
      .update(assets)
      .set({ contentText, updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .returning();

    sendEvent("done", { assetId: updated.id, content: contentText });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Regeneration failed" })}\n\n`);
      res.end();
    }
  }
});

// POST /assets/:id/variants — generate an A/B variant of an existing asset
assetsRouter.post("/:id/variants", generationLimiter, async (req, res, next) => {
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

    // New variant is always the opposite of the source ("b" if source is null/"a", "a" if source is "b")
    const newVariant: "a" | "b" = asset.variant === "b" ? "a" : "b";
    const variantInstruction = VARIANT_INSTRUCTIONS[newVariant];

    const agent = new ContentCreatorAgent();
    let contentText = "";
    await agent.generate(
      {
        channel: asset.channel,
        goalType: campaign.goal.type,
        brandName: brand?.name ?? campaign.goal.brandName,
        brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
        strategyContext: (campaign.strategy as any)?.contentText?.slice(0, 800),
        voiceTone: brand?.voiceTone ?? undefined,
        products: (brand?.products as Array<{ name: string; description: string }> | null) ?? undefined,
        variantInstruction,
        brandVoiceProfile: org?.brandVoiceProfile ? JSON.stringify(org.brandVoiceProfile) : undefined,
      },
      (chunk) => { contentText += chunk; },
    );

    const [newAsset] = await db
      .insert(assets)
      .values({
        orgId,
        campaignId: asset.campaignId,
        channel: asset.channel,
        type: asset.type,
        contentText,
        variant: newVariant,
        status: "draft",
        generatedByAgent: "content_creator",
        modelVersion: "claude-sonnet-4-6",
      })
      .returning();

    res.json({ data: newAsset });
  } catch (err) {
    next(err);
  }
});

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
        columns: { logoUrl: true, brandPrimaryColor: true, brandSecondaryColor: true, logoPosition: true },
      }),
    ]);

    if (!campaign?.goal) throw new AppError(422, "Campaign has no linked goal");

    // No API key guard — ImageGeneratorAgent auto-selects Fal.ai (if FAL_KEY set)
    // then Pollinations (free, no key), then brand-graphic fallback.

    const imageAgent = new ImageGeneratorAgent();
    const { imageUrl, prompt, imageSource } = await imageAgent.generate({
      brandName: brand?.name ?? campaign.goal.brandName,
      brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
      channel: asset.channel,
      goalType: campaign.goal.type,
      primaryColor: brand?.primaryColor ?? org?.brandPrimaryColor ?? undefined,
      voiceTone: brand?.voiceTone ?? undefined,
    });

    await db
      .update(assets)
      .set({ imageUrl, promptSnapshot: prompt, metadata: { imageSource } })
      .where(eq(assets.id, assetId));

    // Call compositor
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { headline, cta } = simpleExtractHeadline(asset.contentText);

    let compositedImageUrl: string | null = null;
    let finalImageSource = imageSource;
    try {
      const compRes = await fetch(`${appUrl}/api/render/${asset.channel}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.INTERNAL_RENDER_SECRET ?? "",
        },
        body: JSON.stringify({
          backgroundImageUrl: imageUrl,
          headlineText: headline,
          ctaText: cta,
          logoUrl: org?.logoUrl,
          brandPrimaryColor: org?.brandPrimaryColor,
          brandSecondaryColor: org?.brandSecondaryColor,
          channel: asset.channel,
          flowType: "generate",
          logoPosition: org?.logoPosition,
          imageSource,
        }),
      });
      if (compRes.ok) {
        const json = (await compRes.json()) as { url: string; imageSource?: string };
        compositedImageUrl = json.url;
        if (json.imageSource) finalImageSource = json.imageSource as typeof imageSource;
      }
    } catch {}

    const [updated] = await db
      .update(assets)
      .set({ compositedImageUrl: compositedImageUrl ?? undefined, metadata: { imageSource: finalImageSource }, updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .returning();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /assets/:id/repurpose — create a new goal + pipeline run to repurpose an asset to new channels
assetsRouter.post("/:id/repurpose", async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const orgId = req.user.orgId;

    const { channels } = z
      .object({ channels: z.array(z.string()).min(1).max(7) })
      .parse(req.body);

    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
    });
    if (!asset) throw new AppError(404, "Asset not found");
    if (!asset.campaignId) throw new AppError(422, "Asset has no linked campaign");

    const [campaign, brand] = await Promise.all([
      db.query.campaigns.findFirst({
        where: eq(campaigns.id, asset.campaignId),
        with: { goal: true },
      }),
      db.query.brands.findFirst({
        where: and(eq(brands.orgId, orgId), eq(brands.isActive, true)),
      }),
    ]);
    if (!campaign?.goal) throw new AppError(422, "Campaign has no linked goal");

    const goalType = campaign.goal.type as
      | "leads" | "awareness" | "event" | "product"
      | "traffic" | "social" | "conversions";
    const brandName = brand?.name ?? campaign.goal.brandName;

    // Create a new goal for the repurpose pipeline run
    const [newGoal] = await db
      .insert(goals)
      .values({
        orgId,
        userId: req.user.id,
        type: goalType,
        brandName,
        brandDescription: brand?.description ?? campaign.goal.brandDescription ?? undefined,
        targetAudience: campaign.goal.targetAudience ?? undefined,
        timeline: campaign.goal.timeline,
        budget: campaign.goal.budget ?? undefined,
        status: "active",
      })
      .returning();

    await inngest.send({
      name: "orion/pipeline.run",
      data: {
        goalId: newGoal!.id,
        orgId,
        userId: req.user.id,
        channels,
        repurposeSourceAssetId: assetId,
      },
    });

    res.status(201).json({ data: { goalId: newGoal!.id } });
  } catch (err) {
    next(err);
  }
});

// POST /assets/:id/recycle — manually trigger evergreen recycle for a single asset
assetsRouter.post("/:id/recycle", generationLimiter, async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const orgId = req.user.orgId;

    const [asset, org] = await Promise.all([
      db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
        columns: {
          id: true,
          orgId: true,
          status: true,
          recycleCount: true,
          sourceAssetId: true,
        },
      }),
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { evergreenMaxRecycles: true },
      }),
    ]);

    if (!asset) throw new AppError(404, "Asset not found");
    if ((asset as any).sourceAssetId) throw new AppError(422, "Cannot recycle a recycled variant");

    const maxRecycles = (org as any)?.evergreenMaxRecycles ?? 3;
    if ((asset.recycleCount ?? 0) >= maxRecycles) {
      throw new AppError(422, `This asset has reached the maximum recycle limit (${maxRecycles})`);
    }

    await inngest.send({
      name: "orion/asset.recycle",
      data: { assetId, orgId },
    });

    res.status(202).json({ data: { queued: true } });
  } catch (err) {
    next(err);
  }
});

// GET /assets/:id/recycles — list recycled variants of an asset
assetsRouter.get("/:id/recycles", async (req, res, next) => {
  try {
    const assetId = req.params.id!;
    const orgId = req.user.orgId;

    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
      columns: { id: true },
    });
    if (!asset) throw new AppError(404, "Asset not found");

    const recycles = await db.query.assets.findMany({
      where: and(
        eq(assets.orgId, orgId),
        eq(assets.sourceAssetId as any, assetId),
      ),
      columns: {
        id: true,
        channel: true,
        contentText: true,
        status: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: (a, { desc: d }) => [d(a.createdAt)],
    });

    res.json({ data: recycles });
  } catch (err) {
    next(err);
  }
});
