/**
 * @file mealReminders.test.ts
 * Guards the meal-reminder rules: what a saved config means, when each kind of
 * reminder next rings, what actually gets handed to the OS scheduler, and when
 * a one-shot alarm must switch itself off.
 *
 * Why this exists: these decisions run while the app is opening and are the
 * only thing standing between "a friendly nudge at lunch" and "an alarm that
 * fires at 3 am on the wrong day, or never". The module is pure precisely so
 * all of it can be asserted here rather than discovered on a phone.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_DAYS,
  DEFAULT_REMINDER_TIMES,
  MAX_REMINDER_NAME_LENGTH,
  MEAL_KEYS,
  MEAL_LABELS,
  MealKey,
  MealReminder,
  MealReminderMap,
  defaultMealReminders,
  describeSchedules,
  formatNextLabel,
  formatRepeatLabel,
  formatTimeLabel,
  isMealKey,
  isMealScheduleId,
  nextOccurrence,
  nextRingLabel,
  normaliseReminder,
  onceScheduleId,
  parseMealReminders,
  reconcilePlan,
  reminderNotification,
  scheduleIdsFor,
  serializeMealReminders,
  uiDayToExpoWeekday,
  weeklyScheduleId,
} from "../src/lib/mealReminders";

function localDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month, day, hour, minute, 0, 0);
}

/** A default-config map with per-meal overrides applied. */
function buildMap(overrides: Partial<Record<MealKey, Partial<MealReminder>>>): MealReminderMap {
  const map = defaultMealReminders();
  for (const meal of MEAL_KEYS) {
    const patch = overrides[meal];
    if (patch) {
      map[meal] = { ...map[meal], ...patch, meal };
    }
  }
  return map;
}

describe("uiDayToExpoWeekday — Monday-first UI to expo's 1 = Sunday", () => {
  it("maps every chip to the weekday expo expects", () => {
    assert.deepEqual(ALL_DAYS.map(uiDayToExpoWeekday), [2, 3, 4, 5, 6, 7, 1]);
  });

  it("keeps Sunday as 1 and Saturday as 7", () => {
    assert.equal(uiDayToExpoWeekday(6), 1);
    assert.equal(uiDayToExpoWeekday(5), 7);
  });
});

describe("defaults and parsing", () => {
  it("starts every meal off, at a sensible time, repeating daily", () => {
    const map = defaultMealReminders();
    assert.deepEqual(Object.keys(map).sort(), [...MEAL_KEYS].sort());
    for (const meal of MEAL_KEYS) {
      assert.equal(map[meal].enabled, false);
      assert.equal(map[meal].once, false);
      assert.deepEqual(map[meal].days, [...ALL_DAYS]);
      assert.deepEqual(
        [map[meal].hour, map[meal].minute],
        [DEFAULT_REMINDER_TIMES[meal].hour, DEFAULT_REMINDER_TIMES[meal].minute],
      );
      assert.equal(map[meal].name, `${MEAL_LABELS[meal]} time`);
    }
  });

  it("falls back to the defaults for missing, unparsable or hostile storage", () => {
    const defaults = defaultMealReminders();
    for (const raw of [null, undefined, "", "{ not json", "null", '"a string"', "[]"]) {
      const parsed = parseMealReminders(raw as string | null);
      assert.deepEqual(parsed, defaults, `raw=${String(raw)}`);
    }
  });

  it("clamps junk values instead of trusting them", () => {
    const parsed = parseMealReminders(
      JSON.stringify({
        breakfast: { enabled: true, hour: 99, minute: -4, days: [9, "x", 2, 2, 6, 0], once: true, name: "" },
      }),
    );
    assert.equal(parsed.breakfast.enabled, true);
    assert.equal(parsed.breakfast.hour, 23);
    assert.equal(parsed.breakfast.minute, 0);
    assert.deepEqual(parsed.breakfast.days, [0, 2, 6]);
    assert.equal(parsed.breakfast.name, "Breakfast time");
  });

  it("only treats a real boolean true as enabled", () => {
    const parsed = parseMealReminders(
      JSON.stringify({ lunch: { enabled: "yes", hour: 12, minute: 0, days: [0] } }),
    );
    assert.equal(parsed.lunch.enabled, false);
  });

  it("caps the reminder name so it can never reach storage unbounded", () => {
    const parsed = parseMealReminders(
      JSON.stringify({ dinner: { name: "x".repeat(120), days: [0] } }),
    );
    assert.equal(parsed.dinner.name.length, MAX_REMINDER_NAME_LENGTH);
  });

  it("ignores unknown keys from a hand-edited file", () => {
    const parsed = parseMealReminders(JSON.stringify({ brunch: { enabled: true }, lunch: { days: [1] } }));
    assert.deepEqual(Object.keys(parsed).sort(), [...MEAL_KEYS].sort());
  });
});

