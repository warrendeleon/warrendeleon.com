// The manage page: the link from the invite opens the booking, a move walks
// the same calendar and ends in a confirmation, a cancel asks first, and the
// token never stays in the URL. The booking routes are mocked so no calendar
// event is touched; availability comes from the live preview.
//
// Run against `wrangler pages dev dist` on BOOKING_URL (default localhost:8788).

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BOOKING_URL ?? 'http://localhost:8788';
const ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'a'.repeat(32);

/** A confirmed booking at 10:00 London on the first available weekday. */
function bookingAt(startUTC, status = 'confirmed') {
  const endUTC = new Date(Date.parse(startUTC) + 30 * 60_000).toISOString();
  return {
    id: ID, status, startUTC, endUTC, location: 'video',
    meetLink: status === 'confirmed' ? 'https://meet.google.com/abc-defg-hij' : null, hostPhone: null,
    firstName: 'Jane', email: 'jane@example.com', guests: ['bo@example.org'], timezone: 'Europe/London',
    type: { slug: 'intro-30', name: 'Intro call', durationMinutes: 30, locations: ['video', 'phone'] },
  };
}

/** Mock the three booking routes; record what the page sent. */
async function mockManage(page, booking, options = {}) {
  const seen = { gets: [], patches: [], deletes: [] };
  await page.route(`**/api/booking/bookings/${ID}**`, async (route) => {
    const request = route.request();
    const token = request.headers()['x-manage-token'];
    if (token !== TOKEN) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found', message: 'No booking matches this link.' }) });
    }
    const method = request.method();
    if (method === 'GET') {
      seen.gets.push(request.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ booking }) });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(request.postData() ?? '{}');
      seen.patches.push(body);
      if (options.patchFails) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'slot_taken', message: 'taken' }) });
      const moved = { ...booking, startUTC: body.startUTC, endUTC: new Date(Date.parse(body.startUTC) + 30 * 60_000).toISOString(), timezone: body.timezone };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ booking: moved, calendar: { eventUpdated: true, updatesSentTo: ['jane@example.com', 'bo@example.org'] } }) });
    }
    if (method === 'DELETE') {
      seen.deletes.push(request.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ booking: { ...booking, status: 'cancelled', meetLink: null }, calendar: { eventRemoved: true, alreadyCancelled: false, updatesSentTo: ['jane@example.com', 'bo@example.org'] } }) });
    }
    return route.continue();
  });
  return seen;
}

const visibleStep = (page) => page.evaluate(() => document.querySelector('.bk-panel:not([hidden])')?.dataset.step ?? '');
const panelText = (page, step) => page.locator(`.bk-panel[data-step="${step}"]`).innerText();

