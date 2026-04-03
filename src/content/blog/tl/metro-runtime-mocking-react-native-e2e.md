---
title: "Metro runtime mocking para sa deterministic na React Native E2E tests"
description: "Bakit mahalaga ang pag-mock ng backend sa E2E tests, at paano gawin ito sa Metro bundle level. Walang network interception, walang flaky tests, walang external dependencies."
publishDate: 2026-05-11
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: tl
heroImage: "/images/blog/metro-runtime-mocking.jpg"
heroAlt: "Metro runtime mocking para sa React Native E2E testing"
---

## Ang problema sa tunay na backends sa E2E tests

Tumatakbo ang iyong Detox tests sa tunay na device (o simulator). Nagta-tap ng buttons, nagta-type ng text, nagna-navigate ng screens. Sa isang punto, gumagawa ang app ng API call. At doon nagsisimula ang problema.

**Ginagawang non-deterministic ng tunay na backends ang E2E tests.** Puwedeng pumasa o mag-fail ang parehong test depende sa:

| Factor | Ano ang nagiging mali |
|---|---|
| Network latency | Nag-ti-timeout sa CI, pumapasa naman locally |
| API rate limiting | Nag-fa-fail ang tests kapag masyado kadalas pinapatakbo |
| Shared test data | Ibang test run ang nagbago sa parehong user |
| Backend deployments | Nagbago ang API sa pagitan ng build at test run mo |
| Third-party outages | Down ang auth provider, lahat ng login tests nag-fa-fail |
| Database state | Umaasa ang test sa 3 items, may nagdagdag ng ika-4 |

Bawat isa sa mga ito ay naging dahilan ng test failure sa mga project na pinagtatrabahuhan ko. Wala sa kanila ang totoong bug sa app.

> 💡 **Mas masama ang flaky test kaysa walang test.** Tinaturuan nito ang team na balewalain ang failures. Kapag nagsimula na ang mga tao na i-rerun ang suite "just in case", nawala na ang tiwala sa test infrastructure.

## Bakit i-mock ang backend?

Tatlong bagay ang ibinibigay ng pag-mock ng backend sa E2E tests:

**1. Determinism.** Pare-pareho ang resulta ng parehong test sa bawat pagpapatakbo. Walang network variability, walang shared state, walang external dependencies. Kung nag-fail ang test, dahil sira ang app, hindi dahil masama ang araw ng API.

**2. Bilis.** Walang network round trips. Walang paghihintay sa database queries. Agad bumabalik ang mock responses. Isang suite na tumatagal ng 8 minuto sa tunay na backend ay puwedeng bumaba sa 3 minuto gamit ang mocks.

**3. Testable na error states.** Sa tunay na backend, ang pag-test ng 500 error ay nangangahulugang sirain ang server o gumawa ng espesyal na endpoint. Sa mocks, magpapasa ka lang ng launch argument at ibinabalik ng app kahit anong error na kailangan mo.

## Mga trade-offs

Hindi libre ang mocking. Pinipili mo kung ano ang isusuko.

| Ano ang nakukuha mo | Ano ang nawawala sa iyo |
|---|---|
| Deterministic na resulta | Kumpiyansa na gumagana ang tunay na API integration |
| Mabilis na execution | Coverage ng network edge cases (timeouts, retries) |
| Walang infrastructure na kailangan | Puwedeng mag-drift ang fixture data mula sa tunay na API responses |
| Testable na error states | Kailangang i-maintain ang fixtures habang nagbabago ang API |

Ang tapat na sagot: **kailangan mo pareho.** I-mock ang backend para sa araw-araw na E2E suite (yung tumatakbo sa bawat PR). Magpatakbo ng mas maliit na set ng smoke tests laban sa tunay na backend sa isang schedule (nightly, pre-release). Nahuhuli ng mocked suite ang regressions nang mabilis. Nahuhuli ng tunay na suite ang integration drift.

## Bakit hindi MSW?

