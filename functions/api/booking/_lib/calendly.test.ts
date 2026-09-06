import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CalendlyClient, CalendlyError } from './calendly.ts';

function stub(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('CalendlyClient.availableTimes', () => {
  it('splits a long range into 31-day calls and keeps only available starts, sorted', async () => {
    const { fetchImpl, calls } = stub((url) => {
      const start = new URL(url).searchParams.get('start_time')!;
      return { status: 200, body: { collection: [
        { status: 'available', start_time: new Date(Date.parse(start) + 3_600_000).toISOString() },
        { status: 'unavailable', start_time: new Date(Date.parse(start) + 7_200_000).toISOString() },
      ] } };
    });
    const client = new CalendlyClient('t', fetchImpl);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-10-05T00:00:00Z');
    const starts = await client.availableTimes('https://api.calendly.com/event_types/x', from, to);
    assert.equal(calls.length, 2, 'two windows for 34 days');
    assert.equal(new URL(calls[0]!.url).searchParams.get('event_type'), 'https://api.calendly.com/event_types/x');
    assert.equal(new URL(calls[1]!.url).searchParams.get('end_time'), to.toISOString());
    assert.deepEqual(starts, ['2026-09-01T01:00:00.000Z', '2026-10-02T01:00:00.000Z']);
    assert.match(String(calls[0]!.init.headers && (calls[0]!.init.headers as Record<string, string>).authorization), /^Bearer t$/);
  });

  it('surfaces Calendly refusals with their status and message', async () => {
    const { fetchImpl } = stub(() => ({ status: 403, body: { message: 'paid plans only' } }));
    await assert.rejects(
      () => new CalendlyClient('t', fetchImpl).availableTimes('e', new Date('2026-09-01T00:00:00Z'), new Date('2026-09-02T00:00:00Z')),
      (error: unknown) => error instanceof CalendlyError && error.status === 403 && error.message === 'paid plans only',
    );
  });
});

describe('CalendlyClient.firstQuestion', () => {
  it('returns the first enabled text question by Calendly\'s own name', async () => {
    const { fetchImpl, calls } = stub(() => ({ status: 200, body: { resource: { custom_questions: [
      { name: 'Phone', type: 'phone_number', enabled: true, position: 0 },
      { name: 'Old one', type: 'text', enabled: false, position: 1 },
      { name: 'What would you like to cover? ', type: 'text', enabled: true, position: 2 },
    ] } } }));
    assert.equal(await new CalendlyClient('t', fetchImpl).firstQuestion('https://api.calendly.com/event_types/abc'), 'What would you like to cover? ');
    assert.equal(calls[0]!.url, 'https://api.calendly.com/event_types/abc');
  });
  it('is null when the type asks nothing', async () => {
    const { fetchImpl } = stub(() => ({ status: 200, body: { resource: { custom_questions: [] } } }));
    assert.equal(await new CalendlyClient('t', fetchImpl).firstQuestion('https://api.calendly.com/event_types/abc'), null);
  });
});

describe('CalendlyClient.createInvitee', () => {
  it('posts the invitee, guests and the answer, and returns the links', async () => {
    const { fetchImpl, calls } = stub(() => ({ status: 201, body: { resource: {
      uri: 'https://api.calendly.com/scheduled_events/E/invitees/I', event: 'https://api.calendly.com/scheduled_events/E',
      cancel_url: 'https://calendly.com/cancellations/I', reschedule_url: 'https://calendly.com/reschedulings/I',
    } } }));
    const result = await new CalendlyClient('t', fetchImpl).createInvitee({
      eventTypeUri: 'ET', startUTC: '2026-09-10T09:00:00.000Z', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      timezone: 'Europe/London', guests: ['bo@example.org'], answer: { question: 'What would you like to cover?', answer: 'Roadmap' }, locationKind: 'google_conference',
    });
    assert.equal(calls[0]!.url, 'https://api.calendly.com/invitees');
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.deepEqual(body.invitee, { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', timezone: 'Europe/London' });
    assert.deepEqual(body.event_guests, ['bo@example.org']);
    assert.deepEqual(body.location, { kind: 'google_conference' });
    assert.equal(body.questions_and_answers[0].answer, 'Roadmap');
    assert.equal(body.start_time, '2026-09-10T09:00:00.000Z');
    assert.deepEqual(result, {
      inviteeUri: 'https://api.calendly.com/scheduled_events/E/invitees/I', eventUri: 'https://api.calendly.com/scheduled_events/E',
      cancelUrl: 'https://calendly.com/cancellations/I', rescheduleUrl: 'https://calendly.com/reschedulings/I',
    });
  });

  it('leaves guests and answers out when there are none', async () => {
    const { fetchImpl, calls } = stub(() => ({ status: 201, body: { resource: { uri: 'u' } } }));
    await new CalendlyClient('t', fetchImpl).createInvitee({ eventTypeUri: 'ET', startUTC: 's', firstName: 'J', lastName: 'D', email: 'j@d.com', timezone: 'UTC', guests: [], answer: null });
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal('event_guests' in body, false);
    assert.equal('questions_and_answers' in body, false);
    assert.equal('location' in body, false);
  });
});
