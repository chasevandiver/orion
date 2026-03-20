import { Router } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { db } from "@orion/db";
import { orionSubscriptions, usageRecords } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";

export const billingRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10",
});

// GET /billing/plans — available plans with configured price IDs (no auth required)
billingRouter.get("/plans", (_req, res) => {
  const configured = !!process.env.STRIPE_SECRET_KEY;
  res.json({
    configured,
    pro: {
      priceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
      price: "$79",
      features: ["2M AI tokens/month", "500 scheduled posts", "10,000 contacts", "Priority support"],
    },
    enterprise: {
      priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? "",
      price: "$299",
      features: ["Unlimited AI tokens", "Unlimited posts", "Unlimited contacts", "Dedicated support + SLA"],
    },
  });
});

// GET /billing — current subscription info and this month's usage
billingRouter.get("/", async (req, res, next) => {
  try {
    const subscription = await db.query.orionSubscriptions.findFirst({
      where: eq(orionSubscriptions.orgId, req.user.orgId),
    });

    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2024-01"
    const usage = await db.query.usageRecords.findFirst({
      where: and(
        eq(usageRecords.orgId, req.user.orgId),
        eq(usageRecords.month, currentMonth),
      ),
    });

    res.json({ data: { subscription, usage } });
  } catch (err) {
    next(err);
  }
});

// POST /billing/portal — generate a Stripe customer portal URL (owners/admins only)
billingRouter.post("/portal", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const subscription = await db.query.orionSubscriptions.findFirst({
      where: eq(orionSubscriptions.orgId, req.user.orgId),
    });

    if (!subscription) throw new AppError(404, "No subscription found");
    if (!process.env.STRIPE_SECRET_KEY) throw new AppError(503, "Billing not configured");

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    res.json({ data: { url: session.url } });
  } catch (err) {
    next(err);
  }
});

// POST /billing/checkout — create a Stripe checkout session to upgrade plan
billingRouter.post("/checkout", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const { priceId } = z.object({ priceId: z.string().min(1) }).parse(req.body);

    if (!process.env.STRIPE_SECRET_KEY) throw new AppError(503, "Billing not configured");

    const allowedPriceIds = [
      process.env.STRIPE_PRO_PRICE_ID,
      process.env.STRIPE_ENTERPRISE_PRICE_ID,
    ].filter(Boolean) as string[];

    if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
      throw new AppError(400, "Invalid price ID");
    }

    const subscription = await db.query.orionSubscriptions.findFirst({
      where: eq(orionSubscriptions.orgId, req.user.orgId),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: subscription?.stripeCustomerId ?? undefined,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=1`,
      metadata: { orgId: req.user.orgId },
    });

    res.json({ data: { url: session.url } });
  } catch (err) {
    next(err);
  }
});
