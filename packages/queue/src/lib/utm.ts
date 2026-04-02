/**
 * UTM parameter utilities for attribution tracking.
 *
 * Usage:
 *   appendUtmParams(url, { source: "linkedin", medium: "social", campaign: "q4-launch" })
 *   applyUtmToText(contentText, utmParams)
 */

export const UTM_MEDIUM_MAP: Record<string, string> = {
  linkedin:     "social",
  twitter:      "social",
  instagram:    "social",
  facebook:     "social",
  tiktok:       "social",
  email:        "email",
  blog:         "blog",
  website:      "organic",
  landing_page: "campaign",
};

/** Convert an arbitrary string into a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
}

/**
 * Append UTM parameters to a URL.
 * If the URL already contains `utm_source`, it is returned unchanged (no overwrite).
 * Returns the original string unchanged if parsing fails.
 */
export function appendUtmParams(
  url: string,
  params: { source: string; medium: string; campaign: string; content?: string },
): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("utm_source")) return url; // already tagged
    parsed.searchParams.set("utm_source", params.source);
    parsed.searchParams.set("utm_medium", params.medium);
    parsed.searchParams.set("utm_campaign", params.campaign);
    if (params.content) parsed.searchParams.set("utm_content", params.content);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Find every http/https URL in `text` and append UTM params to each one,
 * skipping URLs that already carry `utm_source`.
 */
export function applyUtmToText(
  text: string,
  params: { source: string; medium: string; campaign: string; content?: string },
): string {
  return text.replace(/https?:\/\/[^\s<>"')\]]+/g, (url) =>
    appendUtmParams(url, params),
  );
}
