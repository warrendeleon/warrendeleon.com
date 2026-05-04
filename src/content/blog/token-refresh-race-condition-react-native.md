---
title: "Token refresh race condition prevention in React Native"
description: "What happens when five API calls get a 401 at the same time. The race condition most apps ignore, and the subscriber queue pattern that prevents it."
publishDate: 2026-06-15
tags: ["react-native", "security", "authentication", "http"]
locale: en
heroImage: "/images/blog/token-refresh-race.webp"
heroAlt: "Token refresh race condition prevention in React Native"
campaign: "token-refresh-race"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "tiered-secure-storage-react-native", "runtime-api-validation-zod-react-native"]
---

## The bug that looks like a random logout

The worst auth bug is the one that looks like a random logout. No crash, no useful error message, just a user opening the app and getting thrown back to login. Nothing in the logs explains it. The user reports it as "the app keeps signing me out" and the engineer can't reproduce it because it only happens after the access token has expired *and* multiple screens load at once.

Your token expires. The app makes an API call. Supabase returns a 401. The interceptor catches it, refreshes the token, retries the request. The user never notices. That's the tutorial version. It works perfectly when one request fails at a time.

Now picture this: the user opens the app after an hour. The home screen fires **five API calls simultaneously**. Profile data, work experience, education, settings, notifications. All five hit the server with an expired token. All five get 401s. All five trigger the interceptor.

**Five refresh attempts. At the same time. Against the same refresh token.**

The first one succeeds. It gets a new access token and a new refresh token. The old refresh token is now invalid.

The second refresh attempt uses the *old* refresh token. Supabase rejects it. The third, fourth, and fifth do the same. Four failures. The interceptor catches the failures and logs the user out.

The user opens the app, sees a loading screen for half a second, and gets thrown back to login. *Nothing crashed. No error message. Just a silent logout.*

This is a race condition. It only happens when multiple requests fire concurrently with an expired token. In development, you're usually testing one screen at a time. In production, the home screen loads everything at once.

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare or Expo)
- TypeScript with the standard RN Babel config
- Axios as the HTTP client (the pattern works with `fetch` too, but the interceptor API is Axios-specific)
- A token-refresh-style auth API (Supabase, OAuth, JWT, anything that returns a refresh token)
- [Tiered secure storage](/blog/tiered-secure-storage-react-native/) for tokens (or any storage that returns a Promise)

The pattern is library-agnostic. If you're not on Axios, replace the interceptor mechanics with your client's equivalent. The state machine (gate, queue, retry) is the same.

## Where this code lives

The snippets below sit on a class that wraps an Axios instance. The full structure:

```typescript
// src/httpClients/SupabaseAuthClient.ts
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { SecureStore, SecureStoreKey } from '@app/utils/storage';

class SupabaseAuthClient {
  private axiosInstance: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.SUPABASE_URL,
      timeout: 10_000,
    });

    this.axiosInstance.interceptors.request.use(this.attachToken);
    this.axiosInstance.interceptors.response.use(
      response => response,
      this.handle401,
    );
  }

  // ... the methods below all live on this class
}

export const authClient = new SupabaseAuthClient();
```

Two pieces of state on the class instance: `isRefreshing` is the gate, `refreshSubscribers` is the queue. Both are instance properties so they're shared across requests through the same client. If you put them at module scope or per-request, the coordination falls apart.

## The naive approach

Most token refresh implementations look like this:

```typescript
this.axiosInstance.interceptors.response.use(
  response => response,
  async (error) => {
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = await SecureStore.get(SecureStoreKey.REFRESH_TOKEN);
      const { data } = await this.axiosInstance.post(
        '/auth/v1/token?grant_type=refresh_token',
        { refresh_token: refreshToken }
      );

      await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return this.axiosInstance(originalRequest);
    }
    return Promise.reject(error);
  }
);
```

One request, one 401, one refresh. Works fine. The `_retry` flag prevents infinite loops. **But there's no coordination between requests.**

