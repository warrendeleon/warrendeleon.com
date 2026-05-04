---
title: "PII-masking interceptors and a production-safe logger in React Native"
description: "Part 6 of the Supabase-without-the-SDK series: a logger and Sentry interceptor that strip tokens, emails, phone numbers, and credit card numbers from breadcrumbs before they leave the device. Field-name and regex-based masking, with tests."
publishDate: 2026-07-06
tags: ["react-native", "security", "logging", "sentry", "privacy"]
locale: en
heroImage: "/images/blog/pii-masking-rn.webp"
heroAlt: "PII-masking interceptors in React Native"
campaign: "pii-masking-rn"
relatedPosts: ["certificate-pinning-in-react-native", "building-an-axios-based-supabase-auth-client", "tiered-secure-storage-react-native"]
---

This is part 6 of the [Supabase-without-the-SDK series](/blog/building-a-supabase-rest-client-without-the-sdk/). The previous post covered [certificate pinning](/blog/certificate-pinning-in-react-native/), which protects the bytes on the wire. This post covers the bytes that *intentionally* leave the app: console logs, error reports, observability breadcrumbs, analytics events. By default, everything you log carries through whatever sensitive data was in the local variable scope at the time. Without a masking layer, the first remote-logging system you bolt on becomes a parallel database of every user's email, every Bearer token in flight, and every password the user ever typed into a form.

This post is the logger and the masking utility that prevent the most common leak paths. It uses Sentry as the worked example for the breadcrumb-scrubbing path, but the masker is SDK-agnostic; the same pattern applies to Crashlytics, Datadog, or any other off-device log sink.

> ⚠️ **What this post is and isn't.** This is a *risk reduction layer*, not a guarantee. Regex-based masking has false positives (it can over-redact strings that look like tokens but aren't) and false negatives (a 6-digit PIN with no surrounding context will pass through). Field-name masking depends on you adding new sensitive field names to the set as your schema grows. The right way to think about this layer: it catches the obvious mistakes that ship every week, not the subtle ones a determined attacker would dig for. Run a periodic audit of what's actually reaching Sentry.

Source: [`src/utils/logger.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/utils/logger.ts) and [`src/utils/logging/maskSensitiveData.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/utils/logging/maskSensitiveData.ts).

## What you're protecting against

Three concrete leak paths that PII masking closes:

**Off-device breadcrumbs.** Tools like Sentry, Crashlytics, and Datadog capture a rolling buffer of recent network calls, navigation events, and console logs. When an error fires, that buffer ships with the report. Without sanitisation, every Authorization header, every `{ email, password }` request body, and every error response containing a user's profile lands in your observability tool unredacted.

**Production console output.** React Native's `console.log` writes to the system log on iOS and logcat on Android. On a managed device, those logs are readable by IT. On a debug build sideloaded for review, they're readable by anyone with the IPA/APK and a bit of time.

**Crash report payloads.** Crash reporters attach the JS stack trace plus surrounding context. The arguments to a thrown error frequently include exactly the kind of objects your app was about to operate on, which is exactly the kind of object you didn't want logged.

The fix isn't "be careful what you log". The fix is a logger that's careful for you, and an interceptor on the way to Sentry that scrubs the payload one more time as a backstop.

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare or Expo)
- TypeScript with the standard RN Babel config
- Sentry React Native SDK if you want the Sentry integration (the masking utility itself is SDK-agnostic)
- Jest for unit tests

The masker has zero runtime dependencies beyond `Set` and `WeakSet`, so it works in any JS environment.

## The two-layer pattern

PII shows up in two shapes, and you need a strategy for each.

**Structured fields.** When you log `{ email: 'user@example.com', accessToken: 'eyJ...' }`, the field name tells you the value is sensitive. A field-name-based masker reads `email` and replaces the value, regardless of what the value happens to be.

**Embedded patterns.** When you log `Bearer eyJhbGciOiJIUzI1NiIs...` as a string, no field name carries the signal. A regex-based masker scans the string for known patterns (JWT tokens, email addresses, phone numbers, credit cards) and replaces the matches.

