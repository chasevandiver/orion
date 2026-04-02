/**
 * Optimal posting-time utilities.
 *
 * getOptimalPostingTime() — async, queries analytics_rollups for the org's
 *   actual engagement data grouped by day-of-week + hour-of-day.  Falls back
 *   to the static nextBusinessHour() defaults when fewer than MIN_DATA_POINTS
 *   rows exist for the channel.
 *
 * computeOrgBestPostingTimes() — returns the top slot per channel for a list
 *   of channels; used by the optimization job to persist results on the org.
 *
 * nextBusinessHour() — static fallback (was previously inlined in jobs/index.ts).
 */
import { db } from "@orion/db";
import { analyticsRollups } from "@orion/db/schema";
import { and, eq, gt, gte, sql } from "drizzle-orm";

export interface BestPostingTime {
  channel: string;
  /** Sunday = 0 … Saturday = 6 */
  dayOfWeek: number;
  /** UTC hour 0–23 */
  hourUtc: number;
  /** engagements / impressions */
  engagementRate: number;
}

const MIN_DATA_POINTS = 20;

// ── Static defaults ────────────────────────────────────────────────────────────

/** UTC hour that makes sense for a channel when we have no data. */
function defaultHourForChannel(channel: string): number {
  switch (channel) {
    case "instagram":
    case "tiktok":
      return 18;
    case "twitter":
      return 12;
    default:
      return 9;
  }
}

/** Default days-of-week (0=Sun) per channel. */
function defaultDaysForChannel(channel: string): number[] {
  switch (channel) {
    case "linkedin":
    case "email":
      return [2, 3, 4]; // Tue/Wed/Thu
    case "twitter":
      return [1, 2, 3, 4, 5]; // weekdays
    case "instagram":
    case "tiktok":
      return [0, 6]; // Sat/Sun
    default:
      return [1, 2, 3, 4, 5];
  }
}

/**
 * Returns the next optimal UTC send time for a channel, expressed relative to
 * the org's local timezone (defaults to "America/Chicago").
 *
 * LinkedIn/Email:    next Tue/Wed/Thu at 09:00 local
 * Twitter:           next weekday    at 12:00 local
 * Instagram/TikTok:  next Sat/Sun    at 18:00 local
 * Everything else:   next weekday    at 09:00 local
 */
export function nextBusinessHour(
  channel: string,
  from: Date,
  orgTimezone = "America/Chicago",
): Date {
  function getLocalParts(d: Date, tz: string) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "long",
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const { type, value } of fmt.formatToParts(d)) parts[type] = value;
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return {
      year: parseInt(parts.year!),
      month: parseInt(parts.month!) - 1, // 0-indexed
      day: parseInt(parts.day!),
      hour: parseInt(parts.hour!) === 24 ? 0 : parseInt(parts.hour!),
      minute: parseInt(parts.minute!),
      weekday: DAYS.indexOf(parts.weekday!),
    };
  }

  function localToUTC(year: number, month: number, day: number, hour: number, tz: string): Date {
    const naive = new Date(Date.UTC(year, month, day, hour, 0, 0));
    const local = getLocalParts(naive, tz);
    const localAsUTC = Date.UTC(local.year, local.month, local.day, local.hour, local.minute, 0);
    const offsetMs = naive.getTime() - localAsUTC;
    return new Date(naive.getTime() + offsetMs);
  }

  function advance(targetDays: number[], targetHour: number): Date {
    const localNow = getLocalParts(from, orgTimezone);
    for (let offset = 0; offset <= 14; offset++) {
      const anchor = new Date(Date.UTC(localNow.year, localNow.month, localNow.day + offset, 12, 0, 0));
      const candidateLocal = getLocalParts(anchor, orgTimezone);
      if (!targetDays.includes(candidateLocal.weekday)) continue;
      const slotUTC = localToUTC(candidateLocal.year, candidateLocal.month, candidateLocal.day, targetHour, orgTimezone);
      if (slotUTC > from) return slotUTC;
    }
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  switch (channel) {
    case "linkedin":
    case "email":
      return advance([2, 3, 4], 9);
    case "twitter":
      return advance([1, 2, 3, 4, 5], 12);
    case "instagram":
    case "tiktok":
      return advance([0, 6], 18);
    default:
      return advance([1, 2, 3, 4, 5], 9);
  }
}

