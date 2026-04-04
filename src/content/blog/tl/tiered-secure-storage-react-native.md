---
title: "Tiered secure storage sa React Native"
description: "Tatlong storage tiers para sa React Native: Keychain para sa tokens, encrypted storage para sa PII, AsyncStorage para sa preferences. Bakit may kanya-kanyang tier, kailan gagamitin, at paano pumapasok ang Redux Persist."
publishDate: 2026-05-18
tags: ["react-native", "security", "typescript", "tutorial"]
locale: tl
heroImage: "/images/blog/tiered-secure-storage.jpg"
heroAlt: "Tiered secure storage sa React Native"
campaign: "tiered-secure-storage"
---

## Ang problema sa iisang storage solution

Karamihan ng React Native apps ay nagsi-store ng lahat sa AsyncStorage. Tokens, user data, preferences, session state. Lahat sa iisang lugar, lahat sa plain text.

Ang AsyncStorage ay isang key-value store na naka-back sa SQLite (iOS) o SharedPreferences (Android). Mabilis at maginhawa. Pero walang encryption. Kahit sino na may physical access sa device, o may rooted/jailbroken na device, ay mababasa ang bawat value.

Para sa isang theme preference, okay lang iyan. Para sa isang access token, security incident na iyan.

> 💡 **Ang prinsipyo:** i-store ang data sa security level na katumbas ng sensitivity nito. Ang tokens ang pinakamatinding proteksyon. Ang preferences ang pinakamabilis na access. Lahat ng iba ay nasa pagitan.

## Ang tatlong tier

| Tier | Library | Seguridad | Bilis | Gamitin para sa |
|---|---|---|---|---|
| 1. SecureStore | react-native-keychain | Hardware-backed (Keychain/Keystore) | Pinakamabagal | Tokens, encryption keys, PINs |
| 2. EncryptedStore | react-native-encrypted-storage | AES-256 encryption | Katamtaman | PII (email, pangalan, phone) |
| 3. AsyncStorage | @react-native-async-storage | Wala (plain text) | Pinakamabilis | Preferences (theme, language) |

Bawat tier ay isang manipis na wrapper sa isang library. Ang wrapper ay nag-e-enforce ng typed keys (para hindi mo mai-store ang token sa maling tier) at nagbibigay ng consistent na API.

## Tier 1: SecureStore (Keychain / Keystore)

Ang pinakamataas na security tier. Gumagamit ng hardware-backed secure enclave ng platform: iOS Keychain o Android Keystore. Ini-encrypt ng OS mismo ang data at puwedeng mangailangan ng biometric authentication para ma-access.

```bash
yarn add react-native-keychain
```

Ang wrapper:

```typescript
// src/utils/storage/SecureStore.ts
import * as Keychain from 'react-native-keychain';

export enum SecureStoreKey {
  ACCESS_TOKEN = 'accessToken',
  REFRESH_TOKEN = 'refreshToken',
  USER_ID = 'userId',
  BIOMETRIC_PREFERENCE = 'biometricPreference',
  HASHED_PIN = 'hashedPIN',
  ENCRYPTION_KEY = 'encryptionKey',
}

const SERVICE_PREFIX = 'com.warrendeleon.portfolio';

export const SecureStore = {
  async set(key: SecureStoreKey, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_PREFIX}.${key}`,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async get(key: SecureStoreKey): Promise<string | null> {
    const result = await Keychain.getGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    });
    return result ? result.password : null;
  },

  async remove(key: SecureStoreKey): Promise<void> {
    await Keychain.resetGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    });
  },

  async clear(): Promise<void> {
    for (const key of Object.values(SecureStoreKey)) {
      await Keychain.resetGenericPassword({
        service: `${SERVICE_PREFIX}.${key}`,
      });
    }
  },
};
```

Mga pangunahing design decisions:

- ✅ **Isang service bawat key.** Isang credential lang ang nasi-store ng Keychain bawat service identifier. Ang paggamit ng `com.warrendeleon.portfolio.accessToken` at `com.warrendeleon.portfolio.refreshToken` bilang magkahiwalay na services ang pumipigil sa pag-overwrite sa isa't isa
- ✅ **Biometric o device passcode.** Ang `BIOMETRY_ANY_OR_DEVICE_PASSCODE` ay nangangahulugang kailangan ng user ang Face ID, Touch ID, o device PIN para ma-access ang data. Kung walang security na naka-setup sa device, protektado pa rin ng OS ang data
- ✅ **Sa device na ito lamang.** Ang `WHEN_UNLOCKED_THIS_DEVICE_ONLY` ay nangangahulugang hindi na-transfer ang data sa bagong device sa pamamagitan ng backup. Hindi dapat gumagala ang tokens
- ✅ **Typed enum keys.** Hindi ka puwedeng mag-pass ng raw string nang hindi sinasadya. Ine-enforce ng compiler na token-level data lang ang pumapasok sa SecureStore

## Tier 2: EncryptedStore (AES-256)

Ang gitnang tier. Naka-encrypt ang data gamit ang AES-256 pero hindi nangangailangan ng hardware-backed security o biometric access. Mas mabilis kaysa Keychain, mas secure kaysa plain text.

```bash
yarn add react-native-encrypted-storage
```

Ang wrapper:

```typescript
// src/utils/storage/EncryptedStore.ts
import EncryptedStorage from 'react-native-encrypted-storage';

