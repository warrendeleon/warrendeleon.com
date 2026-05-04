---
title: "Building a Supabase storage client with retry in React Native"
description: "Build an Axios-based Supabase Storage client in React Native with file uploads, deletes, typed errors, idempotent retries, and exponential backoff."
publishDate: 2026-06-22
tags: ["react-native", "supabase", "axios", "storage", "uploads"]
locale: en
heroImage: "/images/blog/supabase-storage-client.webp"
heroAlt: "Building a Supabase storage client with retry in React Native"
campaign: "supabase-storage-client"
relatedPosts: ["building-an-axios-based-supabase-auth-client", "token-refresh-race-condition-react-native", "building-a-supabase-rest-client-without-the-sdk"]
---

This is part 4 of the [Supabase-without-the-SDK series](/blog/building-a-supabase-rest-client-without-the-sdk/). Parts 2 and 3 covered [the auth client](/blog/building-an-axios-based-supabase-auth-client/) and [the token refresh response interceptor](/blog/token-refresh-race-condition-react-native/). This post is the storage client: profile picture upload and delete, against Supabase Storage's REST API, with exponential-backoff retry on transient failures.

The retry rule, up front:

| Status | Action |
|---|---|
| Network error / timeout / connection drop | Retry with exponential backoff |
| 5xx (server error) | Retry with exponential backoff |
| 408, 429 | Retry, respecting `Retry-After` if present |
| 4xx (400, 401, 403, 413, 422, 404) | Don't retry. Return the error to the caller. |

The rest of this post is what makes that policy work for real uploads: file reading, idempotency on retries, the timeouts, and the typed error mapping.

