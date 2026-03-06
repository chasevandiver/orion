/**
 * Test stubs for TwitterClient.
 *
 * These tests mock fetch() so they run without real Twitter credentials.
 * Full E2E tests require TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET env vars.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwitterClient } from "../twitter/client.js";

const MOCK_TOKENS = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  expiresAt: new Date(Date.now() + 7200 * 1000),
};

describe("TwitterClient", () => {
  it("has channel name 'twitter'", () => {
    const client = new TwitterClient("org-1", MOCK_TOKENS, "user-123");
    expect(client.channelName).toBe("twitter");
  });

  describe("publish()", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: "tweet-abc", text: "Hello" } }),
      }));
    });

    it("returns platformPostId for a single tweet", async () => {
      const client = new TwitterClient("org-1", MOCK_TOKENS, "user-123");
      const result = await client.publish({ content: "Hello world!" });
      expect(result.platformPostId).toBe("tweet-abc");
      expect(result.url).toContain("tweet-abc");
    });

    it("posts the first tweet in a thread when content contains thread markers", async () => {
      const client = new TwitterClient("org-1", MOCK_TOKENS, "user-123");
      const content = "1/ First tweet\n\n2/ Second tweet\n\n3/ Third tweet";
      await client.publish({ content });
      // fetch should be called 3 times (once per tweet)
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("validateTokens()", () => {
    it("returns true when the API responds with 200", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: "user-123" } }),
      }));

      const client = new TwitterClient("org-1", MOCK_TOKENS, "user-123");
      const valid = await client.validateTokens();
      expect(valid).toBe(true);
    });

    it("returns false when the API responds with 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      }));

      const client = new TwitterClient("org-1", MOCK_TOKENS, "user-123");
      const valid = await client.validateTokens();
      expect(valid).toBe(false);
    });
  });
});
