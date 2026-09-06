import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Env } from './http.ts';
import { checkBookingLimits, decide, POLICIES, recordBooking, type LimitRow } from './limits.ts';

const HOUR = 60 * 60_000;
const policy = { max: 2, windowMs: HOUR };
const at = (iso: string) => Date.parse(iso);
const row = (start: string, count: number): LimitRow => ({ window_start: start, count });

describe('rate limit decisions', () => {
  it('lets a first attempt through and opens a window', () => {
    const now = at('2026-09-06T10:00:00Z');
    const decision = decide(null, now, policy);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.next, { window_start: '2026-09-06T10:00:00.000Z', count: 1 });
  });

  it('counts up to the limit', () => {
    const now = at('2026-09-06T10:30:00Z');
    const decision = decide(row('2026-09-06T10:00:00.000Z', 1), now, policy);
    assert.equal(decision.allowed, true);
    assert.equal(decision.next.count, 2);
    assert.equal(decision.next.window_start, '2026-09-06T10:00:00.000Z', 'the window does not slide');
  });

  it('refuses once the limit is reached, and says for how long', () => {
    const now = at('2026-09-06T10:30:00Z');
    const decision = decide(row('2026-09-06T10:00:00.000Z', 2), now, policy);
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, 1800);
  });

  it('starts a new window once the old one runs out', () => {
    const now = at('2026-09-06T11:00:00Z');
    const decision = decide(row('2026-09-06T10:00:00.000Z', 99), now, policy);
    assert.equal(decision.allowed, true);
    assert.equal(decision.next.count, 1);
  });

  it('always reports at least a second to wait', () => {
    const now = at('2026-09-06T10:59:59.500Z');
    const decision = decide(row('2026-09-06T10:00:00.000Z', 2), now, policy);
    assert.equal(decision.allowed, false);
    assert.ok(decision.retryAfterSeconds >= 1, 'Retry-After: 0 would invite an instant retry');
  });

  it('starts again rather than locking someone out when the clock moves', () => {
    const now = at('2026-09-06T10:00:00Z');
    const decision = decide(row('2026-09-06T12:00:00.000Z', 5), now, policy);
    assert.equal(decision.allowed, true);
  });

  it('starts again on an unreadable stored window', () => {
    const decision = decide(row('not a date', 5), at('2026-09-06T10:00:00Z'), policy);
    assert.equal(decision.allowed, true);
  });
});

describe('the policies themselves', () => {
  it('allows two bookings a day from one address', () => {
    assert.deepEqual(POLICIES.perEmailDaily, { max: 2, windowMs: 86_400_000 });
  });

  it('keeps an hour between attempts from one address', () => {
    const first = decide(null, at('2026-09-06T10:00:00Z'), POLICIES.perEmailCooldown);
    assert.equal(first.allowed, true);
    const again = decide(first.next, at('2026-09-06T10:05:00Z'), POLICIES.perEmailCooldown);
    assert.equal(again.allowed, false);
    const later = decide(first.next, at('2026-09-06T11:00:01Z'), POLICIES.perEmailCooldown);
    assert.equal(later.allowed, true);
  });

  it('caps a burst from one address at ten a minute', () => {
    let current: LimitRow | null = null;
    const now = at('2026-09-06T10:00:00Z');
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const decision = decide(current, now, POLICIES.perIpBurst);
      assert.equal(decision.allowed, true, `attempt ${attempt} should pass`);
      current = decision.next;
    }
    assert.equal(decide(current, now, POLICIES.perIpBurst).allowed, false, 'the eleventh must not');
  });
});

/** A rate_limits table in memory. */
function limitsDb() {
  const rows = new Map<string, { window_start: string; count: number }>();
  const db = {
    rows,
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        bind: (...next: unknown[]) => make(next),
        first: async () => rows.get(String(args[0])) ?? null,
        run: async () => { rows.set(String(args[0]), { window_start: String(args[1]), count: Number(args[2]) }); return { success: true }; },
        all: async () => ({ results: [] }),
      });
      return make([]);
    },
  };
  return db;
}
const limitsEnv = (db: unknown): Env => ({ BOOKING_DB: db as D1Database, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TOKEN_KEY: '', TURNSTILE_SECRET: '', ADMIN_KEY: '' });

describe('a refused booking costs nothing', () => {
  const now = Date.parse('2026-09-08T09:00:00.000Z');

  it('charges only the address burst on a check, and the address on a booking', async () => {
    const db = limitsDb();
    const env = limitsEnv(db);
    assert.equal(await checkBookingLimits(env, 'Jane@Example.com', '1.2.3.4', now), null);
    assert.equal(db.rows.get('ip:1.2.3.4')?.count, 1);
    assert.equal(db.rows.has('cooldown:jane@example.com'), false, 'the check wrote nothing for the address');
    // A second try a moment later, after a refusal, is still allowed.
    assert.equal(await checkBookingLimits(env, 'jane@example.com', '1.2.3.4', now + 5_000), null);

    await recordBooking(env, 'jane@example.com', now + 6_000);
    assert.equal(db.rows.get('cooldown:jane@example.com')?.count, 1);
    assert.equal(db.rows.get('daily:jane@example.com')?.count, 1);
    const refused = await checkBookingLimits(env, 'jane@example.com', '1.2.3.4', now + 10_000);
    assert.equal(refused?.allowed, false, 'inside the hour after a real booking');
    assert.equal(await checkBookingLimits(env, 'jane@example.com', '1.2.3.4', now + 61 * 60_000), null, 'an hour later');
  });

  it('still stops a burst from one address before anything else', async () => {
    const db = limitsDb();
    const env = limitsEnv(db);
    for (let i = 0; i < POLICIES.perIpBurst.max; i += 1) assert.equal(await checkBookingLimits(env, `p${i}@example.com`, '9.9.9.9', now + i), null);
    assert.equal((await checkBookingLimits(env, 'late@example.com', '9.9.9.9', now + 20))?.allowed, false);
  });
});
