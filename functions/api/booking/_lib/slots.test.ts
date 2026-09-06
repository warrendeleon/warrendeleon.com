import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TZDate } from '@date-fns/tz';
import {
  bucketsFor,
  dateKey,
  generateSlots,
  instantAt,
  isoWeekday,
  mergeIntervals,
  windowsFor,
  type EventTypeRules,
  type Schedule,
} from './slots.ts';

const LONDON = 'Europe/London';

const nineToFive: Schedule = {
  timezone: LONDON,
  weeklyHours: {
    '1': [['09:00', '17:00']],
    '2': [['09:00', '17:00']],
    '3': [['09:00', '17:00']],
    '4': [['09:00', '17:00']],
    '5': [['09:00', '17:00']],
  },
};

const rules: EventTypeRules = {
  durationMinutes: 30,
  bufferMinutes: 15,
  minNoticeHours: 24,
  daysAheadLimit: 30,
  maxPerDay: 5,
};

const utc = (iso: string) => Date.parse(iso);
const starts = (slots: { start: number }[]) => slots.map((s) => new Date(s.start).toISOString());

/** A "now" far enough before `date` that minimum notice never interferes. */
const wellBefore = (date: string) => utc(`${date}T00:00:00Z`) - 10 * 86_400_000;

describe('wall-clock conversion', () => {
  it('reads a summer time as BST', () => {
    assert.equal(instantAt('2026-08-04', '09:00', LONDON), utc('2026-08-04T08:00:00Z'));
  });

  it('reads a winter time as GMT', () => {
    assert.equal(instantAt('2026-10-26', '09:00', LONDON), utc('2026-10-26T09:00:00Z'));
  });

  it('accepts 24:00 as the end of the day', () => {
    assert.equal(instantAt('2026-08-04', '24:00', LONDON), utc('2026-08-04T23:00:00Z'));
  });

  it('rejects malformed input', () => {
    assert.throws(() => instantAt('4th Aug', '09:00', LONDON), RangeError);
    assert.throws(() => instantAt('2026-08-04', '9am', LONDON), RangeError);
    assert.throws(() => instantAt('2026-08-04', '25:00', LONDON), RangeError);
  });

  it('numbers weekdays from Monday', () => {
    assert.equal(isoWeekday('2026-08-03', LONDON), 1);
    assert.equal(isoWeekday('2026-08-09', LONDON), 7);
  });

  it('reads a date key in the schedule zone, not UTC', () => {
    // 23:30 BST on 4 August is 22:30Z, still the 4th locally.
    assert.equal(dateKey(utc('2026-08-04T22:30:00Z'), LONDON), '2026-08-04');
    // 00:30 BST on the 5th is 23:30Z on the 4th: UTC would answer the 4th.
    assert.equal(dateKey(utc('2026-08-04T23:30:00Z'), LONDON), '2026-08-05');
  });
});

describe('daylight saving', () => {
  it('keeps 09:00 at 09:00Z for a date booked after the clocks go back', () => {
    const slots = generateSlots({
      date: '2026-10-26',
      schedule: nineToFive,
      rules,
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-10-26'),
    });
    assert.equal(starts(slots)[0], '2026-10-26T09:00:00.000Z');
  });

  it('never emits a wall-clock time inside the spring-forward gap', () => {
    const allDay: Schedule = {
      timezone: LONDON,
      weeklyHours: { '7': [['00:00', '23:00']] },
    };
    const slots = generateSlots({
      date: '2026-03-29',
      schedule: allDay,
      rules: { ...rules, minNoticeHours: 0 },
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-03-29'),
    });
    const localHours = slots.map((slot) => new TZDate(slot.start, LONDON).getHours());
    assert.ok(slots.length > 0, 'expected slots on the spring-forward day');
    assert.ok(!localHours.includes(1), 'no slot may start in the 01:00 hour, which does not exist');
  });
});

