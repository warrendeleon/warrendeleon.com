---
title: "Emmagatzematge segur per nivells a React Native"
description: "Tres nivells d'emmagatzematge per a React Native: Keychain per a tokens, emmagatzematge xifrat per a dades personals, AsyncStorage per a preferències. Per què existeix cada nivell, quan usar-lo i com encaixa Redux Persist."
publishDate: 2026-05-18
tags: ["react-native", "security", "typescript", "tutorial"]
locale: ca
heroImage: "/images/blog/tiered-secure-storage.jpg"
heroAlt: "Emmagatzematge segur per nivells a React Native"
campaign: "tiered-secure-storage"
---

## El problema d'una sola solució d'emmagatzematge

La majoria d'apps React Native emmagatzemen tot a AsyncStorage. Tokens, dades d'usuari, preferències, estat de sessió. Tot al mateix lloc, tot en text pla.

AsyncStorage és un magatzem clau-valor recolzat per SQLite (iOS) o SharedPreferences (Android). És ràpid i convenient. També és completament sense xifrar. Qualsevol persona amb accés físic al dispositiu, o un dispositiu rootejat/jailbroken, pot llegir tots els valors.

Per a una preferència de tema, no passa res. Per a un access token, és un incident de seguretat.

> 💡 **El principi:** emmagatzema les dades a un nivell de seguretat que correspongui a la seva sensibilitat. Els tokens reben la protecció més forta. Les preferències reben l'accés més ràpid. Tot el reste cau entremig.

## Els tres nivells

| Nivell | Biblioteca | Seguretat | Velocitat | Usar per a |
|---|---|---|---|---|
| 1. SecureStore | react-native-keychain | Recolzat per hardware (Keychain/Keystore) | Més lent | Tokens, claus de xifrat, PINs |
| 2. EncryptedStore | react-native-encrypted-storage | Xifrat AES-256 | Mitjà | Dades personals (email, nom, telèfon) |
| 3. AsyncStorage | @react-native-async-storage | Cap (text pla) | Més ràpid | Preferències (tema, idioma) |

Cada nivell és un wrapper prim al voltant d'una biblioteca. El wrapper imposa claus tipades (perquè no puguis emmagatzemar un token al nivell equivocat) i proporciona una API consistent.

## Nivell 1: SecureStore (Keychain / Keystore)

El nivell de seguretat més alt. Usa l'enclavament segur recolzat per hardware de la plataforma: iOS Keychain o Android Keystore. Les dades les xifra el propi sistema operatiu i poden requerir autenticació biomètrica per accedir-hi.

```bash
yarn add react-native-keychain
```

El wrapper:

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

Decisions de disseny clau:

- ✅ **Un servei per clau.** Keychain emmagatzema una credencial per identificador de servei. Usar `com.warrendeleon.portfolio.accessToken` i `com.warrendeleon.portfolio.refreshToken` com a serveis separats evita que se sobreescriguin mútuament
- ✅ **Biomètric o codi del dispositiu.** `BIOMETRY_ANY_OR_DEVICE_PASSCODE` vol dir que l'usuari necessita Face ID, Touch ID o el PIN del dispositiu per accedir a les dades. Si el dispositiu no té seguretat configurada, les dades segueixen protegides pel sistema operatiu
- ✅ **Només aquest dispositiu.** `WHEN_UNLOCKED_THIS_DEVICE_ONLY` vol dir que les dades no es transfereixen a un dispositiu nou via còpia de seguretat. Els tokens no han de viatjar
- ✅ **Claus amb enum tipat.** No pots passar una string per accident. El compilador assegura que només dades de nivell token van a SecureStore

## Nivell 2: EncryptedStore (AES-256)

El nivell intermedi. Les dades es xifren amb AES-256 però no requereixen seguretat recolzada per hardware ni accés biomètric. Més ràpid que Keychain, més segur que text pla.

```bash
yarn add react-native-encrypted-storage
```

El wrapper:

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

Per què no posar les dades personals a SecureStore? Rendiment. L'accés a Keychain requereix una comprovació de seguretat a nivell de sistema (i potencialment un prompt biomètric). Per mostrar el nom d'un usuari en una pantalla de perfil, aquesta sobrecàrrega no està justificada. EncryptedStore et dóna xifrat AES-256 sense la barrera del hardware.

