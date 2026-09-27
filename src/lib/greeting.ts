/**
 * Time-of-day greeting calibration for the dashboard greeting card.
 *
 * Two defects lived in the component-level version of this logic:
 *
 * 1. WRONG BUCKET IN THE MORNING. The lookup was
 *      `hour < 5 ? … : hour >= 5 && hour < 12 ? morning : hour < 13 ? lunch : …`
 *    so the second test (`hour < 13`) swallowed every hour from 00:00 to 04:59
 *    and answered "Ready for lunch" in the middle of the morning/night.
 * 2. STALE PHRASE. The phrase was selected once per app session, so an app left
 *    open (or backgrounded overnight) kept whatever it said when it mounted —
 *    yesterday's midday greeting could still be on screen at breakfast.
 *
 * The table below tiles the whole 24-hour clock exactly once: no gaps, no
 * overlaps, and a dedicated night window so 3 AM never claims to be morning or
 * lunchtime. Everything here is pure so it can be tested hour by hour
 * (test/greeting.test.ts).
 */

export type GreetingBucketId = "morning" | "midday" | "afternoon" | "evening" | "night";

export interface GreetingBucket {
  id: GreetingBucketId;
  /** Inclusive first hour of the window (0–23). */
  startHour: number;
  /** Exclusive end hour (0–23). Smaller than `startHour` means "wraps midnight". */
  endHour: number;
  /** Ionicons glyph name. Kept as a plain string so this module stays UI-free. */
  icon: string;
  phrases: string[];
}

/**
 * Calibrated windows (device local time):
 *   05:00–11:59 morning · 12:00–13:59 midday · 14:00–16:59 afternoon
 *   17:00–21:59 evening · 22:00–04:59 night
 */
export const GREETING_BUCKETS: GreetingBucket[] = [
  {
    id: "morning",
    startHour: 5,
    endHour: 12,
    icon: "sunny-outline",
    phrases: ["Good morning", "Rise and shine", "Fresh start", "Morning fuel-up"],
  },
  {
    id: "midday",
    startHour: 12,
    endHour: 14,
    icon: "restaurant-outline",
    phrases: ["Ready for lunch", "Midday check-in", "Lunch o'clock", "Fuel up for the afternoon"],
  },
  {
    id: "afternoon",
    startHour: 14,
    endHour: 17,
    icon: "partly-sunny-outline",
    phrases: ["Good afternoon", "Afternoon refuel", "Halfway there"],
  },
  {
    id: "evening",
    startHour: 17,
    endHour: 22,
    icon: "moon-outline",
    phrases: ["Good evening", "Evening check-in", "Close out the day strong"],
  },
  {
    id: "night",
    startHour: 22,
    endHour: 5,
    icon: "cloudy-night-outline",
    phrases: ["Still up?", "Late-night check-in", "Winding down", "Rest up soon"],
  },
];

/** True when `hour` (0–23) falls inside `bucket`, wrap past midnight included. */
export function isHourInBucket(hour: number, bucket: GreetingBucket): boolean {
  if (!Number.isFinite(hour)) return false;
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  if (bucket.startHour === bucket.endHour) return true; // whole-day window
  return bucket.startHour < bucket.endHour
    ? normalized >= bucket.startHour && normalized < bucket.endHour
    : normalized >= bucket.startHour || normalized < bucket.endHour;
}

/** Index into GREETING_BUCKETS for the device clock. Every hour is covered. */
export function timeBucketIndex(date: Date): number {
  const hour = date.getHours();
  const index = GREETING_BUCKETS.findIndex((bucket) => isHourInBucket(hour, bucket));
  // The table tiles the full clock, so -1 only happens if a future edit leaves
  // a hole — fall back to the morning greeting rather than crashing the card.
  return index === -1 ? 0 : index;
}

export function greetingBucketFor(date: Date): GreetingBucket {
  return GREETING_BUCKETS[timeBucketIndex(date)] ?? GREETING_BUCKETS[0];
}

/**
 * Phrase for a bucket. `seed` is the per-session randomness: the same seed and
 * bucket always give the same phrase, so the text is stable until the clock
 * genuinely moves into a new part of the day (no 5-second rotation).
 */
export function pickGreeting(bucket: GreetingBucket, seed: number): { icon: string; phrase: string } {
  const phrases = bucket.phrases.length > 0 ? bucket.phrases : ["Hello"];
  const index = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0)) % phrases.length;
  return { icon: bucket.icon, phrase: phrases[index] };
}
