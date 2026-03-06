/**
 * Test stubs for agent-logger.ts
 *
 * Run with: pnpm test (once a test runner is configured)
 * These stubs document the expected behavior without requiring a running DB/Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAgentRun, agentTimer } from "../agent-logger.js";

describe("logAgentRun", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("emits a JSON log line with required fields", () => {
    logAgentRun({
      timestamp: "2024-01-01T00:00:00.000Z",
      runId: "run-123",
      agentName: "MarketingStrategistAgent",
      promptVersion: "1.0.0",
      orgId: "org-abc",
      tokensUsed: 1200,
      durationMs: 3500,
      success: true,
    });

    expect(console.log).toHaveBeenCalledOnce();
    const logged = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(logged.level).toBe("info");
    expect(logged.agentName).toBe("MarketingStrategistAgent");
    expect(logged.tokensUsed).toBe(1200);
    expect(logged.success).toBe(true);
  });

  it("includes errorMessage when success is false", () => {
    logAgentRun({
      timestamp: "2024-01-01T00:00:00.000Z",
      runId: "run-fail",
      agentName: "ContentCreatorAgent",
      promptVersion: "1.0.0",
      orgId: "org-abc",
      tokensUsed: 0,
      durationMs: 500,
      success: false,
      errorMessage: "Rate limit exceeded",
    });

    const logged = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(logged.success).toBe(false);
    expect(logged.errorMessage).toBe("Rate limit exceeded");
  });
});

describe("agentTimer", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("emits a log entry when done() is called", async () => {
    const timer = agentTimer("AnalyticsAgent", "1.0.0", {
      runId: "run-timer",
      orgId: "org-xyz",
      resourceId: "campaign-abc",
    });

    // Simulate some work
    await new Promise((r) => setTimeout(r, 10));

    timer.done({ tokensUsed: 800 });

    expect(console.log).toHaveBeenCalledOnce();
    const logged = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(logged.durationMs).toBeGreaterThan(0);
    expect(logged.tokensUsed).toBe(800);
  });
});
