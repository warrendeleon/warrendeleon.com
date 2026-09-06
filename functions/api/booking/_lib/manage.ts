// Managing a booking after the fact: read it, move it, cancel it.
//
// The manage token is the whole authorisation. It travels in a header, never
// in a URL, so it stays out of access logs, analytics and referrers; the page
// keeps it in session storage after stripping it from the link it arrived in.
// A wrong token and a missing booking answer the same way, so the endpoint
// cannot be used to confirm that an id exists.

import { CalendarAuthError, CalendarUnavailableError, mergedBusy as liveMergedBusy } from './google.ts';
import { fail, json, maskEmail, safeEqual, type Env } from './http.ts';
import { consume, POLICIES } from './limits.ts';
import { bucketsFor, dateKey, generateSlots, subtractInterval } from './slots.ts';
import {
  audit,
  bookedByDate,
  busyClients,
  clientFor as liveClientFor,
  getEventType,
  getSchedule,
  listAccounts,
  localised,
  markNeedsReconnect,
} from './store.ts';
import { knownTimezone } from './validate.ts';

export const TOKEN_HEADER = 'x-manage-token';

/** A day either side of the new slot is plenty of context for the overlap check. */
const BUSY_PADDING_MS = 86_400_000;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[0-9a-f]{16,128}$/i;

export interface BookingRow {
  id: string;
  event_type: string;
  organiser_account: string;
  start_utc: string;
  end_utc: string;
  local_date: string;
  location: 'video' | 'phone';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  guests: string | null;
  booker_timezone: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
  meet_link: string | null;
  manage_token: string;
  status: 'confirmed' | 'cancelled';
}

/** Seams for tests: the calendar is never touched by the unit suite. */
export interface ManageDeps {
  clientFor: typeof liveClientFor;
  mergedBusy: typeof liveMergedBusy;
  now: () => number;
}

const liveDeps: ManageDeps = { clientFor: liveClientFor, mergedBusy: liveMergedBusy, now: Date.now };

const BOOKING_COLUMNS = `id, event_type, organiser_account, start_utc, end_utc, local_date, location,
  first_name, last_name, email, phone, guests, booker_timezone, google_event_id, google_calendar_id,
  meet_link, manage_token, status`;

/**
 * The booking the token unlocks, or null. Shape checks first so a malformed
 * id never reaches the database, and a constant-time compare on the token so
 * timing says nothing about how many characters matched.
 */
