// Creating a booking. The order of the steps is the design:
//
//   validate -> challenge -> rate limit -> recompute the slot -> claim it
//   atomically -> write the calendar event -> or undo everything.
//
// The client's chosen slot is never trusted. It is recomputed from the schedule
// and a fresh free/busy read, because the page may have been open for an hour.

import { CalendlyClient, CalendlyError } from './calendly.ts';
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

  if (eventType.provider === 'calendly') return createThroughCalendly(env, eventType, schedule, value);

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

  // The id and token ride in the fragment: a browser never sends a fragment to
  // a server, so the capability stays out of access logs and analytics. The
  // page moves it to session storage and strips it the moment it loads.
  const manageUrl = `${origin}/booking/manage/?utm_source=calendar&utm_medium=email#id=${id}&token=${manageToken}`;
  const details = describeEvent({
    typeName: localised(eventType.names, 'en'),
    question: localised(eventType.question, value.locale) || null,
    booker: value,
    hostPhone,
    manageUrl,
    origin,
  });

  try {
    const event = await organiser.insertEvent(
      {
        summary: details.summary,
        description: details.description,
        startUTC: value.startUTC,
        endUTC,
        timezone: schedule.timezone,
        attendees,
        withMeet: value.location === 'video',
        location: details.location ?? undefined,
      },
      eventType.targetCalendarId,
    );

    await env.BOOKING_DB.prepare(
      "UPDATE bookings SET google_event_id = ?, google_calendar_id = ?, meet_link = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(event.id, eventType.targetCalendarId, event.meetLink, id)
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
          hostPhone: isPhone ? hostPhone : null,
          status: 'confirmed',
        },
        // What actually happened, so the page can say so rather than imply it.
        calendar: { eventCreated: true, invitesSentTo: [value.email, ...value.guests] },
        manageUrl,
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

/**
 * The Calendly-provided types. Calendly checks the slot, creates the meeting
 * on the seat's own calendar and emails the invite; the row here is a record,
 * not a lock, so it never counts against this app's daily caps. Reschedule
 * and cancel go through the links Calendly hands back.
 */
async function createThroughCalendly(
  env: Env,
  eventType: Awaited<ReturnType<typeof getEventType>> & object,
  schedule: { timezone: string },
  value: NonNullable<ReturnType<typeof validateBooking>['value']>,
): Promise<Response> {
  if (!env.CALENDLY_TOKEN || !eventType.calendlyEventType) {
    console.error('[booking] create: calendly type without token or event type uri', eventType.slug);
    return fail('calendar_unavailable', 'This call cannot be booked right now.');
  }
  const id = crypto.randomUUID();
  const calendly = new CalendlyClient(env.CALENDLY_TOKEN);
  let booked;
  try {
    // The notes are filed under Calendly's own question, or dropped when
    // the type asks none: Calendly keeps answers only to questions it knows.
    const question = value.notes ? await calendly.firstQuestion(eventType.calendlyEventType) : null;
    booked = await calendly.createInvitee({
      eventTypeUri: eventType.calendlyEventType,
      startUTC: value.startUTC,
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email,
      timezone: value.timezone,
      guests: value.guests,
      answer: value.notes && question ? { question, answer: value.notes } : null,
      locationKind: value.location === 'video' ? 'google_conference' : null,
    });
  } catch (cause) {
    const detail = cause instanceof CalendlyError ? `${cause.status} ${cause.message}` : String(cause);
    console.error('[booking] create: calendly refused', detail);
    await audit(env, 'failed', id, { reason: detail, provider: 'calendly' });
    // Calendly names a taken or stale slot in its 400; any other refusal is
    // configuration or Calendly itself, which the booker cannot fix by
    // choosing again.
    if (cause instanceof CalendlyError && cause.status === 400 && /time|slot|availab|already|past/i.test(cause.message)) {
      return fail('slot_taken', 'That time is no longer available. Please pick another.');
    }
    return fail('calendar_unavailable', 'The booking could not be confirmed. Nothing was reserved.');
  }

  const startsAt = Date.parse(value.startUTC);
  const endUTC = new Date(startsAt + eventType.durationMinutes * 60_000).toISOString();
  try {
    await env.BOOKING_DB.prepare(
      `INSERT INTO bookings (
         id, event_type, organiser_account, start_utc, end_utc, local_date, location,
         first_name, last_name, email, phone, guests, booker_timezone, notes,
         utm_source, utm_medium, utm_campaign, utm_content,
         manage_token, status, provider, calendly_invitee_uri, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'calendly', ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        id, eventType.slug, eventType.organiserAccount, value.startUTC, endUTC, dateKey(startsAt, schedule.timezone), value.location,
        value.firstName, value.lastName, value.email, value.phone, JSON.stringify(value.guests), value.timezone, value.notes,
        value.utm.source ?? null, value.utm.medium ?? null, value.utm.campaign ?? null, value.utm.content ?? null,
        randomToken(), booked.inviteeUri,
      )
      .run();
  } catch (cause) {
    // The meeting exists and the invite is out; a missing record is a log
    // problem, not the booker's.
    console.error('[booking] create: calendly booking made but the row failed', id, cause);
  }
  await audit(env, 'created', id, { type: eventType.slug, provider: 'calendly', email: maskEmail(value.email), start: value.startUTC });

  return json(
    {
      booking: { id, startUTC: value.startUTC, endUTC, location: value.location, meetLink: null, hostPhone: null, status: 'confirmed' },
      calendar: { eventCreated: true, invitesSentTo: [value.email, ...value.guests], provider: 'calendly' },
      manageUrl: booked.rescheduleUrl || null,
      cancelUrl: booked.cancelUrl || null,
    },
    201,
  );
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

export const HOST_NAME = 'Warren de Leon';

/** The manage URL with the action named in both the query (for analytics) and the fragment (for the page). */
function manageLink(manageUrl: string, action: 'cancel' | 'reschedule'): string {
  const [base, fragment = ''] = manageUrl.split('#');
  const joiner = base!.includes('?') ? '&' : '?';
  return `${base}${joiner}utm_content=${action}#${fragment}${fragment ? '&' : ''}action=${action}`;
}

export interface EventDetailsInput {
  typeName: string;
  /** The event type's own question, in the booker's language, if it has one. */
  question: string | null;
  booker: {
    firstName: string; lastName: string; email: string; phone: string | null;
    location: 'video' | 'phone'; notes: string | null; guests: string[]; locale: string;
  };
  hostPhone: string | null;
  manageUrl: string;
  origin: string;
}

/**
 * The event as Calendly writes it, so a booking looks the same in the diary
 * whichever tool made it: a title of the form "Type: Booker and Host", then labelled lines for
 * the event, the location, the answers, the guests, and how to change it.
 * Pure, so the exact text is tested without creating anything.
 */
export function describeEvent(input: EventDetailsInput): { summary: string; description: string; location: string | null } {
  const { typeName, question, booker, hostPhone, manageUrl, origin } = input;
  const bookerName = `${booker.firstName} ${booker.lastName}`;
  const isPhone = booker.location === 'phone';

  const location = isPhone
    ? hostPhone
      ? `Phone call: you call ${HOST_NAME} on ${hostPhone}`
      : 'Phone call'
    : 'Google Meet';

  const prefix = booker.locale === 'en' ? '' : `/${booker.locale}`;
  const profileUrl = `${origin}${prefix}/work-experience/?utm_source=calendar&utm_medium=email`;

  const lines: string[] = [
    `Event Name: ${typeName}`,
    `Location: ${location}`,
  ];
  if (isPhone && booker.phone) lines.push(`Invitee phone number: ${booker.phone}`);
  if (booker.notes) lines.push(`${question ?? 'Notes'}: ${booker.notes}`);
  if (booker.guests.length > 0) lines.push(`Guests: ${booker.guests.join(', ')}`);
  // Every link carries the site's tags: calendar is the source, email the
  // medium. The two manage links share a target, so content tells them apart.
  lines.push(
    `Before we talk, my work experience is here, with a button to download my CV:\n${profileUrl}`,
    `Need to make changes to this event?\nCancel: ${manageLink(manageUrl, 'cancel')}\nReschedule: ${manageLink(manageUrl, 'reschedule')}`,
    `Booked at ${origin}/?utm_source=calendar&utm_medium=email`,
  );

  return {
    summary: `${typeName}: ${bookerName} and ${HOST_NAME}`,
    description: lines.join('\n\n'),
    location: isPhone && hostPhone ? hostPhone : null,
  };
}
