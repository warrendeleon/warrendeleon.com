// Every /api/booking/* request enters here. Pages Functions gives us one
// catch-all per directory, which suits a hand-rolled router: the whole surface
// is a handful of routes and a dependency would earn nothing.

import { fail, isAdmin, json, type Env } from './_lib/http.ts';

interface RouteContext {
  request: Request;
  env: Env;
  /** Path segments after /api/booking, e.g. ["bookings", "<id>"]. */
  segments: string[];
}

type Handler = (context: RouteContext) => Promise<Response>;

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
  let accounts: { email: string; status: string; check_busy: number }[];
  try {
    const result = await env.BOOKING_DB.prepare(
      'SELECT email, status, check_busy FROM calendar_accounts ORDER BY email',
    ).all<{ email: string; status: string; check_busy: number }>();
    accounts = result.results ?? [];
  } catch (cause) {
    console.error('[booking] health: database unreachable', cause);
    return json({ status: 'error', reason: 'database_unreachable' }, 503);
  }

  const broken = accounts.filter((account) => account.status !== 'ok').map((a) => a.email);
  const connected = accounts.length;

  if (connected === 0) {
    return json({ status: 'error', reason: 'no_calendar_connected', connected: 0 }, 503);
  }
  if (broken.length > 0) {
    return json({ status: 'error', reason: 'needs_reconnect', accounts: broken }, 503);
  }
  return json({ status: 'ok', connected });
};

const notImplemented: Handler = async () =>
  fail('not_found', 'This route is not built yet.');

function route({ request, segments }: RouteContext): Handler | null {
  const [head] = segments;
  const method = request.method.toUpperCase();

  if (segments.length === 1 && head === 'health' && method === 'GET') return health;

  // Declared so the shape of the API is visible in one place. Each lands with
  // its own ticket; until then they answer 404 rather than pretending.
  const planned = ['types', 'availability', 'bookings', 'admin'];
  if (head !== undefined && planned.includes(head)) return notImplemented;

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

  const handler = route({ request, env, segments });
  if (!handler) return fail('not_found', 'No such booking route.');

  if (segments[0] === 'admin' && !isAdmin(request, env)) {
    return fail('forbidden', 'Admin key missing or wrong.');
  }

  try {
    return await handler({ request, env, segments });
  } catch (cause) {
    // Never leak an internal message to a booker; the detail goes to the log.
    console.error('[booking] unhandled error', url.pathname, cause);
    return fail('internal', 'Something went wrong. Please try again.');
  }
};