// ── Data-driven helpers ────────────────────────────────────────────────────────

/**
 * Query analytics_rollups for a single channel and return the top-3 time slots
 * (day-of-week + hour-of-day) ranked by avg engagement rate over the last 60 days.
 *
 * Returns [] when fewer than MIN_DATA_POINTS rows are available.
 */
async function getBestSlotsForChannel(
  orgId: string,
  channel: string,
): Promise<BestPostingTime[]> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${analyticsRollups.date})::int`,
      hourUtc: sql<number>`EXTRACT(HOUR FROM ${analyticsRollups.date})::int`,
      impressions: analyticsRollups.impressions,
      engagements: analyticsRollups.engagements,
    })
    .from(analyticsRollups)
    .where(
      and(
        eq(analyticsRollups.orgId, orgId),
        eq(analyticsRollups.channel, channel),
        gte(analyticsRollups.date, sixtyDaysAgo),
        gt(analyticsRollups.impressions, 0),
      ),
    );

  if (rows.length < MIN_DATA_POINTS) return [];

  // Group by DOW+hour, accumulate totals
  const slotMap = new Map<
    string,
    { totalEng: number; totalImp: number; dow: number; hour: number }
  >();
  for (const row of rows) {
    const key = `${row.dayOfWeek}-${row.hourUtc}`;
    const slot = slotMap.get(key) ?? {
      totalEng: 0,
      totalImp: 0,
      dow: row.dayOfWeek,
      hour: row.hourUtc,
    };
    slot.totalEng += row.engagements;
    slot.totalImp += row.impressions;
    slotMap.set(key, slot);
  }

  const sorted = Array.from(slotMap.values())
    .map((s) => ({
      channel,
      dayOfWeek: s.dow,
      hourUtc: s.hour,
      engagementRate: s.totalImp > 0 ? s.totalEng / s.totalImp : 0,
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 3);

  // If rollups are all stored at midnight (hour=0), overlay the channel's
  // known-good default hour so the returned slot is actionable.
  const allAtMidnight = sorted.every((s) => s.hourUtc === 0);
  if (allAtMidnight) {
    const defaultHour = defaultHourForChannel(channel);
    return sorted.map((s) => ({ ...s, hourUtc: defaultHour }));
  }

  return sorted;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the next UTC Date at which a post for `channel` should be scheduled.
 *
 * Queries the last-60-days rollups; if enough data exists (≥ 20 rows) it picks
 * the highest-engagement day+hour slot and returns its next occurrence.
 * Falls back to nextBusinessHour() when data is insufficient.
 */
export async function getOptimalPostingTime(
  orgId: string,
  channel: string,
  from: Date = new Date(),
  orgTimezone = "America/Chicago",
): Promise<Date> {
  const top = await getBestSlotsForChannel(orgId, channel);

  if (top.length === 0) {
    return nextBusinessHour(channel, from, orgTimezone);
  }

  // Walk forward up to two weeks, return the first slot that matches a top DOW
  for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
    const candidate = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const candidateDow = candidate.getUTCDay();
    const match = top.find((s) => s.dayOfWeek === candidateDow);
    if (match) {
      const result = new Date(candidate);
      result.setUTCHours(match.hourUtc, 0, 0, 0);
      if (result > from) return result;
    }
  }

  return nextBusinessHour(channel, from, orgTimezone);
}

/**
 * Compute the single best posting slot per channel for a list of channels.
 * Used by the optimization job to persist results on the org record.
 */
export async function computeOrgBestPostingTimes(
  orgId: string,
  channels: string[],
): Promise<BestPostingTime[]> {
  const results: BestPostingTime[] = [];
  for (const channel of channels) {
    const slots = await getBestSlotsForChannel(orgId, channel);
    const best = slots[0];
    if (best) results.push(best);
  }
  return results;
}
