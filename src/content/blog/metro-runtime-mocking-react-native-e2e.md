---
title: "Metro runtime mocking for deterministic React Native E2E tests"
description: "Mocking the backend at the Metro bundle level for Detox. No network interception, no flaky tests, no external services. Why this beats MSW for E2E."
publishDate: 2026-12-21
series: "Testing and Infrastructure"
tags: ["react-native", "testing", "e2e-testing", "mocking"]
locale: en
heroImage: "/images/blog/metro-runtime-mocking.webp"
heroImgPrompt: "A large two-way toggle switch inside a plain bundle cube rerouting an arrow away from a crossed-out cloud toward a stack of plain folders, a small phone outline"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#D3E7EE"
heroAlt: "Metro runtime mocking for React Native E2E testing"
campaign: "metro-runtime-mocking"
relatedPosts: ["setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing", "building-a-supabase-rest-client-without-the-sdk"]
---

## The problem with real backends in E2E tests

Your Detox tests run on a real device or simulator. They tap buttons, type text, navigate screens. At some point, the app makes an API call. That's where things get fragile.

The same test can pass or fail depending on:

| Factor | What goes wrong |
|---|---|
| Network latency | Timeout on CI, passes locally |
| API rate limiting | Tests fail when run too frequently |
| Shared test data | Another test run mutated the same user |
| Backend deployments | API changed between your build and your test run |
| Third-party outages | Auth provider is down, all login tests fail |
| Database state | Test expects 3 items, someone added a 4th |

Every one of these has caused a test failure in a project I've worked on. None were actual bugs in the app.

A flaky test is worse than no test. It trains the team to ignore failures. Once people start re-running the suite "just in case", you've lost trust in your test infrastructure.

## Why not MSW, Mirage, or a mock server?

These are the obvious choices, and each fits a real shape. Worth saying what they do well before explaining why I reach past them for Detox.

**MSW** intercepts requests at the network layer inside Node. It's excellent for Jest unit and integration tests, and that's where I [use it on this same project](/blog/setting-up-msw-v2-in-react-native/). Service Worker mode covers the browser. In a Detox run, though, the app runs in a native iOS or Android process, and the request leaves the JS runtime through NSURLSession or OkHttp. MSW can't see those.

**Mirage JS** runs an in-memory mock server inside the app. It patches `fetch` and `XMLHttpRequest` in the JS runtime, which works for libraries that go through those (Axios on the JS side does, until you start using native networking layers). The interception model is sound for development and Jest; it's less aligned with Detox builds where you want the swap baked in.

**Standalone mock servers** (Prism, json-server, a small Express app on localhost) are the most realistic option. They exercise the full network stack. The trade-off is operational: now you've got a process to start, a port to manage, CI plumbing for spinning it up alongside the simulator, and a build that depends on a sidecar to be up. For a small project run by one or two people, that's usually more weight than it's worth.

The approach I want to write up here keeps the swap inside the bundle. No sidecar, no Service Worker, no `fetch` patching. A build flag picks the API implementation at compile time; the rest of the app doesn't change. It suits apps where you control the HTTP client (Axios, a hand-rolled REST client) and want one binary per test mode.

## What you give up

Mocking isn't free. You're picking what to trade.

| What you gain | What you lose |
|---|---|
| Deterministic results | Confidence that the real API integration works |
| Fast execution | Coverage of network edge cases (timeouts, retries) |
| No infrastructure needed | Fixture data can drift from real API responses |
| Testable error states | Need to maintain fixtures as the API evolves |

The honest split: mock for the daily E2E suite that runs on every PR, then run a smaller smoke set against the real backend on a schedule (nightly, pre-release). The mocked suite catches regressions fast. The real suite catches integration drift. Neither alone is enough.

## Why the bundle, not the network

Three reasons.

Determinism. Same input, same output, every time. No flaky retries from a slow CI runner, no shared state between runs, no auth provider outage failing twenty tests at once. If a Detox test fails, the app is wrong.

Speed. No round trips. No database. Mock responses resolve synchronously in `Promise.resolve`. A suite that took eight minutes against a real backend drops to three with this in place on the same project.

