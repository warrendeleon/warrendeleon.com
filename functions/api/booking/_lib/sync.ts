// Keeping the rows honest with the calendar.
//
// The calendar is where Warren lives, so an event deleted or dragged by hand
// there has to reach the booking row, or the slot stays locked (a deletion)
// or the wrong slot stays locked (a move). The reconcile reads every future
// confirmed booking back from Google and repairs the difference. It runs when
// Google pushes a change to the webhook and on a timer as the fallback.

import { CalendlyClient, CalendlyError } from './calendly.ts';
import { CalendarAuthError, CalendarUnavailableError } from './google.ts';
import { randomToken } from './crypto.ts';
import type { Env } from './http.ts';
import { bucketsFor, dateKey } from './slots.ts';
import { audit, clientFor as liveClientFor, getSchedule, listEventTypes, markNeedsReconnect } from './store.ts';

/** How long a push channel lives. Google caps calendar channels at about a week. */
export const CHANNEL_TTL_MS = 6 * 24 * 60 * 60_000;
/** Renew when less than this is left, so a missed run does not lapse the channel. */
export const CHANNEL_RENEW_MS = 2 * 24 * 60 * 60_000;
/** Bookings this far ahead are looked at; the horizon is the booking limit. */
const LOOKAHEAD_MS = 60 * 24 * 60 * 60_000;

export interface SyncDeps {
  clientFor: typeof liveClientFor;
  now: () => number;
  /** Calendly, for the rows it booked; null when no token is configured. */
  calendly?: (env: Env) => CalendlyClient | null;
}

const liveCalendly = (env: Env) => (env.CALENDLY_TOKEN ? new CalendlyClient(env.CALENDLY_TOKEN) : null);
const liveDeps: SyncDeps = { clientFor: liveClientFor, now: Date.now, calendly: liveCalendly };

interface FutureRow {
  id: string;
  organiser_account: string;
  event_type: string;
  start_utc: string;
  end_utc: string;
  local_date: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
  provider: 'google' | 'calendly';
  calendly_invitee_uri: string | null;
}

export interface SyncReport {
  checked: number;
  cancelled: string[];
  moved: string[];
  /** Rows that disagree with the calendar but could not be repaired. */
  stuck: string[];
  /** Accounts whose calendar could not be read; their rows were left alone. */
  unreadable: string[];
}

/**
 * Compare every future confirmed booking with its event and repair the row.
 * A calendar that cannot be read leaves its rows untouched: guessing would
 * cancel real bookings during an outage.
 */
export async function reconcile(env: Env, deps: SyncDeps = liveDeps): Promise<SyncReport> {
  const now = deps.now();
  const horizon = new Date(now + LOOKAHEAD_MS).toISOString();
  const rows = (
    await env.BOOKING_DB.prepare(
      `SELECT id, organiser_account, event_type, start_utc, end_utc, local_date, google_event_id, google_calendar_id, provider, calendly_invitee_uri
         FROM bookings
        WHERE status = 'confirmed' AND (google_event_id IS NOT NULL OR calendly_invitee_uri IS NOT NULL) AND end_utc > ? AND start_utc < ?
        ORDER BY start_utc`,
    )
      .bind(new Date(now).toISOString(), horizon)
      .all<FutureRow>()
  ).results ?? [];

  const report: SyncReport = { checked: 0, cancelled: [], moved: [], stuck: [], unreadable: [] };
  const clients = new Map<string, Awaited<ReturnType<typeof deps.clientFor>>>();
  const schedules = new Map<string, string>();

  const calendly = (deps.calendly ?? liveCalendly)(env);
  for (const row of rows) {
    // A Calendly booking has no locks and no Google event of ours: the only
    // question is whether Calendly still has it.
    if (row.provider === 'calendly') {
      if (!calendly || !row.calendly_invitee_uri) continue;
      if (report.unreadable.includes('calendly')) continue;
      let status;
      try {
        status = await calendly.inviteeStatus(row.calendly_invitee_uri);
      } catch (cause) {
        console.error('[booking] sync: calendly unreadable', cause instanceof CalendlyError ? `${cause.status} ${cause.message}` : cause);
        report.unreadable.push('calendly');
        continue;
      }
      report.checked += 1;
      if (status === 'active') continue;
      try {
        await env.BOOKING_DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
        await audit(env, 'cancelled', row.id, { reason: 'cancelled in Calendly', start: row.start_utc });
        report.cancelled.push(row.id);
      } catch (cause) {
        console.error('[booking] sync: could not cancel calendly row', row.id, cause);
        report.stuck.push(row.id);
      }
      continue;
    }
    if (report.unreadable.includes(row.organiser_account)) continue;
    if (!clients.has(row.organiser_account)) clients.set(row.organiser_account, await deps.clientFor(env, row.organiser_account));
    const client = clients.get(row.organiser_account);
    if (!client) { report.unreadable.push(row.organiser_account); continue; }

    let event;
    try {
      event = await client.getEvent(row.google_event_id!, row.google_calendar_id ?? 'primary');
    } catch (cause) {
      if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
      const detail = cause instanceof CalendarUnavailableError ? cause.detail : String(cause);
      console.error('[booking] sync: calendar unreadable', row.organiser_account, detail);
      report.unreadable.push(row.organiser_account);
      continue;
    }
    report.checked += 1;

    if (!event || event.status === 'cancelled') {
      try {
        await env.BOOKING_DB.batch([
          env.BOOKING_DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(row.id),
          env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(row.id),
        ]);
        await audit(env, 'cancelled', row.id, { reason: 'removed in the calendar', start: row.start_utc });
        report.cancelled.push(row.id);
      } catch (cause) {
        console.error('[booking] sync: could not cancel row', row.id, cause);
        report.stuck.push(row.id);
      }
      continue;
    }

    if (!event.startUTC || !event.endUTC || (event.startUTC === row.start_utc && event.endUTC === row.end_utc)) continue;

    // Moved by hand. The row follows the calendar; the buckets follow the row.
    // A collision means someone booked into the new time first, which the
    // calendar owner has to resolve by hand, so it is reported rather than hidden.
    if (!schedules.has(row.event_type)) {
      const types = await listEventTypes(env, true);
      const type = types.find((t) => t.slug === row.event_type);
      const schedule = type ? await getSchedule(env, type.scheduleId) : null;
      schedules.set(row.event_type, schedule?.timezone ?? 'UTC');
    }
    const timezone = schedules.get(row.event_type)!;
    const start = Date.parse(event.startUTC);
    const buckets = bucketsFor({ start, end: Date.parse(event.endUTC) });
    try {
      await env.BOOKING_DB.batch([
        env.BOOKING_DB.prepare('DELETE FROM slot_locks WHERE booking_id = ?').bind(row.id),
        ...buckets.map((bucket) =>
          env.BOOKING_DB.prepare('INSERT INTO slot_locks (bucket_utc, booking_id) VALUES (?, ?)').bind(bucket, row.id),
        ),
        env.BOOKING_DB.prepare(
          "UPDATE bookings SET start_utc = ?, end_utc = ?, local_date = ?, updated_at = datetime('now') WHERE id = ?",
        ).bind(event.startUTC, event.endUTC, dateKey(start, timezone), row.id),
      ]);
      await audit(env, 'rescheduled', row.id, { reason: 'moved in the calendar', from: row.start_utc, to: event.startUTC });
      report.moved.push(row.id);
    } catch (cause) {
      console.error('[booking] sync: moved event collides with another booking', row.id, cause);
      await audit(env, 'failed', row.id, { reason: 'moved in the calendar onto a taken slot', to: event.startUTC });
      report.stuck.push(row.id);
    }
  }

  return report;
}

