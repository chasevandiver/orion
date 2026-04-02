/**
 * attribute-revenue.ts
 *
 * Traces a contact back to their source campaign/channel and computes
 * attribution data: which campaign generated this customer, which channel
 * they came through, and time from first touch to conversion.
 */
import { db } from "@orion/db";
import { contacts, contactEvents, campaigns, trackingLinks } from "@orion/db/schema";
import { eq, and, asc } from "drizzle-orm";

export interface AttributionData {
  sourceCampaignId: string | null;
  sourceCampaignName: string | null;
  sourceChannel: string | null;
  firstTouchAt: string | null;
  conversionAt: string | null;
  daysToConvert: number | null;
  touchpoints: number;
}

export async function attributeRevenue(contactId: string): Promise<AttributionData> {
  // 1. Load the contact
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      sourceCampaign: { columns: { id: true, name: true } },
    },
  });

  if (!contact) {
    return emptyAttribution();
  }

  // 2. Load all contact events sorted chronologically
  const events = await db.query.contactEvents.findMany({
    where: eq(contactEvents.contactId, contactId),
    orderBy: asc(contactEvents.occurredAt),
  });

  const touchpoints = events.length;
  const firstTouchAt = events.length > 0
    ? events[0]!.occurredAt.toISOString()
    : contact.createdAt.toISOString();

  const conversionAt = contact.dealClosedAt?.toISOString()
    ?? new Date().toISOString();

  // 3. Calculate days to convert
  const firstTouch = new Date(firstTouchAt);
  const conversion = new Date(conversionAt);
  const daysToConvert = Math.round(
    (conversion.getTime() - firstTouch.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 4. Determine source campaign and channel
  let sourceCampaignId = contact.sourceCampaignId;
  let sourceCampaignName = (contact as any).sourceCampaign?.name ?? null;
  let sourceChannel: string | null = contact.sourceChannel;

  // If no source campaign on the contact, try to trace through events
  if (!sourceCampaignId && events.length > 0) {
    for (const event of events) {
      const meta = event.metadataJson as Record<string, unknown> | null;
      if (!meta) continue;

      // Check for tracking link reference
      if (meta.trackingId && typeof meta.trackingId === "string") {
        const link = await db.query.trackingLinks.findFirst({
          where: eq(trackingLinks.trackingId, meta.trackingId),
        });
        if (link?.campaignId) {
          sourceCampaignId = link.campaignId;
          sourceChannel = sourceChannel ?? link.channel;
          break;
        }
      }

      // Check for direct campaign reference in event metadata
      if (meta.campaignId && typeof meta.campaignId === "string") {
        sourceCampaignId = meta.campaignId;
        break;
      }
    }

    // Resolve campaign name if we found one
    if (sourceCampaignId && !sourceCampaignName) {
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, sourceCampaignId),
        columns: { name: true },
      });
      sourceCampaignName = campaign?.name ?? null;
    }
  }

  const attribution: AttributionData = {
    sourceCampaignId,
    sourceCampaignName,
    sourceChannel,
    firstTouchAt,
    conversionAt,
    daysToConvert,
    touchpoints,
  };

  // 5. Store attribution on the contact
  await db
    .update(contacts)
    .set({ attributionJson: attribution })
    .where(eq(contacts.id, contactId));

  return attribution;
}

function emptyAttribution(): AttributionData {
  return {
    sourceCampaignId: null,
    sourceCampaignName: null,
    sourceChannel: null,
    firstTouchAt: null,
    conversionAt: null,
    daysToConvert: null,
    touchpoints: 0,
  };
}