Les operacions per lots (`setMultiple`, `getMultiple`) importen en fluxos d'autenticació on necessites emmagatzemar múltiples camps alhora:

```typescript
await EncryptedStore.setMultiple([
  { key: EncryptedStoreKey.USER_EMAIL, value: user.email },
  { key: EncryptedStoreKey.USER_FIRST_NAME, value: user.firstName },
  { key: EncryptedStoreKey.USER_LAST_NAME, value: user.lastName },
]);
```

## Nivell 3: AsyncStorage + Redux Persist

El nivell més ràpid. Text pla, sense xifrat. Només per a dades amb zero sensibilitat de seguretat: preferència de tema, selecció d'idioma.

```bash
yarn add @react-native-async-storage/async-storage redux-persist
```

No uses AsyncStorage directament per a preferències. Redux Persist s'encarrega d'això. Guarda automàticament l'estat de Redux a AsyncStorage i el rehidrata quan l'app s'inicia.

La clau és la configuració de persistència:

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

| Config | Què persisteix | Què exclou |
|---|---|---|
| `rootPersistConfig` | Només el slice de settings (tema, idioma) | Tot el reste |
| `authPersistConfig` | Només el flag `biometricEnabled` | user, error, isLoading, tokens |

La `whitelist` és crítica. És una llista positiva: només els slices que anomenes es persisteixen. Tot el reste és efímer. Així és com prevens que els tokens acabin accidentalment a AsyncStorage a través de Redux.

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

Quan l'usuari canvia el tema o l'idioma, Redux Persist escriu automàticament a AsyncStorage. Al proper inici, `PersistGate` espera la rehidratació abans de renderitzar:

```typescript
<Provider store={store}>
  <PersistGate loading={null} persistor={persistor}>
    <App />
  </PersistGate>
</Provider>
```

## Com treballen junts els nivells

El valor real és en com els nivells es componen durant els fluxos d'autenticació.

### Inici de sessió

```typescript
// 1. El backend retorna tokens i dades d'usuari
const { access_token, refresh_token, user } = await authClient.signIn(credentials);

// 2. Tokens → SecureStore (Nivell 1)
await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, access_token);
await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, refresh_token);
await SecureStore.set(SecureStoreKey.USER_ID, user.id);

// 3. Dades personals → EncryptedStore (Nivell 2)
await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, user.email);
await EncryptedStore.set(EncryptedStoreKey.USER_FIRST_NAME, user.firstName);

// 4. Estat de Redux actualitzat → la UI renderitza
dispatch(setUser(user));
// Els settings (tema, idioma) ja són a Redux via Persist (Nivell 3)
```

### Inici de l'app (restauració de sessió)

```typescript
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async () => {
    // Comprovar si tenim un token vàlid (Nivell 1)
    const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
    if (!accessToken) return null;

    // Restaurar dades d'usuari (Nivell 2)
    const email = await EncryptedStore.get(EncryptedStoreKey.USER_EMAIL);
    const firstName = await EncryptedStore.get(EncryptedStoreKey.USER_FIRST_NAME);
    const userId = await SecureStore.get(SecureStoreKey.USER_ID);

    // Els settings ja han estat restaurats per PersistGate (Nivell 3)
    return { id: userId, email, firstName };
  }
);
```

### Tancament de sessió

```typescript
// 1. Invalidar el refresh token al backend
await authClient.logout();

// 2. Netejar tokens (Nivell 1)
await SecureStore.clear();

// 3. Netejar dades personals (Nivell 2)
await EncryptedStore.clear();

// 4. Netejar l'estat d'auth de Redux
dispatch(resetAuth());

// Els settings (Nivell 3) persisteixen a través del logout. L'usuari conserva el tema i l'idioma.
```

La seqüència de tancament de sessió és deliberada. El Nivell 1 i el Nivell 2 es netegen perquè els tokens i les dades personals pertanyen a la sessió. El Nivell 3 persisteix perquè el tema i l'idioma pertanyen al dispositiu.

### Renovació de token

