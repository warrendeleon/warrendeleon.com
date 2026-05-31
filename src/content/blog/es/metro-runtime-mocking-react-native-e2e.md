---
title: "Mocking en runtime de Metro para tests E2E deterministas en React Native"
description: "Mockear el backend a nivel del bundle de Metro para Detox. Sin intercepción de red, sin tests flaky, sin servicios externos. Por qué supera a MSW en E2E."
tags: ["react-native", "testing", "e2e-testing", "mocking"]
locale: es
heroImage: "/images/blog/metro-runtime-mocking.webp"
heroAlt: "Mocking en runtime de Metro para testing E2E en React Native"
campaign: "metro-runtime-mocking"
relatedPosts: ["setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing", "building-a-supabase-rest-client-without-the-sdk"]
---

## El problema con backends reales en tests E2E

Tus tests de Detox corren en un dispositivo real o simulador. Tocan botones, escriben texto, navegan pantallas. En algún momento, la app hace una llamada a la API. Ahí es donde todo se vuelve frágil.

El mismo test puede pasar o fallar dependiendo de:

| Factor | Qué sale mal |
|---|---|
| Latencia de red | Timeout en CI, pasa en local |
| Rate limiting de la API | Los tests fallan si se ejecutan muy seguido |
| Datos de test compartidos | Otra ejecución de tests mutó el mismo usuario |
| Deploys del backend | La API cambió entre tu build y tu ejecución de tests |
| Caídas de terceros | El proveedor de auth está caído, todos los tests de login fallan |
| Estado de la base de datos | El test espera 3 items, alguien añadió un 4to |

Cada uno de estos causó un test fallido en un proyecto en el que trabajé. Ninguno era un bug real en la app.

Un test flaky es peor que no tener test. Entrena al equipo a ignorar los fallos. Una vez que la gente empieza a relanzar la suite "por si acaso", has perdido la confianza en tu infraestructura de tests.

## Por qué no MSW, Mirage o un servidor mock

Son las opciones obvias, y cada una encaja con una forma real. Vale la pena decir qué hacen bien antes de explicar por qué las dejo de lado en Detox.

**MSW** intercepta peticiones a nivel de red dentro de Node. Es excelente para tests unitarios y de integración con Jest, y ahí es donde lo [uso en este mismo proyecto](/blog/es/setting-up-msw-v2-in-react-native/). El modo Service Worker cubre el navegador. En una ejecución de Detox la cosa cambia: la app corre en un proceso nativo de iOS o Android, y la petición sale del runtime de JS por NSURLSession u OkHttp. MSW no las ve.

**Mirage JS** corre un servidor mock en memoria dentro de la app. Parchea `fetch` y `XMLHttpRequest` en el runtime de JS, lo que funciona con librerías que pasan por ahí (Axios del lado JS sí, hasta que empiezas a usar capas de networking nativas). El modelo de intercepción es sólido para desarrollo y Jest; encaja peor con builds de Detox donde quieres el swap horneado.

**Servidores mock independientes** (Prism, json-server, un Express pequeño en localhost) son la opción más realista. Ejercitan el stack de red completo. El coste es operativo: ahora tienes un proceso que arrancar, un puerto que gestionar, fontanería de CI para levantarlo junto al simulador, y un build que depende de un sidecar funcionando. Para un proyecto pequeño llevado por una o dos personas, suele pesar más de lo que aporta.

El enfoque que quiero contar aquí mantiene el swap dentro del bundle. Sin sidecar, sin Service Worker, sin parchear `fetch`. Un flag de build elige la implementación de la API en tiempo de compilación; el resto de la app no cambia. Encaja con apps donde controlas el cliente HTTP (Axios, un cliente REST hecho a mano) y quieres un binario por modo de test.

## A qué renuncias

Mockear no es gratis. Estás eligiendo a qué renunciar.

