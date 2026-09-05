import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookableMonths, datesIn, monthAvailability, monthWindow } from './availability.ts';
import type { EventTypeRules, Schedule } from './slots.ts';

const LONDON = 'Europe/London';

const schedule: Schedule = {
  timezone: LONDON,
  weeklyHours: {
    '1': [['09:00', '11:00']],
    '2': [['09:00', '11:00']],
    '3': [['09:00', '11:00']],
    '4': [['09:00', '11:00']],
    '5': [['09:00', '11:00']],
  },
};

const rules: EventTypeRules = {
  durationMinutes: 30,
  bufferMinutes: 15,
  minNoticeHours: 24,
  daysAheadLimit: 60,
  maxPerDay: 2,
};

const utc = (iso: string) => Date.parse(iso);

describe('month arithmetic', () => {
  it('counts the days of a month', () => {
    assert.equal(datesIn('2026-08').length, 31);
    assert.equal(datesIn('2026-09').length, 30);
    assert.equal(datesIn('2026-02').length, 28);
    assert.equal(datesIn('2028-02').length, 29, 'leap year');
  });

  it('starts and ends where it should', () => {
    const august = datesIn('2026-08');
    assert.equal(august[0], '2026-08-01');
    assert.equal(august[august.length - 1], '2026-08-31');
  });

  it('rejects a malformed month', () => {
    assert.throws(() => datesIn('2026-13'), RangeError);
    assert.throws(() => datesIn('August'), RangeError);
  });

  it('pads the free/busy window past both ends of the month', () => {
    const { timeMin, timeMax } = monthWindow('2026-08', LONDON);
    assert.ok(Date.parse(timeMin) < utc('2026-08-01T00:00:00Z'));
    assert.ok(Date.parse(timeMax) > utc('2026-08-31T23:00:00Z'));
  });

  it('lists every month the horizon reaches', () => {
    assert.deepEqual(bookableMonths(utc('2026-08-20T09:00:00Z'), LONDON, 30), ['2026-08', '2026-09']);
    assert.deepEqual(bookableMonths(utc('2026-08-02T09:00:00Z'), LONDON, 7), ['2026-08']);
    assert.deepEqual(bookableMonths(utc('2026-12-20T09:00:00Z'), LONDON, 30), ['2026-12', '2027-01']);
  });
});

describe('a month of availability', () => {
  const now = utc('2026-08-01T00:00:00Z');

  it('offers only working days', () => {
    const { days } = monthAvailability({ month: '2026-08', schedule, rules, busy: [], bookedByDate: {}, now });
    assert.ok(days['2026-08-04'], 'Tuesday is open');
    assert.equal(days['2026-08-08'], undefined, 'Saturday is not');
    assert.equal(days['2026-08-09'], undefined, 'Sunday is not');
  });

  it('returns slots as UTC instants', () => {
    const { days } = monthAvailability({ month: '2026-08', schedule, rules, busy: [], bookedByDate: {}, now });
    assert.deepEqual(days['2026-08-04'], [
      { startUTC: '2026-08-04T08:00:00.000Z', endUTC: '2026-08-04T08:30:00.000Z' },
      { startUTC: '2026-08-04T08:30:00.000Z', endUTC: '2026-08-04T09:00:00.000Z' },
      { startUTC: '2026-08-04T09:00:00.000Z', endUTC: '2026-08-04T09:30:00.000Z' },
      { startUTC: '2026-08-04T09:30:00.000Z', endUTC: '2026-08-04T10:00:00.000Z' },
    ]);
  });

  it('drops a day once it hits its own cap', () => {
    const { days } = monthAvailability({
      month: '2026-08',
      schedule,
      rules,
      busy: [],
      bookedByDate: { '2026-08-04': 2 },
      now,
    });
    assert.equal(days['2026-08-04'], undefined);
    assert.ok(days['2026-08-05'], 'the cap is per day, not per month');
  });

  it('subtracts busy periods from the month', () => {
    const { days } = monthAvailability({
      month: '2026-08',
      schedule,
      rules,
      busy: [{ start: utc('2026-08-04T00:00:00Z'), end: utc('2026-08-05T00:00:00Z') }],
      bookedByDate: {},
      now,
    });
    assert.equal(days['2026-08-04'], undefined);
    assert.ok(days['2026-08-05']);
  });

  it('omits a month entirely beyond the horizon', () => {
    const { days } = monthAvailability({
      month: '2026-12',
      schedule,
      rules,
      busy: [],
      bookedByDate: {},
      now,
    });
    assert.deepEqual(days, {});
  });

  it('reports the schedule zone, not the visitor zone', () => {
    const answer = monthAvailability({ month: '2026-08', schedule, rules, busy: [], bookedByDate: {}, now });
    assert.equal(answer.timezone, LONDON);
    assert.equal(answer.month, '2026-08');
  });
});