Error states without infrastructure. Testing a 500 against a real server means either breaking it or wiring a special endpoint. With a flag and a launch argument, you get every error class on demand: network, 500, 404, timeout.

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare workflow, not Expo)
- TypeScript with the standard RN Babel config
- `react-native-config` installed for the build-time flag (`Config.E2E_MOCK`)
- `react-native-launch-arguments` for runtime per-test arguments
- Detox already wired up for E2E tests
- A custom HTTP client where you control the request layer (an Axios instance, a hand-rolled REST client), not the Supabase or Firebase SDK directly

If your only path to the backend is a vendor SDK, this approach can't reach in. You'd need to wrap the SDK behind your own client first, then mock at that boundary.

## How it works

At build time, bake a flag into the native build. At runtime, every API function checks the flag. If mocking is on, return fixture data wrapped in the same response shape; if not, hit the real network. The choice happens inside the function, so callers (Redux, screens, hooks) stay identical.

### Step 1: pick how the flag gets in

Two practical options. They're not mutually exclusive, but you usually want one of them.

`react-native-config` reads from a `.env` file at native build time and exposes values through `Config.E2E_MOCK`. The value is set when Xcode or Gradle builds the binary, so you'd run `E2E_MOCK=true yarn detox:ios:build` to produce a mocked build.

```bash
yarn add react-native-config
cd ios && pod install && cd ..
```

The Babel plugin `babel-plugin-transform-inline-environment-variables` is the JS-side alternative. It rewrites `process.env.E2E_MOCK` in your source to the literal string at bundle time. If you go that route, you read the flag directly:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-environment-variables'],
};
```

Either approach gives you the same property: the flag is a constant in the shipped binary, not a runtime lookup. The rest of this post uses `react-native-config`, which is what the [rn-warrendeleon repo](https://github.com/warrendeleon/rn-warrendeleon) uses in production.

### Step 2: the configuration module

A single module reads the flag and exposes it. The reference implementation also supports a runtime override (useful for flipping mocks during manual dev sessions without a rebuild), but the bundle-time flag is what your Detox runs rely on.

```typescript
// src/config/e2e.ts
import Config from 'react-native-config';

const envE2EMockEnabled = Config.E2E_MOCK === 'true';
let runtimeOverride: boolean | null = null;

export const isE2EMockEnabled = (): boolean => {
  return runtimeOverride ?? envE2EMockEnabled;
};

export const setE2EMockOverride = (value: boolean | null): void => {
  runtimeOverride = value;
};
```

In the real codebase the override persists to `AsyncStorage` so it survives a reload; that's an extension, not the core idea.

### Step 3: the fixture files

Fixture data lives in JSON files, organised by locale:

```
src/test-utils/fixtures/api/
├── en/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── es/
├── ca/
├── pl/
└── tl/
```

A fixture file is plain JSON matching the API response shape:

```json
// src/test-utils/fixtures/api/en/profile.json
{
  "name": "Warren",
  "email": "warren@example.com",
  "phone": "+44 7700 900000",
  "profilePicture": "https://example.com/avatar.png"
}
```

A barrel file exports them with types attached, so a mismatched fixture is a compile error:

```typescript
// src/test-utils/fixtures/index.ts
import profileENData from './api/en/profile.json';
import educationENData from './api/en/education.json';
import workxpENData from './api/en/workxp.json';

export const mockProfileEN = profileENData as Profile;
export const mockEducationEN = educationENData as Education[];
export const mockWorkXPEN = workxpENData as WorkExperience[];
```

### Step 4: the API switch

Every API function checks the flag at the top. If mocking is on, return fixture data wrapped in an Axios-compatible response. This pattern depends on owning the HTTP boundary, which is one of the reasons I [built my own REST client](/blog/building-a-supabase-rest-client-without-the-sdk/) instead of taking the Supabase SDK.

```typescript
import profileEN from '@app/test-utils/fixtures/api/en/profile.json';
import profileES from '@app/test-utils/fixtures/api/es/profile.json';
import profileCA from '@app/test-utils/fixtures/api/ca/profile.json';
import profilePL from '@app/test-utils/fixtures/api/pl/profile.json';
import profileTL from '@app/test-utils/fixtures/api/tl/profile.json';

const profileFixtures: Record<string, Profile> = {
  en: profileEN as Profile,
  es: profileES as Profile,
  ca: profileCA as Profile,
  pl: profilePL as Profile,
  tl: profileTL as Profile,
};