| Lo que ganas | Lo que pierdes |
|---|---|
| Resultados deterministas | Confianza en que la integración real con la API funciona |
| Ejecución rápida | Cobertura de edge cases de red (timeouts, reintentos) |
| Sin infraestructura necesaria | Los datos fixture pueden desviarse de las respuestas reales de la API |
| Estados de error testeables | Necesidad de mantener los fixtures a medida que la API evoluciona |

El reparto honesto: mockea para la suite E2E diaria que corre en cada PR, y ejecuta un conjunto más pequeño de smoke tests contra el backend real con un schedule (nightly, pre-release). La suite mockeada detecta regresiones rápido. La suite real detecta drift en la integración. Ninguna sola es suficiente.

## Por qué el bundle, no la red

Tres razones.

Determinismo. Misma entrada, misma salida, siempre. Sin reintentos flaky por un runner de CI lento, sin estado compartido entre ejecuciones, sin una caída del proveedor de auth tumbando veinte tests a la vez. Si un test de Detox falla, la app está mal.

Velocidad. Sin round trips. Sin base de datos. Las respuestas mockeadas resuelven de forma síncrona en `Promise.resolve`. Una suite que tardaba ocho minutos contra un backend real baja a tres con esto puesto en el mismo proyecto.

Estados de error sin infraestructura. Testear un 500 contra un servidor real significa romperlo o cablear un endpoint especial. Con un flag y un argumento de lanzamiento, tienes cada clase de error a demanda: red, 500, 404, timeout.

## Cómo funciona

En tiempo de build, metes un flag en la compilación nativa. En runtime, cada función de API comprueba el flag. Si el mocking está activo, devuelve datos fixture envueltos en la misma forma de respuesta; si no, va a la red real. La elección ocurre dentro de la función, así que los llamantes (Redux, pantallas, hooks) quedan idénticos.

### Paso 1: cómo entra el flag

Dos opciones prácticas. No son excluyentes, pero normalmente quieres una de ellas.

`react-native-config` lee de un archivo `.env` en tiempo de build nativo y expone los valores a través de `Config.E2E_MOCK`. El valor se fija cuando Xcode o Gradle compilan el binario, así que ejecutarías `E2E_MOCK=true yarn detox:ios:build` para producir un build mockeado.

El plugin de Babel `babel-plugin-transform-inline-environment-variables` es la alternativa del lado JS. Reescribe `process.env.E2E_MOCK` en tu código fuente al string literal en tiempo de bundle. Si vas por ese camino, lees el flag directamente:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-environment-variables'],
};
```

Cualquiera de los dos enfoques te da la misma propiedad: el flag es una constante en el binario distribuido, no un lookup en runtime. El resto del post usa `react-native-config`, que es lo que utiliza en producción el [repo rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).

### Paso 2: el módulo de configuración

Un solo módulo lee el flag y lo expone. La implementación de referencia también soporta un override en runtime (útil para alternar mocks durante sesiones manuales de dev sin recompilar), pero el flag de build-time es lo que tus ejecuciones de Detox usan de verdad.

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

En el codebase real, el override persiste en `AsyncStorage` para sobrevivir a un reload; eso es una extensión, no la idea central.

### Paso 3: los archivos de fixtures

Los datos fixture viven en archivos JSON, organizados por locale:

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

Un barrel file los exporta con los tipos atados, así que un fixture que no encaje es un error de compilación:

```typescript
// src/test-utils/fixtures/index.ts
import profileEN from './api/en/profile.json';
import educationEN from './api/en/education.json';
import workxpEN from './api/en/workxp.json';

