export interface InngestHealthResult {
  healthy: boolean;
  mode: "dev" | "cloud";
  error?: string;
}

/**
 * Checks whether the Inngest event bus is reachable.
 *
 * Dev mode  (INNGEST_DEV=1): pings http://localhost:8288/v0/health with a
 *   3-second timeout. Returns healthy=false if the dev server is not running.
 *
 * Cloud mode: checks that INNGEST_EVENT_KEY is set. We can't reach the cloud
 *   endpoint from a backend health check easily, so we trust the key presence
 *   as a proxy for "configured correctly".
 */
export async function checkInngestHealth(): Promise<InngestHealthResult> {
  const isDevMode = process.env.INNGEST_DEV === "1";

  if (isDevMode) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    try {
      const res = await fetch("http://localhost:8288/health", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        return { healthy: true, mode: "dev" };
      }
      return {
        healthy: false,
        mode: "dev",
        error: `Inngest dev server returned HTTP ${res.status}`,
      };
    } catch {
      clearTimeout(timeout);
      return {
        healthy: false,
        mode: "dev",
        error: "Inngest dev server not reachable at localhost:8288",
      };
    }
  }

  // Cloud mode — trust INNGEST_EVENT_KEY presence
  if (process.env.INNGEST_EVENT_KEY) {
    return { healthy: true, mode: "cloud" };
  }

  return {
    healthy: false,
    mode: "cloud",
    error: "INNGEST_EVENT_KEY is not set. Inngest cloud events will not be delivered.",
  };
}
