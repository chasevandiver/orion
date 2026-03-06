/**
 * Canonical Inngest client for the ORION platform.
 *
 * IMPORTANT: This is the ONLY place an Inngest client should be instantiated.
 * Both apps/api and packages/queue must import from here to ensure all events
 * are sent and received by the same logical Inngest application.
 *
 * Previously, apps/api had its own client with id "orion-api" while this
 * package used id "orion" — causing events sent by the API to never be
 * received by the job listeners.
 */
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "orion",
  eventKey: process.env.INNGEST_EVENT_KEY ?? "local",
  // In production, Inngest uses INNGEST_SIGNING_KEY to verify payloads.
  // Locally it falls back to unsigned mode against the dev server.
  ...(process.env.INNGEST_SIGNING_KEY
    ? { signingKey: process.env.INNGEST_SIGNING_KEY }
    : {}),
});