export enum EncryptedStoreKey {
  USER_EMAIL = 'userEmail',
  USER_FIRST_NAME = 'userFirstName',
  USER_LAST_NAME = 'userLastName',
  USER_PHONE_NUMBER = 'userPhoneNumber',
  PROFILE_PICTURE_URL = 'profilePictureURL',
  AUTH_PROVIDER = 'authProvider',
}

export const EncryptedStore = {
  async set(key: EncryptedStoreKey, value: string): Promise<void> {
    await EncryptedStorage.setItem(key, value);
  },

  async get(key: EncryptedStoreKey): Promise<string | null> {
    return await EncryptedStorage.getItem(key);
  },

  async remove(key: EncryptedStoreKey): Promise<void> {
    await EncryptedStorage.removeItem(key);
  },

  async setMultiple(
    items: { key: EncryptedStoreKey; value: string }[]
  ): Promise<void> {
    for (const item of items) {
      await EncryptedStorage.setItem(item.key, item.value);
    }
  },

  async getMultiple(
    keys: EncryptedStoreKey[]
  ): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = await EncryptedStorage.getItem(key);
    }
    return result;
  },

  async clear(): Promise<void> {
    await EncryptedStorage.clear();
  },
};
```

Bakit hindi ilagay ang PII sa SecureStore? Dahil sa performance. Ang Keychain access ay nangangailangan ng system-level security check (at posibleng biometric prompt). Para sa pagpapakita ng pangalan ng user sa profile screen, hindi justified ang overhead na iyon. Binibigyan ka ng EncryptedStore ng AES-256 encryption nang walang hardware gate.

Mahalaga ang batch operations (`setMultiple`, `getMultiple`) para sa auth flows kung saan kailangan mong i-store ang maraming fields nang sabay-sabay:

```typescript
await EncryptedStore.setMultiple([
  { key: EncryptedStoreKey.USER_EMAIL, value: user.email },
  { key: EncryptedStoreKey.USER_FIRST_NAME, value: user.firstName },
  { key: EncryptedStoreKey.USER_LAST_NAME, value: user.lastName },
]);
```

## Tier 3: AsyncStorage + Redux Persist

Ang pinakamabilis na tier. Plain text, walang encryption. Para lang sa data na walang security sensitivity: theme preference, language selection.

```bash
yarn add @react-native-async-storage/async-storage redux-persist
```

Hindi mo ginagamit nang direkta ang AsyncStorage para sa preferences. Ang Redux Persist ang nagha-handle niyan. Awtomatiko nitong sini-save ang iyong Redux state sa AsyncStorage at nire-rehydrate ito kapag nagla-launch ang app.

Ang susi ay ang persist config:

```typescript
// src/store/configureStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';

const rootPersistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['settings'],
};

