---
title: "Almacenamiento seguro por niveles en React Native"
description: "Tres niveles de almacenamiento para React Native: Keychain para tokens, almacenamiento cifrado para datos personales, AsyncStorage para preferencias. Por qué existe cada nivel, cuándo usarlo y cómo encaja Redux Persist."
publishDate: 2026-05-18
tags: ["react-native", "security", "typescript", "tutorial"]
locale: es
heroImage: "/images/blog/tiered-secure-storage.jpg"
heroAlt: "Almacenamiento seguro por niveles en React Native"
campaign: "tiered-secure-storage"
---

## El problema de una sola solución de almacenamiento

La mayoría de las apps React Native guardan todo en AsyncStorage. Tokens, datos del usuario, preferencias, estado de sesión. Todo en un solo lugar, todo en texto plano.

AsyncStorage es un key-value store respaldado por SQLite (iOS) o SharedPreferences (Android). Es rápido y conveniente. También está completamente sin cifrar. Cualquier persona con acceso físico al dispositivo, o un dispositivo rooteado/jailbreakeado, puede leer cada valor.

Para una preferencia de tema, no pasa nada. Para un access token, es un incidente de seguridad.

> 💡 **El principio:** almacena los datos en un nivel de seguridad acorde a su sensibilidad. Los tokens reciben la protección más fuerte. Las preferencias obtienen el acceso más rápido. Todo lo demás cae en algún punto intermedio.

## Los tres niveles

| Nivel | Librería | Seguridad | Velocidad | Usa para |
|---|---|---|---|---|
| 1. SecureStore | react-native-keychain | Respaldado por hardware (Keychain/Keystore) | Más lento | Tokens, claves de cifrado, PINs |
| 2. EncryptedStore | react-native-encrypted-storage | Cifrado AES-256 | Medio | Datos personales (email, nombre, teléfono) |
| 3. AsyncStorage | @react-native-async-storage | Ninguna (texto plano) | Más rápido | Preferencias (tema, idioma) |

Cada nivel es un wrapper delgado sobre una librería. El wrapper obliga a usar claves tipadas (así no puedes guardar un token en el nivel equivocado) y proporciona una API consistente.

## Nivel 1: SecureStore (Keychain / Keystore)

El nivel de seguridad más alto. Usa el enclave seguro respaldado por hardware de la plataforma: iOS Keychain o Android Keystore. Los datos los cifra el sistema operativo y puede requerir autenticación biométrica para acceder a ellos.

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

Decisiones de diseño clave:

- ✅ **Un service por clave.** Keychain almacena una credencial por identificador de servicio. Usar `com.warrendeleon.portfolio.accessToken` y `com.warrendeleon.portfolio.refreshToken` como servicios separados evita que se sobreescriban entre sí
- ✅ **Biometría o passcode del dispositivo.** `BIOMETRY_ANY_OR_DEVICE_PASSCODE` significa que el usuario necesita Face ID, Touch ID o el PIN de su dispositivo para acceder a los datos. Si el dispositivo no tiene seguridad configurada, los datos siguen protegidos por el sistema operativo
- ✅ **Solo este dispositivo.** `WHEN_UNLOCKED_THIS_DEVICE_ONLY` significa que los datos no se transfieren a un nuevo dispositivo vía backup. Los tokens no deberían viajar
- ✅ **Claves tipadas con enum.** No puedes pasar un string por accidente. El compilador obliga a que solo datos de nivel token vayan al SecureStore

## Nivel 2: EncryptedStore (AES-256)

El nivel intermedio. Los datos se cifran con AES-256 pero no requieren seguridad respaldada por hardware ni acceso biométrico. Más rápido que Keychain, más seguro que texto plano.

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

¿Por qué no poner los datos personales en SecureStore? Rendimiento. El acceso a Keychain requiere una verificación de seguridad a nivel de sistema (y potencialmente un prompt biométrico). Para mostrar el nombre de un usuario en una pantalla de perfil, esa sobrecarga no se justifica. EncryptedStore te da cifrado AES-256 sin la barrera de hardware.

