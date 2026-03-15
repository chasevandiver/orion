import { Router } from "express";
import Stripe from "stripe";
import { db } from "@orion/db";
import {
  orionSubscriptions as subscriptions,
  analyticsEvents,
  organizations,
  auditEvents,
} from "@orion/db/schema";
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        const stripeSubscriptionId = session.subscription as string | null;
        const stripeCustomerId = session.customer as string;

        if (!orgId) {
          logger.warn({ sessionId: session.id }, "checkout.session.completed missing orgId in metadata");
          break;
        }

        // Retrieve full subscription details if this is a subscription checkout
        if (stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
            expand: ["items.data.price"],
          });

          // Derive plan from price metadata (set this on your Stripe price objects)
          const price = sub.items.data[0]?.price as Stripe.Price | undefined;
          const plan = (price?.metadata?.plan as "free" | "pro" | "enterprise") ?? "pro";
          const currentPeriodEnd = new Date(sub.current_period_end * 1000);

          // Upsert subscription record
          await db
            .insert(subscriptions)
            .values({
              orgId,
              stripeCustomerId,
              stripeSubscriptionId,
              plan,
              status: "active",
              currentPeriodEnd,
            })
            .onConflictDoUpdate({
              target: subscriptions.orgId,
              set: {
                stripeSubscriptionId,
                stripeCustomerId,
                plan,
                status: "active",
                currentPeriodEnd,
                updatedAt: new Date(),
              },
            });

          // Update org plan
          await db
            .update(organizations)
            .set({ plan, updatedAt: new Date() })
            .where(eq(organizations.id, orgId));

          // Audit log
          await db.insert(auditEvents).values({
            orgId,
            action: "billing.subscription.created",
            resourceType: "subscription",
            metadataJson: { plan, subscriptionId: stripeSubscriptionId },
          });

          logger.info({ orgId, plan, stripeSubscriptionId }, "Subscription activated via checkout");
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;

        if (orgId) {
          // Full upsert — handles the race condition where this event fires before
          // checkout.session.completed has inserted the row.
          // Conflict target is stripeCustomerId (unique index: subscriptions_stripe_idx).
          // Note: stripeSubscriptionId has no unique constraint so cannot be used as target.
          await db
            .insert(subscriptions)
            .values({
              orgId,
              stripeCustomerId: sub.customer as string,
              stripeSubscriptionId: sub.id,
              plan: "pro",
              status: sub.status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
            })
            .onConflictDoUpdate({
              target: subscriptions.stripeCustomerId,
              set: {
                stripeSubscriptionId: sub.id,
                status: sub.status,
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
                updatedAt: new Date(),
              },
            });
        } else {
          // No orgId in subscription metadata — update-only path.
          // checkout.session.completed is responsible for the initial insert.
          await db
            .update(subscriptions)
            .set({
              stripeSubscriptionId: sub.id,
              status: sub.status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeCustomerId, sub.customer as string));
        }
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