describe("normaliseReminder — the no-dead-alarm rule", () => {
  it("turns a repeating reminder with no weekdays into a one-shot", () => {
    const normalised = normaliseReminder({
      meal: "snacks",
      enabled: true,
      hour: 16,
      minute: 30,
      days: [],
      once: false,
      name: "Snacks",
    });
    assert.equal(normalised.once, true);
  });

  it("sorts and de-duplicates the weekday list", () => {
    const normalised = normaliseReminder({
      meal: "lunch",
      enabled: true,
      hour: 13,
      minute: 0,
      days: [6, 0, 6, 3],
      once: false,
      name: "Lunch",
    });
    assert.deepEqual(normalised.days, [0, 3, 6]);
    assert.equal(normalised.once, false);
  });
});

describe("serialization", () => {
  it("round-trips every field through user_prefs JSON", () => {
    const map = buildMap({
      breakfast: { enabled: true, hour: 7, minute: 45, days: [0, 6], once: false, name: "Porridge o'clock" },
      lunch: { enabled: true, hour: 13, minute: 15, days: [], once: true, name: "Lunch", armedAt: "2026-10-14T07:00:00.000Z" },
    });

    const parsed = parseMealReminders(serializeMealReminders(map));
    assert.equal(parsed.breakfast.name, "Porridge o'clock");
    assert.deepEqual([parsed.breakfast.hour, parsed.breakfast.minute], [7, 45]);
    assert.deepEqual(parsed.breakfast.days, [0, 6]);
    assert.equal(parsed.breakfast.once, false);
    assert.equal(parsed.lunch.once, true);
    assert.deepEqual(parsed.lunch.days, []);
    assert.equal(parsed.lunch.armedAt, "2026-10-14T07:00:00.000Z");
  });

  it("never persists a stale armedAt on a repeating reminder", () => {
    const map = buildMap({
      dinner: { enabled: true, days: [0], once: false, armedAt: "2026-10-14T07:00:00.000Z" },
    });
    const raw = JSON.parse(serializeMealReminders(map)) as Record<string, { armedAt?: string }>;
    assert.equal(raw.dinner.armedAt, undefined);
  });
});

describe("labels", () => {
  it("formats the time in 12-hour form, including the am/pm edges", () => {
    assert.equal(formatTimeLabel(0, 0), "12:00 am");
    assert.equal(formatTimeLabel(8, 5), "8:05 am");
    assert.equal(formatTimeLabel(12, 0), "12:00 pm");
    assert.equal(formatTimeLabel(13, 30), "1:30 pm");
    assert.equal(formatTimeLabel(23, 59), "11:59 pm");
  });

  it("summarises the repeat rule the way the list screen shows it", () => {
    const base = defaultMealReminders().lunch;
    assert.equal(formatRepeatLabel({ ...base, days: [...ALL_DAYS], once: false }), "Every day");
    assert.equal(formatRepeatLabel({ ...base, days: [0, 2, 4], once: false }), "Mon, Wed, Fri");
    assert.equal(formatRepeatLabel({ ...base, days: [6, 0], once: false }), "Mon, Sun");
    assert.equal(formatRepeatLabel({ ...base, days: [...ALL_DAYS], once: true }), "Once");
    assert.equal(formatRepeatLabel({ ...base, days: [], once: false }), "Once");
  });

  it("uses Samsung's date line, including Today/Tomorrow", () => {
    // 14 Oct 2026 is a Wednesday.
    const now = localDate(2026, 9, 14, 9);
    assert.equal(formatNextLabel(localDate(2026, 9, 14, 13), now), "Today-Wed, 14 Oct");
    assert.equal(formatNextLabel(localDate(2026, 9, 15, 13), now), "Tomorrow-Thu, 15 Oct");
    assert.equal(formatNextLabel(localDate(2026, 9, 20, 13), now), "Tue, 20 Oct");
    // 1 Jan 2026 is a Thursday — the weekday must come from the date, not a guess.
    assert.equal(formatNextLabel(localDate(2026, 0, 1, 13), now), "Thu, 1 Jan");
  });
});

