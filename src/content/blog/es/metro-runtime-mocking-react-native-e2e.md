---
title: "Mocking en runtime de Metro para tests E2E deterministas en React Native"
description: "Por qué importa mockear tu backend en tests E2E, y cómo hacerlo a nivel del bundle de Metro. Sin intercepción de red, sin tests flaky, sin dependencias externas."
publishDate: 2026-06-15
tags: ["react-native", "testing", "e2e-testing", "mocking"]
locale: es
heroImage: "/images/blog/metro-runtime-mocking.jpg"
heroAlt: "Mocking en runtime de Metro para testing E2E en React Native"
campaign: "metro-runtime-mocking"
relatedPosts: ["setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing", "building-a-supabase-rest-client-without-the-sdk"]
---

## El problema con backends reales en tests E2E

Tus tests de Detox corren en un dispositivo real (o simulador). Tocan botones, escriben texto, navegan pantallas. En algún momento, la app hace una llamada a la API. Y ahí es donde todo se vuelve frágil.

**Los backends reales hacen que los tests E2E sean no deterministas.** El mismo test puede pasar o fallar dependiendo de:

| Factor | Qué sale mal |
|---|---|
| Latencia de red | Timeout en CI, pasa en local |
| Rate limiting de la API | Los tests fallan si se ejecutan muy seguido |
| Datos de test compartidos | Otra ejecución de tests mutó el mismo usuario |
| Deploys del backend | La API cambió entre tu build y tu ejecución de tests |
| Caídas de terceros | El proveedor de auth está caído, todos los tests de login fallan |
| Estado de la base de datos | El test espera 3 items, alguien añadió un 4to |

Cada uno de estos causó un test fallido en un proyecto en el que trabajé. Ninguno era un bug real en la app.

> 💡 **Un test flaky es peor que no tener test.** Entrena al equipo a ignorar los fallos. Una vez que la gente empieza a relanzar la suite "por si acaso", has perdido la confianza en tu infraestructura de tests.

## Por qué mockear el backend

¿Para qué?

**1. Determinismo.** El mismo test produce el mismo resultado cada vez. Sin variabilidad de red, sin estado compartido, sin dependencias externas. Si un test falla, es porque la app está rota, no porque la API tuvo un mal día.

**2. Velocidad.** Sin round trips de red. Sin esperar queries a la base de datos. Las respuestas mockeadas vuelven al instante. Una suite que tarda 8 minutos contra un backend real puede bajar a 3 minutos con mocks.

**3. Estados de error testeables.** Con un backend real, testear un error 500 significa romper el servidor o construir un endpoint especial. Con mocks, pasas un argumento de lanzamiento y la app devuelve el error que necesites.

## Los trade-offs

Mockear no es gratis. Estás eligiendo a qué renunciar.

| Lo que ganas | Lo que pierdes |
|---|---|
| Resultados deterministas | Confianza en que la integración real con la API funciona |
| Ejecución rápida | Cobertura de edge cases de red (timeouts, reintentos) |
| Sin infraestructura necesaria | Los datos fixture pueden desviarse de las respuestas reales de la API |
| Estados de error testeables | Necesidad de mantener los fixtures a medida que la API evoluciona |

La respuesta honesta: **necesitas ambos.** Mockea el backend para tu suite E2E diaria (la que corre en cada PR). Ejecuta un conjunto más pequeño de smoke tests contra el backend real con un schedule (nightly, pre-release). La suite mockeada detecta regresiones rápido. La suite real detecta drift en la integración.

## Por qué no MSW

[MSW funciona bien para tests unitarios y de integración](/blog/es/setting-up-msw-v2-in-react-native/) porque corren en Node.js (vía Jest). MSW intercepta peticiones a nivel de red dentro del proceso de Node.

Los tests E2E de Detox son diferentes. La app corre en un proceso nativo de iOS o Android, no en Node.js. MSW no puede interceptar peticiones dentro de un proceso nativo. Las llamadas de red salen del runtime de JavaScript y pasan por el stack de networking nativo de la plataforma (NSURLSession en iOS, OkHttp en Android).

Necesitas una estrategia de mocking que funcione dentro de la propia app. Ahí es donde entra el mocking en runtime de Metro.

## Cómo funciona

La idea es simple: en el momento del build, metes un flag en el bundle de JavaScript. En runtime, cada función de API comprueba el flag. Si el mocking está habilitado, devuelve datos fixture en vez de hacer una llamada real a la red.

### Paso 1: La variable de entorno

El plugin `transform-inline-environment-variables` de Babel inlinea variables de entorno en el bundle en tiempo de compilación:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'transform-inline-environment-variables',
  ],
};
```

Cuando compilas con `E2E_MOCK=true`, cada referencia a `process.env.E2E_MOCK` se convierte en el string `"true"` en el JavaScript compilado. No es un lookup en runtime. Es un valor estático embebido en el bundle.

### Paso 2: El módulo de configuración

Un solo módulo lee el flag y lo expone al resto de la app:

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

El override en runtime es útil para testing durante el desarrollo. Un dev puede activar/desactivar el mocking sin recompilar la app. Para tests E2E, el flag de build-time es todo lo que necesitas.

### Paso 3: Los archivos de fixtures

Los datos fixture viven en archivos JSON, organizados por locale:

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

Estos archivos se importan en tiempo de bundle y se exportan a través de un barrel file:

```typescript
// src/test-utils/fixtures/index.ts
import profileEN from './api/en/profile.json';
import educationEN from './api/en/education.json';
import workxpEN from './api/en/workxp.json';

