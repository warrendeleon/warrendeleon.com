---
title: "Building an Axios-based Supabase auth client in React Native"
description: "Part 2 of the Supabase-without-the-SDK series: a typed Axios client that handles sign-up, sign-in, sign-out, and current-user retrieval against the Supabase REST API. Request interceptor for token attachment, mapped errors with codes, and MSW tests."
publishDate: 2026-06-08
tags: ["react-native", "supabase", "axios", "authentication", "typescript"]
locale: en
heroImage: "/images/blog/supabase-auth-client.webp"
heroAlt: "Building an Axios-based Supabase auth client in React Native"
campaign: "supabase-auth-client"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "token-refresh-race-condition-react-native", "tiered-secure-storage-react-native"]
---

This is part 2 of the [Supabase-without-the-SDK series](/blog/building-a-supabase-rest-client-without-the-sdk/). Part 1 covered the *why*. This post covers the auth client: a typed Axios wrapper around Supabase's REST API with sign-up, sign-in, sign-out, current-user retrieval, request interceptor for token attachment, and a mapped error type.

The token-refresh response interceptor is its own post in the series. This one stops at the request interceptor and the auth methods.

Source: [`src/httpClients/SupabaseAuthClient.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/httpClients/SupabaseAuthClient.ts).

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare workflow)
- TypeScript with the standard RN Babel config
- A Supabase project (or any compatible REST API at `/auth/v1`)
- [Tiered secure storage](/blog/tiered-secure-storage-react-native/) wired up so tokens go into the platform Keychain, not AsyncStorage
- Zod for runtime response validation (the auth client validates every response before it touches Redux; covered in a later post in this series)
- Jest configured for unit tests (see [Setting up MSW v2 in React Native](/blog/setting-up-msw-v2-in-react-native/) if you don't have it yet)

## Installation

```bash
yarn add axios react-native-config zod
cd ios && pod install && cd ..
```

`react-native-config` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from a `.env` file at build time. It's a native module, so iOS needs a pod install.

`.env` at the repo root:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=ey...
```

The anon key is safe to ship in your app bundle. It's the public key Supabase issues for unauthenticated requests, and RLS policies on the backend are what actually enforce security. The final post in this series covers RLS specifically.

## What you're building

A single class with an Axios instance and four public methods:

```typescript
class SupabaseAuthClient {
  signUp(request: SupabaseSignUpRequest): Promise<SupabaseSignUpResponse>;
  signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<SupabaseUser | null>;
}
```

The Axios instance is constructed once with the project URL, the anon key as a default header, and a request interceptor that attaches the user's access token on every authenticated call. Each public method posts to a Supabase REST endpoint, validates the response with Zod, stores the resulting tokens in the platform Keychain, and returns typed data to the caller.

A typed `AuthError` class wraps every failure mode so the UI can switch on the error code without parsing strings.

## Project layout

```text
src/
  httpClients/
    SupabaseAuthClient.ts     # this post
    SupabaseStorageClient.ts  # later post in the series
    GithubApiClient.ts        # the portfolio data API
    index.ts                  # barrel export
    __tests__/
      SupabaseAuthClient.rntl.ts
  schemas/
    supabase.auth.schema.ts   # Zod schemas for requests + responses
  utils/
    storage/
      SecureStore.ts          # Keychain wrapper, tier 1
      EncryptedStore.ts       # AES-256 wrapper, tier 2
```

Each file has one job. The auth client doesn't know about storage internals; it imports the SecureStore wrapper and calls `set`/`get`. The storage wrapper doesn't know about Supabase. The schemas don't know about either. Three small modules instead of one large one.

## The base client

```typescript
// src/httpClients/SupabaseAuthClient.ts
import Config from 'react-native-config';
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { SecureStore, SecureStoreKey } from '@app/utils/storage';

class SupabaseAuthClientClass {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: Config.SUPABASE_URL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        apikey: Config.SUPABASE_ANON_KEY,
      },
    });

    this.axiosInstance.interceptors.request.use(this.attachToken);
  }

  // ... methods follow
}

export const SupabaseAuthClient = new SupabaseAuthClientClass();
```

Three configuration choices worth flagging:

**A 10-second timeout.** Anything slower is a network problem, not a server problem. The default (none) lets requests hang forever, which means a flaky cell signal manifests as a frozen UI rather than an error message. Ten seconds is short enough to fail fast and long enough to absorb a normal network blip.

**`apikey` as a default header.** Supabase requires it on every call. Setting it once on the instance means you never forget it on a new endpoint.

**`Content-Type: application/json` as a default.** Supabase's auth endpoints expect JSON bodies. The header is harmless on GET requests and required on POST/PATCH.

## The request interceptor

Every authenticated call needs a Bearer token. Reading from the Keychain on every call sounds expensive, but `react-native-keychain` caches behind the scenes after the first read in a process and the call is sub-millisecond on subsequent reads.

```typescript
private attachToken = async (
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> => {
  const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
};
```

The interceptor runs on *every* request through the instance. If the user isn't signed in, `accessToken` is null and the call goes through with just the anon key. If they are signed in, the access token attaches as a Bearer header and Supabase resolves the request as that user.

> 💡 **Why not pass the token explicitly to each call?** Because forgetting to attach it on a single endpoint is a bug that doesn't crash anything. The call goes through unauthenticated, the RLS policy filters everything, and the screen renders empty. Centralising token attachment in an interceptor makes "not authenticated when you should be" impossible by construction.

## Sign-up

```typescript
async signUp(request: SupabaseSignUpRequest): Promise<SupabaseSignUpResponse> {
  try {
    const { data } = await this.axiosInstance.post('/auth/v1/signup', request);

    // Supabase returns the user object directly when email confirmation is required.
    // When confirmation is disabled, it returns { user, session } instead. The schema
    // handles both with z.union.
    const user = validateResponse(SupabaseUserSchema, data, 'Supabase Auth signUp');

    if (user) {
      await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, user.email);
      await SecureStore.set(SecureStoreKey.USER_ID, user.id);
    }

    return { user, session: null };
  } catch (error) {
    throw this.handleError(error);
  }
}
```

A few things to call out.

**Email confirmation is the default Supabase behaviour and the response shape changes accordingly.** When confirmation is required, `/auth/v1/signup` returns just the user object. When it's disabled, it returns `{ user, session }`. The Zod schema accepts either via `z.union`, so the validation passes in both cases.

**The user's email and ID get stored immediately.** Email goes into the AES-256 EncryptedStore (it's PII, but you need it for the profile screen). The ID goes into the Keychain (it's used to identify the user in subsequent requests).

**No tokens are stored on signup.** A user who needs to confirm their email doesn't have a session yet. `signIn` is what produces a session.

## Sign-in

```typescript
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse> {
  try {
    const { data } = await this.axiosInstance.post(
      '/auth/v1/token?grant_type=password',
      request,
    );

    const validatedData = validateResponse(
      SupabaseSignInResponseSchema,
      data,
      'Supabase Auth signIn',
    );

    await this.storeSession(validatedData);
    await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, validatedData.user.email);
    await SecureStore.set(SecureStoreKey.USER_ID, validatedData.user.id);

    return validatedData;
  } catch (error) {
    throw this.handleError(error);
  }
}

private async storeSession(session: SupabaseSignInResponse): Promise<void> {
  await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, session.access_token);
  await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, session.refresh_token);
}
```

The endpoint is `/auth/v1/token?grant_type=password`, the OAuth2 password grant flow that returns an access token, a refresh token, and the user object in one response.

`storeSession` is private and tiny on purpose. It's the only place tokens get written. If you ever need to add observability around token storage, change the storage tier, or add encryption-at-rest verification, you change one method and every call site stays the same.

## Sign-out

```typescript
async signOut(): Promise<void> {
  try {
    await this.axiosInstance.post('/auth/v1/logout');
  } catch (error) {
    // Server-side logout failure shouldn't block local logout.
    // Clearing the local session is more important than telling Supabase about it.
  } finally {
    await this.clearSession();
  }
}

private async clearSession(): Promise<void> {
  await SecureStore.clear();
  await EncryptedStore.clear();
}
```

The `finally` block is load-bearing. The user-facing meaning of "log out" is "wipe my session from this device". If the server is unreachable, the call fails, but the local clear still has to happen. Otherwise tapping log-out leaves the user logged in until they get connectivity again, which is the worst possible UX for a security action.

The `try` still attempts the server-side logout because Supabase tracks active sessions and revoking the refresh token server-side prevents an attacker who stole the device's refresh token from continuing to use it.

## Getting the current user

```typescript
async getCurrentUser(): Promise<SupabaseUser | null> {
  try {
    const { data } = await this.axiosInstance.get('/auth/v1/user');
    return validateResponse(SupabaseUserSchema, data, 'Supabase Auth getCurrentUser');
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw this.handleError(error);
  }
}
```

A 401 means the access token is expired or invalid. The token-refresh interceptor (covered in the next post) handles refresh transparently for *most* requests. `getCurrentUser` is the exception: when called at app startup before any other request has fired, a 401 means there's no valid session, and the right answer is to return `null` so the app knows to show the login screen instead of throwing.

Every other error gets converted to an `AuthError` and rethrown.

## Typed errors

The SDK throws errors with a message string. The custom client throws an `AuthError` with both a user-facing message and a machine-readable code, so the UI can switch on the code while the user sees the message.

```typescript
export class AuthError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}
```

The `handleError` method centralises the conversion from Supabase's various error formats into one normalised type:

```typescript
private handleError(error: unknown): AuthError {
  if (axios.isAxiosError(error)) {
    const errorData = error.response?.data as SupabaseErrorResponse;

    // Supabase's preferred error_code field
    if (errorData?.error_code) {
      switch (errorData.error_code) {
        case 'email_not_confirmed':
          return new AuthError('Email not confirmed', 'email_not_confirmed');
        case 'user_already_exists':
          return new AuthError('User already exists', 'user_already_exists');
        case 'invalid_credentials':
          return new AuthError('Invalid email or password', 'invalid_credentials');
        default:
          return new AuthError(
            errorData.msg || errorData.message || 'An error occurred',
            errorData.error_code,
          );
      }
    }

    // OAuth error format
    if (errorData?.error_description) {
      return new AuthError(errorData.error_description);
    }

    // Status-code fallbacks for endpoints that don't return error_code
    switch (error.response?.status) {
      case 400:
        return new AuthError('Invalid email or password', 'invalid_credentials');
      case 422:
        return new AuthError('Email already registered', 'user_already_exists');
      case 429:
        return new AuthError('Too many attempts. Please try again later.', 'rate_limit_exceeded');
      case 500:
        return new AuthError('Server error. Please try again later.', 'server_error');
      default:
        return new AuthError('An unexpected error occurred');
    }
  }

  return error instanceof Error
    ? new AuthError(error.message)
    : new AuthError('Unknown error');
}
```

Three layers of fallback because Supabase's error response shape is inconsistent between endpoints:

1. The newer `error_code` format (preferred by `/auth/v1/*` endpoints since the 2024 redesign).
2. The OAuth-style `error_description` format (returned by some token-grant flows).
3. A status-code fallback for cases where neither shape is present.

The `default` branch catches the rest with a generic message. That keeps `AuthError` total: every code path returns one, never throws or returns `undefined`.

A component using the client switches on the code:

```tsx
try {
  await SupabaseAuthClient.signIn({ email, password });
  navigation.navigate('Home');
} catch (error) {
  if (error instanceof AuthError) {
    if (error.code === 'email_not_confirmed') {
      navigation.navigate('VerifyEmail', { email });
      return;
    }
    if (error.code === 'rate_limit_exceeded') {
      showToast({ message: error.message, severity: 'warning' });
      return;
    }
    setFormError(error.message);
  }
}
```

The component never parses Supabase's error response. The auth client is the one place that translation happens.

## Testing the client

MSW intercepts the network calls at the right layer for these tests: Axios fires real HTTP requests, MSW catches them before they leave the process, returns canned responses, and the rest of the client (validation, error mapping, storage calls) runs as it would in production. Storage modules are stubbed with `jest.mock` so the test can assert which keys would have been written, without standing up a real Keychain.

```typescript
// src/httpClients/__tests__/SupabaseAuthClient.rntl.ts
import { http, HttpResponse } from 'msw';
import { server } from '@app/test-utils/msw/server';
import { AuthError, SupabaseAuthClient } from '../SupabaseAuthClient';

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

jest.mock('@app/utils/storage/SecureStore', () => ({
  SecureStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() },
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

describe('SupabaseAuthClient.signIn', () => {
  const { SecureStore, SecureStoreKey } = require('@app/utils/storage/SecureStore');

  beforeEach(() => {
    jest.clearAllMocks();
    server.resetHandlers();
  });

  it('stores tokens and returns the validated session on success', async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/token`, () =>
        HttpResponse.json({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'bearer',
          expires_in: 3600,
          user: mockUser,
        }),
      ),
    );

    const result = await SupabaseAuthClient.signIn({
      email: 'warren@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.access_token).toBe('access-1');
    expect(SecureStore.set).toHaveBeenCalledWith(SecureStoreKey.ACCESS_TOKEN, 'access-1');
    expect(SecureStore.set).toHaveBeenCalledWith(SecureStoreKey.REFRESH_TOKEN, 'refresh-1');
  });

  it('throws AuthError with invalid_credentials on 400', async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/token`, () =>
        HttpResponse.json(
          { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
          { status: 400 },
        ),
      ),
    );

    await expect(
      SupabaseAuthClient.signIn({ email: 'warren@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_credentials',
      message: 'Invalid email or password',
    });
  });

  it('does not store tokens when sign-in fails', async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/token`, () =>
        HttpResponse.json({ error_code: 'invalid_credentials' }, { status: 400 }),
      ),
    );

    await expect(
      SupabaseAuthClient.signIn({ email: 'warren@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(AuthError);

    expect(SecureStore.set).not.toHaveBeenCalledWith(SecureStoreKey.ACCESS_TOKEN, expect.anything());
  });
});
```

Run them:

```bash
yarn jest SupabaseAuthClient
```

```text
PASS  src/httpClients/__tests__/SupabaseAuthClient.rntl.ts
  SupabaseAuthClient.signIn
    ✓ stores tokens and returns the validated session on success (28 ms)
    ✓ throws AuthError with invalid_credentials on 400 (12 ms)
    ✓ does not store tokens when sign-in fails (10 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

The third test is the one that matters most. It's easy to write a sign-in that *appears* to work because the success path is fine, and only discover the bug when a real failed login leaves stale tokens in the Keychain. Asserting the storage *write* never happened on failure catches that class of bug at the unit-test level.

## Common pitfalls

**Don't put `apikey` in the Authorization header.** It goes in its own `apikey` header. Supabase rejects requests where the anon key is mistaken for a Bearer token.

**Don't forget to clear storage on sign-out.** A user who signs out and then opens the app expects to land on login. If `SecureStore.clear()` doesn't run, the request interceptor still attaches a stale token, the app thinks they're authenticated, and the home screen flashes briefly before any other check catches the inconsistency.

**Don't rely on the SDK's response shapes.** Supabase has migrated their error format across versions. `error_code` is preferred now; `msg` and `error_description` are legacy. Cover all three in `handleError` and add tests for each shape so a future Supabase version doesn't silently break error mapping.

**Don't share the Axios instance across clients with different auth requirements.** The auth client uses the user's access token. The storage client (covered later in the series) uses the same. The portfolio-data client (against GitHub's raw content API) doesn't need either. Three instances, three constructors, three sets of interceptors. One shared instance for one set of headers gets confused fast.

**Don't skip the response validation.** A schema-validated response is the only way to catch the case where Supabase changes a field and your app silently stores corrupted data. The cost is one Zod parse per call; the benefit is a clear error at the API boundary instead of a `Cannot read property of undefined` three layers deep.

## What's next in the series

The auth client above handles successful requests and clean errors. The interesting case is when a request fails with a 401 because the access token expired, and especially when *five* requests fail with 401 at the same time because the home screen fired them all in parallel. Naively refreshing the token on each 401 invalidates the refresh token after the first success, and the user gets logged out for no reason.

The next post in the series covers the response interceptor that prevents this: a subscriber queue, a single in-flight refresh, and a test that proves the queue holds up under concurrent load.

Source: [`src/httpClients/SupabaseAuthClient.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/httpClients/SupabaseAuthClient.ts).
