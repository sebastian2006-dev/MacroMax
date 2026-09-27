/**
 * @file greeting.test.ts
 * Unit tests for the REAL src/lib/greeting.ts module — the time-of-day
 * calibration behind the dashboard greeting card.
 *
 * Regression guard for the reported bug: the old lookup used `hour < 13` as its
 * second test, so every hour from 00:00 to 04:59 answered with the LUNCH
 * bucket ("Ready for lunch" in the morning).
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GREETING_BUCKETS,
  greetingBucketFor,
  isHourInBucket,
  pickGreeting,
} from "../src/lib/greeting";
import type { GreetingBucketId } from "../src/lib/greeting";

/** `2026-09-22` with the given wall-clock hour and minute. */
function atHour(hour: number, minute = 0): Date {
  return new Date(2026, 8, 22, hour, minute, 0, 0);
}

function idAtHour(hour: number, minute = 0): GreetingBucketId {
  return greetingBucketFor(atHour(hour, minute)).id;
}

/** What each hour of the day must resolve to. */
const EXPECTED_BY_HOUR: GreetingBucketId[] = [
  "night", // 00
  "night", // 01
  "night", // 02
  "night", // 03
  "night", // 04
  "morning", // 05
  "morning", // 06
  "morning", // 07
  "morning", // 08
  "morning", // 09
  "morning", // 10
  "morning", // 11
  "midday", // 12
  "midday", // 13
  "afternoon", // 14
  "afternoon", // 15
  "afternoon", // 16
  "evening", // 17
  "evening", // 18
  "evening", // 19
  "evening", // 20
  "evening", // 21
  "night", // 22
  "night", // 23
];

// ── hour-by-hour calibration ─────────────────────────────────────────────────
describe("timeBucketIndex()", () => {
  it("maps all 24 hours to the expected bucket", () => {
    for (let hour = 0; hour < 24; hour++) {
      assert.equal(idAtHour(hour), EXPECTED_BY_HOUR[hour], `hour ${hour}`);
    }
  });

  it("never answers a morning hour with the midday/lunch bucket", () => {
    // The exact reported failure: "in the mornings it's showing Lunch related".
    for (let hour = 5; hour < 12; hour++) {
      const bucket = greetingBucketFor(atHour(hour));
      assert.equal(bucket.id, "morning", `hour ${hour}`);
      assert.ok(
        !bucket.phrases.includes("Ready for lunch") && !bucket.phrases.includes("Lunch o'clock"),
        `hour ${hour} must not offer a lunch phrase`
      );
    }
  });

  it("keeps the small hours out of every daytime bucket", () => {
    for (const hour of [0, 1, 2, 3, 4]) {
      assert.equal(idAtHour(hour), "night", `hour ${hour}`);
    }
  });

  it("flips exactly on the window boundaries", () => {
    assert.equal(idAtHour(4, 59), "night");
    assert.equal(idAtHour(5, 0), "morning");
    assert.equal(idAtHour(11, 59), "morning");
    assert.equal(idAtHour(12, 0), "midday");
    assert.equal(idAtHour(13, 59), "midday");
    assert.equal(idAtHour(14, 0), "afternoon");
    assert.equal(idAtHour(16, 59), "afternoon");
    assert.equal(idAtHour(17, 0), "evening");
    assert.equal(idAtHour(21, 59), "evening");
    assert.equal(idAtHour(22, 0), "night");
    assert.equal(idAtHour(23, 59), "night");
  });

  it("ignores minutes within an hour", () => {
    for (const minute of [0, 1, 30, 59]) {
      assert.equal(idAtHour(8, minute), "morning");
      assert.equal(idAtHour(20, minute), "evening");
    }
  });

  it("is stable across many days of the year", () => {
    for (const month of [0, 3, 6, 9, 11]) {
      for (const hour of [3, 9, 13, 18, 23]) {
        const date = new Date(2026, month, 15, hour, 30);
        assert.equal(greetingBucketFor(date).id, EXPECTED_BY_HOUR[hour], `${month}/${hour}`);
      }
    }
  });
});