Las operaciones batch (`setMultiple`, `getMultiple`) importan para los flujos de autenticación donde necesitas guardar varios campos a la vez:

```typescript
await EncryptedStore.setMultiple([
  { key: EncryptedStoreKey.USER_EMAIL, value: user.email },
  { key: EncryptedStoreKey.USER_FIRST_NAME, value: user.firstName },
  { key: EncryptedStoreKey.USER_LAST_NAME, value: user.lastName },
]);
```

## Nivel 3: AsyncStorage + Redux Persist

El nivel más rápido. Texto plano, sin cifrado. Solo para datos sin sensibilidad de seguridad: preferencia de tema, selección de idioma.

```bash
yarn add @react-native-async-storage/async-storage redux-persist
```

No usas AsyncStorage directamente para preferencias. Redux Persist se encarga de eso. Guarda automáticamente tu estado de Redux en AsyncStorage y lo rehidrata cuando la app arranca.

La clave es la configuración de persist:

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

| Config | Qué persiste | Qué excluye |
|---|---|---|
| `rootPersistConfig` | Solo el slice de settings (tema, idioma) | Todo lo demás |
| `authPersistConfig` | Solo el flag `biometricEnabled` | user, error, isLoading, tokens |

La `whitelist` es crítica. Es una lista positiva: solo los slices que nombras se persisten. Todo lo demás es efímero. Así es como evitas que los tokens terminen accidentalmente en AsyncStorage a través de Redux.

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

Cuando el usuario cambia el tema o el idioma, Redux Persist escribe automáticamente en AsyncStorage. En el próximo arranque, `PersistGate` espera la rehidratación antes de renderizar:

```typescript
<Provider store={store}>
  <PersistGate loading={null} persistor={persistor}>
    <App />
  </PersistGate>
</Provider>
```

## Cómo funcionan los niveles juntos

El verdadero valor está en cómo los niveles se componen durante los flujos de autenticación.

### Login

```typescript
// 1. El backend devuelve tokens y datos del usuario
const { access_token, refresh_token, user } = await authClient.signIn(credentials);

// 2. Tokens → SecureStore (Nivel 1)
await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, access_token);
await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, refresh_token);
await SecureStore.set(SecureStoreKey.USER_ID, user.id);

// 3. Datos personales → EncryptedStore (Nivel 2)
await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, user.email);
await EncryptedStore.set(EncryptedStoreKey.USER_FIRST_NAME, user.firstName);

// 4. Se actualiza el estado de Redux → la UI renderiza
dispatch(setUser(user));
// Los settings (tema, idioma) ya están en Redux vía Persist (Nivel 3)
```

### Arranque de la app (restauración de sesión)

```typescript
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async () => {
    // Verificar si tenemos un token válido (Nivel 1)
    const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
    if (!accessToken) return null;

    // Restaurar datos del usuario (Nivel 2)
    const email = await EncryptedStore.get(EncryptedStoreKey.USER_EMAIL);
    const firstName = await EncryptedStore.get(EncryptedStoreKey.USER_FIRST_NAME);
    const userId = await SecureStore.get(SecureStoreKey.USER_ID);

    // Los settings ya fueron restaurados por PersistGate (Nivel 3)
    return { id: userId, email, firstName };
  }
);
```

### Logout

```typescript
// 1. Invalidar el refresh token en el backend
await authClient.logout();

// 2. Limpiar tokens (Nivel 1)
await SecureStore.clear();

// 3. Limpiar datos personales (Nivel 2)
await EncryptedStore.clear();

// 4. Limpiar el estado de auth en Redux
dispatch(resetAuth());

// Los settings (Nivel 3) persisten después del logout. El usuario conserva su tema e idioma.
```

La secuencia de logout es deliberada. Los Niveles 1 y 2 se limpian porque los tokens y los datos personales pertenecen a la sesión. El Nivel 3 persiste porque el tema y el idioma pertenecen al dispositivo.

### Renovación de token