describe("nextOccurrence", () => {
  const onceAt = { hour: 8, minute: 0, days: [] as number[], once: true };

  it("lands later today when the time has not passed yet", () => {
    const next = nextOccurrence(onceAt, localDate(2026, 9, 14, 6, 30));
    assert.deepEqual(
      [next.getFullYear(), next.getMonth(), next.getDate(), next.getHours(), next.getMinutes()],
      [2026, 9, 14, 8, 0],
    );
  });

  it("rolls to tomorrow once the time has passed", () => {
    const next = nextOccurrence(onceAt, localDate(2026, 9, 14, 9, 0));
    assert.deepEqual([next.getDate(), next.getHours()], [15, 8]);
  });

  it("crosses month and year boundaries", () => {
    const nextMonth = nextOccurrence(onceAt, localDate(2026, 9, 31, 23));
    assert.deepEqual([nextMonth.getMonth(), nextMonth.getDate()], [10, 1]);

    const nextYear = nextOccurrence(onceAt, localDate(2026, 11, 31, 23));
    assert.deepEqual([nextYear.getFullYear(), nextYear.getMonth(), nextYear.getDate()], [2027, 0, 1]);
  });

  it("is always strictly in the future", () => {
    const from = localDate(2026, 9, 14, 13, 0);
    for (let hour = 0; hour < 24; hour += 1) {
      for (const days of [[], [0], [0, 1, 2, 3, 4, 5, 6]]) {
        for (const once of [true, false]) {
          const next = nextOccurrence({ hour, minute: 0, days, once }, from);
          assert.ok(
            next.getTime() > from.getTime(),
            `hour=${hour} days=[${days}] once=${once} must be in the future`,
          );
        }
      }
    }
  });

  it("picks the next selected weekday for a repeating reminder", () => {
    // Wed 14 Oct 2026 → the next Monday-only alarm is Mon 19 Oct.
    const next = nextOccurrence({ hour: 8, minute: 0, days: [0], once: false }, localDate(2026, 9, 14, 9));
    assert.deepEqual([next.getMonth(), next.getDate(), next.getHours()], [9, 19, 8]);
  });

  it("uses today when today is one of the selected days and its time is ahead", () => {
    // Mon 12 Oct 2026 at 07:00, alarm at 08:00 on Mondays.
    const next = nextOccurrence({ hour: 8, minute: 0, days: [0], once: false }, localDate(2026, 9, 12, 7));
    assert.deepEqual([next.getDate(), next.getHours()], [12, 8]);
  });

  it("skips to next week when today's own time has already passed", () => {
    const next = nextOccurrence({ hour: 8, minute: 0, days: [0], once: false }, localDate(2026, 9, 12, 9));
    assert.deepEqual([next.getDate(), next.getHours()], [19, 8]);
  });

  it("treats Sunday as its own day (index 6, not 0)", () => {
    // Sun 18 Oct 2026 at 07:00 → an 08:00 Sunday alarm rings the same day.
    const next = nextOccurrence({ hour: 8, minute: 0, days: [6], once: false }, localDate(2026, 9, 18, 7));
    assert.deepEqual([next.getDate(), next.getHours()], [18, 8]);
  });
});

