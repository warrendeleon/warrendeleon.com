---
title: "Metro runtime mocking para sa deterministic na React Native E2E tests"
description: "Pag-mock ng backend sa Metro bundle level para sa Detox. Walang network interception, flaky tests, o external services. Bakit mas maganda ito kaysa MSW."
tags: ["react-native", "testing", "e2e-testing", "mocking"]
locale: tl
heroImage: "/images/blog/metro-runtime-mocking.webp"
heroAlt: "Metro runtime mocking para sa React Native E2E testing"
campaign: "metro-runtime-mocking"
relatedPosts: ["setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing", "building-a-supabase-rest-client-without-the-sdk"]
---

## Ang problema sa tunay na backends sa E2E tests

Tumatakbo ang iyong Detox tests sa tunay na device o simulator. Nagta-tap ng buttons, nagta-type ng text, nagna-navigate ng screens. Sa isang punto, gumagawa ang app ng API call. Doon nagsisimula ang problema.

Puwedeng pumasa o mag-fail ang parehong test depende sa:

| Factor | Ano ang nagiging mali |
|---|---|
| Network latency | Nag-ti-timeout sa CI, pumapasa naman locally |
| API rate limiting | Nag-fa-fail ang tests kapag masyado kadalas pinapatakbo |
| Shared test data | Ibang test run ang nagbago sa parehong user |
| Backend deployments | Nagbago ang API sa pagitan ng build at test run mo |
| Third-party outages | Down ang auth provider, lahat ng login tests nag-fa-fail |
| Database state | Umaasa ang test sa 3 items, may nagdagdag ng ika-4 |

Bawat isa sa mga ito ay naging dahilan ng test failure sa mga project na pinagtatrabahuhan ko. Wala sa kanila ang totoong bug sa app.

Mas masama ang flaky test kaysa walang test. Tinaturuan nito ang team na balewalain ang failures. Kapag nagsimula na ang mga tao na i-rerun ang suite "just in case", nawala na ang tiwala sa test infrastructure.

## Bakit hindi MSW, Mirage, o isang mock server?

Ito ang mga halatang pagpipilian, at bawat isa ay may totoong lugar. Bago ko ipaliwanag kung bakit lumalampas ako sa kanila para sa Detox, dapat sabihin muna kung saan sila magaling.

**MSW** ay nag-i-intercept ng requests sa network layer sa loob ng Node. Napakahusay nito para sa Jest unit at integration tests, at doon ko [ginagamit ito sa proyektong ito mismo](/blog/tl/setting-up-msw-v2-in-react-native/). Sinasaklaw ng Service Worker mode ang browser. Sa isang Detox run naman, tumatakbo ang app sa native iOS o Android process, at umaalis ang request sa JS runtime sa pamamagitan ng NSURLSession o OkHttp. Hindi ito nakikita ng MSW.

**Mirage JS** ay nagpapatakbo ng in-memory mock server sa loob ng app. Pina-patch nito ang `fetch` at `XMLHttpRequest` sa JS runtime, na gumagana para sa mga library na dumadaan dito (gumagana ang Axios sa JS side, hanggang sa magsimula kang gumamit ng native networking layers). Maayos ang interception model para sa development at Jest; mas hindi ito tugma sa Detox builds kung saan gusto mong naka-bake na ang swap.

**Standalone mock servers** (Prism, json-server, isang maliit na Express app sa localhost) ang pinaka-realistic na option. Pinatatakbo nila ang buong network stack. Ang katumbas ay operational: may process kang patatakbuhin, port na pamamahalaan, CI plumbing para sa pag-spin up nito kasabay ng simulator, at isang build na umaasa sa isang sidecar. Para sa isang maliit na proyekto na pinapatakbo ng isa o dalawang tao, kadalasan mas mabigat ito kaysa sa halaga niyan.

