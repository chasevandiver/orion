import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "orion-api",
  eventKey: process.env.INNGEST_EVENT_KEY ?? "local",
});