export async function loadBooking(env: Env, id: string, token: string): Promise<BookingRow | null> {
  if (!ID_PATTERN.test(id) || !TOKEN_PATTERN.test(token)) return null;
  const row = await env.BOOKING_DB.prepare(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = ?`)
    .bind(id)
    .first<BookingRow>();
  if (!row || !safeEqual(row.manage_token, token)) return null;
  return row;
}

function guestsOf(row: BookingRow): string[] {
  try {
    const parsed: unknown = JSON.parse(row.guests ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

/** What the page may know. The token itself is never echoed back. */
export async function publicBooking(env: Env, row: BookingRow, locale: string) {
  const type = await getEventType(env, row.event_type);
  const isPhone = row.location === 'phone';
  return {
    id: row.id,
    status: row.status,
    startUTC: row.start_utc,
    endUTC: row.end_utc,
    location: row.location,
    meetLink: row.status === 'confirmed' ? row.meet_link : null,
    hostPhone: isPhone && row.status === 'confirmed' ? env.HOST_PHONE?.trim() || null : null,
    firstName: row.first_name,
    email: row.email,
    guests: guestsOf(row),
    timezone: row.booker_timezone,
    type: {
      slug: row.event_type,
      name: type ? localised(type.names, locale) : row.event_type,
      durationMinutes: type?.durationMinutes ?? Math.round((Date.parse(row.end_utc) - Date.parse(row.start_utc)) / 60_000),
      locations: type?.locations ?? [row.location],
    },
  };
}

/** Every /bookings/:id request, whichever verb. */
export async function manageBooking(
  request: Request,
  env: Env,
  id: string,
  deps: ManageDeps = liveDeps,
): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP');
  const limited = await consume(env, `manage:${ip ?? 'unknown'}`, POLICIES.perIpBurst, deps.now());
  if (!limited.allowed) {
    return fail('rate_limited', 'Too many attempts. Please try again later.', {
      headers: { 'retry-after': String(limited.retryAfterSeconds) },
    });
  }

  const token = request.headers.get(TOKEN_HEADER) ?? '';
  const row = await loadBooking(env, id, token);
  if (!row) return fail('not_found', 'No booking matches this link.');

  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';

  switch (request.method.toUpperCase()) {
    case 'GET':
      return json({ booking: await publicBooking(env, row, locale) });
    case 'DELETE':
      return cancelBooking(env, row, locale, deps);
    case 'PATCH':
      return rescheduleBooking(request, env, row, locale, deps);
    default:
      return fail('not_found', 'No such booking route.');
  }
}

/**
 * Cancel. The calendar goes first, because the deletion is what tells everyone;
 * a booking marked cancelled with the event still standing would leave people
 * turning up. If the calendar refuses, nothing changes and the page says so.
 */
export async function cancelBooking(env: Env, row: BookingRow, locale: string, deps: ManageDeps = liveDeps): Promise<Response> {
  const recipients = [row.email, ...guestsOf(row)];
  if (row.status === 'cancelled') {
    return json({
      booking: await publicBooking(env, row, locale),
      calendar: { eventRemoved: false, alreadyCancelled: true, updatesSentTo: [] },
    });
  }

  if (row.google_event_id) {
    const organiser = await deps.clientFor(env, row.organiser_account);
    if (!organiser) return fail('calendar_unavailable', 'This call cannot be cancelled right now. Nothing changed.');
    try {
      await organiser.deleteEvent(row.google_event_id, row.google_calendar_id ?? 'primary');
    } catch (cause) {
      if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
      const detail = cause instanceof CalendarUnavailableError ? cause.detail : String(cause);
      console.error('[booking] cancel: calendar delete failed', row.id, detail);
      return fail('calendar_unavailable', 'My calendar did not answer. Nothing changed.');
    }
  }

  try {
    await env.BOOKING_DB.batch([
      env.BOOKING_DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(row.id),
      env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(row.id),
    ]);
  } catch (cause) {
    // The event is already gone, so people have been told. Worth shouting
    // about: the slot stays locked until someone clears it.
    console.error('[booking] cancel: event removed but the row would not update', row.id, cause);
    return fail('internal', 'The invite was cancelled but the record could not be updated.');
  }

  await audit(env, 'cancelled', row.id, { email: maskEmail(row.email), start: row.start_utc });
  return json({
    booking: await publicBooking(env, { ...row, status: 'cancelled' }, locale),
    calendar: { eventRemoved: true, alreadyCancelled: false, updatesSentTo: recipients },
  });
}

function readInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Move. Same shape as creating: recompute the slot from a fresh free/busy read
 * with the booking's own time carved out, claim the new buckets atomically,
 * then move the event; if the calendar refuses, put everything back.
 */
export async function rescheduleBooking(
  request: Request,
  env: Env,
  row: BookingRow,
  locale: string,
  deps: ManageDeps = liveDeps,
): Promise<Response> {
  if (row.status === 'cancelled') return fail('bad_request', 'This call was cancelled, so it cannot be moved.', { fields: { status: 'cancelled' } });

  const body: unknown = await request.json().catch(() => null);
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const startUTC = readInstant(input.startUTC);
  if (!startUTC) return fail('bad_request', 'A start time is required.', { fields: { startUTC: 'invalid' } });
  if (startUTC === row.start_utc) return fail('bad_request', 'That is the current time.', { fields: { startUTC: 'unchanged' } });
  const timezone = typeof input.timezone === 'string' && knownTimezone(input.timezone) ? input.timezone : row.booker_timezone;

  const eventType = await getEventType(env, row.event_type);
  const schedule = eventType ? await getSchedule(env, eventType.scheduleId) : null;
  if (!eventType || !schedule) {
    console.error('[booking] reschedule: event type or schedule missing', row.event_type);
    return fail('internal', 'This event type is misconfigured.');
  }

  const startsAt = Date.parse(startUTC);
  const localDate = dateKey(startsAt, schedule.timezone);
  const now = deps.now();

  let busy;
  try {
    busy = await deps.mergedBusy(
      await busyClients(env, await listAccounts(env)),
      new Date(startsAt - BUSY_PADDING_MS).toISOString(),
      new Date(startsAt + BUSY_PADDING_MS).toISOString(),
    );
  } catch (cause) {
    if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
    console.error('[booking] reschedule: calendar read failed', cause);
    return fail('calendar_unavailable', 'The calendar is unreachable. Please try again shortly.');
  }

  const own = { start: Date.parse(row.start_utc), end: Date.parse(row.end_utc) };
  const counts = await bookedByDate(env, localDate, localDate);
  const offered = generateSlots({
    date: localDate,
    schedule,
    rules: eventType.rules,
    busy: subtractInterval(busy, own),
    // The booking being moved must not count against its own day.
    bookedCount: (counts[localDate] ?? 0) - (row.local_date === localDate ? 1 : 0),
    now,
  });
  const slot = offered.find((candidate) => candidate.start === startsAt);
  if (!slot) return fail('slot_taken', 'That time is no longer available. Please pick another.');

  const endUTC = new Date(slot.end).toISOString();
  const oldBuckets = bucketsFor(own);
  const newBuckets = bucketsFor(slot);

  try {
    await env.BOOKING_DB.batch([
      env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(row.id),
      ...newBuckets.map((bucket) =>
        env.BOOKING_DB.prepare('INSERT INTO slot_locks (bucket_utc, booking_id) VALUES (?, ?)').bind(bucket, row.id),
      ),
      env.BOOKING_DB.prepare(
        "UPDATE bookings SET start_utc = ?, end_utc = ?, local_date = ?, booker_timezone = ?, updated_at = datetime('now') WHERE id = ?",
      ).bind(startUTC, endUTC, localDate, timezone, row.id),
    ]);
  } catch (cause) {
    console.error('[booking] reschedule: slot already claimed', localDate, cause);
    return fail('slot_taken', 'That time was taken a moment ago. Please pick another.');
  }

  const restore = async (reason: string) => {
    try {
      await env.BOOKING_DB.batch([
        env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(row.id),
        ...oldBuckets.map((bucket) =>
          env.BOOKING_DB.prepare('INSERT INTO slot_locks (bucket_utc, booking_id) VALUES (?, ?)').bind(bucket, row.id),
        ),
        env.BOOKING_DB.prepare(
          "UPDATE bookings SET start_utc = ?, end_utc = ?, local_date = ?, booker_timezone = ?, updated_at = datetime('now') WHERE id = ?",
        ).bind(row.start_utc, row.end_utc, row.local_date, row.booker_timezone, row.id),
      ]);
    } catch (cause) {
      console.error('[booking] reschedule: restore failed, record and calendar may disagree', row.id, cause);
    }
    await audit(env, 'failed', row.id, { reason, action: 'reschedule' });
  };

  if (row.google_event_id) {
    const organiser = await deps.clientFor(env, row.organiser_account);
    if (!organiser) {
      await restore('organiser account is not connected');
      return fail('calendar_unavailable', 'This call cannot be moved right now. Nothing changed.');
    }
    try {
      await organiser.patchEvent(row.google_event_id, startUTC, endUTC, schedule.timezone, row.google_calendar_id ?? 'primary');
    } catch (cause) {
      if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
      const detail = cause instanceof CalendarUnavailableError ? cause.detail : String(cause);
      console.error('[booking] reschedule: calendar update failed, restoring', row.id, detail);
      await restore(detail);
      return fail('calendar_unavailable', 'My calendar did not answer. The call keeps its old time.');
    }
  }

  await audit(env, 'rescheduled', row.id, { email: maskEmail(row.email), from: row.start_utc, to: startUTC });
  const moved: BookingRow = { ...row, start_utc: startUTC, end_utc: endUTC, local_date: localDate, booker_timezone: timezone };
  return json({
    booking: await publicBooking(env, moved, locale),
    calendar: { eventUpdated: Boolean(row.google_event_id), updatesSentTo: [row.email, ...guestsOf(row)] },
  });
}
