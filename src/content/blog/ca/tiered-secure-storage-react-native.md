---
title: "Emmagatzematge segur per nivells a React Native"
description: "Tres nivells a React Native: Keychain per a tokens, magatzem xifrat per a dades personals, AsyncStorage per preferències. Quan usar cada un, i com hi cap Redux Persist."
tags: ["react-native", "security", "storage", "mobile-security"]
locale: ca
heroImage: "/images/blog/tiered-secure-storage.webp"
heroAlt: "Emmagatzematge segur per nivells a React Native"
campaign: "tiered-secure-storage"
relatedPosts: ["token-refresh-race-condition-react-native", "building-a-supabase-rest-client-without-the-sdk", "feature-first-project-structure-react-native"]
---

## Quan una sola capa d'emmagatzematge es queda curta

La majoria d'apps React Native ho posen tot a AsyncStorage. Tokens, dades d'usuari, preferències, estat de sessió. Tot al mateix lloc, tot en text pla.

AsyncStorage és un magatzem clau-valor recolzat per SQLite a iOS i SharedPreferences a Android. És ràpid i pràctic. Tampoc està xifrat. Qualsevol persona amb accés físic, o amb un dispositiu rootejat/jailbroken, pot llegir tots els valors.

Per a una preferència de tema, no passa res. Per a un access token, és un incident.

En aquest post recorro els tres nivells que faig servir en producció: Keychain amb suport de hardware per a tokens, un magatzem xifrat per a dades personals, i AsyncStorage (via Redux Persist) per a preferències. Cada nivell és un wrapper curt. La feina està a decidir què va on, i mantenir aquesta frontera honesta al flux d'autenticació.

## Suposicions

El setup d'aquí sota es va escriure contra:

