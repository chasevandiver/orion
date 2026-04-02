/**
 * Landing Pages API
 *
 * GET  /landing-pages              — list all for org
 * GET  /landing-pages/:id          — get single
 * POST /landing-pages              — create (manual, not pipeline-generated)
 * POST /landing-pages/generate     — SSE: run LandingPageAgent + save, returns id
 * POST /landing-pages/generate-section — return one regenerated section (JSON)
 * PATCH /landing-pages/:id         — update title/slug/meta/contentJson
 * POST /landing-pages/:id/publish  — set publishedAt + generate shareToken
 * DELETE /landing-pages/:id        — delete
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@orion/db";
import { landingPages } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { LandingPageAgent } from "@orion/agents";
import { rateLimit } from "express-rate-limit";
import crypto from "crypto";

export const landingPagesRouter = Router();

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many generation requests. Please wait." },
  keyGenerator: (req) => req.user.id,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function agentOutputToContentJson(lp: {
  heroSection: { headline: string; subheadline: string; ctaText: string; ctaButtonLabel: string };
  benefitsSections: Array<{ icon: string; title: string; description: string }>;
  socialProof: Array<{ quote: string; author: string; company: string; role: string }>;
  faqSection: Array<{ question: string; answer: string }>;
  ctaSection: { headline: string; subtext: string; buttonLabel: string; formFields: string[] };
}) {
  return {
    hero: {
      headline: lp.heroSection.headline,
      subheadline: lp.heroSection.subheadline,
      ctaText: lp.heroSection.ctaText,
      ctaUrl: "#cta-form",
    },
    benefits: lp.benefitsSections.map((b) => ({ icon: b.icon, title: b.title, description: b.description })),
    socialProof: lp.socialProof.map((s) => ({ quote: s.quote, author: s.author, company: s.company })),
    faq: lp.faqSection.map((f) => ({ question: f.question, answer: f.answer })),
    cta: {
      headline: lp.ctaSection.headline,
      subtext: lp.ctaSection.subtext,
      buttonText: lp.ctaSection.buttonLabel,
      formFields: lp.ctaSection.formFields,
    },
    _captureEndpoint: `${process.env.INTERNAL_API_URL ?? "http://localhost:3001"}/contacts/capture`,
  };
}

// GET /landing-pages
landingPagesRouter.get("/", async (req, res, next) => {
  try {
    const pages = await db.query.landingPages.findMany({
      where: eq(landingPages.orgId, req.user.orgId),
      orderBy: desc(landingPages.createdAt),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true } },
      },
    });
    res.json({ data: pages });
  } catch (err) {
    next(err);
  }
});

// GET /landing-pages/:id
landingPagesRouter.get("/:id", async (req, res, next) => {
  try {
    const page = await db.query.landingPages.findFirst({
      where: and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)),
      with: {
        goal: { columns: { type: true, brandName: true } },
        campaign: { columns: { id: true, name: true, status: true } },
      },
    });
    if (!page) throw new AppError(404, "Landing page not found");
    res.json({ data: page });
  } catch (err) {
    next(err);
  }
});

// POST /landing-pages
landingPagesRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
      goalId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      contentJson: z.record(z.unknown()).default({}),
      metaTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(155).optional(),
    }).parse(req.body);

    const [page] = await db
      .insert(landingPages)
      .values({ orgId: req.user.orgId, ...body })
      .returning();

    res.status(201).json({ data: page });
  } catch (err) {
    next(err);
  }
});

// POST /landing-pages/generate — SSE: run LandingPageAgent, save, return page id
landingPagesRouter.post("/generate", generationLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      brandName: z.string().min(1).max(200),
      brandDescription: z.string().max(500).optional(),
      goalType: z.string().min(1).max(100),
      primaryAudience: z.string().max(200).optional(),
      keyMessage: z.string().max(500).optional(),
      campaignId: z.string().uuid().optional(),
      goalId: z.string().uuid().optional(),
      topic: z.string().max(300).optional(),
    }).parse(req.body);

    // SSE setup
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send("status", { message: "Starting LandingPageAgent…" });

    const agent = new LandingPageAgent();
    const lp = await agent.generate({
      brandName: body.brandName,
      brandDescription: body.brandDescription,
      goalType: body.keyMessage ? `${body.goalType} — ${body.keyMessage}` : body.goalType,
      primaryAudience: body.primaryAudience,
      keyMessage: body.topic ?? body.keyMessage,
    });

    send("status", { message: "Saving landing page…" });

    const slug = `${(lp.slug || "landing-page").slice(0, 40)}-${crypto.randomBytes(3).toString("hex")}`;

    const contentJson = agentOutputToContentJson(lp);

    const [page] = await db
      .insert(landingPages)
      .values({
        orgId: req.user.orgId,
        campaignId: body.campaignId ?? undefined,
        goalId: body.goalId ?? undefined,
        title: lp.headline || body.brandName,
        slug,
        contentJson,
        metaTitle: lp.metaTitle || undefined,
        metaDescription: lp.metaDescription || undefined,
      })
      .returning();

    send("done", { id: page!.id, slug: page!.slug });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
});

// POST /landing-pages/generate-section — regenerate one section, return updated contentJson fragment
landingPagesRouter.post("/generate-section", generationLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      section: z.enum(["hero", "benefits", "socialProof", "faq", "cta"]),
      brandName: z.string().min(1).max(200),
      brandDescription: z.string().max(500).optional(),
      goalType: z.string().min(1).max(100),
      primaryAudience: z.string().max(200).optional(),
      keyMessage: z.string().max(500).optional(),
    }).parse(req.body);

    const agent = new LandingPageAgent();
    const lp = await agent.generate({
      brandName: body.brandName,
      brandDescription: body.brandDescription,
      goalType: body.goalType,
      primaryAudience: body.primaryAudience,
      keyMessage: body.keyMessage,
    });

    const full = agentOutputToContentJson(lp);

    // Return just the requested section
    const sectionMap: Record<string, unknown> = {
      hero: full.hero,
      benefits: full.benefits,
      socialProof: full.socialProof,
      faq: full.faq,
      cta: full.cta,
    };

    res.json({ data: { section: body.section, content: sectionMap[body.section] } });
  } catch (err) {
    next(err);
  }
});

// PATCH /landing-pages/:id
landingPagesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
      contentJson: z.record(z.unknown()).optional(),
      metaTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(155).optional(),
    }).parse(req.body);

    const [updated] = await db
      .update(landingPages)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Landing page not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /landing-pages/:id/publish — publish + generate share token
landingPagesRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const shareToken = crypto.randomBytes(20).toString("base64url");

    const [updated] = await db
      .update(landingPages)
      .set({
        publishedAt: new Date(),
        shareToken,
        updatedAt: new Date(),
      })
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning();

    if (!updated) throw new AppError(404, "Landing page not found");
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /landing-pages/:id
landingPagesRouter.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(landingPages)
      .where(and(eq(landingPages.id, req.params.id!), eq(landingPages.orgId, req.user.orgId)))
      .returning({ id: landingPages.id });

    if (!deleted) throw new AppError(404, "Landing page not found");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