Here's what happens with five concurrent 401s:

```
Timeline (milliseconds):

  0ms  Request A fires → 401
  0ms  Request B fires → 401
  0ms  Request C fires → 401
  0ms  Request D fires → 401
  0ms  Request E fires → 401

  1ms  A starts refresh (refresh_token_v1)
  1ms  B starts refresh (refresh_token_v1)  ← same token!
  1ms  C starts refresh (refresh_token_v1)  ← same token!
  1ms  D starts refresh (refresh_token_v1)  ← same token!
  1ms  E starts refresh (refresh_token_v1)  ← same token!

 50ms  A's refresh succeeds → new tokens stored
       refresh_token_v1 is now INVALID

 51ms  B's refresh fails → refresh_token_v1 rejected
       → SecureStore cleared → user logged out

 52ms  C's refresh fails → same
 53ms  D's refresh fails → same
 54ms  E's refresh fails → same
```

**Five requests. One success. Four failures. One silent logout.** The `_retry` flag only prevents the *same request* from retrying twice. It does nothing to prevent *different requests* from all refreshing simultaneously.

## The subscriber queue

The fix: **only one refresh runs at a time.** Every other 401 waits in a queue.

Two pieces of state:

```typescript
private isRefreshing = false;
private refreshSubscribers: Array<(token: string) => void> = [];
```

`isRefreshing` is a gate. When the first 401 arrives, it flips to `true` and the refresh starts. When the second, third, fourth, and fifth 401s arrive, they see the gate is closed and **add themselves to the queue instead of starting their own refresh.**

```typescript
if (isTokenExpired && !originalRequest._retry) {
  // Gate check: is someone already refreshing?
  if (this.isRefreshing) {
    // Yes. Don't refresh. Just wait.
    return new Promise(resolve => {
      this.refreshSubscribers.push((token: string) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        resolve(this.axiosInstance(originalRequest));
      });
    });
  }

  // I'm the first. I'll do the refresh.
  originalRequest._retry = true;
  this.isRefreshing = true;
```

Each subscriber stores a **callback function**. The callback takes a token, attaches it to the original request, and retries. It's a promise that doesn't resolve until the refresh completes.

When the refresh finishes:

```typescript
  try {
    const refreshToken = await SecureStore.get(SecureStoreKey.REFRESH_TOKEN);
    const { data } = await this.axiosInstance.post(
      '/auth/v1/token?grant_type=refresh_token',
      { refresh_token: refreshToken }
    );

    await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
    await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, data.refresh_token);

    // Wake up everyone in the queue
    this.refreshSubscribers.forEach(cb => cb(data.access_token));
    this.refreshSubscribers = [];

    // Retry my own request
    originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
    return this.axiosInstance(originalRequest);
  } catch (refreshError) {
    // Refresh failed. Clear everything. Logout.
    await SecureStore.clear();
    return Promise.reject(refreshError);
  } finally {
    this.isRefreshing = false;
  }
```

The `forEach` is the key line. It iterates through every waiting request and calls each callback with the new token. **All five requests retry simultaneously with a valid token.** The queue empties. The gate opens.

## The fixed timeline

Same scenario. Five concurrent 401s. Completely different outcome.

```
Timeline (milliseconds):

  0ms  Request A fires → 401
  0ms  Request B fires → 401
  0ms  Request C fires → 401
  0ms  Request D fires → 401
  0ms  Request E fires → 401

  1ms  A sees isRefreshing=false → starts refresh
       isRefreshing = true

  1ms  B sees isRefreshing=true → joins queue
  1ms  C sees isRefreshing=true → joins queue
  1ms  D sees isRefreshing=true → joins queue
  1ms  E sees isRefreshing=true → joins queue

 50ms  A's refresh succeeds → new tokens stored
       A notifies B, C, D, E with new token
       isRefreshing = false

 51ms  A retries with new token → 200 ✓
 51ms  B retries with new token → 200 ✓
 51ms  C retries with new token → 200 ✓
 51ms  D retries with new token → 200 ✓
 51ms  E retries with new token → 200 ✓
```

