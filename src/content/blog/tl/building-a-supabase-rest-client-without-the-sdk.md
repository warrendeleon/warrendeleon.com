---
title: "Pagbuo ng Supabase REST client nang walang SDK"
description: "Bakit Axios ang pinili ko imbes na ang official Supabase SDK para sa isang React Native app. Full control sa interceptors, token refresh, error handling, at kakayahang palitan ang backend nang hindi ginagalaw ang app code."
publishDate: 2026-06-01
tags: ["react-native", "architecture", "http", "authentication"]
locale: tl
heroImage: "/images/blog/supabase-rest-client.jpg"
heroAlt: "Pagbuo ng Supabase REST client nang walang SDK sa React Native"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

## Tatlong linya ng code na nag-cost sa akin ng bawat interview

```typescript
const { data } = await supabase.auth.signInWithPassword({ email, password });
```

Iyan ang Supabase SDK. Isang linya para sa authentication. Isa para sa storage uploads. Isa para sa database queries. Gumagana. Well-documented. At tuwing binubuksan ng potential client ang source code ng portfolio app ko, iyan lang ang makikita nila.

Matagal na akong contractor. Hindi side project ang React Native app ko. **Portfolio ko ito.** Kapag tinanong ako ng client kung ano ang kaya ko, ini-send ko sa kanila itong codebase. Binubuksan nila, binabasa ang code, at nagde-decide kung kukunin nila ako base sa nakita nila.

Kung SDK calls lang ang makita nila, nakikita nila ang isang tao na marunong magbasa ng documentation. Kung custom REST client na may typed interceptors, token refresh race condition handling, certificate pinning, at tiered secure storage ang makita nila, nakikita nila ang isang tao na naiintindihan kung paano talaga gumagana ang production mobile apps.

Hindi ko man lang naisip gamitin ang SDK. Kahit isang segundo.

## Ang tinatago ng SDK

Ang Supabase SDK ay nagha-handle ng authentication, storage, database queries, at real-time subscriptions. I-install, ipasa ang project URL at anon key, at gumagana na. Tatlong linya para sa login, dalawa para sa file upload, isa para sa query.

Sa likod ng mga linyang iyan, may mga desisyon ang SDK na hindi mo nakikita:

- **Kung saan ini-store ang tokens.** Gumagamit ang SDK ng sarili nitong storage adapter. Sa React Native, karaniwang AsyncStorage iyan. Plain text. Walang encryption. Walang hardware-backed security.
- **Paano gumagana ang token refresh.** Internally ang pag-handle ng SDK sa expired tokens. Hindi mo nakikita ang refresh logic, ang retry mechanism, o kung ano ang nangyayari kapag limang requests ang nag-fire nang sabay-sabay na may expired tokens.
- **Ano ang nangyayari sa errors.** May sariling error types ang SDK. Makakakuha ka ng message string at umaasa na lang na useful.
- **Paano ginagawa ang HTTP calls.** Internally, gumagamit ang SDK ng `fetch`. Hindi ka makakapag-add ng interceptors, certificate pinning, o request logging nang hindi nag-wo-workaround sa SDK.

Para sa prototype, wala namang epekto ang lahat ng iyan. Para sa app na nagre-represent ng professional capabilities ko sa hiring managers at clients, **lahat ng iyan ay mahalaga.**

## Ang client

Isang Axios instance. Isang file. Ang tanging lugar sa buong app na nakakaalam na may Supabase.

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

Palitan ang base URL at ang endpoint paths, at makikipag-usap na itong client sa ibang backend. Firebase, AWS Cognito, custom Node.js server. **Hindi malalaman ng natitirang bahagi ng app.** Walang SDK calls na nakakalat sa 13 features. Walang vendor lock-in. Isang file lang ang babaguhin.

Dalawang backends na ang kinakausap ng app ko gamit ang parehong pattern: Supabase para sa auth at storage, GitHub raw content API para sa portfolio data. Parehong Axios structure, parehong interceptor approach, parehong error handling. Gagawing special case ng SDK ang isa sa mga backends na iyon.

## Request interceptor: tokens mula sa secure enclave

Bawat authenticated request ay nangangailangan ng Bearer token. Binabasa ito ng interceptor mula sa **hardware-backed secure enclave** ng device (iOS Keychain / Android Keystore) at awtomatikong inaattach:

