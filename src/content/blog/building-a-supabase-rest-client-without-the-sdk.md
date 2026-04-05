---
title: "Building a Supabase REST client without the SDK"
description: "Why I chose Axios over the official Supabase SDK for a React Native app. Full control over interceptors, token refresh, error handling, and the ability to swap the backend without touching app code."
publishDate: 2026-05-25
tags: ["react-native", "typescript", "architecture", "tutorial"]
locale: en
heroImage: "/images/blog/supabase-rest-client.jpg"
heroAlt: "Building a Supabase REST client without the SDK in React Native"
campaign: "supabase-rest-client"
---

## Three lines of code that cost me every interview

```typescript
const { data } = await supabase.auth.signInWithPassword({ email, password });
```

That's the Supabase SDK. One line for authentication. One for storage uploads. One for database queries. It works. It's well-documented. And every time a potential client opened my portfolio app's source code, that's all they'd see.

I've been a contractor for years. My React Native app isn't a side project. **It's my portfolio.** When a client asks what I can do, I send them this codebase. They open it, read the code, and decide whether to hire me based on what they find.

If they find SDK calls, they see someone who can read documentation. If they find a custom REST client with typed interceptors, token refresh race condition handling, certificate pinning, and tiered secure storage, they see someone who understands how production mobile apps actually work.

I never considered using the SDK. Not for a moment.

## What the SDK hides

The Supabase SDK handles authentication, storage, database queries, and real-time subscriptions. Install it, pass your project URL and anon key, and you're running. Three lines for login, two for file upload, one for a query.

Behind those lines, the SDK makes decisions you don't see:

- **Where tokens are stored.** The SDK uses its own storage adapter. On React Native, that's typically AsyncStorage. Plain text. No encryption. No hardware-backed security.
- **How token refresh works.** The SDK handles expired tokens internally. You don't see the refresh logic, the retry mechanism, or what happens when five requests fire simultaneously with expired tokens.
- **What happens on errors.** The SDK throws its own error types. You get a message string and hope it's useful.
- **How HTTP calls are made.** The SDK uses `fetch` internally. You can't add interceptors, certificate pinning, or request logging without working around the SDK.

For a prototype, none of that matters. For an app that represents my professional capabilities to hiring managers and clients, **all of it matters.**

## The client

One Axios instance. One file. The only place in the entire app that knows Supabase exists.

```typescript
this.axiosInstance = axios.create({
  baseURL: Config.SUPABASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    apikey: Config.SUPABASE_ANON_KEY,
  },
});
```

Change the base URL and the endpoint paths, and this client talks to a completely different backend. Firebase, AWS Cognito, a custom Node.js server. **The rest of the app never knows.** No SDK calls scattered across 13 features. No vendor lock-in. One file to change.

My app already talks to two backends through the same pattern: Supabase for auth and storage, GitHub's raw content API for portfolio data. Same Axios structure, same interceptor approach, same error handling. The SDK would make one of those backends a special case.

## Request interceptor: tokens from the secure enclave

Every authenticated request needs a Bearer token. The interceptor reads it from the device's **hardware-backed secure enclave** (iOS Keychain / Android Keystore) and attaches it automatically:

```typescript
this.axiosInstance.interceptors.request.use(async config => {
  const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
```

Not AsyncStorage. Not the SDK's storage adapter. The [Keychain](/blog/tiered-secure-storage-react-native/). The same place the banking apps on your phone store their tokens.

The SDK would bypass this entirely. It manages its own token storage, and on React Native that means your access tokens sit in plain text next to your theme preference. For a portfolio app that's supposed to demonstrate production security practices, that's not acceptable.

## Response interceptor: the race condition nobody talks about

When an access token expires, Supabase returns a 401. You refresh the token and retry the request. Simple.

Until **five requests fire at the same time** and all get 401s. Without coordination, each one triggers its own refresh. Five refresh calls. The first one succeeds. The second one fails because the refresh token was already used. Tokens get overwritten. The session breaks. The user gets logged out for no reason.

The SDK handles this internally. You never see it. You also never see it break, and you never learn how to fix it.

My client uses **a subscriber queue**:

```typescript
private isRefreshing = false;
private refreshSubscribers: Array<(token: string) => void> = [];
```

The first request to detect a 401 starts the refresh. Every subsequent 401 **queues up and waits.** When the refresh completes, all waiting requests get the new token and retry simultaneously.

```typescript
if (this.isRefreshing) {
  return new Promise(resolve => {
    this.refreshSubscribers.push((token: string) => {
      originalRequest.headers.Authorization = `Bearer ${token}`;
      resolve(this.axiosInstance(originalRequest));
    });
  });
}

originalRequest._retry = true;
this.isRefreshing = true;

try {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=refresh_token',
    { refresh_token: refreshToken }
  );

  // Notify all waiting requests
  this.refreshSubscribers.forEach(cb => cb(data.access_token));
  this.refreshSubscribers = [];

  return this.axiosInstance(originalRequest);
} catch (refreshError) {
  await SecureStore.clear(); // Logout on refresh failure
  return Promise.reject(refreshError);
} finally {
  this.isRefreshing = false;
}
```