**Five requests. One refresh. Zero failures. Zero logouts.** The user sees a 50ms delay on their home screen and nothing else.

## What about the 403?

Supabase doesn't always return a clean 401. Sometimes an expired token triggers a **403 with a JWT error** in the body. If you only check for `status === 401`, you'll miss these.

```typescript
const isTokenExpired =
  status === 401 ||
  (status === 403 &&
    (errorData?.error_code === 'bad_jwt' ||
      errorMessage.includes('token is expired') ||
      errorMessage.includes('exp')));
```

Three checks: the status code, the error code field, and the error message. Paranoid, but necessary. I've seen Supabase return all three variants depending on which endpoint was called and how the token expired.

> 💡 **Don't assume your auth provider returns consistent error formats.** Test token expiry against every endpoint your app calls. You might be surprised.

## What if the refresh itself fails?

The `finally` block ensures `isRefreshing` always resets, even on failure:

```typescript
} finally {
  this.isRefreshing = false;
}
```

Without this, a failed refresh would leave the gate permanently closed. Every subsequent 401 would join a queue that **never gets processed.** The app would freeze on every API call. The `finally` block prevents this.

When the refresh fails, `SecureStore.clear()` wipes all tokens. The user gets logged out. That's the correct behaviour. If your refresh token is rejected, the session is dead. Trying to recover from that state would create worse problems than a clean logout.

## The details that matter

A few things to call out about the implementation:

**Tokens live in the [secure enclave](/blog/tiered-secure-storage-react-native/), not in memory.** The interceptor reads from iOS Keychain / Android Keystore on every refresh. If the app gets backgrounded mid-refresh, the tokens survive. AsyncStorage or a JavaScript variable wouldn't give you that guarantee.

**The `finally` block is load-bearing.** Without `isRefreshing = false` in the `finally`, a failed refresh leaves the gate permanently closed. Every subsequent 401 joins a queue that **never gets processed.** The app freezes on every API call. One missing line, and the recovery mechanism becomes the failure mode.

**Logout on refresh failure is correct.** When `SecureStore.clear()` wipes all tokens, the user gets sent back to login. That feels aggressive, but if your refresh token is rejected, the session is dead. Trying to silently recover from that state creates worse problems than a clean logout.

## Proving it works

You can't trust a fix you haven't tested. The test below uses [MSW](/blog/setting-up-msw-v2-in-react-native/) to fire five concurrent requests through a real public method on the auth client (`getCurrentUser`), watch all five hit `/auth/v1/user` with an expired token, count how many times `/auth/v1/token` is called, and assert exactly one refresh happened despite five 401s.