[Gumagana nang maayos ang MSW para sa unit at integration tests](/blog/tl/setting-up-msw-v2-in-react-native/) dahil tumatakbo ang mga iyon sa Node.js (sa pamamagitan ng Jest). Nag-i-intercept ang MSW ng requests sa network level sa loob ng Node process.

Iba ang Detox E2E tests. Tumatakbo ang app sa native iOS o Android process, hindi sa Node.js. Hindi kayang i-intercept ng MSW ang requests sa loob ng native process. Umaalis ang network calls sa JavaScript runtime at dumadaan sa native networking stack ng platform (NSURLSession sa iOS, OkHttp sa Android).

Kailangan mo ng mocking strategy na gumagana sa loob mismo ng app. Doon pumapasok ang Metro runtime mocking.

## Paano gumagana

Simple ang ideya: sa build time, i-bake ang isang flag sa JavaScript bundle. Sa runtime, tine-check ng bawat API function ang flag. Kung naka-enable ang mocking, ibabalik ang fixture data sa halip na gumawa ng tunay na network call.

### Step 1: Ang environment variable

Ini-inline ng `transform-inline-environment-variables` plugin ng Babel ang environment variables sa bundle sa compile time:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'transform-inline-environment-variables',
  ],
};
```

Kapag nag-build ka gamit ang `E2E_MOCK=true`, bawat reference sa `process.env.E2E_MOCK` ay nagiging string na `"true"` sa compiled JavaScript. Hindi ito runtime lookup. Static value ito na naka-bake sa bundle.

### Step 2: Ang configuration module

Isang module ang nagbabasa ng flag at ine-expose ito sa buong app:

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

Kapaki-pakinabang ang runtime override para sa developer testing. Puwedeng i-toggle ng dev ang mocking nang hindi nire-rebuild ang app. Para sa E2E tests, sapat na ang bundle-time flag.

### Step 3: Ang fixture files

Nakalagay ang fixture data sa JSON files, naka-organise ayon sa locale:

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

Ini-import ang mga files na ito sa bundle time at ine-export sa pamamagitan ng barrel file:

```typescript
// src/test-utils/fixtures/index.ts
import profileEN from './api/en/profile.json';
import educationEN from './api/en/education.json';
import workxpEN from './api/en/workxp.json';

export const mockProfileEN = profileEN as Profile;
export const mockEducationEN = educationEN as Education[];
export const mockWorkXPEN = workxpEN as WorkExperience[];
```

Typed ang fixtures. Kung magbago ang API response shape at hindi tugma ang fixture, nahuhuli ito ng TypeScript sa compile time.

### Step 4: Ang API switch

Tine-check ng bawat API function ang flag sa simula. Kung naka-enable ang mocking, nagbabalik ito ng fixture data na naka-wrap sa Axios-compatible response:

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

  // Tunay na API call
  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Mga pangunahing detalye:

- ✅ Nagbabalik ang mock path ng buong Axios response object. Hindi malalaman ng Redux, selectors, at components ang pagkakaiba
- ✅ Language-specific fixtures na may fallback sa English
- ✅ Nagva-validate pa rin ang tunay na path gamit ang Zod. Nila-laktawan ng mock path ang validation dahil typed na ang fixtures
- ✅ Walang conditional imports. Parehong path ay nasa iisang function

### Step 5: Error simulation

Ang tunay na kapangyarihan ng approach na ito: deterministic na error testing. Kino-kontrol ng launch arguments kung aling endpoints ang mag-fa-fail at paano:

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

Sa iyong API function, i-check ang error simulation bago ibalik ang fixture data:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    return Promise.reject(error);
  }
  // Ibalik ang normal na fixture data
}
```

Sa iyong Detox test, i-launch ang app gamit ang error arguments:

```typescript
await device.launchApp({
  launchArgs: {
    errorMode: 'network',
    errorEndpoint: 'profile',
  },
});
```