const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  whitelist: ['biometricEnabled'],
};
```

| Config | Ano ang pini-persist | Ano ang hindi kasama |
|---|---|---|
| `rootPersistConfig` | Settings slice lang (theme, language) | Lahat ng iba |
| `authPersistConfig` | `biometricEnabled` flag lang | user, error, isLoading, tokens |

Kritikal ang `whitelist`. Ito ay isang positive list: ang mga slice lang na pangalanan mo ang mape-persist. Lahat ng iba ay ephemeral. Ganito mo pinipigilan ang mga tokens na mapadpad nang aksidente sa AsyncStorage sa pamamagitan ng Redux.

```typescript
const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    theme: 'system' as 'light' | 'dark' | 'system',
    language: 'en' as string,
  },
  reducers: {
    setTheme: (state, action) => { state.theme = action.payload; },
    setLanguage: (state, action) => { state.language = action.payload; },
  },
});
```

Kapag nagpalit ang user ng theme o language, awtomatikong nagsusulat ang Redux Persist sa AsyncStorage. Sa susunod na launch, naghihintay ang `PersistGate` ng rehydration bago mag-render:

```typescript
<Provider store={store}>
  <PersistGate loading={null} persistor={persistor}>
    <App />
  </PersistGate>
</Provider>
```

## Paano nagtutulungan ang mga tier

Ang tunay na halaga ay sa kung paano nag-cocompose ang mga tier sa mga auth flow.

### Login

```typescript
// 1. Nagbabalik ang backend ng tokens at user data
const { access_token, refresh_token, user } = await authClient.signIn(credentials);

// 2. Tokens → SecureStore (Tier 1)
await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, access_token);
await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, refresh_token);
await SecureStore.set(SecureStoreKey.USER_ID, user.id);

// 3. PII → EncryptedStore (Tier 2)
await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, user.email);
await EncryptedStore.set(EncryptedStoreKey.USER_FIRST_NAME, user.firstName);

// 4. Na-update ang Redux state → nagre-render ang UI
dispatch(setUser(user));
// Nasa Redux na ang settings (theme, language) sa pamamagitan ng Persist (Tier 3)
```

### App startup (session restore)

```typescript
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async () => {
    // Tingnan kung may valid token (Tier 1)
    const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
    if (!accessToken) return null;

    // I-restore ang user data (Tier 2)
    const email = await EncryptedStore.get(EncryptedStoreKey.USER_EMAIL);
    const firstName = await EncryptedStore.get(EncryptedStoreKey.USER_FIRST_NAME);
    const userId = await SecureStore.get(SecureStoreKey.USER_ID);

    // Na-restore na ng PersistGate ang settings (Tier 3)
    return { id: userId, email, firstName };
  }
);
```

### Logout

```typescript
// 1. I-invalidate ang refresh token sa backend
await authClient.logout();

// 2. I-clear ang tokens (Tier 1)
await SecureStore.clear();

// 3. I-clear ang PII (Tier 2)
await EncryptedStore.clear();

// 4. I-clear ang Redux auth state
dispatch(resetAuth());

