import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Env } from './http.ts';
import { loadBooking, manageBooking, TOKEN_HEADER, type BookingRow, type ManageDeps } from './manage.ts';

// ---- a D1 stand-in --------------------------------------------------------
// Answers by matching the SQL; records every statement so a test can assert
// what was written and in which order. `failOn` makes a batch throw, which is
// how D1 reports a primary-key collision on slot_locks.

type Answer = { first?: unknown; all?: unknown[]; run?: unknown };
interface FakeDb {
  calls: { sql: string; args: unknown[] }[];
  batches: { sql: string; args: unknown[] }[][];
  failBatchWhen: ((statements: { sql: string; args: unknown[] }[]) => boolean) | null;
}

function fakeD1(answer: (sql: string, args: unknown[]) => Answer): D1Database & FakeDb {
  const db = {
    calls: [] as FakeDb['calls'],
    batches: [] as FakeDb['batches'],
    failBatchWhen: null as FakeDb['failBatchWhen'],
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        sql,
        args,
        bind: (...next: unknown[]) => make(next),
        first: async () => { db.calls.push({ sql, args }); return answer(sql, args).first ?? null; },
        all: async () => { db.calls.push({ sql, args }); return { results: answer(sql, args).all ?? [] }; },
        run: async () => { db.calls.push({ sql, args }); return answer(sql, args).run ?? { success: true }; },
      });
      return make([]);
    },
    async batch(statements: { sql: string; args: unknown[] }[]) {
      const plain = statements.map((s) => ({ sql: s.sql, args: s.args }));
      if (db.failBatchWhen?.(plain)) throw new Error('UNIQUE constraint failed: slot_locks.bucket_utc');
      db.batches.push(plain);
      return [];
    },
  };
  return db as unknown as D1Database & FakeDb;
}

const TOKEN = 'a'.repeat(32);
const ID = '11111111-2222-4333-8444-555555555555';

const row: BookingRow = {
  id: ID, event_type: 'intro-30', organiser_account: 'hi@warrendeleon.com',
  start_utc: '2026-09-08T09:00:00.000Z', end_utc: '2026-09-08T09:30:00.000Z', local_date: '2026-09-08',
  location: 'video', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: null,
  guests: '["bo@example.org"]', booker_timezone: 'Europe/Madrid',
  google_event_id: 'evt1', google_calendar_id: 'interviews@group.calendar.google.com', meet_link: 'https://meet.google.com/abc',
  manage_token: TOKEN, status: 'confirmed',
};

const typeRow = {
  slug: 'intro-30', duration_minutes: 30, names: '{"en":"Intro call","es":"Llamada inicial"}', descriptions: '{"en":""}',
  locations: '["video","phone"]', organiser_account: 'hi@warrendeleon.com', mirror_to: '[]', schedule_id: 'work-hours',
  visibility: 'listed', target_calendar_id: 'interviews@group.calendar.google.com', question: '{}', question_required: 0,
  allow_guests: 1, buffer_minutes: 15, min_notice_hours: 0, days_ahead_limit: 30, max_per_day: 5, active: 1, sort_order: 0,
};
const scheduleRow = {
  id: 'work-hours', name: 'Weekdays', timezone: 'Europe/London',
  weekly_hours: '{"1":[["09:00","12:00"],["13:30","17:30"]],"2":[["09:00","12:00"],["13:30","17:30"]],"3":[["09:00","12:00"]]}',
  date_overrides: '{}',
};

/** Tuesday 8 September 2026, 07:00 London, so the day is bookable with no notice. */
const NOW = Date.parse('2026-09-08T06:00:00.000Z');

function answers(overrides: { booking?: BookingRow | null; counts?: Record<string, number> } = {}) {
  const booking = overrides.booking === undefined ? row : overrides.booking;
  return (sql: string, args: unknown[]): Answer => {
    if (sql.includes('FROM bookings WHERE id')) return { first: booking && args[0] === booking.id ? booking : null };
    if (sql.includes('FROM rate_limits')) return { first: null };
    if (sql.includes('FROM event_types')) return { first: typeRow };
    if (sql.includes('FROM schedules')) return { first: scheduleRow };
    if (sql.includes('FROM calendar_accounts')) return { all: [] };
    if (sql.includes('COUNT(*)')) return { all: Object.entries(overrides.counts ?? {}).map(([local_date, total]) => ({ local_date, total })) };
    return {};
  };
}