describe('managing a booking', () => {
  let browser;
  let context;
  let page;
  /** The first bookable day's first slot, read from the live availability. */
  let firstSlot;

  before(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({ timezoneId: 'Europe/London', viewport: { width: 1280, height: 900 } });
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const response = await fetch(`${BASE}/api/booking/availability?type=intro-30&month=${month}`);
    const { days } = await response.json();
    const firstDay = Object.keys(days).sort()[0];
    assert.ok(firstDay, 'the preview has at least one bookable day this month');
    firstSlot = days[firstDay][0].startUTC;
  });

  after(async () => { await browser?.close(); });
  beforeEach(async () => { page = await context.newPage(); });
  afterEach(async () => { await page.close(); });

  it('opens the booking from the invite link and moves the token out of the URL', async () => {
    const seen = await mockManage(page, bookingAt(firstSlot));
    await page.goto(`${BASE}/booking/manage/?utm_source=calendar&utm_medium=email#id=${ID}&token=${TOKEN}`);
    await page.locator('.bk-manage .bk-done-actions button').first().waitFor();

    assert.equal(new URL(page.url()).hash, '', 'the fragment is gone');
    assert.equal(new URL(page.url()).search, '?utm_source=calendar&utm_medium=email', 'the tags stay for analytics');
    assert.equal(seen.gets.length, 1);
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('bk.manage'))), { id: ID, token: TOKEN });
    const text = await panelText(page, 'manage');
    assert.match(text, /Intro call, 30 min/);
    assert.match(text, /Pick a new time/);
    assert.match(text, /Cancel this call/);
    assert.match(text, /Join with Google Meet/);

    // A reload keeps working from session storage, without the fragment.
    await page.reload();
    await page.locator('.bk-manage .bk-done-actions button').first().waitFor();
    assert.equal(seen.gets.length, 2);
  });

  it('moves the call through the calendar, a confirmation and a PATCH', async () => {
    const seen = await mockManage(page, bookingAt(firstSlot));
    await page.goto(`${BASE}/booking/manage/?utm_medium=email#id=${ID}&token=${TOKEN}&action=reschedule`);
    await page.locator('.bk-day-btn:not([disabled])').first().waitFor();
    assert.equal(await visibleStep(page), 'date', 'the reschedule link lands on the calendar');
    assert.equal(new URL(page.url()).hash, '#step=date', 'the hash names the step, never the token');

    await page.locator('.bk-day-btn:not([disabled])').first().click();
    await page.locator('.bk-slot').first().waitFor();
    // A slot other than the current one, so the move is a real change.
    const other = page.locator(`.bk-slot:not([data-start="${firstSlot}"])`).first();
    const target = await other.getAttribute('data-start');
    await other.click();
    await page.locator('.bk-confirm .bk-done-actions button').first().waitFor();
    assert.equal(await visibleStep(page), 'confirm');
    const confirm = await panelText(page, 'confirm');
    assert.match(confirm, /Move the call\?/);
    assert.match(confirm, /jane@example.com and 1 guest/);

    // Back returns to the times; Forward to the confirmation.
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.bk-panel:not([hidden])')?.dataset.step === 'time');
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.bk-panel:not([hidden])')?.dataset.step === 'confirm');

    await page.locator('.bk-confirm .bk-done-actions .is-primary').click();
    await page.locator('.bk-panel[data-step="done"]:not([hidden])').waitFor();
    assert.deepEqual(seen.patches, [{ startUTC: target, timezone: 'Europe/London' }]);
    const done = await panelText(page, 'done');
    assert.match(done, /^Moved/m);
    assert.match(done, /Updated in Warren's calendar/);
    assert.match(done, /Update sent to jane@example.com and 1 guest/);
    assert.match(await page.locator('.bk-stub-hint').innerText(), /Moved/);
  });

  it('asks before cancelling, then reports the cancellation', async () => {
    const seen = await mockManage(page, bookingAt(firstSlot));
    await page.goto(`${BASE}/booking/manage/#id=${ID}&token=${TOKEN}&action=cancel`);
    await page.locator('.bk-cancel .bk-done-actions button').first().waitFor();
    assert.equal(await visibleStep(page), 'cancel');
    assert.match(await panelText(page, 'cancel'), /Cancel this call\?/);
    assert.equal(seen.deletes.length, 0, 'nothing is sent until confirmed');

    await page.locator('.bk-cancel .bk-done-actions .is-quiet').click();
    assert.equal(await visibleStep(page), 'manage', 'Keep it returns to the booking');

    await page.locator('.bk-manage .bk-done-actions .is-quiet').first().click();
    await page.locator('.bk-cancel .bk-done-actions .is-primary').click();
    await page.locator('.bk-panel[data-step="done"]:not([hidden])').waitFor();
    assert.equal(seen.deletes.length, 1);
    const done = await panelText(page, 'done');
    assert.match(done, /^Cancelled/m);
    assert.match(done, /Removed from Warren's calendar/);
    assert.match(done, /Book a call/);
  });

  it('shows the booking as cancelled when it already is', async () => {
    await mockManage(page, bookingAt(firstSlot, 'cancelled'));
    await page.goto(`${BASE}/booking/manage/#id=${ID}&token=${TOKEN}&action=reschedule`);
    await page.locator('.bk-manage .bk-done-actions a').first().waitFor();
    assert.equal(await visibleStep(page), 'manage', 'a cancelled booking cannot be moved');
    assert.match(await panelText(page, 'manage'), /^Cancelled/m);
  });

  it('explains a link that opens nothing', async () => {
    await mockManage(page, bookingAt(firstSlot));
    await page.goto(`${BASE}/booking/manage/#id=${ID}&token=${'b'.repeat(32)}`);
    await page.locator('.bk-panel[data-step="done"]:not([hidden])').waitFor();
    const done = await panelText(page, 'done');
    assert.match(done, /Nothing changed/);
    assert.match(done, /This link does not open a booking/);
    assert.match(done, /Book a call/);
  });

  it('keeps the call when the move is refused, and offers the calendar again', async () => {
    await mockManage(page, bookingAt(firstSlot), { patchFails: true });
    await page.goto(`${BASE}/booking/manage/#id=${ID}&token=${TOKEN}&action=reschedule`);
    await page.locator('.bk-day-btn:not([disabled])').first().click();
    await page.locator(`.bk-slot:not([data-start="${firstSlot}"])`).first().click();
    await page.locator('.bk-confirm .bk-done-actions .is-primary').click();
    await page.locator('.bk-panel[data-step="done"]:not([hidden])').waitFor();
    const done = await panelText(page, 'done');
    assert.match(done, /Nothing changed/);
    assert.match(done, /keeps its current time/);
    // "Pick another time" reloads the day and lands on its times again.
    await page.locator('.bk-panel[data-step="done"] .bk-done-actions .is-primary').click();
    await page.locator('.bk-panel[data-step="time"]:not([hidden]) .bk-slot').first().waitFor();
    assert.equal(await visibleStep(page), 'time');
  });
});
