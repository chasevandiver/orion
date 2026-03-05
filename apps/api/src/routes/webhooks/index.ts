import { Router } from "express";
import Stripe from "stripe";
import { db } from "@orion/db";
import { subscriptions, analyticsEvents } from "@orion/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export const webhooksRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

// POST /webhooks/stripe
webhooksRouter.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "No signature" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature failed");
    return res.status(400).json({ error: "Invalid signature" });
  }

  logger.info({ type: event.type }, "Stripe webhook received");

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .update(subscriptions)
          .set({
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .update(subscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        break;
      }

      case "invoice.payment_failed": {
        // TODO: notify org owner
        logger.warn({ event: event.id }, "Payment failed");
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Webhook processing failed");
    res.status(500).json({ error: "Processing failed" });
  }
});

// POST /webhooks/analytics — inbound pixel events from landing pages
webhooksRouter.post("/analytics", async (req, res) => {
  try {
    const { orgId, campaignId, assetId, channel, eventType, value, metadata } = req.body;

    if (!orgId || !eventType) return res.status(400).json({ error: "Missing fields" });

    await db.insert(analyticsEvents).values({
      orgId,
      campaignId,
      assetId,
      channel,
      eventType,
      value: value ?? 1,
      metadataJson: metadata ?? {},
      occurredAt: new Date(),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Analytics webhook failed");
    res.status(500).json({ error: "Failed" });
  }
});
