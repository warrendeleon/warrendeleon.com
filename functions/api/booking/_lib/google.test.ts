import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CalendarAuthError,
  CalendarClient,
  CalendarUnavailableError,
  mergedBusy,
} from './google.ts';

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' };

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stand-in that replays queued responses and records what it was sent. */
function stubFetch(queue: (() => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request to ${String(input)}`);
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const tokenGrant = (expiresIn = 3600) => okJson({ access_token: 'access-1', expires_in: expiresIn });

function client(queue: (() => Response | Promise<Response>)[], now: () => number = () => 0) {
  const { impl, calls } = stubFetch(queue);
  return {
    calendar: new CalendarClient('hi@warrendeleon.com', 'refresh-1', CREDENTIALS, impl, now),
    calls,
  };
}

describe('access tokens', () => {
  it('exchanges the refresh token and reuses the result', async () => {
    const { calendar, calls } = client([tokenGrant]);
    assert.equal(await calendar.token(), 'access-1');
    assert.equal(await calendar.token(), 'access-1');
    assert.equal(calls.length, 1, 'the second call must come from cache');
    assert.equal(calls[0]!.url, 'https://oauth2.googleapis.com/token');
    assert.match(String(calls[0]!.init.body), /grant_type=refresh_token/);
  });

  it('refreshes again once the token is nearly out', async () => {
    let clock = 0;
    const { calendar, calls } = client([tokenGrant, () => okJson({ access_token: 'access-2', expires_in: 3600 })], () => clock);
    assert.equal(await calendar.token(), 'access-1');
    clock = 3_400_000; // inside the five-minute margin
    assert.equal(await calendar.token(), 'access-2');
    assert.equal(calls.length, 2);
  });

  it('shares one refresh between parallel callers', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { calendar, calls } = client([
      async () => {
        await gate;
        return tokenGrant();
      },
    ]);
    const all = Promise.all([calendar.token(), calendar.token(), calendar.token()]);
    release!();
    assert.deepEqual(await all, ['access-1', 'access-1', 'access-1']);
    assert.equal(calls.length, 1, 'three parallel callers must not trigger three refreshes');
  });

  it('reports a revoked grant as needing reconnection', async () => {
    const { calendar } = client([() => okJson({ error: 'invalid_grant' }, 400)]);
    await assert.rejects(() => calendar.token(), CalendarAuthError);
  });

  it('treats other refresh failures as transient, not as a lost grant', async () => {
    const { calendar } = client([() => okJson({ error: 'backend_error' }, 500)]);
    await assert.rejects(() => calendar.token(), CalendarUnavailableError);
  });

  it('rejects a grant with no usable token', async () => {
    const { calendar } = client([() => okJson({ token_type: 'Bearer' })]);
    await assert.rejects(() => calendar.token(), CalendarUnavailableError);
  });

  it('retries cleanly after a transient failure', async () => {
    const { calendar } = client([() => okJson({ error: 'backend_error' }, 500), tokenGrant]);
    await assert.rejects(() => calendar.token());
    assert.equal(await calendar.token(), 'access-1', 'the failed promise must not be cached');
  });
});

describe('free/busy', () => {
  it('merges busy periods and returns epoch intervals', async () => {
    const { calendar } = client([
      tokenGrant,
      () =>
        okJson({
          calendars: {
            primary: {
              busy: [
                { start: '2026-08-04T09:00:00Z', end: '2026-08-04T10:00:00Z' },
                { start: '2026-08-04T09:45:00Z', end: '2026-08-04T11:00:00Z' },
              ],
            },
          },
        }),
    ]);
    assert.deepEqual(await calendar.freeBusy('2026-08-04T00:00:00Z', '2026-08-05T00:00:00Z'), [
      { start: Date.parse('2026-08-04T09:00:00Z'), end: Date.parse('2026-08-04T11:00:00Z') },
    ]);
  });

  it('fails closed when a calendar reports an error inside a 200', async () => {
    const { calendar } = client([
      tokenGrant,
      () => okJson({ calendars: { primary: { errors: [{ reason: 'notFound' }], busy: [] } } }),
    ]);
    await assert.rejects(() => calendar.freeBusy('a', 'b'), /reported notFound/);
  });

  it('fails closed when a requested calendar is missing from the answer', async () => {
    const { calendar } = client([tokenGrant, () => okJson({ calendars: {} })]);
    await assert.rejects(() => calendar.freeBusy('a', 'b', ['primary']), /omitted calendar primary/);
  });

  it('fails closed on an unparseable busy period', async () => {
    const { calendar } = client([
      tokenGrant,
      () => okJson({ calendars: { primary: { busy: [{ start: 'not-a-date', end: 'nor-this' }] } } }),
    ]);
    await assert.rejects(() => calendar.freeBusy('a', 'b'), /unparseable/);
  });

  it('treats a rejected token as needing reconnection', async () => {
    const { calendar } = client([tokenGrant, () => okJson({ error: 'unauthorised' }, 401)]);
    await assert.rejects(() => calendar.freeBusy('a', 'b'), CalendarAuthError);
  });
});

describe('busy across accounts', () => {
  const account = (busy: { start: string; end: string }[]) => {
    const { impl } = stubFetch([tokenGrant, () => okJson({ calendars: { primary: { busy } } })]);
    return new CalendarClient('a@example.com', 'refresh', CREDENTIALS, impl, () => 0);
  };

  it('combines every account into one list', async () => {
    const busy = await mergedBusy(
      [
        account([{ start: '2026-08-04T09:00:00Z', end: '2026-08-04T10:00:00Z' }]),
        account([{ start: '2026-08-04T14:00:00Z', end: '2026-08-04T15:00:00Z' }]),
      ],
      'a',
      'b',
    );
    assert.equal(busy.length, 2);
  });

  it('fails the whole query when one account fails', async () => {
    const { impl } = stubFetch([tokenGrant, () => okJson({ calendars: { primary: { errors: [{ reason: 'forbidden' }] } } })]);
    const broken = new CalendarClient('b@example.com', 'refresh', CREDENTIALS, impl, () => 0);
    await assert.rejects(
      () => mergedBusy([account([]), broken], 'a', 'b'),
      /reported forbidden/,
      'partial availability is indistinguishable from a free diary',
    );
  });

  it('refuses to answer with nothing connected', async () => {
    await assert.rejects(() => mergedBusy([], 'a', 'b'), /no calendars are connected/);
  });
});

describe('events', () => {
  it('asks Google to email the invite and to mint a Meet link', async () => {
    const { calendar, calls } = client([
      tokenGrant,
      () => okJson({ id: 'event-1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
    ]);
    const created = await calendar.insertEvent({
      summary: 'Call with Jane Doe',
      startUTC: '2026-08-04T09:00:00Z',
      endUTC: '2026-08-04T09:30:00Z',
      timezone: 'Europe/London',
      attendees: [{ email: 'jane@example.com', displayName: 'Jane Doe' }],
      withMeet: true,
    });
    assert.deepEqual(created, { id: 'event-1', meetLink: 'https://meet.google.com/abc-defg-hij' });
    const url = new URL(calls[1]!.url);
    assert.equal(url.searchParams.get('sendUpdates'), 'all');
    assert.equal(url.searchParams.get('conferenceDataVersion'), '1');
    const body = JSON.parse(String(calls[1]!.init.body));
    assert.equal(body.attendees[0].email, 'jane@example.com');
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  });

  it('puts the number to ring on a phone call as the location, with no conference', async () => {
    const { calendar, calls } = client([tokenGrant, () => okJson({ id: 'event-2' })]);
    const created = await calendar.insertEvent({
      summary: 'Call with Jane Doe',
      startUTC: '2026-08-04T09:00:00Z',
      endUTC: '2026-08-04T09:30:00Z',
      timezone: 'Europe/London',
      attendees: [{ email: 'jane@example.com' }],
      withMeet: false,
      location: '+44 20 7946 0000',
    });
    assert.equal(created.meetLink, null);
    assert.equal(new URL(calls[1]!.url).searchParams.get('conferenceDataVersion'), null);
    assert.equal(JSON.parse(String(calls[1]!.init.body)).location, '+44 20 7946 0000');
  });

  it('fails when a video booking comes back without a Meet link', async () => {
    const { calendar } = client([tokenGrant, () => okJson({ id: 'event-3' })]);
    await assert.rejects(
      () =>
        calendar.insertEvent({
          summary: 'Call',
          startUTC: '2026-08-04T09:00:00Z',
          endUTC: '2026-08-04T09:30:00Z',
          timezone: 'Europe/London',
          attendees: [],
          withMeet: true,
        }),
      /without a Meet link/,
    );
  });

  it('writes to the calendar it is told to, escaping the id', async () => {
    const { calendar, calls } = client([tokenGrant, () => okJson({ id: 'event-9' })]);
    await calendar.insertEvent(
      { summary: 'x', startUTC: '2026-08-04T09:00:00Z', endUTC: '2026-08-04T09:30:00Z', timezone: 'Europe/London', attendees: [], withMeet: false },
      'abc_def@group.calendar.google.com',
    );
    assert.ok(calls[1]!.url.includes('/calendars/abc_def%40group.calendar.google.com/events'));
  });

  it('emails the change when a booking moves', async () => {
    const { calendar, calls } = client([tokenGrant, () => new Response(null, { status: 204 })]);
    await calendar.patchEvent('event-1', '2026-08-05T09:00:00Z', '2026-08-05T09:30:00Z', 'Europe/London');
    assert.equal(calls[1]!.init.method, 'PATCH');
    assert.equal(new URL(calls[1]!.url).searchParams.get('sendUpdates'), 'all');
  });

  it('treats an already-deleted event as cancelled', async () => {
    const { calendar } = client([tokenGrant, () => new Response('gone', { status: 410 })]);
    await calendar.deleteEvent('event-1');
  });

  it('still reports a real failure on cancel', async () => {
    const { calendar } = client([tokenGrant, () => new Response('boom', { status: 500 })]);
    await assert.rejects(() => calendar.deleteEvent('event-1'), CalendarUnavailableError);
  });

  it('escapes an event id into the path', async () => {
    const { calendar, calls } = client([tokenGrant, () => new Response(null, { status: 204 })]);
    await calendar.deleteEvent('weird/id?x=1');
    assert.ok(calls[1]!.url.includes('weird%2Fid%3Fx%3D1'));
  });
});

describe('shared calendars', () => {
  it('queries every calendar the account contributes, not just its own', async () => {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push(String(init.body ?? ''));
      if (String(input).includes('oauth2')) return tokenGrant();
      return okJson({
        calendars: {
          primary: { busy: [{ start: '2026-09-07T09:00:00Z', end: '2026-09-07T10:00:00Z' }] },
          'warren.deleonofalla@news.co.uk': {
            busy: [{ start: '2026-09-07T14:00:00Z', end: '2026-09-07T15:00:00Z' }],
          },
        },
      });
    }) as unknown as typeof fetch;

    const calendar = new CalendarClient('hi@warrendeleon.com', 'refresh', CREDENTIALS, impl, () => 0, [
      'primary',
      'warren.deleonofalla@news.co.uk',
    ]);
    const busy = await calendar.freeBusy('2026-09-07T00:00:00Z', '2026-09-08T00:00:00Z');

    assert.equal(busy.length, 2, 'both diaries must block time');
    assert.match(calls[1]!, /warren\.deleonofalla@news\.co\.uk/, 'the shared calendar is asked for by name');
  });

  it('fails closed when a shared calendar stops being readable', async () => {
    const impl = (async (input: RequestInfo | URL) => {
      if (String(input).includes('oauth2')) return tokenGrant();
      return okJson({
        calendars: {
          primary: { busy: [] },
          'warren.deleonofalla@news.co.uk': { errors: [{ reason: 'notFound' }] },
        },
      });
    }) as unknown as typeof fetch;

    const calendar = new CalendarClient('hi@warrendeleon.com', 'refresh', CREDENTIALS, impl, () => 0, [
      'primary',
      'warren.deleonofalla@news.co.uk',
    ]);
    await assert.rejects(
      () => calendar.freeBusy('a', 'b'),
      /reported notFound/,
      'a withdrawn share must stop bookings, not silently open the diary',
    );
  });

  it('falls back to the primary calendar when given an empty list', async () => {
    const { calendar } = client([tokenGrant, () => okJson({ calendars: { primary: { busy: [] } } })]);
    assert.deepEqual(calendar.calendarIds, ['primary']);
  });
});