describe("describeSchedules — what the OS is actually asked to do", () => {
  const now = localDate(2026, 9, 14, 9);

  it("schedules nothing while every reminder is off", () => {
    assert.deepEqual(describeSchedules(defaultMealReminders(), now), []);
  });

  it("schedules exactly one dated notification for a one-shot reminder", () => {
    const schedules = describeSchedules(
      buildMap({ lunch: { enabled: true, hour: 13, minute: 0, days: [], once: true, name: "Lunch" } }),
      now,
    );
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].identifier, onceScheduleId("lunch"));
    assert.equal(schedules[0].meal, "lunch");
    assert.equal(schedules[0].trigger.kind, "date");
    if (schedules[0].trigger.kind === "date") {
      assert.ok(schedules[0].trigger.date.getTime() > now.getTime());
      assert.equal(schedules[0].trigger.date.getHours(), 13);
    }
    assert.equal(schedules[0].data.meal, "lunch");
    assert.match(schedules[0].title, /Lunch/);
  });

  it("schedules one weekly notification per selected weekday", () => {
    const schedules = describeSchedules(
      buildMap({ dinner: { enabled: true, hour: 19, minute: 30, days: [0, 2, 6], once: false } }),
      now,
    );
    assert.deepEqual(
      schedules.map((entry) => entry.identifier),
      [weeklyScheduleId("dinner", 0), weeklyScheduleId("dinner", 2), weeklyScheduleId("dinner", 6)],
    );
    const weekdays = schedules.map((entry) =>
      entry.trigger.kind === "weekly" ? entry.trigger.weekday : -1,
    );
    assert.deepEqual(weekdays, [2, 4, 1]); // Mon, Wed, Sun in expo numbering
    for (const entry of schedules) {
      assert.equal(entry.trigger.kind, "weekly");
      if (entry.trigger.kind === "weekly") {
        assert.equal(entry.trigger.hour, 19);
        assert.equal(entry.trigger.minute, 30);
      }
    }
  });

  it("collapses a selected weekday set that is empty into a single dated ring", () => {
    const schedules = describeSchedules(
      buildMap({
        snacks: { enabled: true, hour: 16, minute: 30, days: [...ALL_DAYS], once: false },
        breakfast: { enabled: true, hour: 8, minute: 0, days: [], once: false },
      }),
      now,
    );
    assert.equal(schedules.filter((entry) => entry.meal === "snacks").length, 7);
    const breakfast = schedules.filter((entry) => entry.meal === "breakfast");
    assert.equal(breakfast.length, 1);
    assert.equal(breakfast[0].trigger.kind, "date");
  });
});

describe("reminderNotification", () => {
  it("uses the user's name and a friendly body", () => {
    const reminder = { ...defaultMealReminders().breakfast, name: "Breakfast" };
    const { title, body } = reminderNotification(reminder, localDate(2026, 9, 14, 8));
    assert.match(title, /Breakfast/);
    assert.ok(body.length > 20, "body must be a real sentence");
  });

  it("rotates the message across days instead of repeating one line", () => {
    const reminder = defaultMealReminders().dinner;
    const bodies = new Set(
      [1, 2, 3].map((day) => reminderNotification(reminder, localDate(2026, 0, day, 19)).body),
    );
    assert.equal(bodies.size, 3);
  });
});

