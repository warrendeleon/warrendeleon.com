---
title: "Tiered secure storage in React Native"
description: "Three storage tiers for React Native: Keychain for tokens, encrypted storage for PII, AsyncStorage for preferences. Why each tier exists, when to use it, and how Redux Persist fits in."
publishDate: 2026-05-04
tags: ["react-native", "security", "storage", "mobile-security"]
locale: en
heroImage: "/images/blog/tiered-secure-storage.jpg"
heroAlt: "Tiered secure storage in React Native"
campaign: "tiered-secure-storage"
relatedPosts: ["token-refresh-race-condition-react-native", "building-a-supabase-rest-client-without-the-sdk"]
---

## The problem with one storage solution

Most React Native apps store everything in AsyncStorage. Tokens, user data, preferences, session state. All in one place, all in plain text.

AsyncStorage is a key-value store backed by SQLite (iOS) or SharedPreferences (Android). It's fast and convenient. It's also completely unencrypted. Anyone with physical access to the device, or a rooted/jailbroken device, can read every value.

For a theme preference, that's fine. For an access token, it's a security incident.

> 💡 **The principle:** store data at a security level that matches its sensitivity. Tokens get the strongest protection. Preferences get the fastest access. Everything else falls somewhere in between.

## The three tiers

| Tier | Library | Security | Speed | Use for |
|---|---|---|---|---|
| 1. SecureStore | react-native-keychain | Hardware-backed (Keychain/Keystore) | Slowest | Tokens, encryption keys, PINs |
| 2. EncryptedStore | react-native-encrypted-storage | AES-256 encryption | Medium | PII (email, name, phone) |
| 3. AsyncStorage | @react-native-async-storage | None (plain text) | Fastest | Preferences (theme, language) |

Each tier is a thin wrapper around a library. The wrapper enforces typed keys (so you can't store a token in the wrong tier) and provides a consistent API.

## Tier 1: SecureStore (Keychain / Keystore)

The highest security tier. Uses the platform's hardware-backed secure enclave: iOS Keychain or Android Keystore. Data is encrypted by the OS itself and can require biometric authentication to access.

```bash
yarn add react-native-keychain
```

The wrapper:

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
  async set(key: SecureStoreKey, value: string): Promise<boolean> {
    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_PREFIX}.${key}`,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  },

  async get(key: SecureStoreKey): Promise<string | null> {
    const result = await Keychain.getGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    });
    return result ? result.password : null;
  },

  async remove(key: SecureStoreKey): Promise<boolean> {
    await Keychain.resetGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    });
    return true;
  },

  async clear(): Promise<boolean> {
    for (const key of Object.values(SecureStoreKey)) {
      await Keychain.resetGenericPassword({
        service: `${SERVICE_PREFIX}.${key}`,
      });
    }
    return true;
  },
};
```

Key design decisions:

- ✅ **One service per key.** Keychain stores one credential per service identifier. Using `com.warrendeleon.portfolio.accessToken` and `com.warrendeleon.portfolio.refreshToken` as separate services prevents them from overwriting each other
- ✅ **Biometric or device passcode.** `BIOMETRY_ANY_OR_DEVICE_PASSCODE` means the user needs Face ID, Touch ID, or their device PIN to access the data. If the device has no security set up, the data is still protected by the OS
- ✅ **This device only.** `WHEN_UNLOCKED_THIS_DEVICE_ONLY` means the data doesn't transfer to a new device via backup. Tokens shouldn't roam
- ✅ **Typed enum keys.** You can't accidentally pass a string. The compiler enforces that only token-level data goes into SecureStore

## Tier 2: EncryptedStore (AES-256)

The middle tier. Data is encrypted with AES-256 but doesn't require hardware-backed security or biometric access. Faster than Keychain, more secure than plain text.

```bash
yarn add react-native-encrypted-storage
```

The wrapper:

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
  async set(key: EncryptedStoreKey, value: string): Promise<boolean> {
    await EncryptedStorage.setItem(key, value);
    return true;
  },

  async get(key: EncryptedStoreKey): Promise<string | null> {
    return await EncryptedStorage.getItem(key);
  },

  async remove(key: EncryptedStoreKey): Promise<boolean> {
    await EncryptedStorage.removeItem(key);
    return true;
  },

  async setMultiple(
    items: { key: EncryptedStoreKey; value: string }[]
  ): Promise<boolean> {
    for (const item of items) {
      await EncryptedStorage.setItem(item.key, item.value);
    }
    return true;
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

  async clear(): Promise<boolean> {
    await EncryptedStorage.clear();
    return true;
  },
};
```

Why not put PII in SecureStore? Performance. Keychain access requires a system-level security check (and potentially biometric prompt). For displaying a user's name on a profile screen, that overhead isn't justified. EncryptedStore gives you AES-256 encryption without the hardware gate.

The batch operations (`setMultiple`, `getMultiple`) matter for auth flows where you need to store multiple fields at once:

```typescript
await EncryptedStore.setMultiple([
  { key: EncryptedStoreKey.USER_EMAIL, value: user.email },
  { key: EncryptedStoreKey.USER_FIRST_NAME, value: user.firstName },
  { key: EncryptedStoreKey.USER_LAST_NAME, value: user.lastName },
]);
```

## Tier 3: AsyncStorage + Redux Persist

The fastest tier. Plain text, no encryption. Only for data that has zero security sensitivity: theme preference, language selection.

```bash
yarn add @react-native-async-storage/async-storage redux-persist
```

You don't use AsyncStorage directly for preferences. Redux Persist handles that. It automatically saves your Redux state to AsyncStorage and rehydrates it when the app launches.

The key is the persist config:

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

| Config | What it persists | What it excludes |
|---|---|---|
| `rootPersistConfig` | Settings slice only (theme, language) | Everything else |
| `authPersistConfig` | `biometricEnabled` flag only | user, error, isLoading, tokens |

The `whitelist` is critical. It's a positive list: only the slices you name get persisted. Everything else is ephemeral. This is how you prevent tokens from accidentally ending up in AsyncStorage through Redux.

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

When the user changes theme or language, Redux Persist automatically writes to AsyncStorage. On next launch, `PersistGate` waits for rehydration before rendering:

```typescript
<Provider store={store}>
  <PersistGate loading={null} persistor={persistor}>
    <App />
  </PersistGate>
</Provider>
```

## How the tiers work together

The real value is in how the tiers compose during auth flows.

### Login

```typescript
// 1. Backend returns tokens and user data
const { access_token, refresh_token, user } = await authClient.signIn(credentials);

// 2. Tokens → SecureStore (Tier 1)
await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, access_token);
await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, refresh_token);
await SecureStore.set(SecureStoreKey.USER_ID, user.id);