interface ChannelRow {
  calendar_id: string;
  channel_id: string;
  resource_id: string;
  token: string;
  expires_at: string;
}

/**
 * One push channel per calendar that bookings are written to, renewed before
 * it lapses. Returns the calendars whose channel was (re)created.
 */
export async function ensureChannels(env: Env, address: string, deps: SyncDeps = liveDeps): Promise<string[]> {
  const now = deps.now();
  const types = await listEventTypes(env, true);
  // Only the calendars this app writes to. A Calendly-provided type's events
  // live on the seat's own calendar, which this app neither reads nor watches.
  const wanted = new Map<string, string>();
  for (const type of types) if (type.provider !== 'calendly') wanted.set(type.targetCalendarId, type.organiserAccount);

  const existing = new Map<string, ChannelRow>();
  for (const row of (await env.BOOKING_DB.prepare('SELECT calendar_id, channel_id, resource_id, token, expires_at FROM sync_channels').all<ChannelRow>()).results ?? []) {
    existing.set(row.calendar_id, row);
  }

  // A channel for a calendar nothing points at any more is stopped and forgotten.
  for (const [calendarId, current] of existing) {
    if (wanted.has(calendarId)) continue;
    const client = await deps.clientFor(env, types.find((t) => t.targetCalendarId === calendarId)?.organiserAccount ?? '');
    try { if (client) await client.stopChannel(current.channel_id, current.resource_id); } catch (cause) { console.error('[booking] sync: could not stop stale channel', calendarId, cause instanceof Error ? cause.message : cause); }
    await env.BOOKING_DB.prepare('DELETE FROM sync_channels WHERE calendar_id = ?').bind(calendarId).run();
  }

  const renewed: string[] = [];
  for (const [calendarId, account] of wanted) {
    const current = existing.get(calendarId);
    if (current && Date.parse(current.expires_at) - now > CHANNEL_RENEW_MS) continue;
    const client = await deps.clientFor(env, account);
    if (!client) { console.error('[booking] sync: no client for', account); continue; }
    try {
      if (current) await client.stopChannel(current.channel_id, current.resource_id);
      const token = randomToken();
      const channel = await client.watchEvents(calendarId, address, token, CHANNEL_TTL_MS);
      await env.BOOKING_DB.prepare(
        `INSERT INTO sync_channels (calendar_id, channel_id, resource_id, token, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(calendar_id) DO UPDATE SET channel_id = excluded.channel_id, resource_id = excluded.resource_id,
           token = excluded.token, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
      )
        .bind(calendarId, channel.channelId, channel.resourceId, token, channel.expiresAt)
        .run();
      renewed.push(calendarId);
    } catch (cause) {
      if (cause instanceof CalendarAuthError) await markNeedsReconnect(env, cause.account, cause.reason);
      console.error('[booking] sync: could not watch', calendarId, cause instanceof Error ? cause.message : cause);
    }
  }
  return renewed;
}

/** True when a webhook call carries a token we handed to Google. */
export async function knownChannelToken(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const row = await env.BOOKING_DB.prepare('SELECT calendar_id FROM sync_channels WHERE token = ?').bind(token).first();
  return row !== null;
}
