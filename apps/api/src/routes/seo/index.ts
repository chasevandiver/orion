/**
 * SEO API
 *
 * POST /seo/analyze — run SEO agent to generate keyword brief
 */
import { Router } from "express";
import { z } from "zod";
import { SEOAgent } from "@orion/agents";

export const seoRouter = Router();

const analyzeSchema = z.object({
  brandName: z.string().min(1),
  industry: z.string().min(1),
  goalType: z.string().default("traffic"),
  contentTopic: z.string().optional(),
  targetAudience: z.string().optional(),
});

// POST /seo/analyze — generate an SEO brief
seoRouter.post("/analyze", async (req, res, next) => {
  try {
    const body = analyzeSchema.parse(req.body);

    const agent = new SEOAgent();
    const result = await agent.generate({
      brandName: body.brandName,
      industry: body.industry,
      goalType: body.goalType,
      channel: "blog",
      contentTopic: body.contentTopic,
      targetAudience: body.targetAudience,
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