Either layer alone leaks something. Field-name masking alone misses tokens embedded in URLs (`?access_token=eyJ...`). Regex-only masking misses values that don't match any pattern (a 6-digit PIN doesn't look like anything in particular). Both layers together catch most things.

## The masking utility

```typescript
// src/utils/logging/maskSensitiveData.ts

const MASKED = {
  TOKEN: '[MASKED_TOKEN]',
  EMAIL: '[MASKED_EMAIL]',
  PASSWORD: '[MASKED]',
  PHONE: '[MASKED_PHONE]',
  ADDRESS: '[MASKED_ADDRESS]',
  CREDIT_CARD: '[MASKED_CARD]',
  SSN: '[MASKED_SSN]',
} as const;

const SENSITIVE_FIELDS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword', 'oldPassword',
  'secret', 'apiKey', 'apiSecret',
  'accessToken', 'refreshToken', 'token', 'authToken', 'bearerToken',
  'idToken', 'sessionToken',
  'pin', 'cvv', 'cvc', 'securityCode',
  'ssn', 'socialSecurityNumber', 'taxId',
  'creditCard', 'cardNumber', 'accountNumber',
]);

const EMAIL_FIELDS = new Set(['email', 'emailAddress', 'userEmail', 'contactEmail']);

const PHONE_FIELDS = new Set([
  'phone', 'phoneNumber', 'mobile', 'mobileNumber', 'telephone', 'cell', 'cellPhone',
]);

const ADDRESS_FIELDS = new Set([
  'address', 'streetAddress', 'street', 'addressLine1', 'addressLine2',
  'fullAddress', 'homeAddress', 'billingAddress', 'shippingAddress',
]);
```

Replacement strings are constants, not redaction characters or random masks. Constants make the masking pass visually obvious in logs (`[MASKED_TOKEN]` is unambiguous) and make assertions in tests trivial. They also signal in the log output that masking happened, which is useful when debugging an issue and you're trying to figure out whether a field was empty or redacted.

## Field-name masking

```typescript
const maskByFieldName = (fieldName: string, value: unknown): unknown => {
  const lower = fieldName.toLowerCase();

  for (const sensitive of SENSITIVE_FIELDS) {
    if (lower === sensitive.toLowerCase()) return MASKED.PASSWORD;
  }
  for (const email of EMAIL_FIELDS) {
    if (lower === email.toLowerCase()) return MASKED.EMAIL;
  }
  for (const phone of PHONE_FIELDS) {
    if (lower === phone.toLowerCase()) return MASKED.PHONE;
  }
  for (const address of ADDRESS_FIELDS) {
    if (lower === address.toLowerCase()) return MASKED.ADDRESS;
  }

  return value;
};
```

A case-insensitive lookup against four sets. Cheap, deterministic, easy to extend. When a new sensitive field shows up in your codebase, you add it to the appropriate set and every existing log call that touches it becomes safe immediately.

## Regex-based masking