Source: [`src/httpClients/SupabaseStorageClient.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/httpClients/SupabaseStorageClient.ts).

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare workflow)
- TypeScript with the standard RN Babel config
- The auth client from part 2 already in place (the storage client reuses its token-refresh interceptor pattern)
- A Supabase project with a Storage bucket (this post uses one called `profile-pictures`)
- [Tiered secure storage](/blog/tiered-secure-storage-react-native/) wired up

The bucket configuration on the Supabase dashboard:
- **Public**: yes (so the URLs returned can be served directly to the UI)
- **RLS**: enabled, with policies that restrict users to their own folder (covered in the final post in this series)

## Installation

```bash
yarn add axios react-native-fs
cd ios && pod install && cd ..
```

`react-native-fs` reads the file from the local filesystem and returns its bytes. It's a native module; pod install on iOS, autolinked on Android.

If you're already installing Axios and `react-native-config` from [part 2](/blog/building-an-axios-based-supabase-auth-client/), they're shared between the two clients.

## Why a separate client

The auth client and the storage client both hit the same Supabase project, but they shouldn't share an Axios instance:

| | Auth client | Storage client |
|---|---|---|
| Base URL | `${SUPABASE_URL}` | `${SUPABASE_URL}/storage/v1` |
| Default timeout | 10s (auth calls finish fast) | 30s (uploads can be slow on bad networks) |
| Default `Content-Type` | `application/json` | not set (each upload sets its own) |
| Request body shape | JSON | binary `Uint8Array` |
| Retry behaviour | none (fail fast) | exponential backoff on transient errors |

Two instances, two configurations. Each one stays simple because it only carries the headers and behaviour appropriate for its own endpoints.

## The base client

```typescript
// src/httpClients/SupabaseStorageClient.ts
import Config from 'react-native-config';
import RNFS from 'react-native-fs';
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { SecureStore, SecureStoreKey } from '@app/utils/storage';
import { EncryptedStore, EncryptedStoreKey } from '@app/utils/storage';
import { SupabaseAuthClient } from './SupabaseAuthClient';
import { validateResponse } from '@app/utils/validation';
import { SupabaseUploadResponseSchema } from '@app/schemas';

const BUCKET_NAME = 'profile-pictures';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

class SupabaseStorageClientClass {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${Config.SUPABASE_URL}/storage/v1`,
      timeout: 30_000,
      headers: {
        apikey: Config.SUPABASE_ANON_KEY,
      },
    });

    this.axiosInstance.interceptors.request.use(this.attachToken);
    this.axiosInstance.interceptors.response.use(r => r, this.handle401);
  }

  // ... methods follow
}

export const SupabaseStorageClient = new SupabaseStorageClientClass();
```

The 30-second timeout is the only configuration that materially differs from the auth client. Profile picture uploads on a 4G connection routinely take 5–15 seconds; on a degraded connection 25 seconds isn't unreasonable. A 10-second timeout would fail uploads that would have succeeded.

## Token attachment and refresh

The token-attachment interceptor is identical to the one in [the auth client](/blog/building-an-axios-based-supabase-auth-client/): read the access token from the Keychain on every call, attach it as a Bearer header.

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

The 401 handler is the same shape as the one in [the token refresh post](/blog/token-refresh-race-condition-react-native/), but delegated to the auth client rather than re-implemented:

```typescript
private handle401 = async (error: AxiosError) => {
  const originalRequest = error.config as RetryableRequest;
  if (!originalRequest) return Promise.reject(error);

  if (this.isTokenExpired(error) && !originalRequest._retry) {
    originalRequest._retry = true;
    try {
      await SupabaseAuthClient.refreshSession();
      const newAccessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return this.axiosInstance(originalRequest);
      }
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
  return Promise.reject(error);
};

private isTokenExpired(error: AxiosError): boolean {
  const status = error.response?.status;
  const errorData = error.response?.data as
    | { error_code?: string; msg?: string; message?: string }
    | undefined;
  const errorMessage = errorData?.msg || errorData?.message || '';
  return (
    status === 401 ||
    (status === 403 &&
      (errorData?.error_code === 'bad_jwt' ||
        errorMessage.includes('token is expired') ||
        errorMessage.includes('exp')))
  );
}
```

The `_retry` flag prevents infinite loops if the refresh succeeds but the second call also gets a 401 (unlikely in practice, but the flag costs nothing).

> ⚠️ **`refreshSession()` must be single-flight.** This handler delegates concurrency control to the auth client. Five concurrent storage 401s become five calls to `SupabaseAuthClient.refreshSession()`. If `refreshSession()` itself is *not* single-flight, you've reproduced the exact race condition the previous post exists to prevent, just on the storage path instead of the auth path. The fix is to gate inside `refreshSession()` itself rather than inside the auth client's response interceptor:
>
> ```typescript
> // On SupabaseAuthClient
> private refreshPromise: Promise<RefreshResponse> | null = null;
>
> async refreshSession(): Promise<RefreshResponse> {
>   if (this.refreshPromise) return this.refreshPromise;
>   this.refreshPromise = this._doRefresh().finally(() => {
>     this.refreshPromise = null;
>   });
>   return this.refreshPromise;
> }
> ```
>
> With that wrapper, every concurrent caller (the auth client's own interceptor, the storage client's interceptor, anything else that calls `refreshSession()` directly) shares the same in-flight promise. One network refresh per token-expiry window, regardless of how many subsystems were affected. The pattern in [the token refresh post](/blog/token-refresh-race-condition-react-native/) puts the gate inside the auth interceptor; lifting it up to the method level is the version that scales beyond a single client.

## Uploading a profile picture

```typescript
async uploadProfilePicture(
  userId: string,
  localFilePath: string,
): Promise<UploadResult> {
  try {
    const timestamp = Date.now();
    const filePath = `${userId}/profile-${timestamp}.jpg`;

    const cleanPath = localFilePath.replace(/^file:\/\//, '');
    const base64Content = await RNFS.readFile(cleanPath, 'base64');

    await this.uploadWithRetry(filePath, base64Content);

    const publicUrl = this.getPublicUrl(filePath);
    await EncryptedStore.set(EncryptedStoreKey.PROFILE_PICTURE_URL, publicUrl);

    return { success: true, publicUrl, filePath };
  } catch (error) {
    return {
      success: false,
      publicUrl: null,
      filePath: null,
      error: this.getErrorMessage(error),
    };
  }
}
```

Three things to call out.

**The path includes the user ID.** Storage paths in Supabase look like `${userId}/profile-${timestamp}.jpg`. The user ID prefix is what RLS policies on the bucket use to enforce that users can only write to their own folder. The timestamp prevents accidental overwrites and makes old uploads garbage-collectable from the URL alone.

**The file gets read as base64, then converted to a binary buffer.** RNFS supports `'utf8'`, `'ascii'`, and `'base64'`. Base64 is the right choice for binary data because the alternatives mangle non-text bytes. Axios needs binary for the upload body, so the base64 string gets decoded back to a `Uint8Array` (in `uploadWithRetry` below). The double conversion costs a few milliseconds and is worth it for the platform consistency.

**The successful URL gets cached in EncryptedStore.** That's the URL the profile screen displays. Caching it means the screen renders the new picture immediately on the next render, without waiting for a profile refetch.

**The function returns a result object instead of throwing on failure.** Upload is a user action, not a system operation. The UI needs to show a "try again" message; it doesn't need to crash. Returning `{ success: false, error }` lets the caller render an error toast and keep going, while throwing forces every caller into a try/catch.

## The retry loop

```typescript
private async uploadWithRetry(
  filePath: string,
  base64Content: string,
): Promise<SupabaseUploadResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data } = await this.axiosInstance.post(
        `/object/${BUCKET_NAME}/${filePath}`,
        bytes,
        {
          headers: {
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
          },
        },
      );

      return validateResponse(
        SupabaseUploadResponseSchema,
        data,
        'Supabase Storage upload',
      );
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors (400-499). They won't get better with another try.
      if (axios.isAxiosError(error) && error.response?.status) {
        const status = error.response.status;
        if (status >= 400 && status < 500) {
          throw error;
        }
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  throw lastError || new Error('Upload failed after all retries');
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

The retry policy is the part worth understanding.

**Three attempts.** With base delay 1 second and exponential backoff (`1s, 2s, 4s`), the worst case adds 7 seconds of wall-clock time before failing. That's tolerable for a user action.

**The 4xx-vs-5xx distinction matters.** A 401 is a stale token (the response interceptor handles it before the retry loop sees it). A 403 is "you don't have permission", retrying changes nothing. A 413 is "file too large", retrying changes nothing. A 422 is a validation error, same. None of these get better with a second attempt; the loop throws immediately so the user sees a clear error instead of waiting through three pointless retries.

5xx errors and network errors are different. A 503 from a Supabase region having a bad five seconds, or a TCP reset on a flaky cell signal, often resolves on the next attempt. Those go through the backoff.

> 💡 **The general rule for retries:** retry idempotent operations on transient failures. "Idempotent" means the same call twice has the same effect as once (the `x-upsert: true` header makes this true for the upload). "Transient" means a temporary condition that's likely to resolve. 5xx and network errors qualify; 4xx don't.

**`x-upsert: true` makes the upload idempotent.** Without it, the second attempt would 409 because the path already exists. With it, the upload either succeeds or fails the same way every time, so retrying is safe.

**The base64-to-binary conversion happens inside the loop.** That looks wasteful, but the conversion is fast (a few milliseconds for a profile picture) and putting it inside the loop avoids holding a giant `Uint8Array` in memory for the entire backoff window if the upload fails on attempt 1.

## Deleting a picture

```typescript
async deleteProfilePicture(
  userId: string,
  filePath: string,
): Promise<DeleteResult> {
  try {
    await this.axiosInstance.delete(`/object/${BUCKET_NAME}/${filePath}`);
    await EncryptedStore.remove(EncryptedStoreKey.PROFILE_PICTURE_URL);
    return { success: true };
  } catch (error) {
    return { success: false, error: this.getErrorMessage(error) };
  }
}
```

Delete is a single DELETE request. There's no retry loop because the operation is short, idempotent (deleting an already-deleted file returns 404), and a failed delete on the user side rarely matters. The actual cleanup of orphaned files happens server-side via a database trigger, covered briefly below.

A 404 on delete usually means the file was already gone, which is fine to treat as success in most flows. But log it. If every delete starts 404-ing, your filename construction is wrong, your bucket configuration changed, or someone else's user ID is in your path. A silent 404-as-success would hide all three.

## Old picture cleanup, briefly

A common bug pattern: user uploads picture A, then picture B, then their bucket has both and you've leaked storage. The naive fix is to delete A from the client *before* uploading B, which fails when the client crashes between the two operations.

The pattern that actually works: a database trigger. When the user's `profile_picture_url` column changes, the trigger inserts the old URL into a `cleanup_queue` table. A scheduled Edge Function reads the queue and deletes the orphaned files. The client never has to coordinate the two operations.

The full SQL for the trigger and the Edge Function lives in the final post in this series on RLS and backend security; they're related concerns and easier to read together.

## Public URL helper

```typescript
getPublicUrl(filePath: string): string {
  return `${Config.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;
}
```

A pure function. Public buckets serve files at a predictable URL pattern, so there's no need to ask the server for the URL after upload. The filename is the URL.

## Typed errors

```typescript
export type StorageErrorCode =
  | 'UPLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'FILE_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'INVALID_FILE';

export class StorageError extends Error {
  public readonly code: StorageErrorCode;

  constructor(message: string, code: StorageErrorCode) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }
}

private getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    switch (error.response?.status) {
      case 401:
        return 'Session expired. Please log in again.';
      case 403:
        return 'You do not have permission to upload files.';
      case 413:
        return 'File is too large. Please choose a smaller image.';
      case 404:
        return 'Storage service unavailable. Please try again.';
      default:
        if (error.code === 'ECONNABORTED') {
          return 'Upload timed out. Please check your connection.';
        }
        if (error.code === 'ERR_NETWORK') {
          return 'Network error. Please check your connection.';
        }
        return 'Failed to upload. Please try again.';
    }
  }

  return error instanceof Error ? error.message : 'An unexpected error occurred';
}
```

Same pattern as the auth client's `AuthError` (and same reason): the UI switches on the error code while the user sees the message. The codes are storage-specific so they don't collide with auth codes when both surface to the same toast component.

## Testing the upload flow

```typescript
// src/httpClients/__tests__/SupabaseStorageClient.rntl.ts
import { http, HttpResponse } from 'msw';
import RNFS from 'react-native-fs';
import { server } from '@app/test-utils/msw/server';
import { SupabaseStorageClient } from '../SupabaseStorageClient';

jest.mock('react-native-config', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('react-native-fs', () => ({ readFile: jest.fn() }));

jest.mock('@app/config/e2e', () => ({
  isE2EMockEnabled: jest.fn(() => false),
}));

jest.mock('@app/utils/storage/EncryptedStore', () => ({
  EncryptedStore: { set: jest.fn(), get: jest.fn(), remove: jest.fn() },
  EncryptedStoreKey: { PROFILE_PICTURE_URL: 'profilePictureURL' },
}));

jest.mock('@app/utils/storage/SecureStore', () => ({
  SecureStore: { get: jest.fn().mockResolvedValue('mock-token'), set: jest.fn() },
  SecureStoreKey: { ACCESS_TOKEN: 'accessToken', REFRESH_TOKEN: 'refreshToken' },
}));

jest.mock('@app/httpClients/SupabaseAuthClient', () => ({
  SupabaseAuthClient: { refreshSession: jest.fn() },
}));

jest.mock('@app/utils/logger', () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
}));

const SUPABASE_URL = 'https://test.supabase.co';
const BUCKET = 'profile-pictures';
const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
const mockFilePath = 'file:///tmp/profile.jpg';

describe('SupabaseStorageClient.uploadProfilePicture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    server.resetHandlers();
    // "Hello World" base64-encoded: a real, valid base64 string so atob() works.
    (RNFS.readFile as jest.Mock).mockResolvedValue('SGVsbG8gV29ybGQ=');
  });

  it('returns the public URL on a successful upload', async () => {
    server.use(
      http.post(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/*`, () =>
        HttpResponse.json({ Key: `${BUCKET}/${mockUserId}/profile-123.jpg` }),
      ),
    );

    const result = await SupabaseStorageClient.uploadProfilePicture(mockUserId, mockFilePath);

    expect(result.success).toBe(true);
    expect(result.publicUrl).toContain(`/storage/v1/object/public/${BUCKET}/`);
  });

  it('retries on 5xx and succeeds on the second attempt', async () => {
    let attempts = 0;
    server.use(
      http.post(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/*`, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json({ message: 'Service unavailable' }, { status: 503 });
        }
        return HttpResponse.json({ Key: `${BUCKET}/${mockUserId}/profile-123.jpg` });
      }),
    );

    const result = await SupabaseStorageClient.uploadProfilePicture(mockUserId, mockFilePath);

    expect(attempts).toBe(2);
    expect(result.success).toBe(true);
  });

  it('does not retry on 4xx and returns a useful error', async () => {
    let attempts = 0;
    server.use(
      http.post(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/*`, () => {
        attempts++;
        return HttpResponse.json({ message: 'Payload too large' }, { status: 413 });
      }),
    );

    const result = await SupabaseStorageClient.uploadProfilePicture(mockUserId, mockFilePath);

    expect(attempts).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('too large');
  });
});
```

Run it:

```bash
yarn jest SupabaseStorageClient
```

```text
PASS  src/httpClients/__tests__/SupabaseStorageClient.rntl.ts
  SupabaseStorageClient.uploadProfilePicture
    ✓ returns the public URL on a successful upload (24 ms)
    ✓ retries on 5xx and succeeds on the second attempt (1058 ms)
    ✓ does not retry on 4xx and returns a useful error (8 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

The 5xx retry test takes ~1 second of wall-clock because the first backoff sleep is 1 second. To keep tests fast, override `RETRY_BASE_DELAY_MS` in the test setup, or use `jest.useFakeTimers()` to advance time without waiting. Real time is fine for one or two tests; if you have a dozen retry tests, fake timers are worth the setup.

## Common pitfalls

**Don't put the user ID in the URL but check the bucket policy with the auth.uid() function.** The path `${userId}/${filename}` is what makes RLS policies `(storage.foldername(name))[1] = auth.uid()::text` work. Without that prefix, the policy can't tell which user owns the file.

**Don't forget `x-upsert: true` if you want retries to be safe.** Without it, the second attempt of an upload that already partially completed returns 409 Conflict. The retry loop sees that as a "won't retry on 4xx" error and gives up. With it, the upload either succeeds cleanly or fails cleanly, regardless of how many attempts ran.

**Don't read the file before checking the auth state.** RNFS will happily read the file and hand you the base64 even if there's no session; the upload then fails with 401 after the file has been loaded into memory. Check `SecureStore.get(SecureStoreKey.ACCESS_TOKEN)` first, fail fast if it's missing, and only read the file once you know the request will at least be attempted.

**Don't ignore the timeout in the upload error message.** A 30-second timeout firing isn't necessarily a permanent failure. The user-facing message ("Upload timed out. Please check your connection.") suggests a retry is safe to attempt manually. Don't conflate timeout with "the file is bad".

**Don't try to delete the old picture from the client.** It looks correct ("delete A, upload B") and fails at the worst time: a crash between the two operations leaves the user with no picture at all. Use a server-side cleanup queue triggered by the column update; the client only ever uploads, never tries to coordinate two operations.

## What's next in the series

Both clients now have token attachment, response handling, and typed errors. The next concern is the network underneath them. By default, an Axios call goes through whatever certificate the operating system trusts, which means a malicious certificate authority (or a corporate MITM proxy with the right root cert installed) can read every token, every email, every file URL the app exchanges with Supabase.

The next post in the series covers certificate pinning: locking the HTTP layer to specific public-key pins so the app refuses to talk to anyone but the real Supabase, even on a network that thinks it can intercept TLS.

Source: [`src/httpClients/SupabaseStorageClient.ts`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/src/httpClients/SupabaseStorageClient.ts). Each post in this series is filed under [the supabase tag at warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/).