```typescript
this.axiosInstance.interceptors.request.use(async config => {
  const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
```

Hindi AsyncStorage. Hindi ang storage adapter ng SDK. Ang [Keychain](/blog/tiered-secure-storage-react-native/). Ang parehong lugar kung saan ini-store ng mga banking apps sa phone mo ang kanilang tokens.

Ibi-bypass lang ng SDK ito. Sarili nitong token storage ang mina-manage nito, at sa React Native ibig sabihin niyan naka-plain text ang access tokens mo katabi ng theme preference mo. Para sa portfolio app na dapat nagde-demonstrate ng production security practices, hindi iyan katanggap-tanggap.

## Response interceptor: ang race condition na walang nagsasabi

Kapag nag-expire ang access token, nagbabalik ang Supabase ng 401. I-refresh ang token at i-retry ang request. Simple.

Hanggang sa **limang requests ang mag-fire nang sabay-sabay** at lahat may 401. Kapag walang coordination, bawat isa ay magti-trigger ng sariling refresh. Limang refresh calls. Ang una ay magsu-succeed. Ang pangalawa ay magfe-fail kasi nagamit na ang refresh token. Na-o-overwrite ang tokens. Nasisira ang session. Na-lo-logout ang user nang walang dahilan.

Internally ang pag-handle nito ng SDK. Hindi mo nakikita. Hindi mo rin nakikitang nasira, at hindi mo matututunan kung paano i-fix.

Gumagamit ang client ko ng **subscriber queue**:

```typescript
private isRefreshing = false;
private refreshSubscribers: Array<(token: string) => void> = [];
```

Ang unang request na makaka-detect ng 401 ang magsi-start ng refresh. Bawat sumunod na 401 ay **naka-queue at naghihintay.** Kapag natapos ang refresh, lahat ng naghihintay na requests ay makakakuha ng bagong token at magre-retry nang sabay-sabay.

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

Tatlong mekanismo na nagtutulungan: ang **`_retry` flag** para maiwasan ang infinite loops, ang **`isRefreshing` gate** para isa lang ang nag-re-refresh sa isang pagkakataon, at ang **`refreshSubscribers` array** ang queue. Kapag nag-fail ang refresh, kini-clear ang tokens at nilo-logout ang user. Walang half-states. Walang silent failures.

Kapag binuksan ng client ang file na ito at nakita ang subscriber queue, alam nilang na-handle ko na ang concurrent auth sa production. Hindi iyan matututunan mula sa SDK.

## Bawat response ay vina-validate

Tinatrust ng SDK kung ano man ang ibalik ng Supabase. Ang client ko, hindi.

```typescript
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse> {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=password', request
  );
  return validateResponse(SupabaseSignInResponseSchema, data, 'signIn');
}
```

Bawat API response ay dumadaan sa Zod schema bago pumasok sa app. Kung baguhin ng Supabase ang response format nila, mahuhuli ito ng app ko sa validation layer na may malinaw na error, imbes na mag-crash tatlong layer pababa na may `Cannot read property 'email' of undefined`.

## Errors na kaya ng app na pag-aksyunan

Nagtha-throw ang SDK ng error objects na may message string. Ang client ko ay nagma-map ng bawat Supabase error code sa isang `AuthError` na may parehong **user-facing message** at **machine-readable code**:

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

Ipinapakita ng UI ang message. Ang Redux store ay nagsi-switch sa code para mag-decide kung anong screen ang ipapakita. **Walang Supabase internals na tumatagas sa app.** Ang error handling layer ang boundary. Lahat ng nasa taas nito ay nagsasalita ng language ng app, hindi ng Supabase.

## Awtomatikong nagre-retry ang uploads

Sinusunod ng storage client ang parehong Axios pattern, na may isang dagdag: **exponential backoff** para sa uploads. Nawawala ang mobile networks. May mga tunnel. Isang failed upload ay hindi dapat ibig sabihin na mawawala ang profile picture ng user.

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

Mag-retry sa network failures at server errors. Mag-fail agad sa client errors. Hindi ibinibigay ng SDK ang control na ito. Either lahat ay ire-retry o wala.

## Paano naman ang certificate pinning?