function env(db: D1Database): Env {
  return { BOOKING_DB: db, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TOKEN_KEY: '', TURNSTILE_SECRET: '', ADMIN_KEY: '', HOST_PHONE: '+44 20 7946 0000' };
}

interface CalendarCalls { deleted: unknown[][]; patched: unknown[][] }
function deps(options: { busy?: { start: number; end: number }[]; calendarFails?: boolean; noAccount?: boolean } = {}): ManageDeps & CalendarCalls {
  const calls: CalendarCalls = { deleted: [], patched: [] };
  const client = {
    async deleteEvent(...args: unknown[]) { if (options.calendarFails) throw new Error('boom'); calls.deleted.push(args); },
    async patchEvent(...args: unknown[]) { if (options.calendarFails) throw new Error('boom'); calls.patched.push(args); },
  };
  return {
    ...calls,
    clientFor: (async () => (options.noAccount ? null : client)) as unknown as ManageDeps['clientFor'],
    mergedBusy: (async () => options.busy ?? []) as unknown as ManageDeps['mergedBusy'],
    now: () => NOW,
  };
}

const request = (method: string, body?: unknown, token = TOKEN) =>
  new Request(`https://warrendeleon.com/api/booking/bookings/${ID}?locale=es`, {
    method,
    headers: { [TOKEN_HEADER]: token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('loadBooking', () => {
  it('rejects a malformed id before touching the database', async () => {
    const db = fakeD1(answers());
    assert.equal(await loadBooking(env(db), 'not-a-uuid', TOKEN), null);
    assert.equal(db.calls.length, 0);
  });

  it('answers null for a wrong token and for a missing booking alike', async () => {
    const db = fakeD1(answers());
    assert.equal(await loadBooking(env(db), ID, 'b'.repeat(32)), null);
    assert.equal(await loadBooking(env(fakeD1(answers({ booking: null }))), ID, TOKEN), null);
  });
});

describe('GET a booking', () => {
  it('describes the booking in the asked language without the token', async () => {
    const response = await manageBooking(request('GET'), env(fakeD1(answers())), ID, deps());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.booking.type.name, 'Llamada inicial');
    assert.equal(body.booking.meetLink, 'https://meet.google.com/abc');
    assert.deepEqual(body.booking.guests, ['bo@example.org']);
    assert.equal(body.booking.hostPhone, null, 'a video call shows no number');
    assert.ok(!JSON.stringify(body).includes(TOKEN));
  });

  it('is a 404 with a wrong token, and no verb gets further', async () => {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = await manageBooking(request(method, method === 'GET' ? undefined : {}, 'b'.repeat(32)), env(fakeD1(answers())), ID, deps());
      assert.equal(response.status, 404, method);
    }
  });
});

describe('DELETE cancels', () => {
  it('removes the event first, then marks the row and frees the slot', async () => {
    const db = fakeD1(answers());
    const d = deps();
    const response = await manageBooking(request('DELETE'), env(db), ID, d);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.booking.status, 'cancelled');
    assert.deepEqual(body.calendar, { eventRemoved: true, alreadyCancelled: false, updatesSentTo: ['jane@example.com', 'bo@example.org'] });
    assert.deepEqual(d.deleted, [['evt1', 'interviews@group.calendar.google.com']]);
    const [batch] = db.batches;
    assert.match(batch![0]!.sql, /status = 'cancelled'/);
    assert.match(batch![1]!.sql, /DELETE FROM slot_locks/);
    assert.ok(db.calls.some((c) => c.sql.includes('audit_log') && c.args[1] === 'cancelled'));
  });

  it('changes nothing when the calendar refuses', async () => {
    const db = fakeD1(answers());
    const response = await manageBooking(request('DELETE'), env(db), ID, deps({ calendarFails: true }));
    assert.equal(response.status, 502);
    assert.equal(db.batches.length, 0);
  });

  it('is a quiet success on a booking already cancelled', async () => {
    const d = deps();
    const response = await manageBooking(request('DELETE'), env(fakeD1(answers({ booking: { ...row, status: 'cancelled' } }))), ID, d);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).calendar.alreadyCancelled, true);
    assert.equal(d.deleted.length, 0);
  });
});

