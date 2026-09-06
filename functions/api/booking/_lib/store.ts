// Every read and write of the booking database lives here, so the route
// handlers stay about HTTP and the JSON columns are parsed in exactly one place.

import { open } from './crypto.ts';
import { CalendarClient, type GoogleCredentials } from './google.ts';
import type { Env } from './http.ts';
import type { EventTypeRules, Schedule, Window } from './slots.ts';

export interface AccountRow {
  email: string;
  refresh_token_enc: string;
  check_busy: number;
  calendar_ids: string;
  status: 'ok' | 'needs_reconnect';
}

export interface EventTypeRow {
  slug: string;
  duration_minutes: number;
  names: string;
  descriptions: string;
  locations: string;
  organiser_account: string;
  mirror_to: string;
  schedule_id: string;
  buffer_minutes: number;
  min_notice_hours: number;
  days_ahead_limit: number;
  max_per_day: number;
  visibility: 'listed' | 'unlisted';
  active: number;
  sort_order: number;
}

export interface ScheduleRow {
  id: string;
  name: string;
  timezone: string;
  weekly_hours: string;
  date_overrides: string;
}

export interface EventType {
  slug: string;
  durationMinutes: number;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  locations: string[];
  organiserAccount: string;
  mirrorTo: string[];
  scheduleId: string;
  visibility: 'listed' | 'unlisted';
  rules: EventTypeRules;
}

/**
 * Parse a JSON column, falling back rather than throwing. A malformed value
 * written by hand should degrade one field, not take the whole page down.
 */
function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function toEventType(row: EventTypeRow): EventType {
  return {
    slug: row.slug,
    durationMinutes: row.duration_minutes,
    names: parseJson<Record<string, string>>(row.names, {}),
    descriptions: parseJson<Record<string, string>>(row.descriptions, {}),
    locations: parseJson<string[]>(row.locations, ['video']),
    organiserAccount: row.organiser_account,
    mirrorTo: parseJson<string[]>(row.mirror_to, []),
    scheduleId: row.schedule_id,
    visibility: row.visibility,
    rules: {
      durationMinutes: row.duration_minutes,
      bufferMinutes: row.buffer_minutes,
      minNoticeHours: row.min_notice_hours,
      daysAheadLimit: row.days_ahead_limit,
      maxPerDay: row.max_per_day,
    },
  };
}

export function toSchedule(row: ScheduleRow): Schedule {
  return {
    timezone: row.timezone,
    weeklyHours: parseJson<Record<string, Window[]>>(row.weekly_hours, {}),
    dateOverrides: parseJson<Record<string, Window[]>>(row.date_overrides, {}),
  };
}

/** Pick the best available translation, falling back through English. */
export function localised(values: Record<string, string>, locale: string): string {
  return values[locale] ?? values.en ?? Object.values(values)[0] ?? '';
}

export async function listAccounts(env: Env): Promise<AccountRow[]> {
  const result = await env.BOOKING_DB.prepare(
    'SELECT email, refresh_token_enc, check_busy, calendar_ids, status FROM calendar_accounts ORDER BY email',
  ).all<AccountRow>();
  return result.results ?? [];
}

/**
 * Calendar clients for every account that should contribute busy time.
 * An account already flagged for reconnection still produces a client, so the
 * caller hits the real error and can report which account is at fault.
 */
export async function busyClients(env: Env, accounts: AccountRow[]): Promise<CalendarClient[]> {
  const credentials: GoogleCredentials = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
  const wanted = accounts.filter((account) => account.check_busy === 1);
  return Promise.all(
    wanted.map(async (account) => {
      const refreshToken = await open(account.refresh_token_enc, env.TOKEN_KEY);
      const ids = parseJson<string[]>(account.calendar_ids, ['primary']);
      return new CalendarClient(account.email, refreshToken, credentials, undefined, undefined, ids);
    }),
  );
}

/** A client for one named account, used when writing the event. */
export async function clientFor(env: Env, email: string): Promise<CalendarClient | null> {
  const row = await env.BOOKING_DB.prepare(
    'SELECT email, refresh_token_enc, check_busy, calendar_ids, status FROM calendar_accounts WHERE email = ?',
  )
    .bind(email)
    .first<AccountRow>();
  if (!row) return null;
  const refreshToken = await open(row.refresh_token_enc, env.TOKEN_KEY);
  return new CalendarClient(row.email, refreshToken, {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
}

export async function markNeedsReconnect(env: Env, email: string, reason: string): Promise<void> {
  await env.BOOKING_DB.prepare(
    `UPDATE calendar_accounts
        SET status = 'needs_reconnect', last_error = ?, updated_at = datetime('now')
      WHERE email = ?`,
  )
    .bind(reason, email)
    .run();
}

export async function markHealthy(env: Env, email: string): Promise<void> {
  await env.BOOKING_DB.prepare(
    `UPDATE calendar_accounts
        SET status = 'ok', last_error = NULL, updated_at = datetime('now')
      WHERE email = ? AND status <> 'ok'`,
  )
    .bind(email)
    .run();
}

/**
 * Event types a visitor may see. Unlisted ones are reachable by their own URL
 * but never appear in a listing, which is what keeps a work one-to-one off the
 * public page.
 */
export async function listEventTypes(env: Env, includeUnlisted = false): Promise<EventType[]> {
  const sql = includeUnlisted
    ? 'SELECT * FROM event_types WHERE active = 1 ORDER BY sort_order, slug'
    : "SELECT * FROM event_types WHERE active = 1 AND visibility = 'listed' ORDER BY sort_order, slug";
  const result = await env.BOOKING_DB.prepare(sql).all<EventTypeRow>();
  return (result.results ?? []).map(toEventType);
}

export async function getEventType(env: Env, slug: string): Promise<EventType | null> {
  const row = await env.BOOKING_DB.prepare('SELECT * FROM event_types WHERE slug = ? AND active = 1')
    .bind(slug)
    .first<EventTypeRow>();
  return row ? toEventType(row) : null;
}

export async function getSchedule(env: Env, id: string): Promise<Schedule | null> {
  const row = await env.BOOKING_DB.prepare('SELECT * FROM schedules WHERE id = ?')
    .bind(id)
    .first<ScheduleRow>();
  return row ? toSchedule(row) : null;
}

/**
 * Confirmed bookings per local date across a range. The cap counts every event
 * type together: five calls in a day is five calls, whoever booked them.
 */
export async function bookedByDate(
  env: Env,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  const result = await env.BOOKING_DB.prepare(
    `SELECT local_date, COUNT(*) AS total
       FROM bookings
      WHERE status = 'confirmed' AND local_date BETWEEN ? AND ?
      GROUP BY local_date`,
  )
    .bind(fromDate, toDate)
    .all<{ local_date: string; total: number }>();

  const counts: Record<string, number> = {};
  for (const row of result.results ?? []) counts[row.local_date] = row.total;
  return counts;
}

export async function audit(
  env: Env,
  action: 'created' | 'cancelled' | 'rescheduled' | 'failed' | 'connected' | 'disconnected',
  bookingId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await env.BOOKING_DB.prepare(
    "INSERT INTO audit_log (booking_id, action, details, created_at) VALUES (?, ?, ?, datetime('now'))",
  )
    .bind(bookingId, action, JSON.stringify(details))
    .run();
}
