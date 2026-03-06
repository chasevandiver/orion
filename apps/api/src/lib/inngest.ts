/**
 * DO NOT instantiate a new Inngest client here.
 *
 * The canonical client lives in @orion/queue/src/client.ts with id "orion".
 * Importing from there ensures the API sends events to the same Inngest app
 * that the job listeners are registered under.
 */
export { inngest } from "@orion/queue";