describe('PATCH moves', () => {
  const target = '2026-09-08T10:00:00.000Z';

  it('claims the new slot, moves the event and reports who is told', async () => {
    const db = fakeD1(answers());
    const d = deps();
    const response = await manageBooking(request('PATCH', { startUTC: target, timezone: 'Asia/Tokyo' }), env(db), ID, d);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.json();
    assert.equal(body.booking.startUTC, target);
    assert.equal(body.booking.endUTC, '2026-09-08T10:30:00.000Z');
    assert.equal(body.booking.timezone, 'Asia/Tokyo');
    assert.deepEqual(body.calendar, { eventUpdated: true, updatesSentTo: ['jane@example.com', 'bo@example.org'] });
    assert.deepEqual(d.patched, [['evt1', target, '2026-09-08T10:30:00.000Z', 'Europe/London', 'interviews@group.calendar.google.com']]);
    const [batch] = db.batches;
    assert.match(batch![0]!.sql, /DELETE FROM slot_locks/);
    assert.equal(batch!.filter((s) => s.sql.includes('INSERT INTO slot_locks')).length, 2, 'two 15-minute buckets');
    assert.match(batch![batch!.length - 1]!.sql, /UPDATE bookings SET start_utc/);
  });

  it('does not let the booking block the times around itself', async () => {
    // The diary shows the booking as busy 09:00 to 09:30. With the 15-minute
    // buffer, 09:30 would be unreachable if it counted against itself.
    const own = { start: Date.parse(row.start_utc), end: Date.parse(row.end_utc) };
    const response = await manageBooking(request('PATCH', { startUTC: '2026-09-08T09:30:00.000Z' }), env(fakeD1(answers())), ID, deps({ busy: [own] }));
    assert.equal(response.status, 200);
  });

  it('refuses a time that is busy for another reason', async () => {
    const busy = [{ start: Date.parse('2026-09-08T10:00:00.000Z'), end: Date.parse('2026-09-08T10:30:00.000Z') }];
    const response = await manageBooking(request('PATCH', { startUTC: target }), env(fakeD1(answers())), ID, deps({ busy }));
    assert.equal(response.status, 409);
  });

  it('does not count the booking against its own day cap', async () => {
    const full = answers({ counts: { '2026-09-08': 5 } });
    const response = await manageBooking(request('PATCH', { startUTC: target }), env(fakeD1(full)), ID, deps());
    assert.equal(response.status, 200, 'five today including this one leaves room for the move');
  });

  it('puts everything back when the calendar refuses the move', async () => {
    const db = fakeD1(answers());
    const response = await manageBooking(request('PATCH', { startUTC: target }), env(db), ID, deps({ calendarFails: true }));
    assert.equal(response.status, 502);
    assert.equal(db.batches.length, 2, 'claim, then restore');
    const restore = db.batches[1]!;
    assert.deepEqual(restore[restore.length - 1]!.args.slice(0, 2), [row.start_utc, row.end_utc]);
    assert.ok(db.calls.some((c) => c.sql.includes('audit_log') && c.args[1] === 'failed'));
  });

  it('reports a slot taken when the buckets collide', async () => {
    const db = fakeD1(answers());
    db.failBatchWhen = (statements) => statements.some((s) => s.sql.includes('INSERT INTO slot_locks'));
    const d = deps();
    const response = await manageBooking(request('PATCH', { startUTC: target }), env(db), ID, d);
    assert.equal(response.status, 409);
    assert.equal(d.patched.length, 0);
  });

  it('rejects the current time, a bad instant and a cancelled booking', async () => {
    assert.equal((await manageBooking(request('PATCH', { startUTC: row.start_utc }), env(fakeD1(answers())), ID, deps())).status, 400);
    assert.equal((await manageBooking(request('PATCH', { startUTC: 'tomorrow' }), env(fakeD1(answers())), ID, deps())).status, 400);
    assert.equal((await manageBooking(request('PATCH', { startUTC: target }), env(fakeD1(answers({ booking: { ...row, status: 'cancelled' } }))), ID, deps())).status, 400);
  });
});
