---
title: "Metro runtime mocking for deterministic React Native E2E tests"
description: "Why mocking your backend in E2E tests matters, and how to do it at the Metro bundle level. No network interception, no flaky tests, no external dependencies."
publishDate: 2026-06-01
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: en
heroImage: "/images/blog/metro-runtime-mocking.jpg"
heroAlt: "Metro runtime mocking for React Native E2E testing"
campaign: "metro-runtime-mocking"
---

## The problem with real backends in E2E tests

Your Detox tests run on a real device (or simulator). They tap buttons, type text, navigate screens. At some point, the app makes an API call. And that's where things get fragile.

**Real backends make E2E tests non-deterministic.** The same test can pass or fail depending on:

| Factor | What goes wrong |
|---|---|
| Network latency | Timeout on CI, passes locally |
| API rate limiting | Tests fail when run too frequently |
| Shared test data | Another test run mutated the same user |
| Backend deployments | API changed between your build and your test run |
| Third-party outages | Auth provider is down, all login tests fail |
| Database state | Test expects 3 items, someone added a 4th |

Every one of these has caused a test failure in a project I've worked on. None of them were actual bugs in the app.

> 💡 **A flaky test is worse than no test.** It trains the team to ignore failures. Once people start re-running the suite "just in case", you've lost trust in your test infrastructure.

## Why mock the backend?

Why bother?

**1. Determinism.** The same test produces the same result every time. No network variability, no shared state, no external dependencies. If a test fails, it's because the app is broken, not because the API had a bad day.

**2. Speed.** No network round trips. No waiting for database queries. Mock responses return instantly. A suite that takes 8 minutes against a real backend can drop to 3 minutes with mocks.

**3. Testable error states.** With a real backend, testing a 500 error means either breaking the server or building a special endpoint. With mocks, you pass a launch argument and the app returns whatever error you need.

## The trade-offs

Mocking isn't free. You're choosing what to give up.

| What you gain | What you lose |
|---|---|
| Deterministic results | Confidence that the real API integration works |
| Fast execution | Coverage of network edge cases (timeouts, retries) |
| No infrastructure needed | Fixture data can drift from real API responses |
| Testable error states | Need to maintain fixtures as the API evolves |

The honest answer: **you need both.** Mock the backend for your daily E2E suite (the one that runs on every PR). Run a smaller set of smoke tests against the real backend on a schedule (nightly, pre-release). The mocked suite catches regressions fast. The real suite catches integration drift.

## Why not MSW?

[MSW works well for unit and integration tests](/blog/setting-up-msw-v2-in-react-native/) because those run in Node.js (via Jest). MSW intercepts requests at the network level inside the Node process.

Detox E2E tests are different. The app runs in a native iOS or Android process, not in Node.js. MSW can't intercept requests inside a native process. The network calls leave the JavaScript runtime and go through the platform's native networking stack (NSURLSession on iOS, OkHttp on Android).

You need a mocking strategy that works inside the app itself. That's where Metro runtime mocking comes in.

## How it works

The idea is simple: at build time, bake a flag into the JavaScript bundle. At runtime, every API function checks the flag. If mocking is enabled, return fixture data instead of making a real network call.

### Step 1: The environment variable

Babel's `transform-inline-environment-variables` plugin inlines environment variables into the bundle at compile time:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'transform-inline-environment-variables',
  ],
};
```

When you build with `E2E_MOCK=true`, every reference to `process.env.E2E_MOCK` becomes the string `"true"` in the compiled JavaScript. It's not a runtime lookup. It's a static value baked into the bundle.

### Step 2: The configuration module

A single module reads the flag and exposes it to the rest of the app:

```typescript
// src/config/e2e.ts
import Config from 'react-native-config';

const envE2EMockEnabled = Config.E2E_MOCK === 'true';
let runtimeOverride: boolean | null = null;

export function isE2EMockEnabled(): boolean {
  if (runtimeOverride !== null) return runtimeOverride;
  return envE2EMockEnabled;
}

