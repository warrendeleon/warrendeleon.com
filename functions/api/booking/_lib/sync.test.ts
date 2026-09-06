import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Env } from './http.ts';
import { CHANNEL_RENEW_MS, ensureChannels, knownChannelToken, reconcile, type SyncDeps } from './sync.ts';

type Answer = { first?: unknown; all?: unknown[] };
interface Recorded { sql: string; args: unknown[] }

function fakeD1(answer: (sql: string, args: unknown[]) => Answer, failBatchWhen?: (b: Recorded[]) => boolean) {
  const db = {
    calls: [] as Recorded[],
    batches: [] as Recorded[][],
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        sql, args,
        bind: (...next: unknown[]) => make(next),
        first: async () => { db.calls.push({ sql, args }); return answer(sql, args).first ?? null; },
        all: async () => { db.calls.push({ sql, args }); return { results: answer(sql, args).all ?? [] }; },
        run: async () => { db.calls.push({ sql, args }); return { success: true }; },
      });
      return make([]);
    },
    async batch(statements: Recorded[]) {
      const plain = statements.map((s) => ({ sql: s.sql, args: s.args }));
      if (failBatchWhen?.(plain)) throw new Error('UNIQUE constraint failed: slot_locks.bucket_utc');
      db.batches.push(plain);
      return [];
    },
  };
  return db;
}

const NOW = Date.parse('2026-09-08T06:00:00.000Z');
const env = (db: unknown): Env => ({ BOOKING_DB: db as D1Database, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TOKEN_KEY: '', TURNSTILE_SECRET: '', ADMIN_KEY: 'k' });

const row = (id: string, start: string, extra: Record<string, unknown> = {}) => ({
  provider: 'google', calendly_invitee_uri: null, ...extra,
  id, organiser_account: 'hi@warrendeleon.com', event_type: 'intro-30', start_utc: start,
  end_utc: new Date(Date.parse(start) + 30 * 60_000).toISOString(), local_date: start.slice(0, 10),
  google_event_id: `evt-${id}`, google_calendar_id: 'interviews',
});
const typeRow = {
  slug: 'intro-30', duration_minutes: 30, names: '{"en":"Intro"}', descriptions: '{}', locations: '["video"]',
  organiser_account: 'hi@warrendeleon.com', mirror_to: '[]', schedule_id: 'work-hours', visibility: 'listed',
  target_calendar_id: 'interviews', question: '{}', question_required: 0, allow_guests: 1,
  buffer_minutes: 15, min_notice_hours: 0, days_ahead_limit: 30, max_per_day: 5, active: 1, sort_order: 0,
};
const scheduleRow = { id: 'work-hours', name: 'w', timezone: 'Europe/London', weekly_hours: '{}', date_overrides: '{}' };

function answers(bookings: ReturnType<typeof row>[], channels: unknown[] = []) {
  return (sql: string): Answer => {
    if (sql.includes('FROM bookings')) return { all: bookings };
    if (sql.includes('FROM event_types')) return { all: [typeRow], first: typeRow };
    if (sql.includes('FROM schedules')) return { first: scheduleRow };
    if (sql.includes('FROM sync_channels WHERE token')) return { first: channels.length ? channels[0] : null };
    if (sql.includes('FROM sync_channels')) return { all: channels };
    return {};
  };
}

/** A calendar that answers per event id; `throws` makes every read fail. */
function deps(events: Record<string, { status: string; startUTC: string | null; endUTC: string | null } | null>, options: { throws?: boolean; calendlyStatus?: 'active' | 'canceled' | null } = {}) {
  const calls = { stopped: [] as unknown[][], watched: [] as unknown[][] };
  const client = {
    async getEvent(id: string) { if (options.throws) throw new Error('down'); return events[id] ?? null; },
    async stopChannel(...args: unknown[]) { calls.stopped.push(args); },
    async watchEvents(calendarId: string, address: string, token: string) {
      calls.watched.push([calendarId, address, token]);
      return { channelId: 'ch-new', resourceId: 'res-new', expiresAt: new Date(NOW + 6 * 86_400_000).toISOString() };
    },
  };
  const d: SyncDeps = { clientFor: (async () => client) as unknown as SyncDeps['clientFor'], now: () => NOW, calendly: () => (options.calendlyStatus === undefined ? null : ({ async inviteeStatus() { return options.calendlyStatus; } } as never)) };
  return { ...d, calls };
}

