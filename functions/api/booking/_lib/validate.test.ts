import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { knownTimezone, nameProblem, validateBooking, verifyTurnstile } from './validate.ts';

const LOCATIONS = ['video', 'phone'];

const good = {
  type: 'recruiter-call',
  startUTC: '2026-09-07T17:00:00.000Z',
  location: 'video',
  firstName: '  Jane ',
  lastName: 'Doe',
  email: 'jane@example.com',
  timezone: 'Europe/Madrid',
  notes: 'Module Federation questions',
  turnstileToken: 'token',
};

describe('booking form', () => {
  it('accepts a complete submission and trims it', () => {
    const { value, fields } = validateBooking(good, LOCATIONS);
    assert.deepEqual(fields, {});
    assert.equal(value?.firstName, 'Jane');
    assert.equal(value?.timezone, 'Europe/Madrid');
    assert.equal(value?.phone, null);
  });

  it('names every missing field at once, not one at a time', () => {
    const { value, fields } = validateBooking({}, LOCATIONS);
    assert.equal(value, null);
    assert.deepEqual(Object.keys(fields).sort(), [
      'email',
      'firstName',
      'lastName',
      'location',
      'startUTC',
      'turnstileToken',
      'type',
    ]);
  });

  it('requires a number for a phone call and not for a video call', () => {
    assert.equal(validateBooking({ ...good, location: 'phone' }, LOCATIONS).fields.phone, 'required');
    assert.equal(
      validateBooking({ ...good, location: 'phone', phone: '+44 7700 900123' }, LOCATIONS).value?.phone,
      '+44 7700 900123',
    );
    assert.equal(validateBooking({ ...good, location: 'phone', phone: 'call me' }, LOCATIONS).fields.phone, 'invalid');
  });

  it('refuses a location the event type does not offer', () => {
    assert.equal(validateBooking({ ...good, location: 'phone' }, ['video']).fields.location, 'unavailable');
  });

  it('rejects an address an invite could never reach', () => {
    assert.equal(validateBooking({ ...good, email: 'jane@example' }, LOCATIONS).fields.email, 'invalid');
    assert.equal(validateBooking({ ...good, email: 'jane at example.com' }, LOCATIONS).fields.email, 'invalid');
    assert.deepEqual(validateBooking({ ...good, email: "o'brien+tag@sub.example.co.uk" }, LOCATIONS).fields, {});
  });

  it('falls back to UTC for a timezone the runtime does not know', () => {
    assert.equal(validateBooking({ ...good, timezone: 'Mars/Olympus' }, LOCATIONS).value?.timezone, 'UTC');
    assert.equal(validateBooking({ ...good, timezone: '' }, LOCATIONS).value?.timezone, 'UTC');
    assert.equal(knownTimezone('Europe/London'), true);
    assert.equal(knownTimezone('Nowhere/Nothing'), false);
  });

  it('accepts real names in any script and rejects junk in the name box', () => {
    for (const ok of ["O'Brien", 'María-José', '李', 'Jean-Luc', 'Ng']) assert.equal(nameProblem(ok), null, ok);
    assert.equal(nameProblem(''), 'required');
    assert.equal(nameProblem('12345'), 'invalid');
    assert.equal(nameProblem('---'), 'invalid');
    assert.equal(nameProblem('https://example.com'), 'invalid');
    assert.equal(nameProblem('jane@example.com'), 'invalid');
    assert.equal(validateBooking({ ...good, firstName: '!!!' }, LOCATIONS).fields.firstName, 'invalid');
  });

  it('keeps valid guests, drops duplicates and the booker, and flags a bad one', () => {
    const ok = validateBooking(
      { ...good, guests: ['ana@example.com', 'Ana@Example.com', 'jane@example.com', ' bo@example.org '] },
      LOCATIONS,
    );
    assert.deepEqual(ok.value?.guests, ['ana@example.com', 'bo@example.org']);
    assert.equal(validateBooking({ ...good, guests: ['not an address'] }, LOCATIONS).fields.guests, 'invalid');
    const many = validateBooking({ ...good, guests: ['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io', 'e@x.io', 'f@x.io'] }, LOCATIONS);
    assert.equal(many.fields.guests, 'too_many');
    assert.deepEqual(validateBooking(good, LOCATIONS).value?.guests, []);
  });

  it('keeps a known locale and falls back to English for anything else', () => {
    assert.equal(validateBooking({ ...good, locale: 'ca' }, LOCATIONS).value?.locale, 'ca');
    assert.equal(validateBooking({ ...good, locale: 'fr' }, LOCATIONS).value?.locale, 'en');
    assert.equal(validateBooking(good, LOCATIONS).value?.locale, 'en');
  });

  it('truncates rather than rejecting an over-long note', () => {
    const { value } = validateBooking({ ...good, notes: 'x'.repeat(5000) }, LOCATIONS);
    assert.equal(value?.notes?.length, 2000);
  });

  it('rejects an unparseable start', () => {
    assert.equal(validateBooking({ ...good, startUTC: 'next Tuesday' }, LOCATIONS).fields.startUTC, 'invalid');
  });

  it('keeps attribution but caps each value', () => {
    const { value } = validateBooking(
      { ...good, utm: { source: 'linkedin', medium: 'social', content: 'y'.repeat(300), other: 'ignored' } },
      LOCATIONS,
    );
    assert.equal(value?.utm.source, 'linkedin');
    assert.equal(value?.utm.content?.length, 100);
    assert.equal((value?.utm as Record<string, string>).other, undefined);
  });

  it('flags a filled honeypot without reporting any field error', () => {
    const result = validateBooking({ ...good, nickname: 'spam' }, LOCATIONS);
    assert.equal(result.trapped, true);
    assert.equal(result.value, null);
    assert.deepEqual(result.fields, {});
  });

  it('survives a body that is not an object', () => {
    assert.equal(validateBooking('nonsense', LOCATIONS).value, null);
    assert.equal(validateBooking(null, LOCATIONS).value, null);
  });
});

describe('turnstile', () => {
  const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });

  it('passes a solved challenge', async () => {
    assert.equal(await verifyTurnstile('t', 's', '1.2.3.4', (async () => ok()) as typeof fetch), true);
  });

  it('sends the secret, the response and the visitor address', async () => {
    let sent: FormData | undefined;
    const spy = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      sent = init.body as FormData;
      return ok();
    }) as typeof fetch;
    await verifyTurnstile('the-token', 'the-secret', '1.2.3.4', spy);
    assert.equal(sent?.get('secret'), 'the-secret');
    assert.equal(sent?.get('response'), 'the-token');
    assert.equal(sent?.get('remoteip'), '1.2.3.4');
  });

  it('fails an unsolved challenge', async () => {
    const no = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    assert.equal(await verifyTurnstile('t', 's', null, no), false);
  });

  it('fails closed when Turnstile is unreachable', async () => {
    const boom = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    assert.equal(await verifyTurnstile('t', 's', null, boom), false);
  });

  it('fails closed on a non-200', async () => {
    const bad = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    assert.equal(await verifyTurnstile('t', 's', null, bad), false);
  });
});
