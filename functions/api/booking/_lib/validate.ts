// Request validation for the booking form.
//
// Hand-rolled rather than schema-driven: the shape is small, and the form wants
// per-field messages back, which is most of what a schema library would give us
// here anyway.

export interface BookingRequest {
  type: string;
  startUTC: string;
  location: 'video' | 'phone';
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  timezone: string;
  notes: string | null;
  turnstileToken: string;
  utm: Partial<Record<'source' | 'medium' | 'campaign' | 'content', string>>;
}

export interface ValidationResult {
  value: BookingRequest | null;
  fields: Record<string, string>;
  /** A filled honeypot: answer as though it worked, write nothing. */
  trapped: boolean;
}

export const LIMITS = {
  name: 100,
  email: 254,
  phone: 32,
  notes: 2000,
  timezone: 64,
  utm: 100,
} as const;

// Deliberately permissive: the only thing worth rejecting is an address the
// invite could never reach. Anything cleverer rejects real people.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const E164_PATTERN = /^\+?[0-9][0-9\s().-]{6,}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** IANA zones the runtime actually knows; anything else falls back to UTC. */
export function knownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function validateBooking(
  body: unknown,
  allowedLocations: readonly string[],
): ValidationResult {
  const fields: Record<string, string> = {};
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  // The honeypot is a hidden field no person ever fills. Reported as trapped so
  // the caller can answer 200 and tell the bot nothing.
  if (text(input.nickname).length > 0) {
    return { value: null, fields: {}, trapped: true };
  }

  const type = text(input.type);
  if (!type) fields.type = 'required';

  const startUTC = text(input.startUTC);
  const startsAt = Date.parse(startUTC);
  if (!startUTC) fields.startUTC = 'required';
  else if (Number.isNaN(startsAt)) fields.startUTC = 'invalid';

  const location = text(input.location);
  if (!location) fields.location = 'required';
  else if (!allowedLocations.includes(location)) fields.location = 'unavailable';

  const firstName = clamp(text(input.firstName), LIMITS.name);
  if (!firstName) fields.firstName = 'required';

  const lastName = clamp(text(input.lastName), LIMITS.name);
  if (!lastName) fields.lastName = 'required';

  const email = clamp(text(input.email), LIMITS.email);
  if (!email) fields.email = 'required';
  else if (!EMAIL_PATTERN.test(email)) fields.email = 'invalid';

  const phone = clamp(text(input.phone), LIMITS.phone);
  if (location === 'phone') {
    if (!phone) fields.phone = 'required';
    else if (!E164_PATTERN.test(phone)) fields.phone = 'invalid';
  }

  const rawTimezone = clamp(text(input.timezone), LIMITS.timezone);
  const timezone = rawTimezone && knownTimezone(rawTimezone) ? rawTimezone : 'UTC';

  const turnstileToken = text(input.turnstileToken);
  if (!turnstileToken) fields.turnstileToken = 'required';

  const utmInput = (typeof input.utm === 'object' && input.utm !== null ? input.utm : {}) as Record<string, unknown>;
  const utm: BookingRequest['utm'] = {};
  for (const key of ['source', 'medium', 'campaign', 'content'] as const) {
    const value = clamp(text(utmInput[key]), LIMITS.utm);
    if (value) utm[key] = value;
  }

  if (Object.keys(fields).length > 0) return { value: null, fields, trapped: false };

  return {
    value: {
      type,
      startUTC: new Date(startsAt).toISOString(),
      location: location as 'video' | 'phone',
      firstName,
      lastName,
      email,
      phone: phone || null,
      timezone,
      notes: clamp(text(input.notes), LIMITS.notes) || null,
      turnstileToken,
      utm,
    },
    fields: {},
    trapped: false,
  };
}

/**
 * Ask Cloudflare whether the visitor solved the challenge. A failure to reach
 * Turnstile is treated as a failed check: the alternative is an open door.
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<boolean> {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    return typeof payload === 'object' && payload !== null && (payload as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}