// ── bucket table shape ───────────────────────────────────────────────────────
describe("GREETING_BUCKETS", () => {
  it("tiles the clock exactly once: no gap, no overlap", () => {
    const counts = new Array(24).fill(0);
    for (const bucket of GREETING_BUCKETS) {
      for (let hour = 0; hour < 24; hour++) {
        if (isHourInBucket(hour, bucket)) counts[hour] += 1;
      }
    }
    assert.deepEqual(counts, new Array(24).fill(1));
  });

  it("gives every bucket a unique id, an icon and phrases", () => {
    const ids = GREETING_BUCKETS.map((bucket) => bucket.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const bucket of GREETING_BUCKETS) {
      assert.ok(bucket.icon.length > 0, `${bucket.id} needs an icon`);
      assert.ok(bucket.phrases.length > 0, `${bucket.id} needs phrases`);
      for (const phrase of bucket.phrases) {
        assert.ok(phrase.trim().length > 0, `${bucket.id} has a blank phrase`);
      }
      // A window whose start and end match would mean "all day".
      assert.notEqual(bucket.startHour, bucket.endHour, `${bucket.id} spans nothing`);
    }
  });

  it("keeps the midday window narrow and the night window wrapping", () => {
    const midday = GREETING_BUCKETS.find((bucket) => bucket.id === "midday");
    const night = GREETING_BUCKETS.find((bucket) => bucket.id === "night");
    assert.equal(midday?.startHour, 12);
    assert.equal(midday?.endHour, 14);
    assert.ok(night && night.startHour > night.endHour, "night must wrap past midnight");
  });
});

// ── isHourInBucket ───────────────────────────────────────────────────────────
describe("isHourInBucket()", () => {
  const morning = GREETING_BUCKETS[0];
  const night = GREETING_BUCKETS[GREETING_BUCKETS.length - 1];

  it("treats start as inclusive and end as exclusive", () => {
    assert.equal(isHourInBucket(5, morning), true);
    assert.equal(isHourInBucket(11, morning), true);
    assert.equal(isHourInBucket(12, morning), false);
  });

  it("handles the window that wraps past midnight", () => {
    assert.equal(isHourInBucket(23, night), true);
    assert.equal(isHourInBucket(0, night), true);
    assert.equal(isHourInBucket(4, night), true);
    assert.equal(isHourInBucket(5, night), false);
  });

  it("rejects non-finite input", () => {
    assert.equal(isHourInBucket(Number.NaN, morning), false);
    assert.equal(isHourInBucket(Number.POSITIVE_INFINITY, morning), false);
  });
});

// ── pickGreeting ─────────────────────────────────────────────────────────────
describe("pickGreeting()", () => {
  const midday = GREETING_BUCKETS[1];

  it("is stable for a given seed", () => {
    assert.deepEqual(pickGreeting(midday, 42), pickGreeting(midday, 42));
  });

  it("always returns a phrase from the bucket, with its icon", () => {
    for (const bucket of GREETING_BUCKETS) {
      for (let seed = 0; seed < 200; seed++) {
        const picked = pickGreeting(bucket, seed);
        assert.equal(picked.icon, bucket.icon);
        assert.ok(bucket.phrases.includes(picked.phrase), `${bucket.id} → ${picked.phrase}`);
      }
    }
  });

  it("can reach every phrase of a bucket", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(pickGreeting(midday, seed).phrase);
    assert.equal(seen.size, midday.phrases.length);
  });

  it("survives junk seeds and empty phrase lists", () => {
    assert.equal(typeof pickGreeting(midday, Number.NaN).phrase, "string");
    assert.equal(typeof pickGreeting(midday, -7).phrase, "string");
    assert.equal(pickGreeting({ ...midday, phrases: [] }, 3).phrase, "Hello");
  });
});

// ── icons ────────────────────────────────────────────────────────────────────
describe("bucket icons", () => {
  it("names real Ionicons glyphs", () => {
    // Guards a silent failure mode: a typo'd name renders an empty circle
    // rather than crashing. Skipped if the dependency layout ever moves.
    let glyphs: Set<string>;
    try {
      const path = join(
        process.cwd(),
        "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json"
      );
      glyphs = new Set(Object.keys(JSON.parse(readFileSync(path, "utf8"))));
    } catch {
      return;
    }

    for (const bucket of GREETING_BUCKETS) {
      assert.ok(glyphs.has(bucket.icon), `unknown Ionicons glyph: ${bucket.icon}`);
    }
  });
});