// Nananatili ang settings (Tier 3) pagkatapos mag-logout. Nananatili ang theme at language ng user.
```

Sinadya ang logout sequence. Kini-clear ang Tier 1 at Tier 2 dahil ang tokens at PII ay pag-aari ng session. Nananatili ang Tier 3 dahil ang theme at language ay pag-aari ng device.

### Token refresh

Ang Axios interceptor ang nagha-handle ng awtomatikong token refresh nang transparent. Nagbabasa at nagsusulat ito sa SecureStore nang hindi ginagalaw ang ibang tiers:

```typescript
axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = await SecureStore.get(SecureStoreKey.REFRESH_TOKEN);
      const { data } = await axios.post('/auth/v1/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      // I-update ang tokens sa SecureStore
      await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
      await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, data.refresh_token);

      // I-retry ang original request
      error.config.headers.Authorization = `Bearer ${data.access_token}`;
      return axiosInstance(error.config);
    }
    return Promise.reject(error);
  }
);
```

## Ang data classification

Bawat piraso ng naka-store na data ay may malinaw na lugar:

| Data | Tier | Bakit |
|---|---|---|
| Access token | 1 (SecureStore) | Nagbibigay ng API access. Hardware-backed na proteksyon. |
| Refresh token | 1 (SecureStore) | Puwedeng gumawa ng bagong access tokens. Pinakamataas na value target. |
| User ID | 1 (SecureStore) | Ginagamit para tukuyin ang user sa bawat request. |
| Hashed PIN | 1 (SecureStore) | Local authentication credential. |
| Encryption key | 1 (SecureStore) | Pinoprotektahan ang Tier 2 data. Kailangang nasa hardware. |
| Email | 2 (EncryptedStore) | PII. Naka-encrypt pero kailangan ng mabilis na access para sa display. |
| Pangalan | 2 (EncryptedStore) | PII. Ipinapakita sa profile screens. |
| Phone number | 2 (EncryptedStore) | PII. Ipinapakita sa settings. |
| Auth provider | 2 (EncryptedStore) | Hindi sensitive pero konektado sa auth session. |
| Theme | 3 (AsyncStorage) | Hindi sensitive na preference. Nananatili pagkatapos mag-logout. |
| Language | 3 (AsyncStorage) | Hindi sensitive na preference. Nananatili pagkatapos mag-logout. |

Simple lang ang patakaran: kung nagbibigay ito ng access, Tier 1. Kung nagpapakilala ito ng tao, Tier 2. Kung preference lang, Tier 3.

## Mga karaniwang pagkakamali

**Huwag mag-store ng tokens sa Redux.** Ang Redux state ay puwedeng i-serialise, i-log, i-persist sa AsyncStorage ng Redux Persist, at i-inspect gamit ang DevTools. Kahit i-blacklist mo ang auth slice mula sa persistence, isang misconfiguration lang at nalantad na ang tokens. Panatilihin ang tokens sa SecureStore, walang ibang paraan.

**Huwag i-skip ang typed enums.** Kung walang `SecureStoreKey` at `EncryptedStoreKey` enums, nagpapasa ka ng raw strings. Isang typo at nagbabasa ka na sa maling key. Isang maling tier at nag-store ka na ng token sa plain text. Ang type system ang iyong pinakamura na security audit.

**Huwag kalimutang i-clear kapag nag-logout.** Kung kini-clear mo ang SecureStore pero nakalimutan ang EncryptedStore, nananatili ang PII ng user pagkatapos nilang mag-logout. Ang `clear()` method sa bawat tier ay umiiral para sa dahilang ito. Tawagin pareho kapag nag-logout.

**Huwag ipagpalagay na mabilis ang Keychain.** Ang SecureStore ay may round trip sa secure enclave. Sa mas lumang devices, puwede itong tumagal ng 100-200ms bawat read. Huwag itong tawagin sa render loop. Basahin ang tokens nang isang beses sa app startup at ipasa sa pamamagitan ng iyong HTTP interceptor.

**Redux Persist whitelist, hindi blacklist.** Gumamit ng `whitelist` para pangalanan kung ano ang dapat i-persist. Delikado ang `blacklist` approach dahil nape-persist ang mga bagong slices bilang default. Isang bagong slice na may sensitive data at may leak ka na. Ang `whitelist` ay opt-in. Mas ligtas.

## Bakit tatlong libraries

Oo. Ang alternatibo ay isang library (AsyncStorage) na walang encryption, o isang library (react-native-keychain) na masyadong mabagal para sa mga hindi sensitive na reads. Tatlong libraries, tatlong wrappers, tatlong enums. Bawat wrapper ay wala pang 50 linya. Isang hapon lang ang setup.

Ang makukuha mo: tokens na hindi mababasa nang walang biometric authentication, PII na naka-encrypt at rest, at preferences na nag-loload nang instant. Bawat piraso ng data ay protektado sa eksaktong level na kinakailangan nito. Wala nang dagdag, wala nang kulang.

> I-store ang lahat sa iisang lugar at wala kang mapoprotektahan. Paghiwalayin ayon sa sensitivity at mapro-protektahan mo ang mahalaga.

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong SecureStore, EncryptedStore, at Redux Persist configuration.*