Ang approach na isusulat ko dito ay pinananatili ang swap sa loob ng bundle. Walang sidecar, walang Service Worker, walang `fetch` patching. Pinipili ng isang build flag ang API implementation sa compile time; ang iba pang bahagi ng app ay hindi nagbabago. Bagay ito sa mga apps kung saan kinokontrol mo ang HTTP client (Axios, isang hand-rolled REST client) at gusto mong isang binary lang kada test mode.

## Ano ang isusuko mo

Hindi libre ang mocking. Pinipili mo kung ano ang ipagpapalit.

| Ano ang nakukuha mo | Ano ang nawawala sa iyo |
|---|---|
| Deterministic na resulta | Kumpiyansa na gumagana ang tunay na API integration |
| Mabilis na execution | Coverage ng network edge cases (timeouts, retries) |
| Walang infrastructure na kailangan | Puwedeng mag-drift ang fixture data mula sa tunay na API responses |
| Testable na error states | Kailangang i-maintain ang fixtures habang nagbabago ang API |

Ang tapat na hatian: i-mock para sa araw-araw na E2E suite na tumatakbo sa bawat PR, tapos magpatakbo ng mas maliit na smoke set laban sa tunay na backend sa isang schedule (nightly, pre-release). Nahuhuli ng mocked suite ang regressions nang mabilis. Nahuhuli ng tunay na suite ang integration drift. Hindi sapat ang alinman sa dalawa nang mag-isa.

## Bakit ang bundle, hindi ang network

Tatlong dahilan.

Determinism. Pareho ang input, pareho ang output, sa bawat pagkakataon. Walang flaky retries mula sa isang mabagal na CI runner, walang shared state sa pagitan ng runs, walang outage ng auth provider na nagpapabagsak ng dalawampung tests nang sabay. Kapag nag-fail ang isang Detox test, mali ang app.

Bilis. Walang round trips. Walang database. Sumasagot ang mock responses nang synchronous sa `Promise.resolve`. Isang suite na tumatagal ng walong minuto laban sa tunay na backend ay bumababa sa tatlo gamit ito sa parehong proyekto.

Error states nang walang infrastructure. Para mag-test ng 500 laban sa tunay na server, kailangan mong sirain ito o mag-wire ng espesyal na endpoint. Sa isang flag at isang launch argument, makukuha mo ang bawat error class on demand: network, 500, 404, timeout.

## Mga assumption

Ang setup sa baba ay isinulat laban sa:

- React Native 0.74+ (bare workflow, hindi Expo)
- TypeScript na may standard na RN Babel config
- `react-native-config` na naka-install para sa build-time flag (`Config.E2E_MOCK`)
- `react-native-launch-arguments` para sa per-test arguments sa runtime
- Detox na naka-wire na para sa E2E tests
- Isang custom HTTP client kung saan kinokontrol mo ang request layer (isang Axios instance, isang hand-rolled REST client), hindi ang Supabase o Firebase SDK nang direkta

Kung ang tanging daan mo papunta sa backend ay isang vendor SDK, hindi makakaabot doon ang approach na ito. Kailangan mo munang i-wrap ang SDK sa likod ng sarili mong client, tapos mag-mock sa boundary na iyon.

## Paano gumagana

Sa build time, i-bake ang isang flag sa native build. Sa runtime, tine-check ng bawat API function ang flag. Kung naka-on ang mocking, ibabalik ang fixture data na naka-wrap sa parehong response shape; kung hindi, tumama sa tunay na network. Nangyayari ang pagpili sa loob ng function, kaya pareho pa rin ang mga callers (Redux, screens, hooks).

### Step 1: pumili kung paano papasok ang flag

Dalawang praktikal na option. Hindi sila magkasalungat, pero kadalasan isa lang sa kanila ang gusto mo.

Binabasa ng `react-native-config` ang isang `.env` file sa native build time at ine-expose ang values sa pamamagitan ng `Config.E2E_MOCK`. Naka-set ang value habang nag-build ang Xcode o Gradle ng binary, kaya magpapatakbo ka ng `E2E_MOCK=true yarn detox:ios:build` para makagawa ng mocked build.

