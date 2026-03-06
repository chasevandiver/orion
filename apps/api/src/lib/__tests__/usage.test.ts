/**
 * Test stubs for usage.ts — plan quota enforcement.
 *
 * These are integration-style tests that require a database connection.
 * In CI, set up a test PostgreSQL instance and run migrations first.
 *
 * Run with: pnpm test (once vitest is configured at the root)
 */

import { describe, it, expect } from "vitest";
import { PLAN_TOKEN_LIMITS, PLAN_POSTS_LIMITS, currentMonth } from "../usage.js";

describe("Plan limits constants", () => {
  it("free plan has 50k token limit", () => {
    expect(PLAN_TOKEN_LIMITS.free).toBe(50_000);
  });

  it("pro plan has 500k token limit", () => {
    expect(PLAN_TOKEN_LIMITS.pro).toBe(500_000);
  });

  it("enterprise plan has unlimited tokens", () => {
    expect(PLAN_TOKEN_LIMITS.enterprise).toBe(Infinity);
  });

  it("free plan allows 10 posts per month", () => {
    expect(PLAN_POSTS_LIMITS.free).toBe(10);
  });

  it("pro plan allows 500 posts per month", () => {
    expect(PLAN_POSTS_LIMITS.pro).toBe(500);
  });
});

describe("currentMonth()", () => {
  it("returns a YYYY-MM formatted string", () => {
    const month = currentMonth();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("matches today's year and month", () => {
    const month = currentMonth();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(month).toBe(expected);
  });
});

// ── Integration test stubs (require DB) ──────────────────────────────────────
// Uncomment and fill in orgId when running against a real test DB

// describe("getOrgQuota() integration", () => {
//   it("returns zero usage for a new org", async () => {
//     const { getOrgQuota } = await import("../usage.js");
//     const quota = await getOrgQuota("test-org-id");
//     expect(quota.tokensUsed).toBe(0);
//     expect(quota.postsPublished).toBe(0);
//   });
// });

// describe("trackTokenUsage() integration", () => {
//   it("increments usage and creates the record if it doesn't exist", async () => {
//     const { trackTokenUsage, getOrgQuota } = await import("../usage.js");
//     await trackTokenUsage("test-org-id", 1000);
//     const quota = await getOrgQuota("test-org-id");
//     expect(quota.tokensUsed).toBeGreaterThanOrEqual(1000);
//   });
// });