```typescript
const PATTERNS = {
  // JWT tokens: header.payload.signature
  JWT: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,

  // Bearer tokens (full Authorization header)
  BEARER: /Bearer\s+[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*/gi,

  // Email addresses (RFC 5322 simplified)
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Password fields embedded in JSON strings
  PASSWORD_JSON:
    /"(password|newPassword|currentPassword|confirmPassword|oldPassword|secret|pin)":\s*"[^"]*"/gi,

  // UK phone numbers (+44 or 0 prefix)
  PHONE_UK: /(\+44\s?|0)(\d\s?){10,11}/g,

  // US phone numbers
  PHONE_US: /(\+1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,

  // International phone (catch-all, runs last)
  PHONE_INTL: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,

  // Credit card numbers (basic Luhn-shape match)
  CREDIT_CARD: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

  // US Social Security Number
  SSN: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  // UK National Insurance Number
  NI_NUMBER: /\b[A-Za-z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Za-z]\b/g,
} as const;

const maskString = (str: string): string => {
  let result = str;
  result = result.replace(PATTERNS.BEARER, `Bearer ${MASKED.TOKEN}`);
  result = result.replace(PATTERNS.JWT, MASKED.TOKEN);
  result = result.replace(PATTERNS.PASSWORD_JSON, match => {
    const fieldMatch = match.match(/"([^"]+)":/);
    const field = fieldMatch ? fieldMatch[1] : 'password';
    return `"${field}": "${MASKED.PASSWORD}"`;
  });
  result = result.replace(PATTERNS.EMAIL, MASKED.EMAIL);
  result = result.replace(PATTERNS.CREDIT_CARD, MASKED.CREDIT_CARD);
  result = result.replace(PATTERNS.SSN, MASKED.SSN);
  result = result.replace(PATTERNS.NI_NUMBER, MASKED.SSN);
  result = result.replace(PATTERNS.PHONE_INTL, MASKED.PHONE);
  result = result.replace(PATTERNS.PHONE_UK, MASKED.PHONE);
  result = result.replace(PATTERNS.PHONE_US, MASKED.PHONE);
  return result;
};
```

The order of replacements matters. `BEARER` runs before `JWT` because the bearer regex is more specific (it captures the `Bearer ` prefix and replaces the whole header rather than just the token suffix). Phone patterns run from most-specific to least-specific so a UK number isn't half-eaten by the US pattern.

> 💡 **Regexes that look right but aren't.** A naive email regex like `\S+@\S+` matches half of an SSH key. A JWT regex without the `eyJ` anchor matches base64 in arbitrary contexts. Anchor your patterns on something that's actually distinctive. JWTs always start with `eyJ` (the URL-safe base64 of `{"`), bearer tokens always have the `Bearer ` prefix, IBANs always start with two letters. The narrower the anchor, the fewer false positives.