// 3. PII → EncryptedStore (Tier 2)
await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, user.email);
await EncryptedStore.set(EncryptedStoreKey.USER_FIRST_NAME, user.firstName);

// 4. Redux state updated → UI renders
dispatch(setUser(user));
// Settings (theme, language) already in Redux via Persist (Tier 3)
```

### App startup (session restore)

```typescript
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async () => {
    // Check if we have a valid token (Tier 1)
    const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
    if (!accessToken) return null;

    // Restore user data (Tier 2)
    const email = await EncryptedStore.get(EncryptedStoreKey.USER_EMAIL);
    const firstName = await EncryptedStore.get(EncryptedStoreKey.USER_FIRST_NAME);
    const userId = await SecureStore.get(SecureStoreKey.USER_ID);

    // Settings already restored by PersistGate (Tier 3)
    return { id: userId, email, firstName };
  }
);
```

### Logout

```typescript
// 1. Invalidate refresh token on backend
await authClient.logout();

// 2. Clear tokens (Tier 1)
await SecureStore.clear();

// 3. Clear PII (Tier 2)
await EncryptedStore.clear();

// 4. Clear Redux auth state
dispatch(resetAuth());

// Settings (Tier 3) persist through logout. User keeps their theme and language.
```

The logout sequence is deliberate. Tier 1 and Tier 2 are cleared because tokens and PII belong to the session. Tier 3 persists because theme and language belong to the device.

### Token refresh

The Axios interceptor handles automatic token refresh transparently. It reads from and writes to SecureStore without touching the other tiers:

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

      // Update tokens in SecureStore
      await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
      await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, data.refresh_token);

      // Retry the original request
      error.config.headers.Authorization = `Bearer ${data.access_token}`;
      return axiosInstance(error.config);
    }
    return Promise.reject(error);
  }
);
```

## The data classification

Every piece of stored data has a clear home:

| Data | Tier | Why |
|---|---|---|
| Access token | 1 (SecureStore) | Grants API access. Hardware-backed protection. |
| Refresh token | 1 (SecureStore) | Can generate new access tokens. Highest value target. |
| User ID | 1 (SecureStore) | Used to identify the user across requests. |
| Hashed PIN | 1 (SecureStore) | Local authentication credential. |
| Encryption key | 1 (SecureStore) | Protects Tier 2 data. Must be in hardware. |
| Email | 2 (EncryptedStore) | PII. Encrypted but needs fast access for display. |
| Name | 2 (EncryptedStore) | PII. Shown on profile screens. |
| Phone number | 2 (EncryptedStore) | PII. Shown in settings. |
| Auth provider | 2 (EncryptedStore) | Not sensitive but related to auth session. |
| Theme | 3 (AsyncStorage) | Non-sensitive preference. Survives logout. |
| Language | 3 (AsyncStorage) | Non-sensitive preference. Survives logout. |

The rule is simple: if it grants access, Tier 1. If it identifies a person, Tier 2. If it's just a preference, Tier 3.

## Common pitfalls

**Don't store tokens in Redux.** Redux state can be serialised, logged, persisted to AsyncStorage by Redux Persist, and inspected with DevTools. Even if you blacklist the auth slice from persistence, a single misconfiguration exposes tokens. Keep tokens in SecureStore, period.

**Don't skip the typed enums.** Without `SecureStoreKey` and `EncryptedStoreKey` enums, you're passing raw strings. One typo and you're reading from the wrong key. One wrong tier and you're storing a token in plain text. The type system is your cheapest security audit.

**Don't forget to clear on logout.** If you clear SecureStore but forget EncryptedStore, the user's PII persists after they log out. The `clear()` method on each tier exists for this reason. Call both during logout.

**Don't assume Keychain is fast.** SecureStore involves a round trip to the secure enclave. On older devices, this can take 100-200ms per read. Don't call it in a render loop. Read tokens once at app startup and pass them through your HTTP interceptor.

**Redux Persist whitelist, not blacklist.** Use `whitelist` to name what should persist. A `blacklist` approach is dangerous because new slices are persisted by default. One new slice with sensitive data and you've got a leak. `whitelist` is opt-in. Safer.

## Why three libraries

Yes. The alternative is one library (AsyncStorage) with no encryption, or one library (react-native-keychain) that's too slow for non-sensitive reads. Three libraries, three wrappers, three enums. Each wrapper is under 50 lines. The setup takes an afternoon.

What you get: tokens that can't be read without biometric authentication, PII that's encrypted at rest, and preferences that load instantly. Each piece of data is protected at exactly the level it requires. No more, no less.

> Store everything in one place and you protect nothing. Separate by sensitivity and you protect what matters.

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full SecureStore, EncryptedStore, and Redux Persist configuration are all in the repo.*