Three mechanisms working together: the **`_retry` flag** prevents infinite loops, the **`isRefreshing` gate** ensures only one refresh runs at a time, and the **`refreshSubscribers` array** is the queue. If the refresh fails, tokens are cleared and the user is logged out. No half-states. No silent failures.

When a client opens this file and sees the subscriber queue, they know I've dealt with concurrent auth in production. That's not something you learn from an SDK.

## Every response gets validated

The SDK trusts whatever Supabase returns. My client doesn't.

```typescript
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse> {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=password', request
  );
  return validateResponse(SupabaseSignInResponseSchema, data, 'signIn');
}
```

Every API response runs through a Zod schema before it enters the app. If Supabase changes their response format, my app catches it at the validation layer with a clear error instead of crashing three layers downstream with `Cannot read property 'email' of undefined`.

## Errors that the app can act on

The SDK throws error objects with a message string. My client maps every Supabase error code to an `AuthError` with both a **user-facing message** and a **machine-readable code**:

```typescript
switch (errorData?.error_code) {
  case 'email_not_confirmed':
    return new AuthError('Email not confirmed', 'email_not_confirmed');
  case 'invalid_credentials':
    return new AuthError('Invalid email or password', 'invalid_credentials');
}

switch (error.response?.status) {
  case 429:
    return new AuthError(
      'Too many attempts. Please try again later.', 'rate_limit_exceeded'
    );
}
```

The UI shows the message. The Redux store switches on the code to decide which screen to show. **No Supabase internals leak into the app.** The error handling layer is the boundary. Everything above it speaks the app's language, not Supabase's.

## Uploads retry automatically

The storage client follows the same Axios pattern, with one addition: **exponential backoff** for uploads. Mobile networks drop. Tunnels happen. A single failed upload shouldn't mean the user loses their profile picture.

```typescript
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    const { data } = await this.axiosInstance.post(
      `/object/${BUCKET_NAME}/${filePath}`, bytes,
      { headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' } }
    );
    return validateResponse(SupabaseUploadResponseSchema, data, 'upload');
  } catch (error) {
    // Don't retry client errors (400-499)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      throw error;
    }
    if (attempt < MAX_RETRIES) {
      await this.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
}
```

Retry on network failures and server errors. Fail immediately on client errors. The SDK doesn't give you this control. It either retries everything or nothing.

## What about certificate pinning?

The Axios client works with **certificate pinning** on both platforms (SHA-256 pins on the Supabase domain in Android's `network_security_config.xml` and iOS's TrustKit). Every HTTP call goes through the pinned connection. MITM attacks can't intercept the traffic even on compromised networks.

The SDK makes its own HTTP calls internally. Those calls wouldn't go through the pinned connection unless the SDK explicitly supports it. It doesn't. **Certificate pinning only works when you control the HTTP layer.**

The same applies to **production observability**. I have Axios interceptors that log request breadcrumbs to Sentry, with all sensitive data (tokens, emails, passwords) automatically masked by a custom logger. The SDK's internal calls wouldn't use my PII masking rules.

## E2E tests without a network

My [Detox E2E tests](/blog/detox-cucumber-bdd-react-native-e2e-testing/) run without a network connection. The entire API layer swaps to local fixtures at build time. That only works because I control the HTTP client. Every auth method has a mock path that returns fixture data when the E2E flag is set.

With the SDK, the network calls are buried inside Supabase's code. I can't swap them at the Metro level. The SDK would need its own mocking strategy, adding complexity for something my architecture already solves.

## "Why not React Query?"

My app uses **Redux Toolkit as the single source of truth.** Auth state, user profile, settings, work experience. API calls go through Redux thunks, which call the Axios client, which stores results in the Redux store. One state system, one mental model.

I evaluated RTK Query as a migration:

| | Axios + thunks | RTK Query |
|---|---|---|
| **Boilerplate** | ~160 lines per feature | ~3 lines per endpoint |
| **Caching** | Manual | Automatic with TTL |
| **E2E mocking** | Simple, per-function | Custom baseQuery, more complex |
| **Migration cost** | None | 18+ test files to rewrite |

For a portfolio app with five endpoints and mostly static data, **the migration effort outweighs the benefits.** RTK Query and React Query earn their place in apps with dozens of endpoints, frequent refetching, and real-time dashboards. Adding a second state system for data that loads once on launch isn't worth the complexity.

## Where the SDK still wins

There's one thing the REST API can't do: **real-time subscriptions.** Supabase Realtime uses WebSockets. You can't replicate that with Axios.

When my app gets its chat feature, I'll bring in the Supabase SDK for *just that one feature*. The auth client stays as Axios. The storage client stays as Axios. **One SDK import, contained to one feature.** Not spread across the entire app.

## The trade-off

Skipping the SDK means maintaining the auth logic myself. If Supabase changes an endpoint, I update my client. If they add a new auth flow, I implement it. That's real work.

But the alternative is worse: an app that looks like every other SDK tutorial project. When a client is choosing between contractors, the one whose portfolio shows production patterns (certificate pinning, token refresh queues, tiered storage, runtime validation) **wins over the one who installed an SDK and called it done.**

The SDK is a shortcut. Shortcuts are fine when you know what they skip. The problem is when the person evaluating your code *also* knows what they skip.

The full implementation is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), in `src/httpClients/`.
