// Google Calendar over plain fetch. No SDK: googleapis does not target Workers,
// and the surface used here is four calls.
//
// The rule that matters most in this file is that every failure is loud. If a
// calendar cannot be read, availability must collapse to nothing rather than
// quietly reporting a free day, because "no slots" and "everything is free"
// look the same to a booker and only one of them is safe.

import type { Interval } from './slots.ts';
import { mergeIntervals } from './slots.ts';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/** Refresh once the current token has less than this left. */
const REFRESH_MARGIN_MS = 5 * 60_000;

/** The grant is gone. Only a human reconnecting through the admin fixes this. */
export class CalendarAuthError extends Error {
  readonly account: string;
  readonly reason: string;

  constructor(account: string, reason: string) {
    super(`calendar account ${account} needs reconnecting: ${reason}`);
    this.name = 'CalendarAuthError';
    this.account = account;
    this.reason = reason;
  }
}

/** Google answered, but not usefully. Transient until proven otherwise. */
export class CalendarUnavailableError extends Error {
  readonly account: string;
  readonly detail: string;

  constructor(account: string, detail: string) {
    super(`calendar for ${account} is unavailable: ${detail}`);
    this.name = 'CalendarUnavailableError';
    this.account = account;
    this.detail = detail;
  }
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
}

export interface EventDraft {
  summary: string;
  description?: string;
  startUTC: string;
  endUTC: string;
  timezone: string;
  attendees: Attendee[];
  /** Ask Google to mint a Meet link and return it. */
  withMeet: boolean;
  /** Shown as the event's location, for example the number to ring. */
  location?: string;
}

export interface CreatedEvent {
  id: string;
  meetLink: string | null;
}

type Fetcher = typeof fetch;

/**
 * Workers binds `fetch` to the global object. Handing the bare function around
 * and calling it as a method detaches that binding and the runtime throws
 * "Illegal invocation", which a stubbed test never sees. Wrapping keeps the
 * call site global.
 */
const globalFetch: Fetcher = (input, init) => fetch(input, init);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * One connected Google account. Holds its own access token, so a caller can
 * fan out across accounts without them treading on each other.
 */