```bash
yarn add react-native-config
cd ios && pod install && cd ..
```

Ang Babel plugin na `babel-plugin-transform-inline-environment-variables` ang JS-side na alternatibo. Sinusulat nito muli ang `process.env.E2E_MOCK` sa source mo bilang literal na string sa bundle time. Kung ito ang papasukin mo, direktang babasahin ang flag:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-environment-variables'],
};
```

Pareho ang ibinibigay ng dalawang approach: ang flag ay isang constant sa shipped binary, hindi runtime lookup. Ginagamit ng natitirang bahagi ng post ang `react-native-config`, na siyang ginagamit ng [rn-warrendeleon repo](https://github.com/warrendeleon/rn-warrendeleon) sa production.

### Step 2: ang configuration module

Isang module ang nagbabasa ng flag at ine-expose ito. Sinusuportahan din ng reference implementation ang isang runtime override (kapaki-pakinabang para mag-flip ng mocks habang manual dev session nang walang rebuild), pero ang bundle-time flag ang inaasahan ng Detox runs mo.

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

Sa totoong codebase, naka-persist ang override sa `AsyncStorage` para mabuhay ito sa isang reload; isang extension iyon, hindi ang core na ideya.

### Step 3: ang fixture files

Nakalagay ang fixture data sa JSON files, naka-organise ayon sa locale:

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

Isang fixture file ay plain JSON na tumutugma sa API response shape:

```json
// src/test-utils/fixtures/api/en/profile.json
{
  "name": "Warren de Leon",
  "title": "Senior Software Engineer",
  "location": "London, UK",
  "bio": "..."
}
```

Ine-export ng isang barrel file ang mga ito na may naka-attach na types, kaya isang mismatched na fixture ay compile error:

```typescript
// src/test-utils/fixtures/index.ts
import profileENData from './api/en/profile.json';
import educationENData from './api/en/education.json';
import workxpENData from './api/en/workxp.json';

export const mockProfileEN = profileENData as Profile;
export const mockEducationEN = educationENData as Education[];
export const mockWorkXPEN = workxpENData as WorkExperience[];
```

### Step 4: ang API switch

Tine-check ng bawat API function ang flag sa simula. Kung naka-on ang mocking, ibalik ang fixture data na naka-wrap sa Axios-compatible response. Umaasa ang pattern na ito sa pagmamay-ari ng HTTP boundary, na isa sa mga dahilan kung bakit ako [gumawa ng sarili kong REST client](/blog/building-a-supabase-rest-client-without-the-sdk/) sa halip na kunin ang Supabase SDK.

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

Mahalagang tandaan:

- Nagbabalik ang mock path ng buong Axios response object. Hindi malalaman ng Redux, selectors, at components ang pagkakaiba.
- Language-specific fixtures na may fallback sa English.
- Nagva-validate pa rin ang tunay na path [gamit ang Zod](/blog/runtime-api-validation-zod-react-native/). Nila-laktawan ng mock path ang validation dahil typed na ang fixtures sa import.
- Walang conditional imports. Pareho ang path na nakaupo sa iisang function.

### Step 5: error simulation

Binibigay sa iyo ng flag ang mocked happy paths. Binibigay sa iyo ng launch arguments ang error states on demand.

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

I-check ang error simulation bago ibalik ang fixture data:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    if (error) return Promise.reject(error);
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

Ang bawat error state ay nagiging launch argument: network failures, 500s, 404s, timeouts. Wala sa kanila ang nangangailangan ng sirang server.

Magkaibang trabaho ang ginagawa ng `launchArgs` at `E2E_MOCK`. Ang `E2E_MOCK` ay naka-bake sa binary sa native build time at pinapalit ang API layer sa pagitan ng tunay na calls at fixtures. Ang `launchArgs` naman ay binabasa sa runtime sa pamamagitan ng `react-native-launch-arguments` at sinasabi sa naka-mock na API kung aling scenario ang patatakbuhin para sa partikular na test na ito. Isang binary, maraming scenarios.

## Authentication mocking

Ang awkward na bahagi ay ang auth. Hinahawakan ng tunay na flows ang tokens, sessions, email verification, password resets. Ang pag-mock ng mga ito ay nangangahulugang magtatago ng kaunting state sa loob ng mock:

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

Isinusulat ng mock ang user email sa [encrypted storage](/blog/tiered-secure-storage-react-native/) sa parehong paraan na gagawin ng tunay na signup. Binabasa ng mga sumunod na calls (login, profile fetch) ang stored state na iyon para mapanatili ang coherent na session sa buong test.

Para sa error testing, isang maliit na convention ang nakakatipid ng maraming wiring: mga password na nagsisimula sa "Wrong" ay nagti-trigger ng auth error. Walang launch argument na kailangan para sa karaniwang bad-password na kaso.

## Ang build at test flow

```bash
# I-build ang app na may mocking na naka-on
E2E_MOCK=true yarn detox:ios:build

