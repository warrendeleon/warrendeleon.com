// Every /api/booking/* request enters here. Pages Functions gives us one
// catch-all per directory, which suits a hand-rolled router: the whole surface
// is a handful of routes and a dependency would earn nothing.

import { bookableMonths, monthAvailability, monthWindow } from './_lib/availability.ts';
import { CalendlyClient, CalendlyError } from './_lib/calendly.ts';
import { dateKey } from './_lib/slots.ts';
import { createBooking } from './_lib/create.ts';
import { CalendarAuthError, CalendarUnavailableError, mergedBusy } from './_lib/google.ts';
import { fail, isAdmin, json, type Env } from './_lib/http.ts';
import { manageBooking } from './_lib/manage.ts';
import { ensureChannels, knownChannelToken, reconcile } from './_lib/sync.ts';
import { datesIn } from './_lib/availability.ts';
import {
  busyClients,
  bookedByDate,
  getEventType,
  getSchedule,
  listAccounts,
  listEventTypes,
  localised,
  markNeedsReconnect,
} from './_lib/store.ts';

interface RouteContext {
  request: Request;
  env: Env;
  url: URL;
  /** Path segments after /api/booking, e.g. ["bookings", "<id>"]. */
  segments: string[];
}

type Handler = (context: RouteContext) => Promise<Response>;

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Liveness for the whole booking path, polled by Uptime Kuma and by the admin
 * container's alert loop.
 *
 * Answers 503 as soon as any connected calendar needs reconnecting. That is
 * deliberate: with a dead token the availability query fails closed and the
 * page shows no slots, which looks identical to a quiet diary. The alarm is the
 * only thing that tells the difference.
 */
const health: Handler = async ({ env }) => {
  let accounts;
  try {
    accounts = await listAccounts(env);
  } catch (cause) {
    console.error('[booking] health: database unreachable', cause);
    return json({ status: 'error', reason: 'database_unreachable' }, 503);
  }

  const broken = accounts.filter((account) => account.status !== 'ok').map((a) => a.email);
  if (accounts.length === 0) {
    return json({ status: 'error', reason: 'no_calendar_connected', connected: 0 }, 503);
  }
  if (broken.length > 0) {
    return json({ status: 'error', reason: 'needs_reconnect', accounts: broken }, 503);
  }
  return json({ status: 'ok', connected: accounts.length });
};

/**
 * The event types the landing page lists. Unlisted types are deliberately
 * absent: they exist only for whoever holds the direct link.
 */
const types: Handler = async ({ env, url }) => {
  const locale = url.searchParams.get('locale') ?? 'en';
  // A direct link to an unlisted type asks for it by slug; it is answered on
  // its own and never appears in the list.
  const slug = url.searchParams.get('slug');
  const one = slug ? await getEventType(env, slug) : null;
  const all = one ? [one] : await listEventTypes(env);
  return json({
    types: all.map((type) => ({
      slug: type.slug,
      name: localised(type.names, locale),
      description: localised(type.descriptions, locale),
      durationMinutes: type.durationMinutes,
      locations: type.locations,
      question: localised(type.question, locale) || null,
      questionRequired: type.questionRequired,
    })),
  });
};

/**
 * A month of bookable slots for one event type.
 *
 * Any calendar failure answers 503 rather than an empty month. Returning "no
 * slots" would be a lie a booker cannot see through, and it would quietly lose
 * the enquiry.
 */
const availability: Handler = async ({ env, url }) => {
  const slug = url.searchParams.get('type');
  const month = url.searchParams.get('month');

  if (!slug) return fail('bad_request', 'A type is required.', { fields: { type: 'required' } });
  if (!month || !MONTH_PATTERN.test(month)) {
    return fail('bad_request', 'A month in the form YYYY-MM is required.', { fields: { month: 'invalid' } });
  }

  const eventType = await getEventType(env, slug);
  if (!eventType) return fail('not_found', 'No such event type.');

  const schedule = await getSchedule(env, eventType.scheduleId);
  if (!schedule) {
    console.error('[booking] event type', slug, 'points at missing schedule', eventType.scheduleId);
    return fail('internal', 'This event type is misconfigured.');
  }

  const now = Date.now();
  if (!bookableMonths(now, schedule.timezone, eventType.rules.daysAheadLimit).includes(month)) {
    return json({ month, timezone: schedule.timezone, days: {} });
  }

  // A Calendly-provided type: Calendly's answer is the whole answer, grouped
  // by the schedule's dates like the Google one so the page cannot tell.
  if (eventType.provider === 'calendly') {
    if (!env.CALENDLY_TOKEN || !eventType.calendlyEventType) {
      console.error('[booking] availability: calendly type without token or event type uri', slug);
      return fail('calendar_unavailable', 'Availability is temporarily unavailable. Please try again shortly.');
    }
    const { timeMin, timeMax } = monthWindow(month, schedule.timezone);
    const from = new Date(Math.max(Date.parse(timeMin), now + 60_000));
    const to = new Date(timeMax);
    let starts: string[] = [];
    try {
      if (from < to) starts = await new CalendlyClient(env.CALENDLY_TOKEN).availableTimes(eventType.calendlyEventType, from, to);
    } catch (cause) {
      console.error('[booking] availability: calendly failed', cause instanceof CalendlyError ? `${cause.status} ${cause.message}` : cause);
      return fail('calendar_unavailable', 'Availability is temporarily unavailable. Please try again shortly.');
    }
    const days: Record<string, { startUTC: string; endUTC: string }[]> = {};
    const duration = eventType.durationMinutes * 60_000;
    for (const startUTC of starts) {
      const key = dateKey(Date.parse(startUTC), schedule.timezone);
      if (!key.startsWith(month)) continue;
      (days[key] ??= []).push({ startUTC, endUTC: new Date(Date.parse(startUTC) + duration).toISOString() });
    }
    return json({ month, timezone: schedule.timezone, days });
  }

  const accounts = await listAccounts(env);
  const clients = await busyClients(env, accounts);
  const { timeMin, timeMax } = monthWindow(month, schedule.timezone);

  let busy;
  try {
    busy = await mergedBusy(clients, timeMin, timeMax);
  } catch (cause) {
    if (cause instanceof CalendarAuthError) {
      // Record it so the health route alarms, then refuse to guess.
      await markNeedsReconnect(env, cause.account, cause.reason);
      console.error('[booking] availability: account needs reconnecting', cause.account);
    } else if (cause instanceof CalendarUnavailableError) {
      console.error('[booking] availability: calendar unavailable', cause.account, cause.detail);
    } else {
      console.error('[booking] availability: unexpected calendar failure', cause);
    }
    return fail('calendar_unavailable', 'Availability is temporarily unavailable. Please try again shortly.');
  }

  const dates = datesIn(month);
  const counts = await bookedByDate(env, dates[0]!, dates[dates.length - 1]!);

  return json(
    monthAvailability({
      month,
      schedule,
      rules: eventType.rules,
      busy,
      bookedByDate: counts,
      now,
    }),
  );
};