El interceptor de Axios maneja la renovación automática de tokens de forma transparente. Lee y escribe en SecureStore sin tocar los otros niveles:

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

      // Actualizar tokens en SecureStore
      await SecureStore.set(SecureStoreKey.ACCESS_TOKEN, data.access_token);
      await SecureStore.set(SecureStoreKey.REFRESH_TOKEN, data.refresh_token);

      // Reintentar la petición original
      error.config.headers.Authorization = `Bearer ${data.access_token}`;
      return axiosInstance(error.config);
    }
    return Promise.reject(error);
  }
);
```

## La clasificación de datos

Cada dato almacenado tiene un lugar claro:

| Dato | Nivel | Por qué |
|---|---|---|
| Access token | 1 (SecureStore) | Da acceso a la API. Protección respaldada por hardware. |
| Refresh token | 1 (SecureStore) | Puede generar nuevos access tokens. El objetivo de mayor valor. |
| User ID | 1 (SecureStore) | Se usa para identificar al usuario en cada petición. |
| PIN hasheado | 1 (SecureStore) | Credencial de autenticación local. |
| Clave de cifrado | 1 (SecureStore) | Protege los datos del Nivel 2. Debe estar en hardware. |
| Email | 2 (EncryptedStore) | Dato personal. Cifrado pero necesita acceso rápido para mostrarse. |
| Nombre | 2 (EncryptedStore) | Dato personal. Se muestra en pantallas de perfil. |
| Teléfono | 2 (EncryptedStore) | Dato personal. Se muestra en configuración. |
| Proveedor de auth | 2 (EncryptedStore) | No es sensible pero está relacionado con la sesión de auth. |
| Tema | 3 (AsyncStorage) | Preferencia no sensible. Sobrevive al logout. |
| Idioma | 3 (AsyncStorage) | Preferencia no sensible. Sobrevive al logout. |

La regla es simple: si da acceso, Nivel 1. Si identifica a una persona, Nivel 2. Si es solo una preferencia, Nivel 3.

## Errores comunes

**No guardes tokens en Redux.** El estado de Redux se puede serializar, registrar en logs, persistir en AsyncStorage vía Redux Persist, e inspeccionar con DevTools. Aunque pongas el slice de auth en blacklist para la persistencia, una sola mala configuración expone los tokens. Guarda los tokens en SecureStore, punto.

**No te saltes los enums tipados.** Sin los enums `SecureStoreKey` y `EncryptedStoreKey`, estás pasando strings sueltos. Un typo y estás leyendo de la clave equivocada. Un nivel equivocado y estás guardando un token en texto plano. El sistema de tipos es tu auditoría de seguridad más barata.

**No te olvides de limpiar en el logout.** Si limpias SecureStore pero te olvidas de EncryptedStore, los datos personales del usuario persisten después del logout. El método `clear()` de cada nivel existe por esta razón. Llama a ambos durante el logout.

**No asumas que Keychain es rápido.** SecureStore implica un round trip al enclave seguro. En dispositivos antiguos, puede tardar entre 100 y 200ms por lectura. No lo llames en un render loop. Lee los tokens una vez al arranque de la app y pásalos a través de tu interceptor HTTP.

**Whitelist de Redux Persist, no blacklist.** Usa `whitelist` para nombrar lo que debe persistir. Un enfoque con `blacklist` es peligroso porque los slices nuevos se persisten por defecto. Un slice nuevo con datos sensibles y ya tienes un leak. `whitelist` es opt-in. Más seguro.

## Por qué tres librerías

Sí. La alternativa es una librería (AsyncStorage) sin cifrado, o una librería (react-native-keychain) que es demasiado lenta para lecturas no sensibles. Tres librerías, tres wrappers, tres enums. Cada wrapper tiene menos de 50 líneas. El setup lleva una tarde.

Lo que obtienes: tokens que no se pueden leer sin autenticación biométrica, datos personales cifrados en reposo, y preferencias que cargan al instante. Cada dato está protegido exactamente en el nivel que requiere. Ni más, ni menos.

> Guarda todo en un solo lugar y no proteges nada. Separa por sensibilidad y proteges lo que importa.

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. Las configuraciones completas de SecureStore, EncryptedStore y Redux Persist están en el repo.*