Ngayon puwede mong i-test ang bawat error state nang deterministic: network failures, 500s, 404s, timeouts. Bawat isa ay launch argument, hindi sirang server.

## Authentication mocking

Ang pinaka-tricky na bahagi ay ang auth. Kinasasangkutan ng tunay na auth flows ang tokens, sessions, email verification, password resets. Kailangan ng state maintenance sa loob ng mock para ma-mock ang mga ito:

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

Sino-store ng mock ang user email sa encrypted storage, katulad ng gagawin ng tunay na flow. Mababasa ng mga sumunod na API calls (login, profile fetch) ang stored state na ito para mapanatili ang consistency sa buong session.

Para sa error testing, isang simpleng convention ang gumagana nang maayos: mga password na nagsisimula sa "Wrong" ay nagti-trigger ng auth error. Walang espesyal na configuration na kailangan.

## Ang build at test flow

```bash
# I-build ang app na may mocking na naka-enable
E2E_MOCK=true yarn detox:ios:build

# Patakbuhin ang E2E tests (gumagamit ng fixture data ang app)
yarn detox:ios:test

# Patakbuhin ang smoke tests laban sa tunay na backend (hiwalay na build)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

Magkahiwalay na app binaries ang mocked build at ang tunay na build. Ginagamit ang mocked para sa buong E2E suite. Ginagamit ang tunay para sa mas maliit na smoke suite.

## Mga karaniwang pagkakamali

**Nag-da-drift ang fixtures mula sa tunay na API.** Ito ang pinakamalaking risk. Kung ang backend ay nagdagdag ng field at wala ito sa fixtures mo, pumapasa ang mock tests pero nasisira ang tunay na app. Ayusin ito sa pamamagitan ng pagpapatakbo ng Zod schema validation sa fixtures mo sa isang unit test. Kung hindi tumugma ang fixture sa schema, mag-fa-fail ang test.

**Sobrang daming nimo-mock.** Kung lahat ng API call ay naka-mock, tine-test mo ang fixtures mo, hindi ang app mo. Panatilihin ang mocking sa HTTP boundary. Dapat tunay ang Redux, state management, navigation, at UI rendering.

**Nakakalimutang i-test ang tunay na integration.** Nahuhuli ng mocked E2E tests ang UI regressions. Hindi nila nahuhuli ang API contract changes. Magpatakbo ng tunay na backend smoke suite sa isang schedule, kahit 5 critical paths lang.

**Nale-leak ang mock state sa pagitan ng scenarios.** Dapat magsimula ang bawat Detox scenario sa bagong app state. Gamitin ang `device.reloadReactNative()` sa `Before` hook para i-reset ang lahat. Huwag umasa sa mock state mula sa nakaraang scenario.

## Sulit ba?

Isang araw na trabaho ang setup. Pagkatapos niyan, tumatakbo ang E2E suite mo nang walang backend, walang network dependencies, at walang flaky failures mula sa external services.

Sa aking project, tumatakbo ang mocked suite sa 3 minuto. Ang parehong tests laban sa tunay na backend ay tumatagal ng 8 minuto at paminsan-minsang nag-fa-fail. Ilang linggo nang green ang mocked suite. Ang tunay na suite ay kailangan ng pag-aalaga.

Magkasama ang dalawang approach. Mock para sa bilis at determinism sa bawat PR. Tunay na backend para sa integration confidence sa isang schedule. Hindi sapat ang alinman sa dalawa nang mag-isa.

> Ang layunin ng E2E tests ay mahuli ang app regressions, hindi para i-test ang network connection mo.

*Ang post na ito ay bahagi ng isang serye tungkol sa testing ng React Native apps. Sinasaklaw ng mga naunang posts ang [MSW v2 para sa unit at integration tests](/blog/tl/setting-up-msw-v2-in-react-native/) at [Detox + Cucumber BDD para sa E2E testing](/blog/tl/detox-cucumber-bdd-react-native-e2e-testing/). Ang mga code examples ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
