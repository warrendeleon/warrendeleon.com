// Browser Back and Forward must restore the time zone, the picker and the
// slot grouping together. Runs against a live preview: `npm run preview`
// (or wrangler pages dev) on BOOKING_URL, default http://localhost:8788.
//
// Every history entry the page writes carries the zone when one was chosen
// and nothing when the browser's own applies, so each step below checks the
// three things a visitor can see: the label, the dropdown, and that every slot
// listed falls on the heading's day in the zone shown.

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BOOKING_URL ?? 'http://localhost:8788';
const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';

/** "YYYY-MM-DD" of an ISO instant as read in `zone`. */
function dateIn(iso, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));
}

/** Wait until the page shows `zone` and has finished loading the month. */
async function settled(page, zone) {
  await page.waitForFunction(
    (z) => document.querySelector('.bk-zone-label')?.textContent.includes(z)
      && document.querySelector('.bk-status').hidden
      && document.querySelectorAll('.bk-slot, .bk-day-btn:not([disabled])').length > 0,
    zone.replace('_', ' '),
  );
}

async function visible(page) {
  return page.evaluate(() => ({
    hash: location.hash,
    label: document.querySelector('.bk-zone-label')?.textContent ?? '',
    picker: document.querySelector('#bk-tz')?.value ?? '',
    heading: document.querySelector('.bk-day')?.textContent ?? '',
    step: document.querySelector('.bk-panel:not([hidden])')?.dataset.step ?? '',
    slots: [...document.querySelectorAll('.bk-slot')].map((b) => b.dataset.start),
  }));
}

/** Everything on screen agrees with `zone` and with the date in the hash. */
function expectConsistent(state, zone, hashDate) {
  assert.equal(state.step, 'time', 'the time step is showing');
  assert.equal(state.picker, zone, 'the dropdown shows the zone in force');
  assert.ok(state.label.includes(zone.replace('_', ' ')), `label "${state.label}" names ${zone}`);
  assert.ok(state.slots.length > 0, 'the day still has slots');
  for (const start of state.slots) {
    assert.equal(dateIn(start, zone), hashDate, `${start} shown under ${hashDate} in ${zone}`);
  }
}

describe('booking history and time zones', () => {
  let browser;
  let context;
  let page;

  before(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({ timezoneId: LONDON, viewport: { width: 1280, height: 900 } });
  });

  // A page per test: a hash-only goto would keep the previous test's DOM.
  beforeEach(async () => { page = await context.newPage(); });
  afterEach(async () => { await page.close(); });

  after(async () => {
    await browser?.close();
  });

  it('keeps zone, picker and slots in step through Back and Forward', async () => {
    await page.goto(`${BASE}/booking/#type=intro-30`);
    const firstDay = page.locator('.bk-day-btn:not([disabled])').first();
    await firstDay.waitFor();
    await firstDay.click();
    await page.locator('.bk-slot').first().waitFor();

    const london = await visible(page);
    const day = new URLSearchParams(london.hash.slice(1)).get('date');
    assert.ok(day, 'the chosen day is in the hash');
    assert.ok(!london.hash.includes('tz='), 'the browser zone writes no tz');
    expectConsistent(london, LONDON, day);

    // London → Tokyo → London through the picker: three history entries.
    await page.locator('.bk-zone-change').click();
    await page.locator('#bk-tz').selectOption(TOKYO);
    await page.waitForFunction(() => location.hash.includes('tz=Asia'));
    await settled(page, TOKYO);
    const tokyo = await visible(page);
    // The London day may not survive the move; whichever day is in force is
    // the one the slots must agree with.
    const tokyoDay = new URLSearchParams(tokyo.hash.slice(1)).get('date');
    if (tokyo.step === 'time') expectConsistent(tokyo, TOKYO, tokyoDay);
    else assert.equal(tokyo.step, 'date', 'a vanished day sends the visitor back to the calendar');

    if (tokyo.step === 'date') {
      await page.locator('.bk-day-btn:not([disabled])').first().click();
      await page.locator('.bk-slot').first().waitFor();
    }
    await page.locator('#bk-tz').selectOption(LONDON);
    await page.waitForFunction(() => location.hash.includes('tz=Europe'));
    await settled(page, LONDON);
    const londonAgain = await visible(page);
    expectConsistent(londonAgain, LONDON, new URLSearchParams(londonAgain.hash.slice(1)).get('date'));

    // Back: the Tokyo entry.
    await page.goBack();
    await page.waitForFunction(() => location.hash.includes('tz=Asia'));
    await settled(page, TOKYO);
    const back1 = await visible(page);
    expectConsistent(back1, TOKYO, new URLSearchParams(back1.hash.slice(1)).get('date'));

    // Back again: the original entry, which names no zone, so the browser's own.
    await page.goBack();
    await page.waitForFunction(() => !location.hash.includes('tz='));
    await settled(page, LONDON);
    const back2 = await visible(page);
    expectConsistent(back2, LONDON, new URLSearchParams(back2.hash.slice(1)).get('date'));

    // Forward twice lands on Tokyo, then London again.
    await page.goForward();
    await page.waitForFunction(() => location.hash.includes('tz=Asia'));
    await settled(page, TOKYO);
    const fwd1 = await visible(page);
    expectConsistent(fwd1, TOKYO, new URLSearchParams(fwd1.hash.slice(1)).get('date'));

    await page.goForward();
    await page.waitForFunction(() => location.hash.includes('tz=Europe'));
    await settled(page, LONDON);
    const fwd2 = await visible(page);
    expectConsistent(fwd2, LONDON, new URLSearchParams(fwd2.hash.slice(1)).get('date'));
  });

  it('a reload keeps the chosen zone and a fresh visit uses the browser one', async () => {
    await page.goto(`${BASE}/booking/#type=intro-30`);
    await page.locator('.bk-day-btn:not([disabled])').first().click();
    await page.locator('.bk-slot').first().waitFor();
    await page.locator('.bk-zone-change').click();
    await page.locator('#bk-tz').selectOption(TOKYO);
    await page.waitForFunction(() => location.hash.includes('tz=Asia'));
    await settled(page, TOKYO);
    await page.reload();
    await settled(page, TOKYO);
    assert.equal(await page.locator('#bk-tz').inputValue(), TOKYO, 'the dropdown survives a reload');

    const fresh = await context.newPage();
    await fresh.goto(`${BASE}/booking/#type=intro-30`);
    await fresh.locator('.bk-day-btn:not([disabled])').first().click();
    await settled(fresh, LONDON);
    assert.equal(await fresh.locator('#bk-tz').inputValue(), LONDON, 'a visit without tz is back on the browser zone');
    await fresh.close();
  });
});