describe('reconcile', () => {
  it('leaves a booking alone when the calendar agrees', async () => {
    const b = row('a', '2026-09-10T09:00:00.000Z');
    const db = fakeD1(answers([b]));
    const report = await reconcile(env(db), deps({ 'evt-a': { status: 'confirmed', startUTC: b.start_utc, endUTC: b.end_utc } }));
    assert.deepEqual(report, { checked: 1, cancelled: [], moved: [], stuck: [], unreadable: [] });
    assert.equal(db.batches.length, 0);
  });

  it('cancels the row and frees the locks when the event was deleted by hand', async () => {
    const db = fakeD1(answers([row('a', '2026-09-10T09:00:00.000Z'), row('b', '2026-09-11T09:00:00.000Z')]));
    const report = await reconcile(env(db), deps({ 'evt-a': null, 'evt-b': { status: 'cancelled', startUTC: null, endUTC: null } }));
    assert.deepEqual(report.cancelled, ['a', 'b']);
    assert.equal(db.batches.length, 2);
    assert.match(db.batches[0]![0]!.sql, /status = 'cancelled'/);
    assert.match(db.batches[0]![1]!.sql, /DELETE FROM slot_locks/);
    assert.equal(db.calls.filter((c) => c.sql.includes('audit_log') && c.args[1] === 'cancelled').length, 2);
  });

  it('follows an event dragged to another time and re-keys the locks', async () => {
    const b = row('a', '2026-09-10T09:00:00.000Z');
    const db = fakeD1(answers([b]));
    const report = await reconcile(env(db), deps({ 'evt-a': { status: 'confirmed', startUTC: '2026-09-10T13:00:00.000Z', endUTC: '2026-09-10T13:30:00.000Z' } }));
    assert.deepEqual(report.moved, ['a']);
    const [batch] = db.batches;
    assert.match(batch![0]!.sql, /DELETE FROM slot_locks/);
    assert.deepEqual(batch!.filter((s) => s.sql.includes('INSERT INTO slot_locks')).map((s) => s.args[0]), ['2026-09-10T13:00:00.000Z', '2026-09-10T13:15:00.000Z']);
    assert.deepEqual(batch![batch!.length - 1]!.args, ['2026-09-10T13:00:00.000Z', '2026-09-10T13:30:00.000Z', '2026-09-10', 'a']);
  });

  it('reports a hand move onto a taken slot instead of hiding it', async () => {
    const b = row('a', '2026-09-10T09:00:00.000Z');
    const db = fakeD1(answers([b]), (batch) => batch.some((s) => s.sql.includes('INSERT INTO slot_locks')));
    const report = await reconcile(env(db), deps({ 'evt-a': { status: 'confirmed', startUTC: '2026-09-10T13:00:00.000Z', endUTC: '2026-09-10T13:30:00.000Z' } }));
    assert.deepEqual(report.stuck, ['a']);
    assert.ok(db.calls.some((c) => c.sql.includes('audit_log') && c.args[1] === 'failed'));
  });

  it('touches nothing when the calendar cannot be read', async () => {
    const db = fakeD1(answers([row('a', '2026-09-10T09:00:00.000Z')]));
    const report = await reconcile(env(db), deps({}, { throws: true }));
    assert.deepEqual(report.unreadable, ['hi@warrendeleon.com']);
    assert.equal(report.checked, 0);
    assert.equal(db.batches.length, 0);
  });
});

describe('reconcile, Calendly rows', () => {
  const cal = (id: string) => row(id, '2026-09-10T09:00:00.000Z', { provider: 'calendly', google_event_id: null, calendly_invitee_uri: `https://api.calendly.com/scheduled_events/E/invitees/${id}` });

  it('leaves an active Calendly booking alone', async () => {
    const db = fakeD1(answers([cal('c')]));
    const report = await reconcile(env(db), deps({}, { calendlyStatus: 'active' }));
    assert.deepEqual(report, { checked: 1, cancelled: [], moved: [], stuck: [], unreadable: [] });
  });

  it('cancels the row when Calendly cancelled or lost the booking', async () => {
    for (const status of ['canceled', null] as const) {
      const db = fakeD1(answers([cal('c')]));
      const report = await reconcile(env(db), deps({}, { calendlyStatus: status }));
      assert.deepEqual(report.cancelled, ['c'], String(status));
      assert.ok(db.calls.some((c) => c.sql.includes("status = 'cancelled'") && c.args[0] === 'c'));
      assert.ok(db.calls.some((c) => c.sql.includes('audit_log') && String(c.args[2]).includes('cancelled in Calendly')));
    }
  });

  it('skips Calendly rows when no token is configured', async () => {
    const db = fakeD1(answers([cal('c')]));
    const report = await reconcile(env(db), deps({}));
    assert.equal(report.checked, 0);
  });
});

describe('ensureChannels', () => {
  const address = 'https://warrendeleon.com/api/booking/webhooks/google';

  it('opens a channel for a calendar that has none', async () => {
    const db = fakeD1(answers([]));
    const d = deps({});
    assert.deepEqual(await ensureChannels(env(db), address, d), ['interviews']);
    assert.deepEqual(d.calls.watched.map((w) => w.slice(0, 2)), [['interviews', address]]);
    const insert = db.calls.find((c) => c.sql.includes('INSERT INTO sync_channels'));
    assert.equal(insert?.args[0], 'interviews');
    assert.equal(insert?.args[1], 'ch-new');
    assert.equal(String(insert?.args[3]).length >= 16, true, 'a fresh token is stored');
  });

  it('keeps a channel with plenty of life and renews one about to lapse', async () => {
    const fresh = { calendar_id: 'interviews', channel_id: 'ch-old', resource_id: 'res-old', token: 't', expires_at: new Date(NOW + CHANNEL_RENEW_MS + 60_000).toISOString() };
    const d1 = deps({});
    assert.deepEqual(await ensureChannels(env(fakeD1(answers([], [fresh]))), address, d1), []);
    assert.equal(d1.calls.watched.length, 0);

    const lapsing = { ...fresh, expires_at: new Date(NOW + 60_000).toISOString() };
    const d2 = deps({});
    assert.deepEqual(await ensureChannels(env(fakeD1(answers([], [lapsing]))), address, d2), ['interviews']);
    assert.deepEqual(d2.calls.stopped, [['ch-old', 'res-old']]);
    assert.equal(d2.calls.watched.length, 1);
  });
});

describe('knownChannelToken', () => {
  it('accepts a stored token and nothing else', async () => {
    const db = fakeD1(answers([], [{ calendar_id: 'interviews' }]));
    assert.equal(await knownChannelToken(env(db), 'abc'), true);
    assert.equal(await knownChannelToken(env(fakeD1(answers([]))), 'abc'), false);
    assert.equal(await knownChannelToken(env(db), null), false);
  });
});
