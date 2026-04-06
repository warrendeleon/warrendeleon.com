---
title: "Token refresh race condition prevention in React Native"
description: "What happens when five API calls get a 401 at the same time. The race condition most apps ignore, and the subscriber queue pattern that prevents it."
publishDate: 2026-06-29
tags: ["react-native", "security", "authentication", "http"]
locale: en
heroImage: "/images/blog/token-refresh-race.jpg"
heroAlt: "Token refresh race condition prevention in React Native"
campaign: "token-refresh-race"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "tiered-secure-storage-react-native", "runtime-api-validation-zod-react-native"]
---

## The bug that only happens in production

Your token expires. The app makes an API call. Supabase returns a 401. The interceptor catches it, refreshes the token, retries the request. The user never notices.

That's the tutorial version. It works perfectly when one request fails at a time.

Now picture this: the user opens the app after an hour. The home screen fires **five API calls simultaneously**. Profile data, work experience, education, settings, notifications. All five hit the server with an expired token. All five get 401s. All five trigger the interceptor.

**Five refresh attempts. At the same time. Against the same refresh token.**

The first one succeeds. It gets a new access token and a new refresh token. The old refresh token is now invalid.

The second refresh attempt uses the *old* refresh token. Supabase rejects it. The third, fourth, and fifth do the same. Four failures. The interceptor catches the failures and logs the user out.

The user opens the app, sees a loading screen for half a second, and gets thrown back to login. *Nothing crashed. No error message. Just a silent logout.*

This is a race condition. It only happens when multiple requests fire concurrently with an expired token. In development, you're usually testing one screen at a time. In production, the home screen loads everything at once.

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

A few things worth noting about the implementation:

**Tokens live in the [secure enclave](/blog/tiered-secure-storage-react-native/), not in memory.** The interceptor reads from iOS Keychain / Android Keystore on every refresh. If the app gets backgrounded mid-refresh, the tokens survive. AsyncStorage or a JavaScript variable wouldn't give you that guarantee.

**The `finally` block is load-bearing.** Without `isRefreshing = false` in the `finally`, a failed refresh leaves the gate permanently closed. Every subsequent 401 joins a queue that **never gets processed.** The app freezes on every API call. One missing line, and the recovery mechanism becomes the failure mode.

**Logout on refresh failure is correct.** When `SecureStore.clear()` wipes all tokens, the user gets sent back to login. That feels aggressive, but if your refresh token is rejected, the session is dead. Trying to silently recover from that state creates worse problems than a clean logout.

Most SDK-based implementations handle all of this for you. The Supabase SDK solves the race condition somewhere in its internals. You never see it. You also never see it break, and you never learn why it matters. I wrote about that trade-off in [Building a Supabase REST client without the SDK](/blog/building-a-supabase-rest-client-without-the-sdk/).

The full implementation is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), in `src/httpClients/SupabaseAuthClient.ts`.