Gumagana ang Axios client sa **certificate pinning** sa parehong platforms (SHA-256 pins sa Supabase domain sa Android `network_security_config.xml` at iOS TrustKit). Bawat HTTP call ay dumadaan sa pinned connection. Hindi ma-intercept ng MITM attacks ang traffic kahit sa compromised networks.

Gumagawa ang SDK ng sarili nitong HTTP calls internally. Hindi dadaan ang mga calls na iyon sa pinned connection maliban kung explicitly sinusuportahan ito ng SDK. Hindi naman. **Gumagana lang ang certificate pinning kapag ikaw ang may kontrol sa HTTP layer.**

Ganoon din sa **production observability**. May Axios interceptors ako na naglo-log ng request breadcrumbs sa Sentry, na lahat ng sensitive data (tokens, emails, passwords) ay awtomatikong nima-mask ng custom logger. Hindi gagamitin ng internal calls ng SDK ang PII masking rules ko.

## E2E tests nang walang network

Ang [Detox E2E tests](/blog/detox-cucumber-bdd-react-native-e2e-testing/) ko ay tumatakbo nang walang network connection. Ang buong API layer ay nagpa-palit sa local fixtures sa build time. Gumagana lang iyon dahil kontrolado ko ang HTTP client. Bawat auth method ay may mock path na nagbabalik ng fixture data kapag naka-set ang E2E flag.

Sa SDK, nakabaon ang network calls sa loob ng code ng Supabase. Hindi ko ma-swap sa Metro level. Kailangan ng SDK ng sarili nitong mocking strategy, na nagdadagdag ng complexity para sa isang bagay na na-solve na ng architecture ko.

## "Bakit hindi React Query?"

Gumagamit ang app ko ng **Redux Toolkit bilang single source of truth.** Auth state, user profile, settings, work experience. Ang API calls ay dumadaan sa Redux thunks, na tumatawag sa Axios client, na nagsi-store ng results sa Redux store. Isang state system, isang mental model.

In-evaluate ko ang RTK Query bilang migration:

| | Axios + thunks | RTK Query |
|---|---|---|
| **Boilerplate** | ~160 lines per feature | ~3 lines per endpoint |
| **Caching** | Manual | Automatic with TTL |
| **E2E mocking** | Simple, per-function | Custom baseQuery, mas complex |
| **Migration cost** | Wala | 18+ test files na ire-rewrite |

Para sa portfolio app na may limang endpoints at mostly static data, **mas malaki ang migration effort kaysa sa benefits.** Ang RTK Query at React Query ay kumikita ng lugar sa apps na may dose-dosenang endpoints, frequent refetching, at real-time dashboards. Hindi sulit ang pagdagdag ng pangalawang state system para sa data na nilo-load lang isang beses sa launch.

## Kung saan nananalo pa rin ang SDK

May isang bagay na hindi kaya ng REST API: **real-time subscriptions.** Gumagamit ang Supabase Realtime ng WebSockets. Hindi mo iyan mare-replicate gamit ang Axios.

Kapag nagkaroon ng chat feature ang app ko, gagamitin ko ang Supabase SDK para *sa isang feature lang na iyon*. Mananatili ang auth client bilang Axios. Mananatili ang storage client bilang Axios. **Isang SDK import, contained sa isang feature.** Hindi nakakalat sa buong app.

## Ang trade-off

Ang pag-skip sa SDK ay ibig sabihin mina-maintain ko ang auth logic mag-isa. Kung baguhin ng Supabase ang isang endpoint, ina-update ko ang client ko. Kung magdagdag sila ng bagong auth flow, ini-implement ko. Totoong trabaho iyan.

Pero mas masama ang alternatibo: isang app na mukhang katulad ng lahat ng ibang SDK tutorial project. Kapag pumipili ang client sa pagitan ng mga contractor, ang isa na may portfolio na nagpapakita ng production patterns (certificate pinning, token refresh queues, tiered storage, runtime validation) **ay nananalo laban sa isa na nag-install ng SDK at tinawag na tapos na.**

Ang SDK ay shortcut. Okay ang mga shortcut kapag alam mo kung ano ang nilalaktawan. Ang problema ay kapag ang taong nag-e-evaluate ng code mo ay *alam din* kung ano ang nilalaktawan.

Ang buong implementation ay nasa [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), sa `src/httpClients/`.
