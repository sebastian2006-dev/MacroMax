/**
 * Meal-reminder engine — the pure half of the alarms feature.
 *
 * Everything here is plain data + date arithmetic: no expo-notifications
 * import, no native calls and no clock reads (the caller passes `now`). That
 * keeps the rules that actually matter testable in the unit suite — which
 * weekday a weekly alarm lands on, when a one-shot alarm should ring, and when
 * one has already rung and must switch itself off — while
 * `src/lib/notifications.ts` stays a thin adapter over the OS scheduler.
 */

import { addDays } from "./nutrition";
import { mondayFirstIndex } from "./monthGrid";

export type MealKey = "breakfast" | "lunch" | "dinner" | "snacks";

/** Display/iteration order — matches the Daily Log's meal order. */
export const MEAL_KEYS: readonly MealKey[] = ["breakfast", "lunch", "dinner", "snacks"];

/** The Daily Log's own meal names, so the reminder and the log agree. */
export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks/Extra",
};

const MEAL_EMOJI: Record<MealKey, string> = {
  breakfast: "🍳",
  lunch: "🥗",
  dinner: "🍽️",
  snacks: "🍎",
};

/** Sensible starting times: breakfast, lunch, a snack, then dinner. */
export const DEFAULT_REMINDER_TIMES: Record<MealKey, { hour: number; minute: number }> = {
  breakfast: { hour: 8, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  dinner: { hour: 19, minute: 30 },
  snacks: { hour: 16, minute: 30 },
};

/** Android notification channel all four reminders post to. */
export const MEAL_REMINDER_CHANNEL_ID = "meal-reminders";

/** Monday-first indices for "every day". */
export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Type guard for route params and stored keys. */
export function isMealKey(value: unknown): value is MealKey {
  return typeof value === "string" && (MEAL_KEYS as readonly string[]).includes(value);
}

/** Longest reminder name we persist (and the input's maxLength). */
export const MAX_REMINDER_NAME_LENGTH = 40;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface MealReminder {
  meal: MealKey;
  enabled: boolean;
  /** 0-23 local wall-clock hour. */
  hour: number;
  /** 0-59. */
  minute: number;
  /**
   * Monday-first weekday indices (0 = Monday … 6 = Sunday) the alarm repeats
   * on. Empty means "no repeat" — see `once`.
   */
  days: number[];
  /**
   * Ring ONCE at the next occurrence and then switch itself off in storage,
   * which is the "just turn it on for the day" mode. Wins over `days`.
   */
  once: boolean;
  /** Loud-off fallback name, editable in the editor ("Alarm name"). */
  name: string;
  /**
   * ISO timestamp of when a one-shot alarm was armed (for `once` only). Used
   * to tell "it rang and the OS dropped it" apart from "it never got armed".
   */
  armedAt?: string;
}

export type MealReminderMap = Record<MealKey, MealReminder>;

/**
 * A declarative scheduling instruction. Deliberately NOT an expo trigger:
 * `src/lib/notifications.ts` maps `date` to `DATE` and `weekly` to `WEEKLY`,
 * so these rules can be asserted without the native module loaded.
 */
export type ReminderTrigger =
  | { kind: "date"; date: Date }
  | { kind: "weekly"; weekday: number; hour: number; minute: number };

export interface ReminderSchedule {
  identifier: string;
  meal: MealKey;
  title: string;
  body: string;
  data: Record<string, string>;
  trigger: ReminderTrigger;
}

/** Friendly, rotating lines — one per meal, picked by day-of-year. */
const FRIENDLY_LINES: Record<MealKey, readonly string[]> = {
  breakfast: [
    "Good morning! Time to log your breakfast — a 20-second scan is all it takes.",
    "Breakfast time. Fuel the morning; your goals will thank you later.",
    "Rise and log! What's going into your breakfast today?",
  ],
  lunch: [
    "Lunchtime! Add it while it's fresh in your mind.",
    "Time for lunch — log it now and keep the day honest.",
    "Halfway through the day. Fancy logging your lunch?",
  ],
  dinner: [
    "Dinner time! Log your plate and close the day out strong.",
    "Evening already. Add dinner before you forget.",
    "Time to eat — and to keep tonight's totals accurate.",
  ],
  snacks: [
    "Snack o'clock. Log it and the day still adds up.",
    "Little bites count too — log that snack.",
    "Snack time! A quick entry keeps your totals honest.",
  ],
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Coerce anything into a sorted, de-duplicated list of Monday-first weekday
 * indices (0 … 6). Out-of-range, non-numeric and duplicate entries are dropped
 * rather than rejected, because this runs on both stored JSON and UI input.
 */
export function normaliseDays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const days = new Set<number>();
  for (const entry of value) {
    const index = clampInt(entry, -1, 7, -1);
    if (index >= 0 && index <= 6) {
      days.add(index);
    }
  }
  return [...days].sort((a, b) => a - b);
}

function normaliseName(value: unknown, meal: MealKey): string {
  if (typeof value !== "string") {
    return `${MEAL_LABELS[meal]} time`;
  }
  const trimmed = value.trim().slice(0, MAX_REMINDER_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : `${MEAL_LABELS[meal]} time`;
}

/**
 * Enforce the one rule the storage layer can't express as a default: a
 * repeating alarm needs at least one weekday. With none selected the reminder
 * becomes a one-shot (Samsung's own behaviour — no days ticked = rings once),
 * so a saved alarm can never silently be a no-op.
 *
 * `armedAt` is only meaningful for an enabled one-shot reminder, so it is
 * dropped everywhere else — that way a disarmed or repeating reminder can never
 * carry a stale arming timestamp that a later reconcile would misread.
 */
export function normaliseReminder(reminder: MealReminder): MealReminder {
  const days = normaliseDays(reminder.days);
  const once = reminder.once || days.length === 0;
  const armedAt = reminder.enabled && once ? reminder.armedAt : undefined;
  return {
    ...reminder,
    days,
    once,
    name: normaliseName(reminder.name, reminder.meal),
    armedAt,
  };
}

/** Every reminder off, at its default meal time, repeating daily. */
export function defaultMealReminders(): MealReminderMap {
  const result = {} as MealReminderMap;
  for (const meal of MEAL_KEYS) {
    const { hour, minute } = DEFAULT_REMINDER_TIMES[meal];
    result[meal] = {
      meal,
      enabled: false,
      hour,
      minute,
      days: [...ALL_DAYS],
      once: false,
      name: `${MEAL_LABELS[meal]} time`,
    };
  }
  return result;
}

/**
 * Parse the `user_prefs` JSON. Never throws: a corrupt or hand-edited value
 * falls back to the defaults field by field, because a reminders blob must not
 * be able to break app startup.
 */
export function parseMealReminders(raw: string | null | undefined): MealReminderMap {
  const defaults = defaultMealReminders();
  if (!raw) {
    return defaults;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return defaults;
  }

  const source = parsed as Record<string, unknown>;
  const result = {} as MealReminderMap;

  for (const meal of MEAL_KEYS) {
    const entry = source[meal];
    const fallback = defaults[meal];
    if (typeof entry !== "object" || entry === null) {
      result[meal] = fallback;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const armedAt =
      typeof record.armedAt === "string" && !Number.isNaN(Date.parse(record.armedAt))
        ? record.armedAt
        : undefined;

    result[meal] = normaliseReminder({
      meal,
      enabled: record.enabled === true,
      hour: clampInt(record.hour, 0, 23, fallback.hour),
      minute: clampInt(record.minute, 0, 59, fallback.minute),
      days: record.days === undefined ? fallback.days : normaliseDays(record.days),
      once: record.once === true,
      name: normaliseName(record.name, meal),
      armedAt,
    });
  }

  return result;
}

/** Serialise for `user_prefs` (and, transitively, for backups). */
export function serializeMealReminders(map: MealReminderMap): string {
  const plain: Record<string, Omit<MealReminder, "meal">> = {};
  for (const meal of MEAL_KEYS) {
    const reminder = normaliseReminder(map[meal]);
    // Explicit field list (not a spread): only known keys ever reach storage,
    // and an unset `armedAt` is dropped rather than persisted as null.
    plain[meal] = {
      enabled: reminder.enabled,
      hour: reminder.hour,
      minute: reminder.minute,
      days: reminder.days,
      once: reminder.once,
      name: reminder.name,
      ...(reminder.armedAt ? { armedAt: reminder.armedAt } : {}),
    };
  }
  return JSON.stringify(plain);
}

/** Monday-first UI index (0 = Monday) → expo's `weekday` (1 = Sunday … 7 = Saturday). */
export function uiDayToExpoWeekday(day: number): number {
  return ((day + 1) % 7) + 1;
}

/** The one-shot identifier for a meal — a single pending notification. */
export function onceScheduleId(meal: MealKey): string {
  return `meal-${meal}-once`;
}

/** The repeating identifier for one weekday of a meal. */
export function weeklyScheduleId(meal: MealKey, day: number): string {
  return `meal-${meal}-d${day}`;
}

/**
 * Every identifier that can ever belong to a meal. Used to cancel a meal's
 * pending notifications before applying an edit — one call covers the one-shot
 * and all seven weekdays, whether or not each is currently scheduled.
 */
export function scheduleIdsFor(meal: MealKey): string[] {
  return [onceScheduleId(meal), ...ALL_DAYS.map((day) => weeklyScheduleId(meal, day))];
}

/** True when the OS identifier belongs to the meal-reminder namespace. */
export function isMealScheduleId(identifier: string): boolean {
  return /^meal-(breakfast|lunch|dinner|snacks)-(once|d[0-6])$/.test(identifier);
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function atTime(day: Date, hour: number, minute: number): Date {
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * The next date+time this reminder should ring, strictly after `from`.
 *
 * One-shot (and "no days selected") reminders look at today first, then
 * tomorrow. Repeating reminders walk forward to the next selected weekday,
 * including today when its time hasn't passed yet.
 */
export function nextOccurrence(
  reminder: Pick<MealReminder, "hour" | "minute" | "days" | "once">,
  from: Date
): Date {
  const { hour, minute } = reminder;
  const repeats = !reminder.once && reminder.days.length > 0;

  if (!repeats) {
    const today = atTime(from, hour, minute);
    return today.getTime() > from.getTime() ? today : atTime(addDays(from, 1), hour, minute);
  }

  const days = reminder.days;
  for (let step = 0; step <= 7; step += 1) {
    const candidateDay = addDays(startOfLocalDay(from), step);
    if (!days.includes(mondayFirstIndex(candidateDay.getDay()))) {
      continue;
    }
    const candidate = atTime(candidateDay, hour, minute);
    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  // Unreachable while `days` is non-empty; never hand back a past date.
  return atTime(addDays(startOfLocalDay(from), 7), hour, minute);
}

/** True when the reminder rings on any / selected weekdays rather than once. */
export function isRepeating(reminder: MealReminder): boolean {
  return reminder.enabled && !reminder.once && reminder.days.length > 0;
}

/** "Mon, Wed, Fri" / "Every day" / "Once" — the list screen's summary line. */
export function formatRepeatLabel(reminder: MealReminder): string {
  if (reminder.once || reminder.days.length === 0) {
    return "Once";
  }
  if (reminder.days.length === 7) {
    return "Every day";
  }
  return reminder.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT[day])
    .join(", ");
}

/**
 * 12-hour clock label for an 0-23 hour: "8:00 am", "12:30 pm".
 * Built by hand rather than via toLocaleTimeString so the list and the editor
 * can never disagree with the wheel's own am/pm column.
 */
export function formatTimeLabel(hour: number, minute: number): string {
  const safeHour = clampInt(hour, 0, 23, 0);
  const safeMinute = clampInt(minute, 0, 59, 0);
  const meridiem = safeHour >= 12 ? "pm" : "am";
  const hour12 = safeHour % 12 === 0 ? 12 : safeHour % 12;
  return `${hour12}:${String(safeMinute).padStart(2, "0")} ${meridiem}`;
}

/**
 * Samsung's own date line: "Today-Mon, 14 Oct" / "Tomorrow-Tue, 15 Oct" /
 * "Mon, 20 Oct" — English day-month order, independent of the device locale
 * (the rest of the app formats en-US too).
 */
export function formatNextLabel(date: Date, now: Date): string {
  const label = `${WEEKDAY_SHORT[mondayFirstIndex(date.getDay())]}, ${date.getDate()} ${
    MONTH_SHORT[date.getMonth()]
  }`;
  const today = startOfLocalDay(now).getTime();
  const target = startOfLocalDay(date).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (target === today) {
    return `Today-${label}`;
  }
  if (target === today + dayMs) {
    return `Tomorrow-${label}`;
  }
  return label;
}

/** The notification the user actually sees, in the app's voice. */
export function reminderNotification(
  reminder: MealReminder,
  fireDate: Date
): { title: string; body: string } {
  const lines = FRIENDLY_LINES[reminder.meal];
  const dayOfYear = Math.floor(
    (fireDate.getTime() - new Date(fireDate.getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000)
  );
  const body = lines[Math.abs(dayOfYear) % lines.length];
  return {
    title: `${MEAL_EMOJI[reminder.meal]} ${reminder.name || MEAL_LABELS[reminder.meal]}`,
    body,
  };
}

/**
 * The complete schedule a stored config implies: one dated entry for a
 * one-shot reminder, one weekly entry per selected weekday otherwise.
 * Disabled reminders produce nothing.
 */
export function describeSchedules(map: MealReminderMap, now: Date): ReminderSchedule[] {
  const schedules: ReminderSchedule[] = [];

  for (const meal of MEAL_KEYS) {
    const reminder = normaliseReminder(map[meal]);
    if (!reminder.enabled) {
      continue;
    }

    if (reminder.once || reminder.days.length === 0) {
      const fireDate = nextOccurrence(reminder, now);
      const { title, body } = reminderNotification(reminder, fireDate);
      schedules.push({
        identifier: onceScheduleId(meal),
        meal,
        title,
        body,
        data: { meal },
        trigger: { kind: "date", date: fireDate },
      });
      continue;
    }

    // One body per scheduled request, anchored on the next occurrence so the
    // rotating line is stable rather than re-rolled on every reschedule.
    const { title, body } = reminderNotification(reminder, nextOccurrence(reminder, now));
    for (const day of reminder.days) {
      schedules.push({
        identifier: weeklyScheduleId(meal, day),
        meal,
        title,
        body,
        data: { meal },
        trigger: {
          kind: "weekly",
          weekday: uiDayToExpoWeekday(day),
          hour: reminder.hour,
          minute: reminder.minute,
        },
      });
    }
  }

  return schedules;
}

export interface ReconcileResult {
  /** The stored config after detecting one-shot alarms that already rang. */
  next: MealReminderMap;
  /** True when storage changed and should be written back. */
  changed: boolean;
  /** True when the OS-side schedule no longer matches and must be re-applied. */
  needsReschedule: boolean;
  /** Already-scheduled identifiers that should no longer exist. */
  staleIds: string[];
}

/**
 * Compare what storage says with what the OS actually has pending, once per
 * app launch/foreground.
 *
 * Why this exists: JS cannot run when the app is dead, so a one-shot alarm
 * physically cannot flip its own switch off the moment it rings. Instead the
 * next time the app runs we look at the pending set — Android removes a fired
 * notification from it — and turn that reminder off in storage. The same pass
 * re-arms anything the OS lost (a cleared schedule, a restored backup) and
 * reports identifiers that should be cancelled.
 */
export function reconcilePlan(
  stored: MealReminderMap,
  scheduledIds: readonly string[],
  now: Date
): ReconcileResult {
  const scheduled = new Set(scheduledIds);
  const next = {} as MealReminderMap;
  let changed = false;

  for (const meal of MEAL_KEYS) {
    const reminder = normaliseReminder(stored[meal]);

    if (reminder.enabled && reminder.once && reminder.armedAt) {
      const fireDate = nextOccurrence(reminder, new Date(reminder.armedAt));
      if (!scheduled.has(onceScheduleId(meal)) && now.getTime() >= fireDate.getTime()) {
        // It rang while the app was dead: switch itself off until re-enabled.
        next[meal] = { ...reminder, enabled: false, armedAt: undefined };
        changed = true;
        continue;
      }
    }

    next[meal] = reminder;
  }

  const expectedIds = new Set(describeSchedules(next, now).map((entry) => entry.identifier));
  const needsReschedule = [...expectedIds].some((identifier) => !scheduled.has(identifier));
  const staleIds = [...scheduled].filter(
    (identifier) => isMealScheduleId(identifier) && !expectedIds.has(identifier)
  );

  return {
    next,
    changed,
    needsReschedule: needsReschedule || staleIds.length > 0,
    staleIds,
  };
}

/** Next ring time for display, or null when the reminder is off. */
export function nextRingLabel(reminder: MealReminder, now: Date): string | null {
  if (!reminder.enabled) {
    return null;
  }
  return formatNextLabel(nextOccurrence(normaliseReminder(reminder), now), now);
}
