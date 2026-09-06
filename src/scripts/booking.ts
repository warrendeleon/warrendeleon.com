import { createOverlay } from './overlay';
// The booking flow. Four steps on one page, with the state in the URL hash so
// Back walks the steps and a refresh or a shared link lands where it points.

declare function t(event: string, data?: Record<string, unknown>): void;
declare const turnstile: {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
} | undefined;

interface EventType {
  slug: string; name: string; description: string; durationMinutes: number; locations: string[];
  question?: string | null; questionRequired?: boolean;
}
interface Slot { startUTC: string; endUTC: string }
type Days = Record<string, Slot[]>;
type Step = 'type' | 'date' | 'time' | 'details' | 'done' | 'manage' | 'confirm' | 'cancel';

/** A booking as the manage route describes it. The token is never in here. */
interface Managed {
  id: string; status: 'confirmed' | 'cancelled'; startUTC: string; endUTC: string;
  location: 'video' | 'phone'; meetLink: string | null; hostPhone: string | null;
  firstName: string; email: string; guests: string[]; timezone: string;
  type: { slug: string; name: string; durationMinutes: number; locations: string[] };
}

const mounted = document.querySelector<HTMLElement>('.bk');
if (mounted) {
  const root: HTMLElement = mounted;
  const S = JSON.parse(root.dataset.strings || '{}');
  const INTL = root.dataset.intl || 'en-GB';
  const LOCALE = root.dataset.locale || 'en';
  /** The manage page runs the same steps but ends in a move or a cancel. */
  const MANAGE = root.dataset.mode === 'manage';
  const HOME = root.dataset.home || '/';
  const BOOK_URL = root.dataset.book || '/booking/';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const panels = new Map<Step, HTMLElement>();
  root.querySelectorAll<HTMLElement>('.bk-panel').forEach((p) => panels.set(p.dataset.step as Step, p));
  const status = root.querySelector<HTMLElement>('.bk-status')!;
  const stub = root.querySelector<HTMLElement>('.bk-stub')!;
  // The manage page has no form. A detached one keeps the form code inert
  // there without a null check at every use.
  const form = root.querySelector<HTMLFormElement>('.bk-form') ?? document.createElement('form');

  let types: EventType[] = [];
  let chosen: EventType | null = null;
  let month = '';
  let days: Days = {};
  let date = '';
  let slot: Slot | null = null;
  let current: Step = MANAGE ? 'manage' : 'type';
  let booking: Managed | null = null;
  let manageId = '';
  let manageToken = '';
  /** What the stub says at the end: set by whichever result was rendered. */
  let doneHint = '';
  /** The canonical IANA name, or null when the browser does not know it. */
  const canonicalZone = (name: string): string | null => {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: name }).resolvedOptions().timeZone; } catch { return null; }
  };
  let zone = 'UTC';
  try { zone = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'; } catch { /* keep UTC */ }
  /** What the browser reported; a history entry without a zone means this one. */
  const detectedZone = zone;
  let scheduleZone = '';
  /** The month's slots as the API groups them, by the schedule's own dates. */
  let rawDays: Days = {};

  const statusText = status.querySelector<HTMLElement>('.bk-status-text')!;
  const retry = status.querySelector<HTMLButtonElement>('.bk-retry')!;
  let retryAction: (() => void) | null = null;
  const say = (message: string, onRetry: (() => void) | null = null) => {
    statusText.textContent = message;
    status.hidden = !message;
    retryAction = onRetry;
    retry.hidden = !onRetry;
    retry.textContent = S.retry;
  };
  retry.addEventListener('click', () => retryAction?.());
  /** Today where the visitor is, not in UTC: near midnight those differ. */
  const todayKey = () => localDate(new Date().toISOString());
  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(INTL, { weekday: 'long', day: 'numeric', month: 'long' });
  const zoneLabel = () => zone.replace(/_/g, ' ');
  /** "YYYY-MM-DD" of an instant in the visitor's zone. */
  const localDate = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  /**
   * Regroup slots by the day they fall on where the visitor is. A 01:00 slot
   * in Tokyo belongs to Tuesday there even if it is Monday evening here, and
   * the day list, the times and the summary all have to agree on that.
   */
  function regroup(): Days {
    const out: Days = {};
    for (const list of Object.values(rawDays)) for (const slot of list) {
      const key = localDate(slot.startUTC);
      if (key.startsWith(month)) (out[key] ??= []).push(slot);
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.startUTC.localeCompare(b.startUTC));
    return out;
  }
  const fmtShortDay = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(INTL, { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(INTL, { hour: '2-digit', minute: '2-digit', timeZone: zone });
  const fmtDuration = (minutes: number) => {
    if (minutes < 60) return S.duration.minutes.replace('{n}', String(minutes));
    const hours = minutes / 60;
    return hours === 1 ? S.duration.hour : S.duration.hours.replace('{n}', String(hours));
  };

  /** What earned this booking, captured on the visitor's first page. */
  function attribution(): Record<string, string> {
    let first: Record<string, string> = {};
    try { first = JSON.parse(sessionStorage.getItem('utm.first') || '{}'); } catch { /* private mode */ }
    const utm: Record<string, string> = { source: first.utm_source || 'website', medium: first.utm_medium || 'internal' };
    if (first.utm_campaign) utm.campaign = first.utm_campaign;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && ref.pathname !== location.pathname) {
        utm.content = ref.pathname.replace(/^\/|\/$/g, '').slice(0, 100) || 'home';
      } else if (first.utm_content) utm.content = first.utm_content;
    } catch { /* ignore */ }
    return utm;
  }
  const track = (event: string, extra: Record<string, unknown> = {}) => {
    if (typeof t !== 'function') return;
    const a = attribution();
    t(event, { locale: LOCALE, source: a.source, medium: a.medium, from: a.content || '', ...extra });
  };

  // ---- the stub and the steps ------------------------------------------

  function renderStub() {
    const line = (name: string, text: string, visible: boolean) => {
      const li = stub.querySelector<HTMLElement>(`.bk-stub-line[data-line="${name}"]`)!;
      li.hidden = !visible;
      li.querySelector('.bk-stub-text')!.textContent = text;
      // On the manage page the type is fixed by the booking: its line is a
      // label, not a way back to a choice.
      const fixed = current === 'done' || (MANAGE && name === 'type');
      li.querySelector('.bk-stub-change')!.textContent = fixed ? '' : S.change;
      li.querySelector('button')!.setAttribute('aria-label', fixed ? text : `${S.change}: ${text}`);
      li.querySelector('button')!.disabled = MANAGE && name === 'type';
    };
    line('type', chosen ? `${chosen.name}, ${fmtDuration(chosen.durationMinutes)}` : '', !!chosen);
    line('date', date ? fmtShortDay(date) : '', !!date);
    line('time', slot ? `${fmtTime(slot.startUTC)}, ${zoneLabel()}` : '', !!slot);

    const hint: Record<Step, string> = {
      type: S.hints.type, date: S.hints.date, time: S.hints.time, details: S.hints.details, done: doneHint || S.confirmed.heading,
      manage: S.manage?.hint ?? '', confirm: S.manage?.confirmHint ?? '', cancel: S.manage?.cancelHint ?? '',
    };
    stub.querySelector<HTMLElement>('.bk-stub-hint')!.textContent = hint[current];
    stub.classList.toggle('is-done', current === 'done' && !panels.get('done')!.classList.contains('is-failed'));
    if (current === 'done' && panels.get('done')!.classList.contains('is-failed')) stub.querySelector<HTMLElement>('.bk-stub-hint')!.textContent = doneHint || S.failed.heading;
  }

  function show(step: Step) {
    current = step;
    panels.forEach((panel, name) => {
      const entering = name === step && panel.hidden;
      panel.hidden = name !== step;
      if (entering && !reducedMotion) {
        panel.classList.remove('is-entering');
        void panel.offsetWidth; // restart the animation even if the class was still present
        panel.classList.add('is-entering');
      }
    });
    renderStub();
    const focusTarget: Record<Step, string> = {
      type: '.bk-stub-hint', date: '.bk-month', time: '.bk-day', details: '.bk-form-title', done: '.bk-done',
      manage: '.bk-manage', confirm: '.bk-confirm', cancel: '.bk-cancel',
    };
    setTimeout(() => root.querySelector<HTMLElement>(focusTarget[step])?.focus(), 0);
  }

  let zoneChosen = false;
  function writeHash() {
    const parts: string[] = [];
    // The manage page's hash names the step instead of the type: the type
    // is fixed by the booking, and the token never goes anywhere near a URL.
    if (MANAGE) { if (current !== 'manage' && current !== 'done') parts.push(`step=${current}`); }
    else if (chosen) parts.push(`type=${chosen.slug}`);
    if (date) parts.push(`date=${date}`);
    if (slot) parts.push(`slot=${encodeURIComponent(slot.startUTC)}`);
    if (zoneChosen) parts.push(`tz=${encodeURIComponent(zone)}`);
    const next = parts.length ? `#${parts.join('&')}` : ' ';
    if (location.hash !== next) history.pushState(null, '', next);
  }
  function readHash(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of location.hash.replace(/^#/, '').split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) out[k] = decodeURIComponent(v);
    }
    return out;
  }

  // ---- step one -----------------------------------------------------------

  async function loadTypes() {
    say(S.calendar.loading);
    try {
      const response = await fetch(`/api/booking/types?locale=${LOCALE}`);
      if (!response.ok) throw new Error(String(response.status));
      types = (await response.json()).types as EventType[];
    } catch { say(S.errors.generic, () => loadTypes()); return; }
    say('');
    const list = root.querySelector<HTMLElement>('.bk-types')!;
    if (types.length === 0) { list.textContent = S.empty; return; }
    list.replaceChildren(...types.map((type) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bk-type';
      const name = document.createElement('span'); name.className = 'bk-type-name'; name.textContent = type.name;
      const duration = document.createElement('span'); duration.className = 'bk-type-duration';
      const [big, small] = fmtDuration(type.durationMinutes).split(' ');
      duration.textContent = big ?? '';
      const unit = document.createElement('small'); unit.textContent = small ?? '';
      duration.appendChild(unit);
      const meta = document.createElement('span'); meta.className = 'bk-type-meta';
      meta.textContent = type.locations.map((l) => S.locations[l] ?? l).join(', ');
      const desc = document.createElement('p'); desc.className = 'bk-type-desc'; desc.textContent = type.description;
      button.append(name, duration, meta, desc);
      button.addEventListener('click', () => pickType(type));
      return button;
    }));
    renderStub();
  }

  async function pickType(type: EventType) {
    chosen = type; date = ''; slot = null; days = {};
    month = todayKey().slice(0, 7);
    writeHash();
    track('booking_type_picked', { type: type.slug, minutes: type.durationMinutes });
    show('date');
    await loadMonth();
  }

  // ---- step two -----------------------------------------------------------

  function shiftMonth(by: number): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y!, m! - 1 + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async function loadMonth() {
    const label = root.querySelector<HTMLElement>('.bk-month')!;
    label.textContent = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(INTL, { month: 'long', year: 'numeric' });
    root.querySelector<HTMLElement>('.bk-grid')!.replaceChildren();
    root.querySelector<HTMLElement>('.bk-datebook')!.replaceChildren();
    root.querySelector<HTMLElement>('.bk-empty')!.hidden = true;
    say(S.calendar.loading);
    try {
      const load = async (m: string) => {
        const response = await fetch(`/api/booking/availability?type=${chosen!.slug}&month=${m}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error === 'calendar_unavailable' ? S.errors.calendarUnavailable : S.errors.generic);
        }
        return response.json() as Promise<{ timezone: string; days: Days }>;
      };
      const main = await load(month);
      scheduleZone = main.timezone;
      rawDays = main.days;
      // A visitor in another zone can see slots that belong to the neighbouring
      // schedule month, so those are fetched too and folded in.
      if (zone !== scheduleZone) {
        const [before, after] = await Promise.all([load(shiftMonth(-1)).catch(() => null), load(shiftMonth(1)).catch(() => null)]);
        rawDays = { ...(before?.days ?? {}), ...rawDays, ...(after?.days ?? {}) };
      }
      days = regroup();
    } catch (cause) { say(cause instanceof Error ? cause.message : S.errors.generic, () => loadMonth()); return; }
    say('');
    renderWeekdays();
    renderGrid();
    renderDatebook();
    root.querySelector<HTMLElement>('.bk-legend')!.textContent = S.legend;
    root.querySelector<HTMLButtonElement>('.bk-nav[data-month="-1"]')!.disabled = month <= todayKey().slice(0, 7);
    const empty = root.querySelector<HTMLElement>('.bk-empty')!;
    empty.textContent = S.calendar.noDays;
    empty.hidden = Object.keys(days).length > 0;
  }

  function monthDates(): string[] {
    const [y, m] = month.split('-').map(Number);
    const length = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    return Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  }

  function renderWeekdays() {
    const head = root.querySelector<HTMLElement>('.bk-weekdays')!;
    if (head.childElementCount > 0) return;
    // 5 January 2026 was a Monday: this walks Monday to Sunday in the locale's own words.
    head.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const cell = document.createElement('span');
      cell.className = 'bk-weekday';
      cell.textContent = new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(INTL, { weekday: 'short' });
      return cell;
    }));
  }

  /** Wide screens: the familiar grid, with a small mark under every free day. */
  function renderGrid() {
    const grid = root.querySelector<HTMLElement>('.bk-grid')!;
    const dates = monthDates();
    const lead = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
    const cells: HTMLElement[] = [];
    for (let i = 0; i < lead; i += 1) {
      const blank = document.createElement('div'); blank.className = 'bk-day-cell is-blank'; cells.push(blank);
    }
    const most = Math.max(1, ...Object.values(days).map((list) => list.length));
    for (const iso of dates) {
      const cell = document.createElement('div'); cell.className = 'bk-day-cell';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'bk-day-btn';
      button.textContent = iso.slice(8).replace(/^0/, '');
      const bar = document.createElement('i');
      const count = (days[iso] || []).length;
      // Same rule as the datebook: the bar's length is how much of the day is free.
      bar.style.setProperty('--bar', `${Math.max(0.5, (count / most) * 2.5)}rem`);
      button.appendChild(bar);
      const free = count > 0;
      button.disabled = !free;
      button.setAttribute('aria-pressed', String(iso === date));
      button.setAttribute('aria-label', `${fmtDay(iso)}, ${count === 1 ? S.freeOne : S.free.replace('{n}', String(count))}`);
      if (free) button.addEventListener('click', () => pickDate(iso));
      cell.appendChild(button); cells.push(cell);
    }
    grid.replaceChildren(...cells);
  }

  /**
   * Phones: the month as a datebook. One row per day from today onwards, a
   * large numeral, and a bar whose length is how much of that day is free.
   * Past days are simply not there; a phone has no room for what cannot be
   * booked.
   */
  function renderDatebook() {
    const book = root.querySelector<HTMLElement>('.bk-datebook')!;
    const today = todayKey();
    const most = Math.max(1, ...Object.values(days).map((list) => list.length));
    const rows: HTMLElement[] = [];
    for (const iso of monthDates()) {
      if (iso < today) continue;
      const count = (days[iso] || []).length;
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'bk-dbrow';
      row.disabled = count === 0;
      row.setAttribute('aria-pressed', String(iso === date));
      row.setAttribute('aria-label', `${fmtDay(iso)}, ${count === 1 ? S.freeOne : S.free.replace('{n}', String(count))}`);
      const wd = document.createElement('span'); wd.className = 'bk-db-wd';
      wd.textContent = new Date(`${iso}T12:00:00Z`).toLocaleDateString(INTL, { weekday: 'short' });
      const num = document.createElement('span'); num.className = 'bk-db-num';
      num.textContent = iso.slice(8).replace(/^0/, '');
      const bar = document.createElement('span'); bar.className = 'bk-db-bar';
      const fill = document.createElement('span');
      bar.appendChild(fill);
      fill.style.width = `${Math.round((count / most) * 100)}%`;
      const n = document.createElement('span'); n.className = 'bk-db-count';
      n.textContent = count === 0 ? '' : count === 1 ? S.freeOne : S.free.replace('{n}', String(count));
      row.append(wd, num, bar, n);
      if (count > 0) row.addEventListener('click', () => pickDate(iso));
      rows.push(row);
    }
    book.replaceChildren(...rows);
  }

  function pickDate(iso: string) {
    date = iso; slot = null;
    show('time');
    writeHash();
    renderSlots();
  }

  // ---- step three ---------------------------------------------------------

  function renderSlots() {
    root.querySelector<HTMLElement>('.bk-day')!.textContent = fmtDay(date);
    const holder = root.querySelector<HTMLElement>('.bk-slots')!;
    const list = days[date] || [];
    if (list.length === 0) { holder.textContent = S.times.none; return; }
    holder.replaceChildren(...list.map((candidate) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'bk-slot';
      button.dataset.start = candidate.startUTC;
      button.textContent = fmtTime(candidate.startUTC);
      button.addEventListener('click', () => pickSlot(candidate));
      return button;
    }));
    renderZone();
  }

  function renderZone() {
    const label = root.querySelector<HTMLElement>('.bk-zone-label')!;
    const change = root.querySelector<HTMLButtonElement>('.bk-zone-change')!;
    const picker = root.querySelector<HTMLElement>('.bk-zone-picker')!;
    const select = root.querySelector<HTMLSelectElement>('#bk-tz')!;
    // Detected, not asked for: a sentence with the alternatives behind a link.
    label.textContent = S.times.zone.replace('{zone}', zone.replace(/_/g, ' '));
    change.textContent = S.times.changeZone;
    root.querySelector<HTMLElement>('.bk-zone-pick-label')!.textContent = S.times.changeZone;
    if (!change.dataset.wired) {
      change.dataset.wired = 'yes';
      change.addEventListener('click', () => {
        picker.hidden = !picker.hidden;
        change.setAttribute('aria-expanded', String(!picker.hidden));
        if (!picker.hidden) select.focus();
      });
    }
    if (select.options.length === 0) {
      let all: string[] = [zone];
      try { all = (Intl as never as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'); } catch { /* older browser */ }
      select.replaceChildren(...all.map((name) => {
        const option = document.createElement('option');
        option.value = name; option.textContent = name.replace(/_/g, ' '); option.selected = name === zone;
        return option;
      }));
      select.addEventListener('change', async () => {
        zone = select.value; zoneChosen = true;
        writeHash();
        await reloadForZone();
      });
    }
    select.value = zone;
  }

  /**
   * The zone changed, so the month is fetched again: whether the neighbouring
   * months are needed depends on the zone, and the grouping by day does too.
   * A chosen day that no longer has anything in it sends the visitor back to
   * the calendar rather than silently picking another day for them.
   */
  async function reloadForZone() {
    renderZone();
    await loadMonth();
    if (date && !(days[date] || []).length) { date = ''; slot = null; writeHash(); show('date'); }
    else if (date) renderSlots();
    renderStub();
  }

  function pickSlot(candidate: Slot) {
    slot = candidate;
    track('booking_slot_picked', { type: chosen!.slug, date });
    // The step is shown before the hash is written: on the manage page the
    // hash names the step, so the history entry must describe the panel.
    if (MANAGE) { renderConfirm(); show('confirm'); writeHash(); return; }
    show('details');
    writeHash();
    renderForm();
  }

  // ---- step four ----------------------------------------------------------

  const ICON: Record<string, string> = {
    video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  };
  const svg = (paths: string) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  function renderForm() {
    const set = (selector: string, text: string) => {
      const node = root.querySelector<HTMLElement>(selector);
      if (node) node.textContent = text;
    };
    set('.bk-form-title', S.form.heading);
    set('[data-copy="aboutYou"]', S.form.aboutYou);
    set('[data-copy="prepare"]', S.form.prepare);
    set('label[for="bk-first"]', S.form.firstName);
    set('label[for="bk-last"]', S.form.lastName);
    set('label[for="bk-email"]', S.form.email);
    set('label[for="bk-phone"]', S.form.phone);
    mountCountries();
    set('.bk-phone .bk-hint', S.form.phoneHelp);
    const ask = chosen!.question || S.form.question;
    set('label[for="bk-notes"]', chosen!.questionRequired ? ask : `${ask} (${S.form.optional})`);
    set('.bk-add-guest span', S.form.addGuests);
    set('.bk-submit', S.form.submit);
    set('.bk-locations .bk-group-title', S.form.location);

    const tiles = root.querySelector<HTMLElement>('.bk-tiles')!;
    tiles.replaceChildren(...chosen!.locations.map((kind, index) => {
      const tile = document.createElement('label');
      tile.className = 'bk-tile';
      tile.innerHTML =
        `<span class="bk-tile-icon">${svg(ICON[kind] ?? ICON.video!)}</span>` +
        `<span><span class="bk-tile-name"></span><span class="bk-tile-help"></span></span>` +
        `<span class="bk-tile-check">${svg('<path d="M20 6 9 17l-5-5"/>')}</span>`;
      tile.querySelector('.bk-tile-name')!.textContent = S.locations[kind] ?? kind;
      tile.querySelector('.bk-tile-help')!.textContent = S.locations[`${kind}Help`] ?? '';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'location'; input.value = kind; input.checked = index === 0;
      input.setAttribute('aria-label', S.locations[kind] ?? kind);
      input.addEventListener('change', togglePhone);
      tile.prepend(input);
      return tile;
    }));
    clearErrors();
    form.querySelectorAll<HTMLElement>('[data-checked]').forEach((n) => { delete n.dataset.checked; });
    togglePhone();
    mountTurnstile();
  }

  let turnstileId: string | null = null;
  /**
   * The anti-spam check, rendered in the page's theme when the form opens.
   * The script loads async, so if it is not here yet the render happens from
   * its onload callback instead; ready() is not allowed with async loading.
   */
  function mountTurnstile() {
    const holder = root.querySelector<HTMLElement>('.bk-turnstile')!;
    const key = root.dataset.turnstile;
    if (!key || typeof turnstile === 'undefined') return;
    if (turnstileId) { turnstile.reset(turnstileId); refreshSubmit(); return; }
    turnstileId = turnstile.render(holder, {
      sitekey: key,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      appearance: 'interaction-only',
      callback: () => refreshSubmit(),
      'expired-callback': () => refreshSubmit(),
      'error-callback': () => refreshSubmit(),
    });
    refreshSubmit();
  }
  (window as unknown as { __bkTurnstileReady?: () => void }).__bkTurnstileReady = () => {
    if (current === 'details') mountTurnstile();
  };

  function togglePhone() {
    const picked = form.querySelector<HTMLInputElement>('input[name="location"]:checked');
    const phoneField = root.querySelector<HTMLElement>('.bk-phone')!;
    phoneField.hidden = picked?.value !== 'phone';
    if (phoneField.hidden) setFieldError('phone', '', inputFor('phone'));
    refreshSubmit();
  }

  root.querySelector<HTMLButtonElement>('.bk-add-guest')?.addEventListener('click', () => {
    const list = root.querySelector<HTMLElement>('.bk-guest-list')!;
    if (list.childElementCount >= 5) return;
    const row = document.createElement('div'); row.className = 'bk-guest';
    const input = document.createElement('input');
    input.type = 'email'; input.placeholder = S.form.guestEmail; input.setAttribute('aria-label', S.form.guestEmail);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'bk-guest-remove'; remove.textContent = '×';
    remove.title = S.form.removeGuest;
    remove.setAttribute('aria-label', S.form.removeGuest);
    remove.addEventListener('click', () => { row.remove(); checkGuests(true); refreshSubmit(); });
    row.append(input, remove); list.appendChild(row); input.focus();
    refreshSubmit();
  });

  function clearErrors() {
    root.querySelectorAll<HTMLElement>('.bk-error').forEach((node) => { node.textContent = ''; });
    root.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((node) => {
      node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby');
    });
    root.querySelector<HTMLElement>('.bk-form-error')!.hidden = true;
  }
  function messageFor(name: string, code: string): string {
    if (name === 'guests') return code === 'too_many' ? S.errors.tooManyGuests : S.errors.guests;
    if (code === 'invalid') {
      if (name === 'email') return S.errors.email;
      if (name === 'phone') return S.errors.phone;
      if (name === 'firstName' || name === 'lastName') return S.errors.name;
    }
    return S.errors.required;
  }

  // ---- live validation -----------------------------------------------------
  // The same rules the API applies, run in the browser as the visitor goes.
  // A field checks itself when it is left, then corrects itself on every
  // keystroke once it has shown an error. The button stays disabled until
  // every required field passes. The API remains the authority.

  const HAS_LETTER = /\p{L}/u;
  const LOOKS_LIKE_LINK = /https?:|www\.|@/i;
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
  const PHONE_SHAPE = /^\+[1-9]\d{7,14}$/;

  const nameCode = (v: string) => (!v ? 'required' : !HAS_LETTER.test(v) || LOOKS_LIKE_LINK.test(v) ? 'invalid' : '');
  const emailCode = (v: string) => (!v ? 'required' : !EMAIL_SHAPE.test(v) ? 'invalid' : '');
  const phoneCode = (v: string) => (!v ? 'required' : !PHONE_SHAPE.test(v) ? 'invalid' : '');

  const phoneChosen = () => form.querySelector<HTMLInputElement>('input[name="location"]:checked')?.value === 'phone';

  // Region code to dialling code. Names come from the browser in the page's
  // own language, so only the numbers live here.
  const DIAL: [string, string][] = [
    ['GB','44'],['IE','353'],['ES','34'],['PT','351'],['FR','33'],['DE','49'],['IT','39'],['NL','31'],['BE','32'],['LU','352'],['CH','41'],['AT','43'],
    ['DK','45'],['SE','46'],['NO','47'],['FI','358'],['IS','354'],['PL','48'],['CZ','420'],['SK','421'],['HU','36'],['RO','40'],['BG','359'],['GR','30'],
    ['HR','385'],['SI','386'],['RS','381'],['UA','380'],['TR','90'],['CY','357'],['MT','356'],['EE','372'],['LV','371'],['LT','370'],
    ['US','1'],['CA','1'],['MX','52'],['BR','55'],['AR','54'],['CL','56'],['CO','57'],['PE','51'],['UY','598'],
    ['PH','63'],['IN','91'],['SG','65'],['MY','60'],['ID','62'],['TH','66'],['VN','84'],['JP','81'],['KR','82'],['CN','86'],['HK','852'],['TW','886'],
    ['AU','61'],['NZ','64'],['AE','971'],['SA','966'],['IL','972'],['QA','974'],['ZA','27'],['NG','234'],['KE','254'],['EG','20'],['MA','212'],
  ];
  const TZ_REGION: Record<string, string> = {
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
    'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Warsaw': 'PL',
    'Asia/Manila': 'PH', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Toronto': 'CA',
    'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN', 'Asia/Dubai': 'AE', 'Australia/Sydney': 'AU',
  };
  const flag = (region: string) => String.fromCodePoint(...[...region].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

  let region = 'GB';
  let dial = '44';
  let countryNames: { of(code: string): string | undefined } | null = null;
  try { countryNames = new Intl.DisplayNames([INTL], { type: 'region' }); } catch { /* older browser */ }
  const countryName = (code: string) => countryNames?.of(code) ?? code;

  // Built on first use: the overlay listens for Tab and Escape on the
  // document, and a page without the sheet (the manage page) must not.
  interface CountrySheet { root: HTMLElement; list: HTMLElement; search: HTMLInputElement; overlay: ReturnType<typeof createOverlay> }
  let countrySheetCache: CountrySheet | null = null;
  function countrySheet(): CountrySheet {
    if (countrySheetCache) return countrySheetCache;
    const sheetRoot = document.getElementById('bk-cc-sheet') as HTMLElement;
    const list = sheetRoot.querySelector<HTMLElement>('.bk-cc-list')!;
    const search = sheetRoot.querySelector<HTMLInputElement>('#bk-cc-search')!;
    const overlay = createOverlay({
      root: sheetRoot,
      panel: sheetRoot.querySelector<HTMLElement>('.bk-sheet-panel')!,
      initialFocus: () => search,
      onOpen: () => {
        search.value = '';
        renderCountryList('');
        list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
      },
    });
    countrySheetCache = { root: sheetRoot, list, search, overlay };
    return countrySheetCache;
  }

  function setCountry(nextRegion: string, nextDial: string) {
    region = nextRegion; dial = nextDial;
    const button = root.querySelector<HTMLButtonElement>('#bk-cc')!;
    button.querySelector('.bk-cc-flag')!.textContent = flag(region);
    button.querySelector('.bk-cc-code')!.textContent = `+${dial}`;
    button.setAttribute('aria-label', `${S.form.country}: ${countryName(region)} +${dial}`);
    form.querySelector<HTMLInputElement>('input[name="cc"]')!.value = dial;
    if (inputFor('phone')?.dataset.checked === 'yes') checkField('phone');
    refreshSubmit();
  }

  function renderCountryList(query: string) {
    const needle = query.trim().toLowerCase();
    const rows = DIAL
      .map(([code, d]) => ({ code, d, name: countryName(code) }))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || `+${c.d}`.includes(needle) || c.code.toLowerCase() === needle)
      .sort((a, b) => a.name.localeCompare(b.name, INTL));
    countrySheet().list.replaceChildren(...rows.map((c) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'bk-cc-option'; button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(c.code === region));
      button.innerHTML = '<span class="flag" aria-hidden="true"></span><span class="name"></span><span class="code"></span>';
      button.querySelector('.flag')!.textContent = flag(c.code);
      button.querySelector('.name')!.textContent = c.name;
      button.querySelector('.code')!.textContent = `+${c.d}`;
      button.addEventListener('click', () => { setCountry(c.code, c.d); countrySheet().overlay.close(); inputFor('phone')?.focus(); });
      li.appendChild(button);
      return li;
    }));
  }

  function mountCountries() {
    const button = root.querySelector<HTMLButtonElement>('#bk-cc')!;
    if (button.dataset.wired) return;
    button.dataset.wired = 'yes';
    const sheet = countrySheet();
    sheet.root.querySelector<HTMLElement>('#bk-cc-title')!.textContent = S.form.chooseCountry;
    sheet.root.querySelector<HTMLElement>('.bk-sheet-close')!.setAttribute('aria-label', S.form.close);
    sheet.search.placeholder = S.form.searchCountry;
    sheet.search.setAttribute('aria-label', S.form.searchCountry);
    sheet.search.addEventListener('input', () => renderCountryList(sheet.search.value));
    button.addEventListener('click', () => sheet.overlay.open());
    const byLocale: Record<string, string> = { en: 'GB', es: 'ES', ca: 'ES', tl: 'PH' };
    const preferred = TZ_REGION[zone] ?? byLocale[LOCALE] ?? 'GB';
    const found = DIAL.find(([code]) => code === preferred) ?? DIAL[0]!;
    setCountry(found[0], found[1]);
  }

  /**
   * The number in international form. Someone who types their own country
   * code ("+44 …" or "0044 …") gets it kept, not doubled. Otherwise the
   * picked code goes in front and the trunk zero comes off, except for Italy,
   * whose landlines keep it after the country code.
   */
  function composedPhone(): string {
    const raw = (inputFor('phone')?.value ?? '').trim().replace(/\(0\)/g, '');
    const digits = raw.replace(/[^0-9]/g, '');
    if (/^\+/.test(raw)) return digits ? `+${digits}` : '';
    if (/^00/.test(digits)) return digits.length > 2 ? `+${digits.slice(2)}` : '';
    const national = dial === '39' ? digits : digits.replace(/^0+/, '');
    return national ? `+${dial}${national}` : '';
  }

  const RULES: Record<string, (v: string) => string> = {
    firstName: nameCode,
    lastName: nameCode,
    email: emailCode,
    phone: () => (phoneChosen() ? phoneCode(composedPhone()) : ''),
  };

  const inputFor = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  const errorFor = (name: string) => root.querySelector<HTMLElement>(`.bk-error[data-for="${name}"]`);

  function setFieldError(name: string, code: string, input: HTMLElement | null) {
    const node = errorFor(name);
    if (!node) return;
    if (code) {
      node.id = node.id || `bk-err-${name}`;
      node.textContent = messageFor(name, code);
      input?.setAttribute('aria-invalid', 'true');
      input?.setAttribute('aria-describedby', node.id);
    } else {
      node.textContent = '';
      input?.removeAttribute('aria-invalid');
      input?.removeAttribute('aria-describedby');
    }
  }

  /** Check one named field and show the result beside it. */
  function checkField(name: string): boolean {
    const rule = RULES[name];
    const input = inputFor(name);
    if (!rule || !input) return true;
    const code = rule(input.value.trim());
    setFieldError(name, code, input);
    input.dataset.checked = 'yes';
    return !code;
  }

  /** Guest rows: an empty row is ignored, a filled one must be an address. */
  function checkGuests(show: boolean): boolean {
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('.bk-guest input'));
    let code = '';
    for (const input of inputs) {
      const value = input.value.trim();
      const bad = value !== '' && !EMAIL_SHAPE.test(value);
      if (show) { if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
      if (bad) code = 'invalid';
    }
    const filled = inputs.filter((i) => i.value.trim() !== '').length;
    if (!code && filled > 5) code = 'too_many';
    if (show) setFieldError('guests', code, null);
    return !code;
  }

  /** Is everything the API will insist on present and well-formed? */
  function formIsComplete(): boolean {
    const challenge = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
    if (turnstileId && (!challenge || !challenge.value)) return false;
    const okNames = Object.keys(RULES).every((name) => {
      const input = inputFor(name);
      return !input || !RULES[name]!(input.value.trim());
    });
    return okNames && checkGuests(false);
  }

  function refreshSubmit() {
    const submit = form.querySelector<HTMLButtonElement>('.bk-submit')!;
    if (submit.dataset.busy === 'yes') return;
    const complete = formIsComplete();
    submit.disabled = !complete;
    const hint = form.querySelector<HTMLElement>('.bk-submit-hint')!;
    if (complete) { hint.textContent = ''; return; }
    const missing: string[] = [];
    if (RULES.firstName!(inputFor('firstName')?.value.trim() ?? '')) missing.push(S.needsFirst);
    if (RULES.lastName!(inputFor('lastName')?.value.trim() ?? '')) missing.push(S.needsLast);
    if (RULES.email!(inputFor('email')?.value.trim() ?? '')) missing.push(S.needsEmail);
    if (RULES.phone!('')) missing.push(S.needsPhone);
    if (!checkGuests(false)) missing.push(S.needsGuest);
    hint.textContent = missing.length ? S.needs.replace('{list}', missing.join(', ')) : '';
  }

  // Leaving a field checks it. Typing in a field that has already been
  // checked re-checks it, so an error clears the moment it is fixed.
  form.addEventListener('focusout', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name in RULES) checkField(target.name);
    if (target.closest('.bk-guest')) checkGuests(true);
    refreshSubmit();
  });
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name in RULES && target.dataset.checked === 'yes') checkField(target.name);
    if (target.closest('.bk-guest') && errorFor('guests')?.textContent) checkGuests(true);
    refreshSubmit();
  });

  /** Run every rule at once and show the results, for the submit backstop. */
  function checkAll(): boolean {
    const results = Object.keys(RULES).map((name) => checkField(name));
    const guestsOk = checkGuests(true);
    const first = root.querySelector<HTMLElement>('[aria-invalid="true"], .bk-error:not(:empty)');
    if (first) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if ('focus' in first) (first as HTMLInputElement).focus({ preventScroll: true });
    }
    return results.every(Boolean) && guestsOk;
  }

  function showFieldErrors(fields: Record<string, string>) {
    for (const [name, code] of Object.entries(fields)) setFieldError(name, code, inputFor(name));
    root.querySelector<HTMLElement>('.bk-error:not(:empty)')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    root.querySelector<HTMLElement>('.bk-form-error')!.hidden = true;
    if (!checkAll()) { refreshSubmit(); return; }
    const submit = form.querySelector<HTMLButtonElement>('.bk-submit')!;
    submit.dataset.busy = 'yes';
    submit.disabled = true; submit.textContent = S.form.submitting;
    const banner = (message: string) => {
      const node = root.querySelector<HTMLElement>('.bk-form-error')!;
      node.textContent = message; node.hidden = !message;
      submit.dataset.busy = '';
      submit.textContent = S.form.submit;
      refreshSubmit();
    };

    const data = new FormData(form);
    const guests = Array.from(root.querySelectorAll<HTMLInputElement>('.bk-guest input')).map((i) => i.value.trim()).filter(Boolean);
    const challengeInput = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
    const body = {
      type: chosen!.slug, startUTC: slot!.startUTC,
      location: String(data.get('location') || ''),
      firstName: String(data.get('firstName') || '').trim(), lastName: String(data.get('lastName') || '').trim(),
      email: String(data.get('email') || '').trim(), phone: composedPhone(),
      notes: String(data.get('notes') || ''), nickname: String(data.get('nickname') || ''),
      timezone: zone, locale: LOCALE, guests, turnstileToken: challengeInput?.value || '', utm: attribution(),
    };


    let response: Response;
    try {
      response = await fetch('/api/booking/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch { banner(S.errors.generic); return; }
    const payload = await response.json().catch(() => ({}));

    if (response.ok) { renderDone(payload, body.email); submit.dataset.busy = ''; submit.textContent = S.form.submit; return; }

    // Field problems the API found stay beside their fields. Anything else
    // that happened after the form was accepted is a result in its own right.
    const fields: Record<string, string> = payload.fields ?? {};
    const placed = Object.keys(fields).filter((name) => errorFor(name));
    if (response.status === 400 && placed.length > 0 && placed.length === Object.keys(fields).length) {
      showFieldErrors(fields); banner(''); return;
    }
    submit.dataset.busy = ''; submit.textContent = S.form.submit;
    if (turnstileId && typeof turnstile !== 'undefined') turnstile.reset(turnstileId);
    const retryAfter = Number(response.headers.get('retry-after') || '') || null;
    renderFailed(String(payload.error || 'generic'), retryAfter);
  });

  const GLYPH = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
  };

  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);

  function resultPanel(failed: boolean, glyph: string, title: string, lead: string, step: Step = 'done') {
    const panel = panels.get(step)!;
    panel.classList.toggle('is-failed', failed);
    panel.querySelector<HTMLElement>('.bk-ticket-mark')!.innerHTML = svg(glyph);
    panel.querySelector<HTMLElement>('.bk-done-title')!.textContent = title;
    panel.querySelector<HTMLElement>('.bk-done-lead')!.textContent = lead;
    panel.querySelector<HTMLElement>('.bk-ticket-facts')!.replaceChildren();
    panel.querySelector<HTMLElement>('.bk-ticket-status')!.replaceChildren();
    panel.querySelector<HTMLElement>('.bk-done-actions')!.replaceChildren();
    return panel;
  }

  function fact(list: HTMLElement, label: string, value: string, big = false, note?: string) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value; if (big) dd.classList.add('is-big');
    if (note) { const small = document.createElement('small'); small.textContent = note; dd.appendChild(small); }
    list.append(dt, dd);
  }
  function statusLine(list: HTMLElement, glyph: string, text: string, warn = false) {
    const li = document.createElement('li'); if (warn) li.classList.add('is-warn');
    li.innerHTML = `${svg(glyph)}<span></span>`;
    li.querySelector('span')!.textContent = text;
    list.appendChild(li);
  }
  function action(list: HTMLElement, text: string, primary: boolean, onClick?: () => void, href?: string) {
    const node = document.createElement(href ? 'a' : 'button');
    node.className = primary ? 'is-primary' : 'is-quiet';
    node.textContent = text;
    if (href) { (node as HTMLAnchorElement).href = href; (node as HTMLAnchorElement).rel = 'noopener'; }
    else { (node as HTMLButtonElement).type = 'button'; node.addEventListener('click', onClick!); }
    list.appendChild(node);
  }

  interface Created {
    booking?: { meetLink?: string | null; hostPhone?: string | null; location?: string };
    calendar?: { eventCreated?: boolean; invitesSentTo?: string[]; provider?: string };
    manageUrl?: string;
    /** Calendly-provided types hand back separate links. */
    cancelUrl?: string | null;
  }

  function renderDone(payload: Created, email: string) {
    const panel = resultPanel(false, GLYPH.check, S.confirmed.heading, S.confirmed.body);
    const facts = panel.querySelector<HTMLElement>('.bk-ticket-facts')!;
    fact(facts, S.steps.type, `${chosen!.name}, ${fmtDuration(chosen!.durationMinutes)}`);
    fact(facts, S.steps.date, fmtDay(date));
    fact(facts, S.steps.time, fmtTime(slot!.startUTC), true, zoneLabel());

    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    if (payload.calendar?.eventCreated) statusLine(status, GLYPH.calendar, S.confirmed.calendarAdded);
    const invites = payload.calendar?.invitesSentTo ?? [email];
    const others = invites.length - 1;
    const tail = others === 1 ? ` ${S.confirmed.inviteGuest}` : others > 1 ? ` ${fill(S.confirmed.inviteGuests, { n: others })}` : '';
    statusLine(status, GLYPH.mail, fill(S.confirmed.inviteSent, { email }) + tail);
    if (payload.booking?.location === 'phone' && payload.booking.hostPhone) {
      statusLine(status, ICON.phone!, fill(S.confirmed.ring, { phone: payload.booking.hostPhone }));
    }

    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    if (payload.booking?.meetLink) action(actions, S.confirmed.meet, true, undefined, payload.booking.meetLink);
    if (payload.cancelUrl) {
      if (payload.manageUrl) action(actions, S.confirmed.reschedule, !payload.booking?.meetLink, undefined, payload.manageUrl);
      action(actions, S.confirmed.cancel, false, undefined, payload.cancelUrl);
    } else if (payload.manageUrl) action(actions, S.confirmed.manage, !payload.booking?.meetLink, undefined, payload.manageUrl);
    show('done');
    track('call_booked', { type: chosen!.slug, minutes: chosen!.durationMinutes, location: payload.booking?.location ?? '' });
  }

  function renderFailed(code: string, retryAfterSeconds: number | null) {
    const why =
      code === 'slot_taken' ? S.failed.slotTaken
      : code === 'calendar_unavailable' ? S.failed.calendar
      : code === 'rate_limited' ? S.failed.rateLimited
      : code === 'forbidden' ? S.failed.forbidden
      : S.failed.generic;
    const panel = resultPanel(true, GLYPH.alert, S.failed.heading, why);
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    statusLine(status, GLYPH.calendar, S.failed.nothingReserved, true);
    if (code === 'rate_limited' && retryAfterSeconds) {
      statusLine(status, GLYPH.alert, fill(S.failed.rateLimitedWait, { minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) }), true);
    }
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    if (code === 'slot_taken') {
      action(actions, S.failed.pickAnother, true, async () => { slot = null; writeHash(); show('date'); await loadMonth(); if (date && days[date]?.length) { show('time'); renderSlots(); } });
    } else {
      action(actions, S.failed.tryAgain, true, () => { show('details'); refreshSubmit(); });
    }
    show('done');
    track('booking_failed', { type: chosen!.slug, reason: code });
  }

  // ---- wiring -------------------------------------------------------------

  root.querySelectorAll<HTMLButtonElement>('.bk-nav').forEach((button) => {
    button.addEventListener('click', () => { month = shiftMonth(Number(button.dataset.month)); loadMonth(); });
  });

  stub.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => {
      let target = button.dataset.goto as Step;
      if (MANAGE && target === 'type') target = 'manage';
      if (target === 'manage') { date = ''; slot = null; }
      if (target === 'type') { chosen = null; date = ''; slot = null; }
      if (target === 'date') { date = ''; slot = null; renderGrid(); renderDatebook(); }
      if (target === 'time') { slot = null; }
      show(target);
      writeHash();
    });
  });

  async function applyState(state: Record<string, string>) {
    // No zone in the entry means the browser's own; a zone that changed
    // invalidates the grouping, so the month is loaded again below.
    const target = (state.tz && canonicalZone(state.tz)) || detectedZone;
    const zoneChanged = target !== zone;
    zone = target; zoneChosen = Boolean(state.tz);
    if (MANAGE) { await applyManageState(state, zoneChanged); return; }
    if (!state.type) { chosen = null; date = ''; slot = null; show('type'); renderStub(); return; }
    let found = types.find((candidate) => candidate.slug === state.type);
    if (!found) {
      // A direct link to a type the list does not show.
      try {
        const response = await fetch(`/api/booking/types?locale=${LOCALE}&slug=${encodeURIComponent(state.type)}`);
        if (response.ok) found = ((await response.json()).types as EventType[])[0];
      } catch { /* treated as unknown below */ }
    }
    if (!found) { show('type'); return; }
    const sameMonth = chosen?.slug === found.slug && month === (state.date ? state.date.slice(0, 7) : month);
    chosen = found; slot = null; date = '';
    if (!sameMonth || zoneChanged || Object.keys(days).length === 0) {
      month = state.date ? state.date.slice(0, 7) : todayKey().slice(0, 7);
      show('date');
      await loadMonth();
    } else {
      show('date');
    }
    if (!state.date || (days[state.date] || []).length === 0) return;
    date = state.date;
    renderGrid(); renderDatebook();
    show('time'); renderSlots();
    const wanted = (days[date] || []).find((candidate) => candidate.startUTC === state.slot);
    if (!wanted) return;
    slot = wanted;
    show('details'); renderForm();
  }

  // ---- the manage page ----------------------------------------------------
  // Same calendar and times, then a confirmation instead of a form. The link
  // in the invite carries the id and token in its fragment; they are moved to
  // session storage and stripped before anything else can read the URL.

  const M = S.manage ?? {};
  const manageHeaders = () => ({ 'x-manage-token': manageToken, 'content-type': 'application/json' });
  const manageEndpoint = () => `/api/booking/bookings/${encodeURIComponent(manageId)}?locale=${LOCALE}`;
  const recipients = (list: string[]) => {
    const others = list.length - 1;
    const tail = others === 1 ? ` ${S.confirmed.inviteGuest}` : others > 1 ? ` ${fill(S.confirmed.inviteGuests, { n: others })}` : '';
    return `${list[0] ?? ''}${tail}`;
  };
  const whenFacts = (list: HTMLElement, startUTC: string) => {
    fact(list, S.steps.date, fmtDay(localDate(startUTC)));
    fact(list, S.steps.time, fmtTime(startUTC), true, zoneLabel());
  };

  function readManageLink(): { id: string; token: string; action: string } | null {
    const fragment = readHash();
    if (fragment.id && fragment.token) {
      try { sessionStorage.setItem('bk.manage', JSON.stringify({ id: fragment.id, token: fragment.token })); } catch { /* private mode: the page still works for this load */ }
      // Off the URL before analytics, the referrer or a screenshot can see it.
      history.replaceState(null, '', location.pathname + location.search);
      return { id: fragment.id, token: fragment.token, action: fragment.action ?? '' };
    }
    try {
      const stored = JSON.parse(sessionStorage.getItem('bk.manage') || 'null');
      if (stored?.id && stored?.token) return { id: stored.id, token: stored.token, action: '' };
    } catch { /* nothing stored */ }
    return null;
  }

  function renderManage() {
    const b = booking!;
    const cancelled = b.status === 'cancelled';
    const panel = resultPanel(cancelled, cancelled ? GLYPH.alert : GLYPH.calendar, cancelled ? M.cancelledHeading : M.heading, cancelled ? M.cancelledLead : M.lead, 'manage');
    const facts = panel.querySelector<HTMLElement>('.bk-ticket-facts')!;
    fact(facts, S.steps.type, `${b.type.name}, ${fmtDuration(b.type.durationMinutes)}`);
    whenFacts(facts, b.startUTC);
    fact(facts, S.form.location, b.location === 'phone' && b.hostPhone ? fill(S.confirmed.ring, { phone: b.hostPhone }) : S.locations[b.location] ?? b.location);
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    if (cancelled) { action(actions, M.bookAnother, true, undefined, BOOK_URL); return; }
    action(actions, M.move, true, async () => {
      date = ''; slot = null; month = todayKey().slice(0, 7);
      show('date'); writeHash();
      await loadMonth();
    });
    action(actions, M.cancel, false, () => { renderCancel(); show('cancel'); writeHash(); });
    if (b.meetLink) action(actions, S.confirmed.meet, false, undefined, b.meetLink);
  }

  function renderCancel() {
    const b = booking!;
    const panel = resultPanel(true, GLYPH.alert, M.cancelTitle, M.cancelLead, 'cancel');
    whenFacts(panel.querySelector<HTMLElement>('.bk-ticket-facts')!, b.startUTC);
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    statusLine(status, GLYPH.calendar, M.willRemove, true);
    statusLine(status, GLYPH.mail, fill(M.willTell, { email: recipients([b.email, ...b.guests]) }), true);
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    action(actions, M.confirmCancel, true, () => doCancel());
    action(actions, M.keep, false, () => { show('manage'); writeHash(); });
  }

  function renderConfirm() {
    const b = booking!;
    const panel = resultPanel(false, GLYPH.calendar, M.confirmTitle, M.confirmLead, 'confirm');
    const facts = panel.querySelector<HTMLElement>('.bk-ticket-facts')!;
    fact(facts, M.from, `${fmtDay(localDate(b.startUTC))}, ${fmtTime(b.startUTC)}`);
    fact(facts, M.to, `${fmtDay(date)}, ${fmtTime(slot!.startUTC)}`, true, zoneLabel());
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    statusLine(status, GLYPH.calendar, M.willUpdate);
    statusLine(status, GLYPH.mail, fill(M.willTell, { email: recipients([b.email, ...b.guests]) }));
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    action(actions, M.confirmMove, true, () => doMove());
    action(actions, M.pickAnother, false, () => { slot = null; writeHash(); show('time'); });
  }

  /** Busy state for whichever action button is doing the work. */
  function busyActions(step: Step, busy: boolean, label?: string) {
    panels.get(step)!.querySelectorAll<HTMLButtonElement>('.bk-done-actions button').forEach((button) => {
      button.disabled = busy;
      if (busy && label && button.classList.contains('is-primary')) button.textContent = label;
    });
  }

  async function doCancel() {
    busyActions('cancel', true, M.cancelling);
    let response: Response;
    try { response = await fetch(manageEndpoint(), { method: 'DELETE', headers: manageHeaders() }); }
    catch { busyActions('cancel', false); renderManageFailed('generic', null, 'cancel'); return; }
    const payload = await response.json().catch(() => ({}));
    busyActions('cancel', false);
    if (!response.ok) { renderManageFailed(String(payload.error || 'generic'), Number(response.headers.get('retry-after') || '') || null, 'cancel'); return; }
    booking = payload.booking;
    doneHint = M.cancelledHeading;
    const panel = resultPanel(false, GLYPH.check, M.cancelledHeading, M.cancelledDone);
    whenFacts(panel.querySelector<HTMLElement>('.bk-ticket-facts')!, booking!.startUTC);
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    if (payload.calendar?.eventRemoved) statusLine(status, GLYPH.calendar, M.removed);
    if (payload.calendar?.alreadyCancelled) statusLine(status, GLYPH.calendar, M.alreadyCancelled);
    if (payload.calendar?.updatesSentTo?.length) statusLine(status, GLYPH.mail, fill(M.told, { email: recipients(payload.calendar.updatesSentTo) }));
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    action(actions, M.bookAnother, true, undefined, BOOK_URL);
    action(actions, S.confirmed.home, false, undefined, HOME);
    date = ''; slot = null;
    show('done'); writeHash();
    track('booking_cancelled', { type: booking!.type.slug });
  }

  async function doMove() {
    busyActions('confirm', true, M.moving);
    const body = { startUTC: slot!.startUTC, timezone: zone };
    let response: Response;
    try { response = await fetch(manageEndpoint(), { method: 'PATCH', headers: manageHeaders(), body: JSON.stringify(body) }); }
    catch { busyActions('confirm', false); renderManageFailed('generic', null, 'confirm'); return; }
    const payload = await response.json().catch(() => ({}));
    busyActions('confirm', false);
    if (!response.ok) { renderManageFailed(String(payload.error || 'generic'), Number(response.headers.get('retry-after') || '') || null, 'confirm'); return; }
    booking = payload.booking;
    doneHint = M.movedHeading;
    const panel = resultPanel(false, GLYPH.check, M.movedHeading, M.movedDone);
    whenFacts(panel.querySelector<HTMLElement>('.bk-ticket-facts')!, booking!.startUTC);
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    if (payload.calendar?.eventUpdated) statusLine(status, GLYPH.calendar, M.updated);
    if (payload.calendar?.updatesSentTo?.length) statusLine(status, GLYPH.mail, fill(M.told, { email: recipients(payload.calendar.updatesSentTo) }));
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    if (booking!.meetLink) action(actions, S.confirmed.meet, true, undefined, booking!.meetLink);
    action(actions, S.confirmed.home, !booking!.meetLink, undefined, HOME);
    date = ''; slot = null;
    show('done'); writeHash();
    track('booking_moved', { type: booking!.type.slug });
  }

  /** A failure on the manage page: what did not happen, and the one way on. */
  function renderManageFailed(code: string, retryAfterSeconds: number | null, from: Step) {
    const why =
      code === 'slot_taken' ? S.failed.slotTaken
      : code === 'calendar_unavailable' ? S.failed.calendar
      : code === 'rate_limited' ? S.failed.rateLimited
      : code === 'not_found' ? M.badLink
      : S.failed.generic;
    doneHint = M.nothingChanged;
    const panel = resultPanel(true, GLYPH.alert, M.nothingChanged, why);
    const status = panel.querySelector<HTMLElement>('.bk-ticket-status')!;
    statusLine(status, GLYPH.calendar, M.stillBooked, true);
    if (code === 'rate_limited' && retryAfterSeconds) {
      statusLine(status, GLYPH.alert, fill(S.failed.rateLimitedWait, { minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) }), true);
    }
    const actions = panel.querySelector<HTMLElement>('.bk-done-actions')!;
    if (code === 'not_found') action(actions, M.bookAnother, true, undefined, BOOK_URL);
    else if (code === 'slot_taken') action(actions, S.failed.pickAnother, true, async () => { slot = null; writeHash(); show('date'); await loadMonth(); if (date && days[date]?.length) { show('time'); renderSlots(); } });
    else action(actions, S.failed.tryAgain, true, () => { if (from === 'cancel') renderCancel(); else renderConfirm(); show(from); });
    show('done');
    track('booking_manage_failed', { reason: code });
  }

  async function applyManageState(state: Record<string, string>, zoneChanged: boolean) {
    if (!booking || booking.status === 'cancelled') { renderManage(); show('manage'); return; }
    const step = state.step ?? 'manage';
    if (step === 'cancel') { renderCancel(); show('cancel'); return; }
    if (step !== 'date' && step !== 'time' && step !== 'confirm') { renderManage(); show('manage'); return; }
    const wantedMonth = state.date ? state.date.slice(0, 7) : todayKey().slice(0, 7);
    slot = null; date = '';
    if (month !== wantedMonth || zoneChanged || Object.keys(days).length === 0) {
      month = wantedMonth;
      show('date');
      await loadMonth();
    } else {
      show('date');
    }
    if (!state.date || (days[state.date] || []).length === 0) return;
    date = state.date;
    renderGrid(); renderDatebook();
    show('time'); renderSlots();
    const wanted = (days[date] || []).find((candidate) => candidate.startUTC === state.slot);
    if (!wanted || step !== 'confirm') return;
    slot = wanted;
    renderConfirm(); show('confirm');
  }

  async function bootManage() {
    const link = readManageLink();
    if (!link) { renderManageFailed('not_found', null, 'manage'); return; }
    manageId = link.id; manageToken = link.token;
    say(S.calendar.loading);
    let response: Response;
    try { response = await fetch(manageEndpoint(), { headers: manageHeaders() }); }
    catch { say(S.errors.generic, () => bootManage()); return; }
    if (response.status === 404) { say(''); renderManageFailed('not_found', null, 'manage'); return; }
    if (!response.ok) { say(S.errors.generic, () => bootManage()); return; }
    say('');
    booking = (await response.json()).booking as Managed;
    chosen = { slug: booking.type.slug, name: booking.type.name, description: '', durationMinutes: booking.type.durationMinutes, locations: booking.type.locations };
    renderManage();
    const state = readHash();
    if (link.action === 'cancel') state.step = 'cancel';
    else if (link.action === 'reschedule') state.step = 'date';
    await applyState(state);
    if (link.action) writeHash();
  }

  window.addEventListener('popstate', () => { applyState(readHash()); });
  // Phones fold the intro away under the booking; wide screens always show it.
  const about = document.querySelector<HTMLDetailsElement>('.bk-about');
  const wide = matchMedia('(min-width: 900px)');
  const foldAbout = () => { if (about) about.open = wide.matches; };
  if (about && !wide.matches) about.open = false;
  wide.addEventListener('change', foldAbout);
  if (MANAGE) bootManage();
  else loadTypes().then(() => applyState(readHash()));
}