describe('busy periods', () => {
  it('buffers on both sides of a meeting, not just after it', () => {
    const slots = generateSlots({
      date: '2026-08-04',
      schedule: nineToFive,
      rules,
      // 10:00-10:30 BST. With 15 minutes either side, 09:30 and 10:30 must go.
      busy: [{ start: utc('2026-08-04T09:00:00Z'), end: utc('2026-08-04T09:30:00Z') }],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    const times = starts(slots);
    assert.ok(times.includes('2026-08-04T08:00:00.000Z'), '09:00 BST stays free');
    assert.ok(!times.includes('2026-08-04T08:30:00.000Z'), '09:30 BST is inside the leading buffer');
    assert.ok(!times.includes('2026-08-04T09:00:00.000Z'), '10:00 BST is the meeting itself');
    assert.ok(!times.includes('2026-08-04T09:30:00.000Z'), '10:30 BST is inside the trailing buffer');
    assert.ok(times.includes('2026-08-04T10:00:00.000Z'), '11:00 BST clears the buffer');
  });

  it('returns nothing when the day is wall-to-wall busy', () => {
    const slots = generateSlots({
      date: '2026-08-04',
      schedule: nineToFive,
      rules,
      busy: [{ start: utc('2026-08-04T00:00:00Z'), end: utc('2026-08-05T00:00:00Z') }],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    assert.deepEqual(slots, []);
  });

  it('merges overlapping and touching busy periods', () => {
    const merged = mergeIntervals([
      { start: 300, end: 400 },
      { start: 100, end: 200 },
      { start: 200, end: 250 },
      { start: 500, end: 500 },
    ]);
    assert.deepEqual(merged, [
      { start: 100, end: 250 },
      { start: 300, end: 400 },
    ]);
  });
});

describe('booking limits', () => {
  it('drops slots inside the minimum notice and keeps the one exactly on it', () => {
    // 24 hours before 12:00 BST on 4 August.
    const now = utc('2026-08-03T11:00:00Z');
    const slots = generateSlots({
      date: '2026-08-04',
      schedule: nineToFive,
      rules,
      busy: [],
      bookedCount: 0,
      now,
    });
    const times = starts(slots);
    assert.equal(times[0], '2026-08-04T11:00:00.000Z', 'the boundary slot is bookable');
    assert.ok(!times.includes('2026-08-04T10:30:00.000Z'), 'half an hour earlier is not');
  });

  it('closes the day once the cap is reached', () => {
    const slots = generateSlots({
      date: '2026-08-04',
      schedule: nineToFive,
      rules,
      busy: [],
      bookedCount: 5,
      now: wellBefore('2026-08-04'),
    });
    assert.deepEqual(slots, []);
  });

  it('refuses dates in the past and beyond the horizon', () => {
    const now = utc('2026-08-04T09:00:00Z');
    const past = generateSlots({ date: '2026-08-03', schedule: nineToFive, rules, busy: [], bookedCount: 0, now });
    const far = generateSlots({ date: '2026-09-30', schedule: nineToFive, rules, busy: [], bookedCount: 0, now });
    assert.deepEqual(past, []);
    assert.deepEqual(far, []);
  });

  it('allows the last day of the horizon', () => {
    const now = utc('2026-08-04T09:00:00Z');
    const edge = generateSlots({ date: '2026-09-03', schedule: nineToFive, rules, busy: [], bookedCount: 0, now });
    assert.ok(edge.length > 0, '30 days ahead is still inside the horizon');
  });
});

describe('schedule windows', () => {
  it('gives nothing on a day with no weekly hours', () => {
    const slots = generateSlots({
      date: '2026-08-08', // Saturday
      schedule: nineToFive,
      rules,
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-08-08'),
    });
    assert.deepEqual(slots, []);
  });

  it('lets a date override replace the weekly hours', () => {
    const schedule: Schedule = { ...nineToFive, dateOverrides: { '2026-08-04': [['18:00', '19:00']] } };
    const slots = generateSlots({
      date: '2026-08-04',
      schedule,
      rules,
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    assert.deepEqual(starts(slots), ['2026-08-04T17:00:00.000Z', '2026-08-04T17:15:00.000Z', '2026-08-04T17:30:00.000Z']);
  });

  it('lets an empty override block a working day', () => {
    const schedule: Schedule = { ...nineToFive, dateOverrides: { '2026-08-04': [] } };
    assert.deepEqual(windowsFor('2026-08-04', schedule), []);
    const slots = generateSlots({
      date: '2026-08-04',
      schedule,
      rules,
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    assert.deepEqual(slots, []);
  });

  it('handles a split day without duplicating slots', () => {
    const schedule: Schedule = {
      timezone: LONDON,
      weeklyHours: { '2': [['09:00', '10:00'], ['14:00', '15:00']] },
    };
    const slots = generateSlots({
      date: '2026-08-04',
      schedule,
      rules,
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    assert.deepEqual(starts(slots), [
      '2026-08-04T08:00:00.000Z', '2026-08-04T08:15:00.000Z', '2026-08-04T08:30:00.000Z',
      '2026-08-04T13:00:00.000Z', '2026-08-04T13:15:00.000Z', '2026-08-04T13:30:00.000Z',
    ]);
  });

  it('never offers a slot that would run past closing time', () => {
    const slots = generateSlots({
      date: '2026-08-04',
      schedule: nineToFive,
      rules: { ...rules, durationMinutes: 180 },
      busy: [],
      bookedCount: 0,
      now: wellBefore('2026-08-04'),
    });
    const last = slots[slots.length - 1];
    assert.equal(new Date(last.end).toISOString(), '2026-08-04T16:00:00.000Z', 'ends at 17:00 BST');
  });
});

describe('slot locks', () => {
  it('covers every 15-minute bucket a booking touches', () => {
    assert.deepEqual(bucketsFor({ start: utc('2026-08-04T09:00:00Z'), end: utc('2026-08-04T10:00:00Z') }), [
      '2026-08-04T09:00:00.000Z', '2026-08-04T09:15:00.000Z',
      '2026-08-04T09:30:00.000Z', '2026-08-04T09:45:00.000Z',
    ]);
  });

  it('locks every bucket a booking touches when it straddles the grid', () => {
    assert.deepEqual(bucketsFor({ start: utc('2026-08-04T09:10:00Z'), end: utc('2026-08-04T09:40:00Z') }), [
      '2026-08-04T09:00:00.000Z', '2026-08-04T09:15:00.000Z', '2026-08-04T09:30:00.000Z',
    ]);
  });

  it('collides on a quarter-hour overlap, which a 30-minute grid would miss', () => {
    const a = bucketsFor({ start: utc('2026-08-04T09:00:00Z'), end: utc('2026-08-04T09:30:00Z') });
    const b = bucketsFor({ start: utc('2026-08-04T09:15:00Z'), end: utc('2026-08-04T09:45:00Z') });
    assert.ok(a.some((bucket) => b.includes(bucket)));
  });

  it('gives two overlapping bookings at least one bucket in common', () => {
    const a = bucketsFor({ start: utc('2026-08-04T09:00:00Z'), end: utc('2026-08-04T10:00:00Z') });
    const b = bucketsFor({ start: utc('2026-08-04T09:30:00Z'), end: utc('2026-08-04T10:30:00Z') });
    assert.ok(a.some((bucket) => b.includes(bucket)), 'the clash must collide on a primary key');
  });
});