export const mockProfileEN = profileEN as Profile;
export const mockEducationEN = educationEN as Education[];
export const mockWorkXPEN = workxpEN as WorkExperience[];
```

Los fixtures están tipados. Si la forma de la respuesta de la API cambia y el fixture no coincide, TypeScript lo detecta en tiempo de compilación.

### Paso 4: El switch en la API

Cada función de API comprueba el flag al principio. Si el mocking está habilitado, devuelve datos fixture envueltos en una respuesta compatible con Axios. Este patrón solo funciona porque [construí mi propio cliente REST](/blog/building-a-supabase-rest-client-without-the-sdk/) en vez de usar el SDK de Supabase. Controlo la capa HTTP, así que puedo intercambiarla en tiempo de build:

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

  // Llamada real a la API
  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Detalles clave:

- ✅ El path mock devuelve un objeto de respuesta Axios completo. Redux, selectores y componentes no notan la diferencia
- ✅ Fixtures específicos por idioma con fallback a inglés
- ✅ El path real sigue [validando con Zod](/blog/runtime-api-validation-zod-react-native/). El path mock se salta la validación porque los fixtures ya están tipados
- ✅ Sin imports condicionales. Ambos paths existen en la misma función

### Paso 5: Simulación de errores

El verdadero poder de este enfoque: testing de errores determinista. Los argumentos de lanzamiento controlan qué endpoints fallan y cómo:

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

En tu función de API, comprueba la simulación de error antes de devolver datos fixture:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    return Promise.reject(error);
  }
  // Devolver datos fixture normales
}
```

En tu test de Detox, lanza la app con argumentos de error:

```typescript
await device.launchApp({
  launchArgs: {
    errorMode: 'network',
    errorEndpoint: 'profile',
  },
});
```

Ahora puedes testear cada estado de error de forma determinista: fallos de red, 500s, 404s, timeouts. Cada uno es un argumento de lanzamiento, no un servidor roto.

## Mocking de autenticación

Auth es la parte más complicada. Los flujos reales de auth implican tokens, sesiones, verificación de email, reset de contraseña. Mockear estos requiere mantener estado dentro del mock:

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

El mock guarda el email del usuario en [encrypted storage](/blog/tiered-secure-storage-react-native/), igual que lo haría el flujo real. Las llamadas subsiguientes a la API (login, fetch de perfil) pueden leer este estado almacenado para mantener consistencia a lo largo de la sesión.

Para testing de errores, una convención simple funciona bien: contraseñas que empiezan con "Wrong" disparan un error de auth. Sin configuración especial.

## El flujo de build y test

```bash
# Compilar la app con mocking habilitado
E2E_MOCK=true yarn detox:ios:build

# Ejecutar tests E2E (la app usa datos fixture)
yarn detox:ios:test

# Ejecutar smoke tests contra el backend real (build separado)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

El build mockeado y el build real son binarios de app separados. El mockeado se usa para la suite E2E completa. El real se usa para una suite de smoke más pequeña.

## Errores comunes

**Los fixtures se desacoplan de la API real.** El mayor riesgo. Si el backend añade un campo y tus fixtures no lo tienen, los tests mock pasan pero la app real se rompe. Soluciona esto ejecutando tu validación de esquema Zod contra tus fixtures en un test unitario. Si el fixture no coincide con el esquema, el test falla.

**Mockear demasiado.** Si cada llamada a la API está mockeada, estás testeando tus fixtures, no tu app. Mantén el mocking en el límite HTTP. Redux, manejo de estado, navegación y renderizado de UI deben ser reales.

**Olvidarse de testear la integración real.** Los tests E2E mockeados detectan regresiones de UI. No detectan cambios en el contrato de la API. Ejecuta una suite de smoke contra el backend real con un schedule, aunque sea solo 5 paths críticos.

**Filtrar estado mock entre escenarios.** Cada escenario de Detox debe arrancar con un estado de app limpio. Usa `device.reloadReactNative()` en el hook `Before` para resetear todo. No te apoyes en estado mock de un escenario previo.

## El resultado

El setup es un día de trabajo. Después de eso, tu suite E2E corre sin backend, sin dependencias de red y sin fallos flaky de servicios externos.

En mi proyecto, la suite mockeada corre en 3 minutos. Los mismos tests contra un backend real tardaban 8 minutos y fallaban intermitentemente. La suite mockeada estuvo verde durante semanas. La suite real necesitaba supervisión.

Los dos enfoques funcionan juntos. Mock para velocidad y determinismo en cada PR. Backend real para confianza en la integración con un schedule. Ninguno solo es suficiente.

> El propósito de los tests E2E es detectar regresiones en la app, no testear tu conexión a internet.

*Este post es parte de una serie sobre testing de apps React Native. Los posts anteriores cubren [MSW v2 para tests unitarios y de integración](/blog/es/setting-up-msw-v2-in-react-native/) y [Detox + Cucumber BDD para testing E2E](/blog/es/detox-cucumber-bdd-react-native-e2e-testing/). Los ejemplos de código son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
