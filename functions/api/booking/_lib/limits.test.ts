import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, POLICIES, type LimitRow } from './limits.ts';

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