describe("reconcilePlan — the app-dead one-shot cleanup", () => {
  // Built from LOCAL dates: the rules are wall-clock, so a hard-coded UTC
  // instant would make these assertions pass or fail by timezone.
  const armedAtDate = localDate(2026, 9, 14, 9, 59);
  const armedAt = armedAtDate.toISOString();

  it("switches a one-shot reminder off once it has rung while the app was dead", () => {
    const stored = buildMap({
      lunch: { enabled: true, hour: 10, minute: 0, days: [], once: true, armedAt },
    });
    const plan = reconcilePlan(stored, [], localDate(2026, 9, 14, 10, 30));
    assert.equal(plan.next.lunch.enabled, false);
    assert.equal(plan.next.lunch.armedAt, undefined);
    assert.equal(plan.changed, true);
    // Nothing left to cancel and nothing left to schedule.
    assert.equal(plan.needsReschedule, false);
    assert.deepEqual(plan.staleIds, []);
  });

  it("leaves a one-shot reminder armed until its time actually arrives", () => {
    const stored = buildMap({
      lunch: { enabled: true, hour: 23, minute: 59, days: [], once: true, armedAt },
    });
    const plan = reconcilePlan(stored, [], armedAtDate);
    assert.equal(plan.next.lunch.enabled, true);
    assert.equal(plan.changed, false);
    assert.equal(plan.needsReschedule, true); // the pending notification is gone
  });

  it("does not touch a one-shot reminder whose notification is still pending", () => {
    const stored = buildMap({
      lunch: { enabled: true, hour: 10, minute: 0, days: [], once: true, armedAt },
    });
    const plan = reconcilePlan(stored, [onceScheduleId("lunch")], localDate(2026, 9, 14, 12, 0));
    assert.equal(plan.changed, false);
    assert.equal(plan.next.lunch.enabled, true);
    assert.equal(plan.needsReschedule, false);
  });

  it("re-arms a repeating reminder the OS no longer has pending", () => {
    const stored = buildMap({ dinner: { enabled: true, days: [0, 3], once: false } });
    const plan = reconcilePlan(stored, [], localDate(2026, 9, 14, 9));
    assert.equal(plan.needsReschedule, true);
    assert.deepEqual(plan.staleIds, []);
  });

  it("is a no-op when the OS already matches storage", () => {
    const stored = buildMap({ dinner: { enabled: true, days: [0, 3], once: false } });
    const plan = reconcilePlan(
      stored,
      [weeklyScheduleId("dinner", 0), weeklyScheduleId("dinner", 3)],
      localDate(2026, 9, 14, 9),
    );
    assert.equal(plan.needsReschedule, false);
    assert.deepEqual(plan.staleIds, []);
    assert.equal(plan.changed, false);
  });

  it("reports a switched-off reminder's leftover notification as stale", () => {
    const stored = buildMap({ lunch: { enabled: false, days: [...ALL_DAYS], once: false } });
    const plan = reconcilePlan(stored, [weeklyScheduleId("lunch", 0)], localDate(2026, 9, 14, 9));
    assert.deepEqual(plan.staleIds, [weeklyScheduleId("lunch", 0)]);
    assert.equal(plan.needsReschedule, true);
  });

  it("ignores notifications that belong to other features", () => {
    const stored = buildMap({});
    const plan = reconcilePlan(stored, ["expo-something-else", "fcm-topic"], localDate(2026, 9, 14, 9));
    assert.deepEqual(plan.staleIds, []);
    assert.equal(plan.needsReschedule, false);
  });
});

describe("identifier namespace", () => {
  it("covers one-shot plus all seven weekdays for cancel-and-replace", () => {
    const ids = scheduleIdsFor("snacks");
    assert.equal(ids.length, 8);
    assert.ok(ids.includes("meal-snacks-once"));
    assert.ok(ids.includes("meal-snacks-d0"));
    assert.ok(ids.includes("meal-snacks-d6"));
  });

  it("recognises only its own identifiers", () => {
    assert.equal(isMealScheduleId("meal-breakfast-once"), true);
    assert.equal(isMealScheduleId("meal-dinner-d6"), true);
    assert.equal(isMealScheduleId("meal-brunch-d0"), false);
    assert.equal(isMealScheduleId("meal-lunch-d7"), false);
    assert.equal(isMealScheduleId("expo-notification"), false);
  });
});

describe("nextRingLabel / isMealKey", () => {
  it("shows nothing for a reminder that is off", () => {
    assert.equal(nextRingLabel(defaultMealReminders().dinner, localDate(2026, 9, 14, 9)), null);
  });

  it("labels the next ring as Today or Tomorrow", () => {
    const now = localDate(2026, 9, 14, 9);
    const later = buildMap({ lunch: { enabled: true, hour: 13, minute: 0, days: [], once: true } }).lunch;
    const past = buildMap({ lunch: { enabled: true, hour: 8, minute: 0, days: [], once: true } }).lunch;
    assert.match(nextRingLabel(later, now) ?? "", /^Today-/);
    assert.match(nextRingLabel(past, now) ?? "", /^Tomorrow-/);
  });

  it("accepts only the four meals as route params", () => {
    for (const meal of MEAL_KEYS) {
      assert.equal(isMealKey(meal), true);
    }
    assert.equal(isMealKey("brunch"), false);
    assert.equal(isMealKey(undefined), false);
    assert.equal(isMealKey(7), false);
  });
});

describe("formatTimeLabel is stable for every minute of the day", () => {
  it("never produces an empty or malformed label", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 5, 30, 59]) {
        assert.match(formatTimeLabel(hour, minute), /^\d{1,2}:\d{2} (am|pm)$/);
      }
    }
  });
});
