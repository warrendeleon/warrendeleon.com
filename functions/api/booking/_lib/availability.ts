// Availability for a whole month in one answer.
//
// The page asks per month rather than per day so the calendar grid can grey out
// closed days immediately. One free/busy query covers the month, and the rest
// is arithmetic over the result.

import {
  dateKey,
  generateSlots,
  instantAt,
  type EventTypeRules,
  type Interval,
  type Schedule,
} from './slots.ts';

export interface MonthRequest {
  /** "YYYY-MM". */
  month: string;
  schedule: Schedule;
  rules: EventTypeRules;
  busy: readonly Interval[];
  /** Confirmed bookings per local date, "YYYY-MM-DD" to a count. */
  bookedByDate: Readonly<Record<string, number>>;
  now: number;
}

export interface DaySlots {
  startUTC: string;
  endUTC: string;
}

export interface MonthAvailability {
  month: string;
  timezone: string;
  /** Only dates with at least one bookable slot appear. */
  days: Record<string, DaySlots[]>;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Every date in a month, as "YYYY-MM-DD". */
export function datesIn(month: string): string[] {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new RangeError(`month must be YYYY-MM, got "${month}"`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new RangeError(`month out of range: "${month}"`);

  // Day 0 of the next month is the last day of this one, which handles leap
  // years without a rule of its own.
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length },
    (_, index) => `${match[1]}-${match[2]}-${String(index + 1).padStart(2, '0')}`,
  );
}

/**
 * The window a free/busy query needs to cover this month, padded by a day at
 * each end so a meeting spanning midnight in the schedule's zone is still seen.
 */
export function monthWindow(month: string, timezone: string): { timeMin: string; timeMax: string } {
  const dates = datesIn(month);
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  return {
    timeMin: new Date(instantAt(first, '00:00', timezone) - 86_400_000).toISOString(),
    timeMax: new Date(instantAt(last, '24:00', timezone) + 86_400_000).toISOString(),
  };
}

/** The months a booker may currently reach, oldest first, as "YYYY-MM". */
export function bookableMonths(now: number, timezone: string, daysAheadLimit: number): string[] {
  const from = dateKey(now, timezone).slice(0, 7);
  const to = dateKey(now + daysAheadLimit * 86_400_000, timezone).slice(0, 7);
  const months = [from];
  let cursor = from;
  while (cursor < to) {
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    months.push(next);
    cursor = next;
  }
  return months;
}

export function monthAvailability(request: MonthRequest): MonthAvailability {
  const { month, schedule, rules, busy, bookedByDate, now } = request;
  const days: Record<string, DaySlots[]> = {};

  for (const date of datesIn(month)) {
    const slots = generateSlots({
      date,
      schedule,
      rules,
      busy,
      bookedCount: bookedByDate[date] ?? 0,
      now,
    });
    if (slots.length > 0) {
      days[date] = slots.map((slot) => ({
        startUTC: new Date(slot.start).toISOString(),
        endUTC: new Date(slot.end).toISOString(),
      }));
    }
  }

  return { month, timezone: schedule.timezone, days };
}