export class CalendarClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  /** In-flight refresh, shared so parallel callers trigger exactly one. */
  private refreshing: Promise<string> | null = null;

  readonly email: string;
  /**
   * Calendars this account contributes busy time from. More than "primary"
   * when another diary has been shared into the account at free/busy level,
   * which is how a calendar the app was never granted access to still blocks
   * slots.
   */
  readonly calendarIds: string[];
  private readonly refreshToken: string;
  private readonly credentials: GoogleCredentials;
  private readonly fetchImpl: Fetcher;
  private readonly now: () => number;

  constructor(
    email: string,
    refreshToken: string,
    credentials: GoogleCredentials,
    fetchImpl: Fetcher = globalFetch,
    now: () => number = Date.now,
    calendarIds: string[] = ['primary'],
  ) {
    this.email = email;
    this.refreshToken = refreshToken;
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.calendarIds = calendarIds.length > 0 ? calendarIds : ['primary'];
  }

  /** A valid access token, refreshing only when the current one is nearly out. */
  async token(): Promise<string> {
    if (this.accessToken && this.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.accessToken;
    }
    // Caching the promise, not just the result, is what makes this single
    // flight: three parallel availability queries share one refresh instead of
    // racing three and having Google invalidate two of them.
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    let response: Response;
    try {
      response = await this.fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (cause) {
      throw new CalendarUnavailableError(this.email, `token endpoint unreachable: ${String(cause)}`);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const error = isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'unknown_error';
      // invalid_grant is the revoked, expired or admin-withdrawn case. Anything
      // else may recover on its own, so it must not clear the stored grant.
      if (error === 'invalid_grant') throw new CalendarAuthError(this.email, error);
      throw new CalendarUnavailableError(this.email, `token refresh failed (${response.status}): ${error}`);
    }

    if (!isRecord(payload) || typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number') {
      throw new CalendarUnavailableError(this.email, 'token response did not contain a usable access token');
    }

    this.accessToken = payload.access_token;
    this.expiresAt = this.now() + payload.expires_in * 1000;
    return this.accessToken;
  }

  private async call(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<unknown> {
    const token = await this.token();
    const url = new URL(`${CALENDAR_API}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new CalendarUnavailableError(this.email, `calendar API unreachable: ${String(cause)}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new CalendarAuthError(this.email, `calendar API refused the token (${response.status})`);
    }
    if (response.status === 204) return null;
    if (!response.ok) {
      throw new CalendarUnavailableError(this.email, `calendar API returned ${response.status}`);
    }
    return response.json().catch(() => {
      throw new CalendarUnavailableError(this.email, 'calendar API returned a body that is not JSON');
    });
  }

  /**
   * Busy periods across every calendar this account can see.
   *
   * Google reports per-calendar problems inside a 200 response, so a missing
   * `calendars` entry or any `errors` array is treated as failure. Skipping a
   * calendar we were asked to check would offer a slot on top of a meeting.
   */
  async freeBusy(timeMin: string, timeMax: string, ids?: string[]): Promise<Interval[]> {
    const calendarIds = ids ?? this.calendarIds;
    const payload = await this.call('/freeBusy', {
      method: 'POST',
      body: JSON.stringify({ timeMin, timeMax, items: calendarIds.map((id) => ({ id })) }),
    });

    if (!isRecord(payload) || !isRecord(payload.calendars)) {
      throw new CalendarUnavailableError(this.email, 'freebusy response had no calendars');
    }

    const periods: Interval[] = [];
    for (const id of calendarIds) {
      const calendar = payload.calendars[id];
      if (!isRecord(calendar)) {
        throw new CalendarUnavailableError(this.email, `freebusy omitted calendar ${id}`);
      }
      if (Array.isArray(calendar.errors) && calendar.errors.length > 0) {
        const reason =
          isRecord(calendar.errors[0]) && typeof calendar.errors[0].reason === 'string'
            ? calendar.errors[0].reason
            : 'unknown';
        // notFound or forbidden here usually means a share was withdrawn.
        throw new CalendarUnavailableError(this.email, `calendar ${id} reported ${reason}`);
      }
      const busy = calendar.busy;
      if (!Array.isArray(busy)) {
        throw new CalendarUnavailableError(this.email, `calendar ${id} returned no busy list`);
      }
      for (const period of busy) {
        if (!isRecord(period) || typeof period.start !== 'string' || typeof period.end !== 'string') {
          throw new CalendarUnavailableError(this.email, `calendar ${id} returned a malformed busy period`);
        }
        const start = Date.parse(period.start);
        const end = Date.parse(period.end);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          throw new CalendarUnavailableError(this.email, `calendar ${id} returned an unparseable busy period`);
        }
        periods.push({ start, end });
      }
    }
    return mergeIntervals(periods);
  }

  /** Create the booking. Google emails the invite because of sendUpdates=all. */
  async insertEvent(draft: EventDraft, calendarId = 'primary'): Promise<CreatedEvent> {
    const body: Record<string, unknown> = {
      summary: draft.summary,
      description: draft.description,
      location: draft.location,
      start: { dateTime: draft.startUTC, timeZone: draft.timezone },
      end: { dateTime: draft.endUTC, timeZone: draft.timezone },
      attendees: draft.attendees.map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName,
      })),
    };

    const query: Record<string, string> = { sendUpdates: 'all' };
    if (draft.withMeet) {
      query.conferenceDataVersion = '1';
      body.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const payload = await this.call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
      query,
    });

    if (!isRecord(payload) || typeof payload.id !== 'string') {
      throw new CalendarUnavailableError(this.email, 'event was created without an id');
    }
    if (draft.withMeet && typeof payload.hangoutLink !== 'string') {
      // Without a link the booker has no way to join, so this is a failure and
      // the caller rolls the booking back rather than sending a broken invite.
      throw new CalendarUnavailableError(this.email, 'event was created without a Meet link');
    }

    return {
      id: payload.id,
      meetLink: typeof payload.hangoutLink === 'string' ? payload.hangoutLink : null,
    };
  }

  /** Move an existing booking. Google emails the change. */
  async patchEvent(eventId: string, startUTC: string, endUTC: string, timezone: string, calendarId = 'primary'): Promise<void> {
    await this.call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        start: { dateTime: startUTC, timeZone: timezone },
        end: { dateTime: endUTC, timeZone: timezone },
      }),
      query: { sendUpdates: 'all' },
    });
  }

  /**
   * The event as Google has it now, or null when it no longer exists. A
   * deleted event answers 200 with status "cancelled" for a while and 404 or
   * 410 after that; both mean the same thing to a booking.
   */
  async getEvent(eventId: string, calendarId = 'primary'): Promise<{ status: string; startUTC: string | null; endUTC: string | null } | null> {
    let raw: unknown;
    try {
      raw = await this.call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
    } catch (cause) {
      if (cause instanceof CalendarUnavailableError && /returned (404|410)/.test(cause.detail)) return null;
      throw cause;
    }
    if (!isRecord(raw)) return null;
    const instant = (value: unknown) => {
      if (!isRecord(value) || typeof value.dateTime !== 'string') return null;
      const ms = Date.parse(value.dateTime);
      return Number.isNaN(ms) ? null : new Date(ms).toISOString();
    };
    return { status: typeof raw.status === 'string' ? raw.status : 'confirmed', startUTC: instant(raw.start), endUTC: instant(raw.end) };
  }

  /**
   * Ask Google to POST to `address` whenever anything on the calendar changes.
   * The channel expires; the caller renews it. Google echoes `token` back in
   * X-Goog-Channel-Token, which is how the receiver knows the call is real.
   */
  async watchEvents(calendarId: string, address: string, token: string, ttlMs: number): Promise<{ channelId: string; resourceId: string; expiresAt: string }> {
    const channelId = crypto.randomUUID();
    const raw = await this.call(`/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      method: 'POST',
      body: JSON.stringify({ id: channelId, type: 'web_hook', address, token, expiration: String(this.now() + ttlMs) }),
    });
    if (!isRecord(raw) || typeof raw.resourceId !== 'string') {
      throw new CalendarUnavailableError(this.email, 'watch answered without a resourceId');
    }
    const expiration = typeof raw.expiration === 'string' ? Number(raw.expiration) : this.now() + ttlMs;
    return { channelId, resourceId: raw.resourceId, expiresAt: new Date(expiration).toISOString() };
  }

  /** Stop a channel. One that already expired answers 404, which is fine. */
  async stopChannel(channelId: string, resourceId: string): Promise<void> {
    try {
      await this.call('/channels/stop', { method: 'POST', body: JSON.stringify({ id: channelId, resourceId }) });
    } catch (cause) {
      if (cause instanceof CalendarUnavailableError && /returned (404|410)/.test(cause.detail)) return;
      throw cause;
    }
  }

  /** Cancel. A 404 or 410 means it is already gone, which is the goal anyway. */
  async deleteEvent(eventId: string, calendarId = 'primary'): Promise<void> {
    try {
      await this.call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        query: { sendUpdates: 'all' },
      });
    } catch (cause) {
      if (cause instanceof CalendarUnavailableError && /returned (404|410)/.test(cause.detail)) return;
      throw cause;
    }
  }
}

/**
 * Busy periods from every account asked, merged into one list.
 *
 * Any single account failing fails the whole query. Partial availability is the
 * dangerous answer: it is indistinguishable from a genuinely free diary.
 */
export async function mergedBusy(
  clients: readonly CalendarClient[],
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  if (clients.length === 0) {
    throw new CalendarUnavailableError('none', 'no calendars are connected');
  }
  const results = await Promise.all(clients.map((client) => client.freeBusy(timeMin, timeMax)));
  return mergeIntervals(results.flat());
}