```typescript
// src/httpClients/__tests__/SupabaseAuthClient.race.rntl.ts
import { http, HttpResponse } from 'msw';
import { server } from '@app/test-utils/msw/server';
import { SupabaseAuthClient } from '../SupabaseAuthClient';

jest.mock('react-native-config', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('@app/config/e2e', () => ({
  isE2EMockEnabled: jest.fn(() => false),
}));

jest.mock('@app/utils/storage/EncryptedStore', () => ({
  EncryptedStore: { set: jest.fn(), get: jest.fn(), clear: jest.fn() },
  EncryptedStoreKey: { USER_EMAIL: 'userEmail' },
}));

// SecureStore.get switches the returned token after the refresh has stored
// the new value, so the second call to /auth/v1/user uses the fresh token.
let currentToken = 'expired-token';
jest.mock('@app/utils/storage/SecureStore', () => ({
  SecureStore: {
    get: jest.fn(async (key: string) => {
      if (key === 'accessToken') return currentToken;
      if (key === 'refreshToken') return 'valid-refresh';
      return null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      if (key === 'accessToken') currentToken = value;
    }),
    clear: jest.fn(),
  },
  SecureStoreKey: {
    ACCESS_TOKEN: 'accessToken',
    REFRESH_TOKEN: 'refreshToken',
    USER_ID: 'userId',
  },
}));

const SUPABASE_URL = 'https://test.supabase.co';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  aud: 'authenticated',
  email: 'warren@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  phone: null,
  confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

describe('Token refresh under concurrent 401s', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    server.resetHandlers();
    currentToken = 'expired-token';
  });

  it('only refreshes once when five requests get 401 simultaneously', async () => {
    let refreshCount = 0;
    let userCallCount = 0;

    server.use(
      // /auth/v1/user: returns 401 if the Authorization is the old token, else returns the user
      http.get(`${SUPABASE_URL}/auth/v1/user`, ({ request }) => {
        userCallCount++;
        const auth = request.headers.get('Authorization');
        if (auth === 'Bearer expired-token') {
          return HttpResponse.json({ msg: 'JWT expired' }, { status: 401 });
        }
        return HttpResponse.json(mockUser);
      }),
      // /auth/v1/token: counts how many refreshes hit the server
      http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
        refreshCount++;
        return HttpResponse.json({
          access_token: 'fresh-token',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: mockUser,
        });
      }),
    );

    // Fire five concurrent reads against the same client. All five should
    // hit the response interceptor's 401 path, only one should trigger a
    // refresh, and the other four should queue behind it.
    const results = await Promise.all([
      SupabaseAuthClient.getCurrentUser(),
      SupabaseAuthClient.getCurrentUser(),
      SupabaseAuthClient.getCurrentUser(),
      SupabaseAuthClient.getCurrentUser(),
      SupabaseAuthClient.getCurrentUser(),
    ]);

    expect(refreshCount).toBe(1);              // Only ONE refresh hit the network
    expect(userCallCount).toBeGreaterThanOrEqual(5);  // First 5 with old token, then retries with new
    expect(results.every(r => r?.email === 'warren@example.com')).toBe(true);
  });
});
```

Run it:

```bash
yarn jest SupabaseAuthClient.race
```

```text
PASS  src/httpClients/__tests__/SupabaseAuthClient.race.rntl.ts
  Token refresh under concurrent 401s
    ✓ only refreshes once when five requests get 401 simultaneously (124 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

If you remove the `isRefreshing` gate and run the same test, `refreshCount` jumps to 5 and the assertion fails. That's the regression test that protects this code from someone reverting the queue "to simplify it".

## Common pitfalls

**Don't put `isRefreshing` at module scope.** It needs to live on the client instance. Module-level state crosses test isolation and clients-per-environment boundaries; instance state doesn't.

**Don't refresh in the request interceptor.** The interceptor runs on *every* request and would gate every call behind a token check, even ones that aren't going to fail. Refresh in the response interceptor when a 401 actually comes back.

**Don't forget the `_retry` flag.** Without it, a 401 on the *retry itself* (because the new token is also bad) sends you back into the queue and you loop forever. The flag is the second guard, after the gate.

**Don't drop subscribers on refresh failure.** If the refresh fails, the queued requests have to be told. The `finally` block resets `isRefreshing`, but you also need to reject every queued request before clearing the array. Without that, queued promises hang forever and the UI freezes.

**Don't assume the auth provider returns 401.** Supabase sometimes returns 403 with `error_code: 'bad_jwt'`. The check at the top of the interceptor needs to cover both the status code and the body. Test against every endpoint your app calls before trusting "401 means expired".

Most SDK-based implementations handle all of this for you. The Supabase SDK solves the race condition somewhere in its internals. You never see it. You also never see it break, and you never learn why it matters. I wrote about that trade-off in [Building a Supabase REST client without the SDK](/blog/building-a-supabase-rest-client-without-the-sdk/).

The full implementation is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), in `src/httpClients/SupabaseAuthClient.ts`.
