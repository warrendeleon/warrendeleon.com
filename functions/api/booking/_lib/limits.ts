// Rate limiting. The decision is a pure function of the stored row, the clock
// and the policy, so the awkward cases (a window that has rolled over, a clock
// that went backwards) are testable without a database.

import type { Env } from './http.ts';

export interface Policy {
  /** Attempts allowed inside one window. */
  max: number;
  windowMs: number;
}

export const POLICIES = {
  /** Bookings one address may hold per day. */
  perEmailDaily: { max: 2, windowMs: 24 * 60 * 60_000 },
  /** Quiet period between attempts from one address. */
  perEmailCooldown: { max: 1, windowMs: 60 * 60_000 },
  /** Blunt instrument against a script hammering the endpoint. */
  perIpBurst: { max: 10, windowMs: 60_000 },
} as const satisfies Record<string, Policy>;

export interface LimitRow {
  window_start: string;
  count: number;
}

export interface Decision {
  allowed: boolean;
  /** Seconds until the window clears, for the Retry-After header. */
  retryAfterSeconds: number;
  /** The row to store when the attempt is allowed. */
  next: LimitRow;
}

export function decide(row: LimitRow | null, now: number, policy: Policy): Decision {
  const started = row ? Date.parse(row.window_start) : Number.NaN;
  const fresh: LimitRow = { window_start: new Date(now).toISOString(), count: 1 };

  // No row, an unreadable one, or a window that has run out: start again. A
  // window_start in the future means the clock moved, and starting again is
  // safer than trusting it and locking someone out for a day.
  if (!row || Number.isNaN(started) || started > now || now - started >= policy.windowMs) {
    return { allowed: true, retryAfterSeconds: 0, next: fresh };
  }

  if (row.count >= policy.max) {
    const remaining = policy.windowMs - (now - started);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remaining / 1000)),
      next: row,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    next: { window_start: row.window_start, count: row.count + 1 },
  };
}

/**
 * Apply one policy to one key, writing the new count when the attempt is
 * allowed. Deliberately not atomic: two simultaneous requests can each see the
 * same count and both pass. That is acceptable here because this guards against
 * volume, not against double booking, which the slot locks handle properly.
 */
export async function consume(
  env: Env,
  key: string,
  policy: Policy,
  now = Date.now(),
): Promise<Decision> {
  const row = await env.BOOKING_DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<LimitRow>();

  const decision = decide(row, now, policy);
  if (decision.allowed) {
    await env.BOOKING_DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
    )
      .bind(key, decision.next.window_start, decision.next.count)
      .run();
  }
  return decision;
}

/** The decision for one key without recording anything. */
export async function peek(env: Env, key: string, policy: Policy, now = Date.now()): Promise<Decision> {
  const row = await env.BOOKING_DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<LimitRow>();
  return decide(row, now, policy);
}

const emailKeys = (email: string): [string, Policy][] => {
  const address = email.toLowerCase();
  return [
    [`cooldown:${address}`, POLICIES.perEmailCooldown],
    [`daily:${address}`, POLICIES.perEmailDaily],
  ];
};

/**
 * Every limit a booking attempt must clear, in the order they are checked.
 *
 * Only the per-IP burst is charged here. The per-address limits are read but
 * not written: a refused booking (a slot taken a second earlier, a calendar
 * that did not answer) must not cost the person their next try, so those are
 * charged by recordBooking once a booking has actually been made.
 */
export async function checkBookingLimits(
  env: Env,
  email: string,
  ip: string | null,
  now = Date.now(),
): Promise<Decision | null> {
  const burst = await consume(env, `ip:${ip ?? 'unknown'}`, POLICIES.perIpBurst, now);
  if (!burst.allowed) return burst;
  for (const [key, policy] of emailKeys(email)) {
    const decision = await peek(env, key, policy, now);
    if (!decision.allowed) return decision;
  }
  return null;
}

/** A booking was made: charge the address its cooldown and its daily count. */
export async function recordBooking(env: Env, email: string, now = Date.now()): Promise<void> {
  for (const [key, policy] of emailKeys(email)) await consume(env, key, policy, now);
}