> ⚠️ **Two patterns above will over-redact in production.** Be honest with yourself about whether you want them.
>
> - **`CREDIT_CARD`** matches any 16-digit number formatted in 4-4-4-4 groups. Tracking IDs, build numbers concatenated with timestamps, and certain UUID slices all get redacted as `[MASKED_CARD]`. The `// Luhn-shape match` comment is misleading: the regex is structural, not arithmetic. Real Luhn validation in regex is impractical. **If your app doesn't take card numbers, drop this pattern entirely.** It can only misfire.
> - **`PHONE_US`** has both leading groups optional, so it matches *any* 7-digit number with a separator in the middle. ISO timestamps with seconds, version strings like `1.20.3-beta`, Sentry event IDs sliced into groups of seven all get redacted. Either drop it (if your audience isn't US-first) or anchor the pattern to require the country code or area-code parens.
>
> Patterns that over-redact aren't safer; they hide signal in your logs and make Sentry less useful. The right framing for regex masking is "narrow patterns with low false-positive rate, plus field-name masking as the safety net".

There's also a heuristic for "this string looks like a token even though it's not in a known field":

```typescript
const looksLikeToken = (value: string): boolean => {
  // Base64-like string longer than 20 chars with no spaces
  if (value.length > 20 && /^[A-Za-z0-9_-]+$/.test(value)) {
    return true;
  }
  // Entire string is a JWT
  if (/^eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/.test(value)) {
    return true;
  }
  return false;
};
```

This catches strings that look like opaque secrets even when their parent field name is innocuous. A 32-character random base64 string in a `requestId` field is almost always a token someone misnamed.

## The recursive masker

The two layers above only handle strings. Real log payloads are nested objects. The masker walks them.

```typescript
const maskDataRecursive = (
  data: unknown,
  fieldName: string | undefined,
  seen: WeakSet<object>,
): unknown => {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    if (fieldName) {
      const maskedByField = maskByFieldName(fieldName, data);
      if (maskedByField !== data) return maskedByField;
    }
    if (looksLikeToken(data)) return MASKED.TOKEN;
    return maskString(data);
  }

  if (Array.isArray(data)) {
    if (seen.has(data)) return '[Circular Reference]';
    seen.add(data);
    return data.map(item => maskDataRecursive(item, undefined, seen));
  }

  if (typeof data === 'object') {
    if (seen.has(data)) return '[Circular Reference]';
    seen.add(data);
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      masked[key] = maskDataRecursive(value, key, seen);
    }
    return masked;
  }

  return data; // numbers, booleans pass through unchanged
};

export const maskSensitiveData = (data: unknown, fieldName?: string): unknown => {
  return maskDataRecursive(data, fieldName, new WeakSet());
};
```

Three points worth flagging.

**Circular references are real.** Older Axios versions had circulars between `error.config` and `error.request`; v1+ scrubbed those, but other libraries still produce them. React fiber nodes are circular by design. Anything you've ever attached `parent`/`child` references to is. A naive recursive mask hits stack overflow on the first one you log. The `WeakSet` of seen objects catches the loop and replaces the second occurrence with `'[Circular Reference]'`.

**The field name carries through one level.** When `maskDataRecursive` walks into an object, it passes the *parent key* as the field name for each value. That's how `{ email: 'user@example.com' }` gets the `email` field name when masking the string. Arrays don't carry a field name through (the parent key applies to the array, not its elements).

**Numbers and booleans pass through.** A boolean isn't sensitive on its own. A number might be an account balance, but masking every number is too aggressive. If you have a sensitive numeric field, add it to `SENSITIVE_FIELDS` and the field-name layer will handle it.

## The logger

A thin wrapper around `console` that runs everything through the masker before printing.

```typescript
// src/utils/logger.ts
import { maskSensitiveData } from './logging/maskSensitiveData';

export const logError = (
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void => {
  if (__DEV__) {
    const maskedContext = context ? maskSensitiveData(context) : undefined;
    const maskedError = error ? maskSensitiveData(error) : undefined;
    console.error(`[DEV] ${message}`, maskedError, maskedContext);
  }
  // In production, errors are silently dropped here. The Sentry integration below
  // is what ships them off-device, with a second sanitisation pass.
};

export const logWarning = (
  message: string,
  context?: Record<string, unknown>,
): void => {
  if (__DEV__) {
    const maskedContext = context ? maskSensitiveData(context) : undefined;
    console.warn(`[DEV] ${message}`, maskedContext);
  }
};

export const logDebug = (message: string, data?: unknown): void => {
  if (__DEV__) {
    const maskedData = data !== undefined ? maskSensitiveData(data) : undefined;
    console.log(`[DEV] ${message}`, maskedData);
  }
};
```

Two design choices that catch most people by surprise.

**Production console output is silent.** No `console.error`, no log file. Anything you want shipped to a remote system goes through Sentry (configured below). The reason: production console output on React Native lands in the system log, and even with masking, you don't want a parallel log destination you're not actively monitoring.

**Replace `console.*` calls in your codebase with these helpers.** It's one of those tedious migrations that pays for itself the first time someone writes `console.log(user)` in a code review and the helper-replacement convention saves the day. An ESLint rule banning `console.*` outside the logger module is the enforcement mechanism.

## Wiring the masker into a remote log sink

When you add an off-device error tracker (Sentry, Crashlytics, Datadog), the masker plugs into its scrub hooks. The pattern below uses Sentry as the example because it's the most common; the same shape applies to any SDK that exposes a "transform the payload before send" callback.

```typescript
// src/config/sentry.ts
import * as Sentry from '@sentry/react-native';
import { maskSensitiveData } from '@app/utils/logging/maskSensitiveData';

Sentry.init({
  dsn: Config.SENTRY_DSN,
  enabled: !__DEV__,

  beforeSend(event) {
    // Run the entire event through the masker. Sentry's events are
    // deeply nested objects (user, request, contexts, exception); the
    // recursive masker handles all of them in one pass.
    return maskSensitiveData(event) as Sentry.Event;
  },

  beforeBreadcrumb(breadcrumb) {
    // Breadcrumbs include the URL and request body of every fetch.
    // Mask both before they enter the rolling buffer.
    if (breadcrumb.data) {
      breadcrumb.data = maskSensitiveData(breadcrumb.data) as typeof breadcrumb.data;
    }
    if (breadcrumb.message) {
      breadcrumb.message = maskSensitiveData(breadcrumb.message) as string;
    }
    return breadcrumb;
  },
});
```

`beforeSend` runs once per error, on the full event. `beforeBreadcrumb` runs every time a breadcrumb is added (which is dozens of times per session for a typical app). Both go through the same masker, which means adding a new sensitive field to `SENSITIVE_FIELDS` automatically protects both paths.

> 💡 **The `enabled: !__DEV__` flag matters.** Sentry SDK calls in development lead to duplicate errors in your team's project from developer machines, and (worse) every breadcrumb captured in development gets shipped. Disable Sentry entirely in DEV builds; rely on the logger's console output during development. If you want to verify the config locally before a release, point it at a separate test project (a `SENTRY_DSN_DEV` with strict access controls) for that one debugging session, then disable again.

> 💡 **Wire the masker on day one of adding Sentry.** Sentry without `beforeSend` is a one-line change away from a parallel PII database. The order to add things is: install the SDK, wire `beforeSend` and `beforeBreadcrumb` to the masker, *then* turn the SDK on. Not the other way round.

## Testing the masker

The masker is the single most security-critical utility in the app. Tests cover every pattern and every failure mode.

```typescript
// src/utils/logging/__tests__/maskSensitiveData.rntl.ts
import { maskSensitiveData } from '../maskSensitiveData';

describe('maskSensitiveData', () => {
  describe('field-name masking', () => {
    it('masks password fields', () => {
      const result = maskSensitiveData({ password: 'secret123' });
      expect(result).toEqual({ password: '[MASKED]' });
    });

    it('masks email fields', () => {
      const result = maskSensitiveData({ email: 'warren@example.com' });
      expect(result).toEqual({ email: '[MASKED_EMAIL]' });
    });

    it('masks any sensitive field regardless of casing', () => {
      const result = maskSensitiveData({
        AccessToken: 'eyJ...',
        REFRESHTOKEN: 'eyJ...',
      });
      expect(result).toEqual({
        AccessToken: '[MASKED]',
        REFRESHTOKEN: '[MASKED]',
      });
    });
  });

  describe('regex-based masking', () => {
    it('masks Bearer tokens in strings', () => {
      const result = maskSensitiveData('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc');
      expect(result).toBe('Authorization: Bearer [MASKED_TOKEN]');
    });

    it('masks emails in free-text strings', () => {
      const result = maskSensitiveData('User logged in: warren@example.com');
      expect(result).toBe('User logged in: [MASKED_EMAIL]');
    });

    it('masks UK phone numbers', () => {
      const result = maskSensitiveData('Contact: +44 7700 900000');
      expect(result).toBe('Contact: [MASKED_PHONE]');
    });

    it('masks credit card numbers', () => {
      const result = maskSensitiveData('Card: 4111-1111-1111-1111');
      expect(result).toBe('Card: [MASKED_CARD]');
    });
  });

  describe('nested structures', () => {
    it('walks into nested objects', () => {
      const result = maskSensitiveData({
        user: {
          email: 'warren@example.com',
          credentials: { password: 'secret', token: 'eyJ...' },
        },
      });
      expect(result).toEqual({
        user: {
          email: '[MASKED_EMAIL]',
          credentials: { password: '[MASKED]', token: '[MASKED]' },
        },
      });
    });

    it('handles arrays of objects', () => {
      const result = maskSensitiveData([
        { email: 'a@example.com' },
        { email: 'b@example.com' },
      ]);
      expect(result).toEqual([
        { email: '[MASKED_EMAIL]' },
        { email: '[MASKED_EMAIL]' },
      ]);
    });

    it('does not stack overflow on circular references', () => {
      const obj: Record<string, unknown> = { email: 'warren@example.com' };
      obj.self = obj;
      const result = maskSensitiveData(obj) as Record<string, unknown>;
      expect(result.email).toBe('[MASKED_EMAIL]');
      expect(result.self).toBe('[Circular Reference]');
    });
  });

  describe('looksLikeToken heuristic', () => {
    it('masks long base64-like strings even without a field name', () => {
      const result = maskSensitiveData('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
      expect(result).toBe('[MASKED_TOKEN]');
    });

    it('does not mask short non-token strings', () => {
      const result = maskSensitiveData('hello world');
      expect(result).toBe('hello world');
    });
  });
});
```

Run them:

```bash
yarn jest maskSensitiveData
```

```text
PASS  src/utils/logging/__tests__/maskSensitiveData.rntl.ts
  maskSensitiveData
    field-name masking
      ✓ masks password fields (3 ms)
      ✓ masks email fields (1 ms)
      ✓ masks any sensitive field regardless of casing (1 ms)
    regex-based masking
      ✓ masks Bearer tokens in strings (2 ms)
      ✓ masks emails in free-text strings (1 ms)
      ✓ masks UK phone numbers (1 ms)
      ✓ masks credit card numbers (1 ms)
    nested structures
      ✓ walks into nested objects (1 ms)
      ✓ handles arrays of objects (1 ms)
      ✓ does not stack overflow on circular references (1 ms)
    looksLikeToken heuristic
      ✓ masks long base64-like strings even without a field name (1 ms)
      ✓ does not mask short non-token strings (1 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

The circular-reference test is the highest-value one. Without the `WeakSet` guard, this test crashes with a stack overflow and fails the whole suite. It's the one assertion that would catch a regression where someone refactored the recursive walker and removed the guard.

## Common pitfalls

**Don't trust regex alone.** Field-name masking catches the common case of `{ email, password, token }` cleanly. Regex catches the messy case of free-text strings that contain embedded sensitive data. You need both layers because either alone leaves obvious gaps.

**Don't put the masker on the hot path of normal code.** It's fine for logging and Sentry breadcrumbs, both of which are inherently slow. Don't run `maskSensitiveData(user)` on every render; the WeakSet allocation alone makes it slower than `console.log` would be unmasked.

**Don't reuse `MASKED.PASSWORD` for tokens.** The constants distinguish kinds of sensitive data. Uniformly masking everything as `[REDACTED]` makes debugging harder ("was that an email or a token?"). Keep the categories distinct so a Sentry trace tells you what kind of value was there before redaction.

**Don't mask in development.** The `__DEV__` check skips the logger's masking pass at the console level so developers can actually read what's being logged. Sentry's `beforeSend`/`beforeBreadcrumb` *do* still run in development if Sentry is enabled there, which is one more reason to disable Sentry in DEV builds.

**Don't forget to add new fields when they appear.** A new feature ships, the schema gets a `nationalInsurance` field, six weeks later you discover it's been logging unmasked into Sentry. The pattern that protects against this is treating `SENSITIVE_FIELDS` (and friends) as part of the same code review as the schema change. When a new sensitive field gets added to a Zod schema, the same PR adds it to the masker's set.

**Don't ship the masker to web.** This implementation assumes React Native (no DOM, no `document.cookie`). Web masking has additional concerns (URL hash fragments, `localStorage` snapshots, `formData` with file uploads) that this utility doesn't cover. If you need web masking, fork it; don't share the same module.

## What's next in the series

Five posts of this series have hardened the *client*: the auth client, the storage client, the token refresh queue, the cert pins on the network, and the logger that scrubs PII before it leaves the device. The remaining attack surface is the backend itself: Row Level Security policies that filter what each user can read, function-level permissions that restrict what they can call, and the rate limits that stop a stolen anon key being used to enumerate your tables.

The final post in the series covers Supabase backend hardening: RLS that actually holds, the cleanup-queue pattern from the storage post (with the SQL trigger this time), and the OWASP-mobile attack surface most "Supabase tutorial" content stops short of.

Source: [`src/utils/logger.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/utils/logger.ts) and [`src/utils/logging/maskSensitiveData.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/utils/logging/maskSensitiveData.ts). Each post in this series is filed under [the supabase tag at warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/).