- React Native 0.74+ (workflow nu, no Expo)
- TypeScript amb la configuració estàndard de Babel de RN
- Redux Toolkit + Redux Persist per a la gestió d'estat
- iOS 13+ i Android API 23+ (el Keystore amb suport de hardware necessita API 23 com a mínim)
- Un backend Supabase (o qualsevol API REST que retorni tokens d'accés/refresc)

A Expo, canvia `react-native-keychain` per `expo-secure-store` al wrapper del Nivell 1. L'estructura és la mateixa.

## Els tres nivells

| Nivell | Biblioteca | Seguretat | Velocitat | Usar per a |
|---|---|---|---|---|
| 1. SecureStore | react-native-keychain | Recolzat per hardware (Keychain/Keystore) | Més lent | Tokens, claus de xifrat, PINs |
| 2. EncryptedStore | react-native-encrypted-storage | Xifrat AES-256 | Mitjà | Dades personals (email, nom, telèfon) |
| 3. AsyncStorage | @react-native-async-storage | Cap (text pla) | Més ràpid | Preferències (tema, idioma) |

Cada nivell és un wrapper prim al voltant d'una biblioteca. El wrapper imposa claus tipades (perquè no puguis emmagatzemar un token al nivell equivocat) i proporciona una API consistent.

## Nivell 1: SecureStore (Keychain / Keystore)

El nivell més alt. Usa l'enclavament segur amb suport de hardware de la plataforma: iOS Keychain o Android Keystore. El sistema operatiu xifra les dades i pot requerir autenticació biomètrica per llegir-les.

```bash
yarn add react-native-keychain
cd ios && pod install && cd ..
```

`react-native-keychain` és un mòdul natiu, així que iOS necessita un pod install. A Android, posa `minSdkVersion = 23` (o més alt) a `android/build.gradle` per arribar al codi del Keystore amb suport de hardware.

Una nota a Android: fins i tot a API 23+, que les claus realment vagin a un Trusted Execution Environment o a un StrongBox depèn del dispositiu i de l'OEM. Alguns mòbils moderns segueixen reportant emmagatzematge només per software. Si el teu model d'amenaces necessita una garantia, crida `Keychain.getSecurityLevel()` en temps d'execució i condiciona les operacions sensibles al resultat. iOS Keychain té suport de hardware a tots els dispositius compatibles.

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

Quatre decisions del wrapper val la pena destacar:

- Un servei per clau. Keychain emmagatzema una sola credencial per identificador de servei. Usar `com.warrendeleon.portfolio.accessToken` i `com.warrendeleon.portfolio.refreshToken` com a serveis separats evita que se sobreescriguin mútuament.
- Biomètric o codi del dispositiu. `BIOMETRY_ANY_OR_DEVICE_PASSCODE` vol dir que l'usuari necessita Face ID, Touch ID o el PIN del dispositiu per llegir el valor. Si el dispositiu no té seguretat configurada, el sistema operatiu segueix protegint les dades.
- Només aquest dispositiu. `WHEN_UNLOCKED_THIS_DEVICE_ONLY` manté les dades fora de les còpies de seguretat d'iCloud Keychain. Els tokens no han de viatjar.
- Claus amb enum tipat. No pots passar una string per accident. El compilador assegura que només dades de nivell token van a SecureStore.

## Nivell 2: EncryptedStore (AES-256)

El nivell intermedi. Les dades es xifren amb AES-256, sense passarel·la de hardware, sense prompt biomètric. Més ràpid que Keychain, molt més segur que el text pla.

```bash
yarn add react-native-encrypted-storage
cd ios && pod install && cd ..
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

Per què no posar les dades personals a SecureStore? Rendiment. L'accés a Keychain executa una comprovació de seguretat a nivell de sistema, i a vegades un prompt biomètric. Per renderitzar el nom d'un usuari en una pantalla de perfil, aquesta sobrecàrrega no surt a compte. EncryptedStore et dóna AES-256 en repòs sense la passarel·la de hardware.

Les operacions per lots (`setMultiple`, `getMultiple`) importen en fluxos d'autenticació que necessiten escriure uns quants camps alhora:

```typescript
await EncryptedStore.setMultiple([
  { key: EncryptedStoreKey.USER_EMAIL, value: user.email },
  { key: EncryptedStoreKey.USER_FIRST_NAME, value: user.firstName },
  { key: EncryptedStoreKey.USER_LAST_NAME, value: user.lastName },
]);
```

## Nivell 3: AsyncStorage + Redux Persist

El nivell més ràpid. Text pla, sense xifrat. Reservat per a dades sense pes de seguretat: preferència de tema, selecció d'idioma.

```bash
yarn add @react-native-async-storage/async-storage redux-persist @reduxjs/toolkit react-redux
cd ios && pod install && cd ..
```

No parles amb AsyncStorage directament per a preferències. Redux Persist ho fa per tu. Guarda l'estat de Redux a AsyncStorage i el rehidrata a l'inici de l'app.

La configuració de persistència és on viu la frontera de seguretat:

```typescript
// src/store/configureStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';

import { authReducer } from '@app/features/Auth';
import { settingsReducer } from '@app/features/Settings';

// El slice d'auth té el seu propi persist config per poder posar un sol camp a la whitelist.
const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  whitelist: ['biometricEnabled'],
  blacklist: ['user', 'error', 'isLoading'],
};

const persistedAuthReducer = persistReducer(authPersistConfig, authReducer);

const rootReducer = combineReducers({
  settings: settingsReducer,
  auth: persistedAuthReducer,
});

// El persist config arrel només persisteix el slice de settings (tema, idioma).
const rootPersistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['settings'],
};