L'interceptor d'Axios gestiona la renovació automàtica de tokens de forma transparent. Llegeix i escriu a SecureStore sense tocar els altres nivells:

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

      // Actualitzar tokens a SecureStore
      await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
      await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, data.refresh_token);

      // Reintentar la petició original
      error.config.headers.Authorization = `Bearer ${data.access_token}`;
      return axiosInstance(error.config);
    }
    return Promise.reject(error);
  }
);
```

## La classificació de dades

Cada peça de dades emmagatzemades té un lloc clar:

| Dada | Nivell | Per què |
|---|---|---|
| Access token | 1 (SecureStore) | Dona accés a l'API. Protecció recolzada per hardware. |
| Refresh token | 1 (SecureStore) | Pot generar nous access tokens. L'objectiu de més valor. |
| ID d'usuari | 1 (SecureStore) | S'usa per identificar l'usuari a les peticions. |
| PIN hashejat | 1 (SecureStore) | Credencial d'autenticació local. |
| Clau de xifrat | 1 (SecureStore) | Protegeix les dades del Nivell 2. Ha d'estar al hardware. |
| Email | 2 (EncryptedStore) | Dada personal. Xifrada però necessita accés ràpid per mostrar-la. |
| Nom | 2 (EncryptedStore) | Dada personal. Es mostra a pantalles de perfil. |
| Telèfon | 2 (EncryptedStore) | Dada personal. Es mostra a configuració. |
| Proveïdor d'auth | 2 (EncryptedStore) | No és sensible però està relacionat amb la sessió d'auth. |
| Tema | 3 (AsyncStorage) | Preferència no sensible. Sobreviu al tancament de sessió. |
| Idioma | 3 (AsyncStorage) | Preferència no sensible. Sobreviu al tancament de sessió. |

La regla és senzilla: si dona accés, Nivell 1. Si identifica una persona, Nivell 2. Si és una preferència, Nivell 3.

## Errors freqüents

**No emmagatzemis tokens a Redux.** L'estat de Redux pot ser serialitzat, registrat, persistit a AsyncStorage per Redux Persist, i inspeccionat amb DevTools. Encara que excloguis el slice d'auth de la persistència, una sola mala configuració exposa els tokens. Guarda els tokens a SecureStore, punt.

**No saltis els enums tipats.** Sense els enums `SecureStoreKey` i `EncryptedStoreKey`, estàs passant strings a pèl. Una errada de tecleig i estàs llegint de la clau equivocada. Un nivell equivocat i estàs emmagatzemant un token en text pla. El sistema de tipus és la teva auditoria de seguretat més barata.

**No oblidis netejar en tancar sessió.** Si neteges SecureStore però oblides EncryptedStore, les dades personals de l'usuari persisteixen després del logout. El mètode `clear()` de cada nivell existeix per això. Crida tots dos durant el tancament de sessió.

**No assumeixis que Keychain és ràpid.** SecureStore implica un anada i tornada a l'enclavament segur. En dispositius antics, pot trigar 100-200ms per lectura. No el cridis dins un bucle de renderització. Llegeix els tokens un cop a l'inici de l'app i passa'ls a través del teu interceptor HTTP.

**Whitelist a Redux Persist, no blacklist.** Usa `whitelist` per especificar què ha de persistir. Un enfocament amb `blacklist` és perillós perquè els slices nous es persisteixen per defecte. Un sol slice nou amb dades sensibles i tens una filtració. `whitelist` és opt-in. Més segur.

## Per què tres biblioteques

Sí. L'alternativa és una biblioteca (AsyncStorage) sense xifrat, o una biblioteca (react-native-keychain) que és massa lenta per a lectures no sensibles. Tres biblioteques, tres wrappers, tres enums. Cada wrapper fa menys de 50 línies. El setup porta una tarda.

El que obtens: tokens que no es poden llegir sense autenticació biomètrica, dades personals xifrades en repòs, i preferències que es carreguen instantàniament. Cada peça de dades està protegida exactament al nivell que requereix. Ni més, ni menys.

> Emmagatzema-ho tot al mateix lloc i no protegeixes res. Separa per sensibilitat i protegeixes el que importa.

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. La configuració completa de SecureStore, EncryptedStore i Redux Persist són al repo.*
