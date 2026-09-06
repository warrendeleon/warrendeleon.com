// Small helpers shared by every booking route. Six routes do not justify a
// router dependency, and JSON responses want the same headers every time.

export interface Env {
  BOOKING_DB: D1Database;
  /** Google OAuth client shared by every connected account. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Base64 32-byte AES-GCM key wrapping refresh tokens at rest in D1. */
  TOKEN_KEY: string;
  /** Turnstile server-side secret. */
  TURNSTILE_SECRET: string;
  /** Shared secret the admin container presents on /admin routes. */
  ADMIN_KEY: string;
  /**
   * The number a booker rings for a phone call. It goes on the invite as the
   * event location. Held as a secret only to keep it out of a public repo.
   */
  HOST_PHONE?: string;
}

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // The booking API is same-origin with the page, so nothing may cache a
  // per-visitor availability answer at the edge or in a shared proxy.
  'cache-control': 'no-store',
} as const;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export type ErrorCode =
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'slot_taken'
  | 'rate_limited'
  | 'calendar_unavailable'
  | 'internal';

const STATUS_FOR: Record<ErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  slot_taken: 409,
  rate_limited: 429,
  calendar_unavailable: 502,
  internal: 500,
};

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  /** Field-level messages the booking form renders next to its inputs. */
  fields?: Record<string, string>;
}

export function fail(
  error: ErrorCode,
  message: string,
  extra: { fields?: Record<string, string>; headers?: HeadersInit } = {},
): Response {
  const body: ErrorBody = { error, message };
  if (extra.fields) body.fields = extra.fields;
  return json(body, STATUS_FOR[error], extra.headers ?? {});
}

/**
 * Compare two secrets without leaking their similarity through timing. Used for
 * the manage token and the admin key, where an attacker controls one side.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

/** Guard for the /admin routes, which only the admin container ever calls. */
export function isAdmin(request: Request, env: Env): boolean {
  const presented = request.headers.get('x-admin-key');
  if (!presented || !env.ADMIN_KEY) return false;
  return safeEqual(presented, env.ADMIN_KEY);
}

/** Mask an address for logs and audit rows: "wa…n@example.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0]}…${domain}`;
  return `${name[0]}…${name[name.length - 1]}${domain}`;
}