const persistedReducer = persistReducer(rootPersistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // Redux Persist despatxa accions no serialitzables durant la rehidratació.
        // Ignora-les perquè el middleware de serializable-check no avisi.
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
```

| Config | Què persisteix | Què exclou |
|---|---|---|
| `rootPersistConfig` | Només el slice de settings (tema, idioma) | Tot el reste |
| `authPersistConfig` | Només el flag `biometricEnabled` | user, error, isLoading, tokens |

La `whitelist` és la peça que aguanta el pes. És una llista positiva: només els slices que anomenes es persisteixen, tot el reste és efímer. Així és com evites que els tokens acabin a AsyncStorage a través de Redux.

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

Quan l'usuari canvia el tema o l'idioma, Redux Persist escriu a AsyncStorage per tu. Al proper inici, `PersistGate` espera la rehidratació abans de renderitzar:

```typescript
// App.tsx
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor, store } from '@app/store/configureStore';

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        {/* les teves pantalles */}
      </PersistGate>
    </Provider>
  );
}
```

`PersistGate` bloqueja el render fins que el slice persistit s'ha tornat a carregar al store. Sense ell, l'app mostra l'estat per defecte un frame abans que el tema/idioma persistit prengui el relleu.

## Com es componen els nivells en un flux d'autenticació

Els wrappers es guanyen el seu pes quan els veus treballant junts al login, la restauració de sessió, el logout i el refresc de tokens.

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

La seqüència de tancament de sessió és deliberada. El Nivell 1 i el Nivell 2 es netegen perquè els tokens i les dades personals pertanyen a la sessió. El Nivell 3 es queda perquè el tema i l'idioma pertanyen al dispositiu.

### Renovació de token

L'interceptor d'Axios gestiona la [renovació de tokens](/blog/token-refresh-race-condition-react-native/) en segon pla. Llegeix i escriu a SecureStore sense tocar els altres nivells:

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

La regla és curta: si dona accés, Nivell 1. Si identifica una persona, Nivell 2. Si és una preferència, Nivell 3. Aquesta classificació també dóna forma a l'estructura del projecte. Els wrappers d'emmagatzematge viuen a una carpeta compartida `utils/storage/`, i el flux d'autenticació que els orquestra viu dins de la feature Auth. Tot lligat amb una [estructura de projecte feature-first](/blog/feature-first-project-structure-react-native/).

## Errors freqüents

**No emmagatzemis tokens a Redux.** L'estat de Redux pot ser serialitzat, registrat, persistit a AsyncStorage via Redux Persist, i inspeccionat amb DevTools. Fins i tot amb el slice d'auth a la blacklist, una sola mala configuració exposa els tokens. Guarda els tokens a SecureStore, i punt.

**No saltis els enums tipats.** Sense `SecureStoreKey` i `EncryptedStoreKey`, estàs passant strings a pèl. Una errada de tecleig i llegeixes de la clau equivocada. Un nivell equivocat i emmagatzemes un token en text pla. El sistema de tipus és l'auditoria de seguretat més barata que faràs mai.

**No oblidis netejar en tancar sessió.** Si neteges SecureStore però et saltes EncryptedStore, les dades personals de l'usuari segueixen allà després del logout. El mètode `clear()` de cada nivell és el contracte: crida tots dos durant el tancament de sessió.

**No assumeixis que Keychain és ràpid.** SecureStore fa una anada i tornada a l'enclavament segur. En dispositius antics pot trigar 100-200ms per lectura. No el cridis dins un bucle de renderització. Llegeix els tokens un cop a l'inici de l'app i passa'ls a través del teu interceptor HTTP.

**Usa la `whitelist` de Redux Persist, no la `blacklist`.** Anomena què ha de persistir. La `blacklist` és arriscada perquè els slices nous persisteixen per defecte. Un sol slice nou amb dades sensibles i tens una filtració. `whitelist` és opt-in, i més segura.

## Llavors, per què tres biblioteques

Una biblioteca (AsyncStorage) deixa els tokens en text pla. Una biblioteca (react-native-keychain) és massa lenta per a lectures no sensibles. Tres biblioteques, tres wrappers, tres enums. Cada wrapper fa menys de 50 línies. El setup porta una tarda.

El que t'emportes: tokens que no es poden llegir sense autenticació biomètrica, dades personals xifrades en repòs, i preferències que es carreguen al primer frame. Cada peça de dades està protegida exactament al nivell que realment necessita.

> Emmagatzema-ho tot al mateix lloc i no protegeixes res. Separa per sensibilitat i protegeixes el que importa.

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. La configuració completa de SecureStore, EncryptedStore i Redux Persist són al repo.*