export const fetchProfileData = async (
  language: string
): Promise<AxiosResponse<Profile>> => {
  if (isE2EMockEnabled()) {
    const fixtureData = profileFixtures[language] || profileFixtures.en;
    return Promise.resolve({
      data: fixtureData,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    });
  }

  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Worth noting:

- The mock path returns a full Axios response object. Redux, selectors, and components can't tell the difference.
- Language-specific fixtures with a fallback to English.
- The real path still [validates with Zod](/blog/runtime-api-validation-zod-react-native/). The mock path skips validation because the fixtures are typed at import.
- No conditional imports. Both paths sit in the same function.

### Step 5: error simulation

The flag gives you mocked happy paths. Launch arguments give you error states on demand.

```typescript
// src/config/e2e-error.ts
export type E2EErrorMode =
  | 'none'
  | 'network'
  | 'server-500'
  | 'not-found-404'
  | 'timeout';

interface E2EErrorConfig {
  errorMode: E2EErrorMode;
  errorEndpoint: 'all' | 'profile' | 'education' | 'workExperience';
}
```

Check for error simulation before returning fixture data:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    if (error) return Promise.reject(error);
  }
  // Return normal fixture data
}
```

In your Detox test, launch the app with error arguments:

```typescript
await device.launchApp({
  launchArgs: {
    errorMode: 'network',
    errorEndpoint: 'profile',
  },
});
```

Every error state becomes a launch argument: network failures, 500s, 404s, timeouts. None of them need a broken server.

`launchArgs` and `E2E_MOCK` do different jobs. `E2E_MOCK` is baked into the binary at native build time and switches the API layer between real calls and fixtures. `launchArgs` is read at runtime via `react-native-launch-arguments` and tells the already-mocked API which scenario to play for this specific test. One binary, many scenarios.

## Authentication mocking

Auth is the awkward part. Real flows touch tokens, sessions, email verification, password resets. Mocking these means maintaining a little state inside the mock:

```typescript
async signUp(request: SupabaseSignUpRequest): Promise<SupabaseSignUpResponse> {
  if (isE2EMockEnabled()) {
    const mockUser: SupabaseUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: request.email,
      created_at: new Date().toISOString(),
    };
    await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, mockUser.email);
    return { user: mockUser, session: null };
  }

  const { data } = await this.axiosInstance.post('/auth/v1/signup', request);
  return data;
}
```

The mock writes the user email to [encrypted storage](/blog/tiered-secure-storage-react-native/) the same way a real signup would. Subsequent calls (login, profile fetch) read that stored state to keep the session coherent across the test.

For error testing, a small convention saves a lot of wiring: passwords starting with "Wrong" trigger an auth error. No launch argument needed for the common bad-password case.

## The build and test flow

```bash
# Build the app with mocking enabled
E2E_MOCK=true yarn detox:ios:build

# Run E2E tests against the mocked binary
yarn detox:ios:test

# Build and run smoke tests against the real backend (separate binary)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

Two binaries, two suites. Mocked for the full PR run, real for the smoke set.

## Common pitfalls

**Fixtures drift from the real API.** The biggest risk. If the backend adds a field and your fixtures don't, the mock tests stay green while the real app breaks. Run your Zod schemas against your fixtures in a unit test; a fixture that doesn't satisfy the schema fails CI.

**Mocking too much.** Mock the HTTP boundary and stop. Redux, state management, navigation, rendering should all run for real. If every layer is faked, you're testing your fixtures.

**Forgetting the real integration.** Mocked E2E tests catch UI regressions. They don't catch contract changes. Keep a small real-backend smoke suite on a schedule, even if it's five critical paths.

**Leaking state between scenarios.** Each Detox scenario should start clean. Call `device.reloadReactNative()` (or relaunch the app) in the `Before` hook so a mock written by one test doesn't bleed into the next.

## Where this leaves you

A day's work for the scaffolding. After that, the E2E suite runs without a backend, without network, without external services.

On the project this pattern came from, the mocked suite settled at three minutes. The same tests against the real backend ran in eight and failed intermittently. The mocked suite has been green for weeks. The real suite needed babysitting.

Mock for speed and determinism on every PR. Real backend for integration confidence on a schedule. The point of an E2E suite is to catch app regressions, not to test your network.

*This post is part of a series on testing React Native apps. Earlier entries cover [MSW v2 for unit and integration tests](/blog/setting-up-msw-v2-in-react-native/) and [Detox with Cucumber BDD for E2E](/blog/detox-cucumber-bdd-react-native-e2e-testing/). The code is from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
