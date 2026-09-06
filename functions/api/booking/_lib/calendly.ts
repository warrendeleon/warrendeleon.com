// Calendly as a booking provider, for the event types whose organiser has to
// be the News UK account. That calendar admits only Calendly's approved
// client, so this app never touches it: Calendly computes the free times and
// creates the meeting, and from then on the invite, the reschedule and the
// cancel are Calendly's. The page is the same either way.

const API = 'https://api.calendly.com';
/** Calendly refuses an available-times range longer than this. */
const MAX_RANGE_MS = 31 * 24 * 60 * 60_000;

export class CalendlyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CalendlyError';
    this.status = status;
  }
}

type Fetcher = typeof fetch;
const globalFetch: Fetcher = (input, init) => fetch(input, init);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class CalendlyClient {
  private readonly token: string;
  private readonly fetchImpl: Fetcher;

  constructor(token: string, fetchImpl: Fetcher = globalFetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      });
    } catch (cause) {
      throw new CalendlyError(0, `Calendly unreachable: ${String(cause)}`);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(body) && typeof body.message === 'string' ? body.message : `Calendly answered ${response.status}`;
      throw new CalendlyError(response.status, message);
    }
    return body;
  }

  /**
   * Start instants Calendly will accept for an event type between two
   * instants, in ranges of at most 31 days. The times are the whole answer:
   * Calendly has already applied the seat's hours, its buffers and both
   * connected calendars.
   */
  async availableTimes(eventTypeUri: string, from: Date, to: Date): Promise<string[]> {
    const starts: string[] = [];
    for (let cursor = from.getTime(); cursor < to.getTime(); cursor += MAX_RANGE_MS) {
      const end = Math.min(cursor + MAX_RANGE_MS, to.getTime());
      const query = new URLSearchParams({
        event_type: eventTypeUri,
        start_time: new Date(cursor).toISOString(),
        end_time: new Date(end).toISOString(),
      });
      const body = await this.call(`/event_type_available_times?${query}`);
      const collection = isRecord(body) && Array.isArray(body.collection) ? body.collection : [];
      for (const item of collection) {
        if (isRecord(item) && item.status === 'available' && typeof item.start_time === 'string') {
          starts.push(new Date(Date.parse(item.start_time)).toISOString());
        }
      }
    }
    return starts.sort();
  }

  /** Book it. Calendly emails the invite and owns the meeting from here on. */
  async createInvitee(input: {
    eventTypeUri: string;
    startUTC: string;
    firstName: string;
    lastName: string;
    email: string;
    timezone: string;
    guests: string[];
    answer?: { question: string; answer: string } | null;
    /** Calendly insists on the kind even when the type has only one: e.g. google_conference. */
    locationKind?: string | null;
  }): Promise<{ inviteeUri: string; eventUri: string; cancelUrl: string; rescheduleUrl: string }> {
    const payload: Record<string, unknown> = {
      event_type: input.eventTypeUri,
      start_time: input.startUTC,
      invitee: { first_name: input.firstName, last_name: input.lastName, email: input.email, timezone: input.timezone },
    };
    if (input.locationKind) payload.location = { kind: input.locationKind };
    if (input.guests.length > 0) payload.event_guests = input.guests;
    if (input.answer) payload.questions_and_answers = [{ question: input.answer.question, answer: input.answer.answer, position: 0 }];

    const body = await this.call('/invitees', { method: 'POST', body: JSON.stringify(payload) });
    const resource = isRecord(body) && isRecord(body.resource) ? body.resource : null;
    if (!resource || typeof resource.uri !== 'string') throw new CalendlyError(502, 'Calendly answered without an invitee');
    const text = (key: string) => (typeof resource[key] === 'string' ? (resource[key] as string) : '');
    return { inviteeUri: resource.uri, eventUri: text('event'), cancelUrl: text('cancel_url'), rescheduleUrl: text('reschedule_url') };
  }
}
