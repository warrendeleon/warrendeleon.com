// Creating a booking. The order of the steps is the design:
//
//   validate -> challenge -> rate limit -> recompute the slot -> claim it
//   atomically -> write the calendar event -> or undo everything.
//
// The client's chosen slot is never trusted. It is recomputed from the schedule
// and a fresh free/busy read, because the page may have been open for an hour.

import { randomToken } from './crypto.ts';
import {
  CalendarAuthError,
  CalendarUnavailableError,
  mergedBusy,
  type Attendee,
} from './google.ts';
import { fail, json, maskEmail, type Env } from './http.ts';
import { checkBookingLimits } from './limits.ts';
import { bucketsFor, dateKey, generateSlots } from './slots.ts';
import {
  audit,
  bookedByDate,
  busyClients,
  clientFor,
  getEventType,
  getSchedule,
  listAccounts,
  localised,
  markNeedsReconnect,
} from './store.ts';
import { validateBooking, verifyTurnstile } from './validate.ts';

/** A day either side of the slot is plenty of context for the overlap check. */
const BUSY_PADDING_MS = 86_400_000;

export async function createBooking(request: Request, env: Env, origin: string): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const requestedType = typeof body === 'object' && body !== null ? String((body as Record<string, unknown>).type ?? '') : '';

  const eventType = requestedType ? await getEventType(env, requestedType) : null;
  if (!eventType) {
    return fail('not_found', 'No such event type.', { fields: { type: 'unknown' } });
  }

  const { value, fields, trapped } = validateBooking(body, eventType.locations);
  if (trapped) {
    // A bot filled the hidden field. Answer as though it worked so it learns
    // nothing, and write nothing at all.
    return json({ booking: null, manageUrl: null }, 201);
  }
  if (!value) return fail('bad_request', 'Please check the form.', { fields });

  const ip = request.headers.get('CF-Connecting-IP');

  if (!(await verifyTurnstile(value.turnstileToken, env.TURNSTILE_SECRET, ip))) {
    return fail('forbidden', 'The anti-spam check did not pass. Please try again.');
  }

  const limited = await checkBookingLimits(env, value.email, ip);
  if (limited) {
    return fail('rate_limited', 'Too many booking attempts. Please try again later.', {
      headers: { 'retry-after': String(limited.retryAfterSeconds) },
    });
  }

  const schedule = await getSchedule(env, eventType.scheduleId);
  if (!schedule) {
    console.error('[booking] event type', eventType.slug, 'points at missing schedule', eventType.scheduleId);
    return fail('internal', 'This event type is misconfigured.');
  }

  const startsAt = Date.parse(value.startUTC);
  const localDate = dateKey(startsAt, schedule.timezone);
  const now = Date.now();

  const accounts = await listAccounts(env);
  let busy;
  try {
    busy = await mergedBusy(
      await busyClients(env, accounts),
      new Date(startsAt - BUSY_PADDING_MS).toISOString(),
      new Date(startsAt + BUSY_PADDING_MS).toISOString(),
    );
  } catch (cause) {
    if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
    console.error('[booking] create: calendar read failed', cause);
    return fail('calendar_unavailable', 'The calendar is unreachable. Please try again shortly.');
  }

  const counts = await bookedByDate(env, localDate, localDate);
  const offered = generateSlots({
    date: localDate,
    schedule,
    rules: eventType.rules,
    busy,
    bookedCount: counts[localDate] ?? 0,
    now,
  });

  const slot = offered.find((candidate) => candidate.start === startsAt);
  if (!slot) {
    return fail('slot_taken', 'That time is no longer available. Please pick another.');
  }

  const id = crypto.randomUUID();
  const manageToken = randomToken();
  const endUTC = new Date(slot.end).toISOString();
  const buckets = bucketsFor(slot);

  // One atomic batch: the booking and every bucket it occupies. A competing
  // request that overlaps by even one bucket collides on the primary key, the
  // whole batch fails, and that request is the one told the slot is gone.
  try {
    await env.BOOKING_DB.batch([
      env.BOOKING_DB.prepare(
        `INSERT INTO bookings (
           id, event_type, organiser_account, start_utc, end_utc, local_date, location,
           first_name, last_name, email, phone, guests, booker_timezone, notes,
           utm_source, utm_medium, utm_campaign, utm_content,
           manage_token, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', datetime('now'), datetime('now'))`,
      ).bind(
        id,
        eventType.slug,
        eventType.organiserAccount,
        value.startUTC,
        endUTC,
        localDate,
        value.location,
        value.firstName,
        value.lastName,
        value.email,
        value.phone,
        JSON.stringify(value.guests),
        value.timezone,
        value.notes,
        value.utm.source ?? null,
        value.utm.medium ?? null,
        value.utm.campaign ?? null,
        value.utm.content ?? null,
        manageToken,
      ),
      ...buckets.map((bucket) =>
        env.BOOKING_DB.prepare('INSERT INTO slot_locks (bucket_utc, booking_id) VALUES (?, ?)').bind(bucket, id),
      ),
    ]);
  } catch (cause) {
    console.error('[booking] create: slot already claimed', localDate, cause);
    return fail('slot_taken', 'That time was taken a moment ago. Please pick another.');
  }

  const organiser = await clientFor(env, eventType.organiserAccount);
  if (!organiser) {
    await undo(env, id, 'organiser account is not connected');
    return fail('calendar_unavailable', 'This call cannot be booked right now.');
  }

  const attendees: Attendee[] = [
    { email: value.email, displayName: `${value.firstName} ${value.lastName}` },
    ...value.guests.map((email) => ({ email })),
    // Only the addresses this event type explicitly mirrors to. An interview
    // organised from the personal account must not surface in a work diary.
    ...eventType.mirrorTo.map((email) => ({ email })),
  ];

  // A phone call means the booker rings Warren. His number is the event's
  // location so it sits at the top of the invite; theirs goes in the notes so
  // an unknown number at the right minute is picked up rather than ignored.
  const isPhone = value.location === 'phone';
  const hostPhone = env.HOST_PHONE?.trim() || null;

  // A link back to the work experience page, in the booker's language, tagged
  // the way the site tags every other origin: source is the specific place the
  // click comes from, medium is its channel. A booking is not a push, so no
  // campaign; the page is linked once, so no content tag.
  const prefix = value.locale === 'en' ? '' : `/${value.locale}`;
  const profileUrl = `${origin}${prefix}/work-experience/?utm_source=calendar&utm_medium=email`;

  const description = [
    value.notes,
    isPhone && hostPhone ? `Call ${hostPhone} at the start time.` : null,
    isPhone && value.phone ? `Calling from ${value.phone}.` : null,
    `Before we talk, my work experience is here, with a button to download my CV:\n${profileUrl}`,
    `Booked from ${origin}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const event = await organiser.insertEvent({
      summary: `${localised(eventType.names, 'en')} with ${value.firstName} ${value.lastName}`,
      description,
      startUTC: value.startUTC,
      endUTC,
      timezone: schedule.timezone,
      attendees,
      withMeet: value.location === 'video',
      location: isPhone && hostPhone ? hostPhone : undefined,
    });

    await env.BOOKING_DB.prepare(
      "UPDATE bookings SET google_event_id = ?, meet_link = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(event.id, event.meetLink, id)
      .run();

    await audit(env, 'created', id, {
      type: eventType.slug,
      organiser: eventType.organiserAccount,
      email: maskEmail(value.email),
      start: value.startUTC,
    });

    return json(
      {
        booking: {
          id,
          startUTC: value.startUTC,
          endUTC,
          location: value.location,
          meetLink: event.meetLink,
          status: 'confirmed',
        },
        manageUrl: `${origin}/booking/manage/?id=${id}&token=${manageToken}`,
      },
      201,
    );
  } catch (cause) {
    // A booking row without a calendar event is worse than no booking: it
    // blocks the slot and nobody is expecting the call.
    if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
    const detail = cause instanceof CalendarUnavailableError ? cause.detail : String(cause);
    console.error('[booking] create: calendar write failed, rolling back', detail);
    await undo(env, id, detail);
    return fail('calendar_unavailable', 'The booking could not be confirmed. Nothing was reserved.');
  }
}

/** Release the slot and record why, after the calendar refused the event. */
async function undo(env: Env, bookingId: string, reason: string): Promise<void> {
  try {
    await env.BOOKING_DB.batch([
      env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(bookingId),
      env.BOOKING_DB.prepare('DELETE FROM bookings WHERE id = ?').bind(bookingId),
    ]);
  } catch (cause) {
    // Worth shouting about: the slot stays locked until someone clears it.
    console.error('[booking] rollback failed, slot may stay locked', bookingId, cause);
  }
  await audit(env, 'failed', bookingId, { reason });
}