export const mockProfileEN = profileEN as Profile;
export const mockEducationEN = educationEN as Education[];
export const mockWorkXPEN = workxpEN as WorkExperience[];
```

### Paso 4: el switch en la API

Cada función de API comprueba el flag al principio. Si el mocking está activo, devuelve datos fixture envueltos en una respuesta compatible con Axios. Este patrón depende de controlar la frontera HTTP, que es una de las razones por las que [construí mi propio cliente REST](/blog/building-a-supabase-rest-client-without-the-sdk/) en vez de coger el SDK de Supabase.

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

Vale la pena anotar:

- El path mock devuelve un objeto de respuesta Axios completo. Redux, selectores y componentes no notan la diferencia.
- Fixtures específicos por idioma con fallback a inglés.
- El path real sigue [validando con Zod](/blog/runtime-api-validation-zod-react-native/). El path mock se salta la validación porque los fixtures ya están tipados al importarse.
- Sin imports condicionales. Ambos paths viven en la misma función.

### Paso 5: simulación de errores

El flag te da happy paths mockeados. Los argumentos de lanzamiento te dan estados de error a demanda.

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

Comprueba la simulación de error antes de devolver datos fixture:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    if (error) return Promise.reject(error);
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

Cada estado de error se convierte en un argumento de lanzamiento: fallos de red, 500s, 404s, timeouts. Ninguno necesita un servidor roto.

`launchArgs` y `E2E_MOCK` hacen trabajos distintos. `E2E_MOCK` se hornea en el binario en tiempo de build nativo y conmuta la capa de API entre llamadas reales y fixtures. `launchArgs` se lee en runtime vía `react-native-launch-arguments` y le dice a la API ya mockeada qué escenario tocar para este test concreto. Un binario, muchos escenarios.

## Mocking de autenticación

Auth es la parte incómoda. Los flujos reales tocan tokens, sesiones, verificación de email, reset de contraseña. Mockear esto implica mantener algo de estado dentro del mock:

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

El mock escribe el email del usuario en [encrypted storage](/blog/tiered-secure-storage-react-native/) igual que lo haría un signup real. Las llamadas siguientes (login, fetch de perfil) leen ese estado almacenado para mantener la sesión coherente a lo largo del test.

Para testing de errores, una convención pequeña ahorra mucho cableado: contraseñas que empiezan con "Wrong" disparan un error de auth. Sin argumento de lanzamiento para el caso común de contraseña incorrecta.

## El flujo de build y test

```bash
# Compilar la app con mocking habilitado
E2E_MOCK=true yarn detox:ios:build

# Ejecutar tests E2E contra el binario mockeado
yarn detox:ios:test

# Compilar y ejecutar smoke tests contra el backend real (binario separado)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

Dos binarios, dos suites. Mockeado para la pasada completa de PR, real para el set de smoke.

## Errores comunes

**Los fixtures se desacoplan de la API real.** El mayor riesgo. Si el backend añade un campo y tus fixtures no, los tests mock siguen verdes mientras la app real se rompe. Ejecuta tus esquemas Zod contra tus fixtures en un test unitario; un fixture que no satisfaga el esquema rompe CI.

**Mockear demasiado.** Mockea el límite HTTP y para. Redux, manejo de estado, navegación y renderizado deben correr de verdad. Si cada capa está falseada, estás testeando tus fixtures.

**Olvidarse de la integración real.** Los tests E2E mockeados detectan regresiones de UI. No detectan cambios de contrato. Mantén una pequeña suite de smoke contra el backend real con un schedule, aunque sean cinco paths críticos.

**Filtrar estado entre escenarios.** Cada escenario de Detox debe arrancar limpio. Llama a `device.reloadReactNative()` (o relanza la app) en el hook `Before` para que un mock escrito por un test no se filtre al siguiente.

## Dónde te deja esto

Un día de trabajo para el andamiaje. Después, la suite E2E corre sin backend, sin red, sin servicios externos.

En el proyecto del que viene este patrón, la suite mockeada se asentó en tres minutos. Los mismos tests contra el backend real corrían en ocho y fallaban intermitentemente. La suite mockeada estuvo verde durante semanas. La suite real necesitaba supervisión.

Mock para velocidad y determinismo en cada PR. Backend real para confianza en la integración con un schedule. El sentido de una suite E2E es detectar regresiones en la app, no testear tu red.

*Este post es parte de una serie sobre testing de apps React Native. Las entregas anteriores cubren [MSW v2 para tests unitarios y de integración](/blog/es/setting-up-msw-v2-in-react-native/) y [Detox con Cucumber BDD para E2E](/blog/es/detox-cucumber-bdd-react-native-e2e-testing/). El código sale de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