# Patakbuhin ang E2E tests laban sa mocked binary
yarn detox:ios:test

# I-build at patakbuhin ang smoke tests laban sa tunay na backend (hiwalay na binary)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

Dalawang binaries, dalawang suites. Mocked para sa buong PR run, tunay para sa smoke set.

## Mga karaniwang pagkakamali

**Nag-da-drift ang fixtures mula sa tunay na API.** Ito ang pinakamalaking risk. Kung ang backend ay nagdagdag ng field at wala ito sa fixtures mo, mananatiling green ang mock tests habang nasisira ang tunay na app. Patakbuhin ang Zod schemas mo laban sa fixtures mo sa isang unit test; mag-fa-fail sa CI ang isang fixture na hindi nasisiyahan ang schema.

**Sobrang daming naka-mock.** I-mock ang HTTP boundary at huminto. Dapat tunay ang Redux, state management, navigation, at rendering. Kung pekeng lahat ng layer, tine-test mo ang fixtures mo.

**Nakakalimutan ang tunay na integration.** Nahuhuli ng mocked E2E tests ang UI regressions. Hindi nila nahuhuli ang contract changes. Magpanatili ng maliit na real-backend smoke suite sa isang schedule, kahit limang critical paths lang.

**Nale-leak ang state sa pagitan ng scenarios.** Dapat magsimulang malinis ang bawat Detox scenario. Tawagin ang `device.reloadReactNative()` (o i-relaunch ang app) sa `Before` hook para hindi tumagas ang mock na isinulat ng isang test patungo sa susunod.

## Saan ka iiwan nito

Isang araw na trabaho para sa scaffolding. Pagkatapos niyan, tumatakbo ang E2E suite nang walang backend, walang network, walang external services.

Sa proyektong pinanggalingan ng pattern na ito, umupo ang mocked suite sa tatlong minuto. Tumakbo ang parehong tests laban sa tunay na backend sa walo at paminsan-minsang nag-fail. Ilang linggo nang green ang mocked suite. Ang tunay na suite ay kailangan ng pag-aalaga.

Mock para sa bilis at determinism sa bawat PR. Tunay na backend para sa integration confidence sa isang schedule. Ang layunin ng isang E2E suite ay mahuli ang app regressions, hindi para i-test ang network mo.

*Ang post na ito ay bahagi ng isang serye tungkol sa testing ng React Native apps. Sinasaklaw ng mga naunang entries ang [MSW v2 para sa unit at integration tests](/blog/tl/setting-up-msw-v2-in-react-native/) at [Detox kasama ang Cucumber BDD para sa E2E](/blog/tl/detox-cucumber-bdd-react-native-e2e-testing/). Ang code ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
