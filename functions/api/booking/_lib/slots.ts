// Pure slot generation. No I/O, no Cloudflare bindings, no Google: everything
// this needs arrives as arguments, so the rules can be tested in isolation.
//
// All wall-clock arithmetic happens in the schedule's own timezone via TZDate.
// Bare Date.setHours() would resolve in the runtime's zone, which on Workers is
// UTC, and would silently shift every window by the British Summer Time offset.

import { TZDate } from '@date-fns/tz';

/** Half-open interval of epoch milliseconds: [start, end). */
export interface Interval {
  start: number;
  end: number;
}

/** "HH:MM" pair, opening and closing wall-clock times. */
export type Window = readonly [string, string];

export interface Schedule {
  /** IANA zone the weekly hours are expressed in, e.g. "Europe/London". */
  timezone: string;
  /** ISO weekday ("1" Monday … "7" Sunday) to the windows open that day. */
  weeklyHours: Readonly<Record<string, readonly Window[]>>;
  /**
   * "YYYY-MM-DD" to the windows open that specific date, replacing the weekly
   * hours entirely. An empty array blocks the day.
   */
  dateOverrides?: Readonly<Record<string, readonly Window[]>>;
}

export interface EventTypeRules {
  durationMinutes: number;
  /** Dead time kept on both sides of every busy period. */
  bufferMinutes: number;
  /** A booking may not start sooner than this many hours from now. */
  minNoticeHours: number;
  /** How many days beyond today may be booked. */
  daysAheadLimit: number;
  /** Confirmed bookings allowed on one day, across all event types. */
  maxPerDay: number;
}

export interface GenerateSlotsInput {
  /** The day being asked about, "YYYY-MM-DD", read in the schedule's zone. */
  date: string;
  schedule: Schedule;
  rules: EventTypeRules;
  /** Busy periods from every connected calendar, already merged or not. */
  busy: readonly Interval[];
  /** Confirmed bookings already held on this date. */
  bookedCount: number;
  /** Epoch ms treated as "now"; injected so tests are deterministic. */
  now: number;
}

const MINUTE = 60_000;

/**
 * Candidate starts advance on this grid, and the slot-lock buckets use it too.
 * Every duration must be a multiple of it. Changing it with bookings already in
 * slot_locks needs a migration to re-key their buckets, or overlaps stop
 * colliding.
 */
export const STEP_MINUTES = 15;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`date must be YYYY-MM-DD, got "${date}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`date is not a real calendar date: "${date}"`);
  }
  return { year, month, day };
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`time must be HH:MM, got "${time}"`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new RangeError(`time out of range: "${time}"`);
  return { hour, minute };
}

/**
 * The instant a wall-clock time on a given date falls at in `timezone`.
 * "24:00" is accepted as the end of the day so a window may close at midnight.
 */
export function instantAt(date: string, time: string, timezone: string): number {
  const { year, month, day } = parseDate(date);
  if (time === '24:00') {
    return new TZDate(year, month - 1, day + 1, 0, 0, 0, 0, timezone).getTime();
  }
  const { hour, minute } = parseTime(time);
  return new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone).getTime();
}

/** ISO weekday, 1 Monday … 7 Sunday, for a date read in `timezone`. */
export function isoWeekday(date: string, timezone: string): number {
  const { year, month, day } = parseDate(date);
  const weekday = new TZDate(year, month - 1, day, 12, 0, 0, 0, timezone).getDay();
  return weekday === 0 ? 7 : weekday;
}

/** "YYYY-MM-DD" for an instant, as read in `timezone`. */
export function dateKey(instant: number, timezone: string): string {
  const local = new TZDate(instant, timezone);
  const year = String(local.getFullYear()).padStart(4, '0');
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days from `from` to `to`, counted on calendar dates in `timezone`. */
function daysBetween(from: string, to: string, timezone: string): number {
  const a = instantAt(from, '12:00', timezone);
  const b = instantAt(to, '12:00', timezone);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Merge overlapping or touching intervals, so later overlap tests walk a
 * shorter list and the result is stable regardless of input ordering.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** The windows open on one date: an override wins outright over weekly hours. */
export function windowsFor(date: string, schedule: Schedule): readonly Window[] {
  const override = schedule.dateOverrides?.[date];
  if (override !== undefined) return override;
  return schedule.weeklyHours[String(isoWeekday(date, schedule.timezone))] ?? [];
}

/**
 * Bookable starts for one date, as UTC instants.
 *
 * Returns an empty list rather than throwing whenever the day is simply not
 * bookable: outside the horizon, closed, fully busy, or already at its cap.
 */
export function generateSlots(input: GenerateSlotsInput): Interval[] {
  const { date, schedule, rules, busy, bookedCount, now } = input;
  const { timezone } = schedule;

  if (bookedCount >= rules.maxPerDay) return [];

  const today = dateKey(now, timezone);
  const offset = daysBetween(today, date, timezone);
  if (offset < 0 || offset > rules.daysAheadLimit) return [];

  const duration = rules.durationMinutes * MINUTE;
  const earliestStart = now + rules.minNoticeHours * 60 * MINUTE;

  // Buffer applies on both sides. Only padding the far side would let a slot
  // butt straight up against the end of a meeting with no room to travel.
  const padding = rules.bufferMinutes * MINUTE;
  const blocked = mergeIntervals(
    busy.map((period) => ({ start: period.start - padding, end: period.end + padding })),
  );

  const slots: Interval[] = [];
  for (const [opens, closes] of windowsFor(date, schedule)) {
    const windowStart = instantAt(date, opens, timezone);
    const windowEnd = instantAt(date, closes, timezone);
    if (windowEnd <= windowStart) continue;

    for (let start = windowStart; start + duration <= windowEnd; start += STEP_MINUTES * MINUTE) {
      if (start < earliestStart) continue;
      const end = start + duration;
      const clashes = blocked.some((period) => start < period.end && end > period.start);
      if (!clashes) slots.push({ start, end });
    }
  }

  return slots.sort((a, b) => a.start - b.start);
}

/**
 * The 30-minute UTC buckets an interval touches, as ISO strings. These are the
 * primary keys of slot_locks: inserting them alongside the booking in one
 * atomic batch is what makes a double booking impossible.
 */
export function bucketsFor(interval: Interval): string[] {
  const size = STEP_MINUTES * MINUTE;
  const first = Math.floor(interval.start / size) * size;
  const buckets: string[] = [];
  for (let bucket = first; bucket < interval.end; bucket += size) {
    buckets.push(new Date(bucket).toISOString());
  }
  return buckets;
}