const create: Handler = async ({ request, env, url }) => createBooking(request, env, env.SITE_ORIGIN?.replace(/\/$/, '') || url.origin);

/** Read, move or cancel one booking. The manage token travels in a header. */
const manage: Handler = async ({ request, env, segments }) => manageBooking(request, env, segments[1]!);

/**
 * Bring the rows in line with the calendar and keep the push channels alive.
 * Called by the mini PC on a timer, and by hand after any edit made in the
 * calendar itself. Admin-key gated by the router.
 */
const adminSync: Handler = async ({ env, url }) => {
  const origin = env.SITE_ORIGIN?.replace(/\/$/, '') || url.origin;
  const channels = await ensureChannels(env, `${origin}/api/booking/webhooks/google`);
  const report = await reconcile(env);
  return json({ ...report, channelsRenewed: channels });
};

/**
 * Google's push notification. It carries no event data, only "something
 * changed", so the answer is a full reconcile. The channel token proves the
 * call came from a channel this app opened; anything else is ignored with a
 * 200, because Google retries anything it takes for a failure.
 */
const googleWebhook: Handler = async ({ request, env }) => {
  const state = request.headers.get('x-goog-resource-state');
  if (!(await knownChannelToken(env, request.headers.get('x-goog-channel-token')))) {
    console.warn('[booking] webhook: unknown channel token ignored');
    return new Response(null, { status: 200 });
  }
  if (state === 'sync') return new Response(null, { status: 200 });
  const report = await reconcile(env);
  if (report.cancelled.length || report.moved.length || report.stuck.length) console.log('[booking] webhook reconcile', JSON.stringify(report));
  return new Response(null, { status: 200 });
};

const notImplemented: Handler = async () => fail('not_found', 'This route is not built yet.');

function route({ request, segments }: RouteContext): Handler | null {
  const [head] = segments;
  const method = request.method.toUpperCase();

  if (segments.length === 1 && method === 'GET') {
    if (head === 'health') return health;
    if (head === 'types') return types;
    if (head === 'availability') return availability;
  }

  if (segments.length === 1 && head === 'bookings' && method === 'POST') return create;
  if (segments.length === 2 && head === 'bookings' && ['GET', 'PATCH', 'DELETE'].includes(method)) return manage;

  if (segments.length === 2 && head === 'admin' && segments[1] === 'sync' && method === 'POST') return adminSync;
  if (segments.length === 2 && head === 'webhooks' && segments[1] === 'google' && method === 'POST') return googleWebhook;

  // Declared so the shape of the API is visible in one place. It lands with
  // its own ticket; until then it answers 404 rather than pretending.
  if (head === 'admin') return notImplemented;

  return null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/booking\/?/, '')
    .split('/')
    .filter((segment) => segment.length > 0);

  if (request.method === 'OPTIONS') {
    // Same-origin by design, so there is no CORS preflight to answer. Saying so
    // explicitly is cheaper than letting a stray request fall through to 404.
    return new Response(null, { status: 204, headers: { allow: 'GET, POST, PATCH, DELETE' } });
  }

  const routeContext: RouteContext = { request, env, url, segments };
  const handler = route(routeContext);
  if (!handler) return fail('not_found', 'No such booking route.');

  if (segments[0] === 'admin' && !isAdmin(request, env)) {
    return fail('forbidden', 'Admin key missing or wrong.');
  }

  try {
    return await handler(routeContext);
  } catch (cause) {
    // Never leak an internal message to a booker; the detail goes to the log.
    console.error('[booking] unhandled error', url.pathname, cause);
    return fail('internal', 'Something went wrong. Please try again.');
  }
};