export function setE2EMockOverride(value: boolean | null): void {
  runtimeOverride = value;
}
```

The runtime override is useful for developer testing. A dev can toggle mocking without rebuilding the app. For E2E tests, the bundle-time flag is all you need.

### Step 3: The fixture files

Fixture data lives in JSON files, organised by locale:

```
src/test-utils/fixtures/api/
├── en/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── es/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── ca/
│   └── ...
└── tl/
    └── ...
```

These files are imported at bundle time and exported through a barrel file:

```typescript
// src/test-utils/fixtures/index.ts
import profileENData from './api/en/profile.json';
import educationENData from './api/en/education.json';
import workxpENData from './api/en/workxp.json';

export const mockProfileEN = profileENData as Profile;
export const mockEducationEN = educationENData as Education[];
export const mockWorkXPEN = workxpENData as WorkExperience[];
```

The fixtures are typed. If the API response shape changes and the fixture doesn't match, TypeScript catches it at compile time.

### Step 4: The API switch

Every API function checks the flag at the top. If mocking is enabled, it returns fixture data wrapped in an Axios-compatible response:

```typescript
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

  // Real API call
  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Key details:

- ✅ The mock path returns a full Axios response object. Redux, selectors, and components can't tell the difference
- ✅ Language-specific fixtures with a fallback to English
- ✅ The real path still validates with Zod. The mock path skips validation because the fixtures are already typed
- ✅ No conditional imports. Both paths exist in the same function

### Step 5: Error simulation

The real power of this approach: deterministic error testing. Launch arguments control which endpoints fail and how:

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

In your API function, check for error simulation before returning fixture data:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    return Promise.reject(error);
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

Now you can test every error state deterministically: network failures, 500s, 404s, timeouts. Each one is a launch argument, not a broken server.

## Authentication mocking

Auth is the trickiest part. Real auth flows involve tokens, sessions, email verification, password resets. Mocking these requires maintaining state within the mock:

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

The mock stores the user email in encrypted storage, just like the real flow would. Subsequent API calls (login, profile fetch) can read this stored state to maintain consistency across the session.

For error testing, a simple convention works well: passwords starting with "Wrong" trigger an auth error. No special configuration needed.

## The build and test flow

```bash
# Build the app with mocking enabled
E2E_MOCK=true yarn detox:ios:build

# Run E2E tests (app uses fixture data)
yarn detox:ios:test

# Run smoke tests against real backend (separate build)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

The mocked build and the real build are separate app binaries. The mocked one is used for the full E2E suite. The real one is used for a smaller smoke suite.

## Common pitfalls

**Fixtures drift from the real API.** The biggest risk. If the backend adds a field and your fixtures don't have it, the mock tests pass but the real app breaks. Fix this by running your Zod schema validation against your fixtures in a unit test. If the fixture doesn't match the schema, the test fails.

**Mocking too much.** If every API call is mocked, you're testing your fixtures, not your app. Keep the mocking at the HTTP boundary. Redux, state management, navigation, and UI rendering should all be real.

**Forgetting to test the real integration.** Mocked E2E tests catch UI regressions. They don't catch API contract changes. Run a real backend smoke suite on a schedule, even if it's just 5 critical paths.

**Leaking mock state between scenarios.** Each Detox scenario should start with a fresh app state. Use `device.reloadReactNative()` in the `Before` hook to reset everything. Don't rely on mock state from a previous scenario.

## The result

The setup is a day of work. After that, your E2E suite runs without a backend, without network dependencies, and without flaky failures from external services.

In my project, the mocked suite runs in 3 minutes. The same tests against a real backend took 8 minutes and failed intermittently. The mocked suite has been green for weeks. The real suite needed babysitting.

The two approaches work together. Mock for speed and determinism on every PR. Real backend for integration confidence on a schedule. Neither one alone is enough.

> The purpose of E2E tests is to catch app regressions, not to test your network connection.

*This post is part of a series on testing React Native apps. The previous posts cover [MSW v2 for unit and integration tests](/blog/setting-up-msw-v2-in-react-native/) and [Detox + Cucumber BDD for E2E testing](/blog/detox-cucumber-bdd-react-native-e2e-testing/). The code examples are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
