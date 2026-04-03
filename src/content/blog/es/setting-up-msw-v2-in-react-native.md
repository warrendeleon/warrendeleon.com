---
title: "Configurando MSW v2 en React Native"
description: "Una guía práctica para configurar Mock Service Worker v2 en un proyecto React Native. Desde la instalación hasta handler sets de nivel producción que cubren éxito, errores, timeouts y escenarios offline."
publishDate: 2026-04-27
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: es
heroImage: "/images/blog/msw-react-native.jpg"
heroAlt: "Configurando MSW v2 en React Native para testing"
---

## Por qué MSW en vez de mocks manuales

La mayoría de los proyectos React Native mockean su capa de API con `jest.fn()`. Mockeás `fetch` o tu instancia de Axios, definís lo que devuelve, y testeás contra eso.

Funciona. Hasta que no.

El problema: estás testeando la interacción de tu código con un mock, no con una capa HTTP. Si tu cliente de API cambia cómo construye URLs, agrega headers o maneja reintentos, el mock no detecta la regresión. El mock siempre devuelve lo que le dijiste, sin importar lo que el código realmente envió.

**Mock Service Worker (MSW)** intercepta las peticiones a nivel de red. Tu código hace llamadas HTTP reales. MSW las captura antes de que salgan del proceso y devuelve tus respuestas mockeadas. Todo lo que hay entre tu componente y la red se ejercita: el thunk de Redux, los interceptores de Axios, el manejo de errores, el parseo de la respuesta.

> 💡 **La diferencia clave:** los mocks manuales reemplazan tu código. MSW reemplaza la red. Tu código corre exactamente como lo haría en producción, hasta el punto donde la petición saldría del dispositivo.

## Instalación

MSW v2 funciona en React Native a través del servidor de Node.js (para tests de Jest). El service worker del navegador no aplica para mobile.

```bash
yarn add -D msw
```

Eso es todo. Sin polyfills, sin cambios en la config de Metro, sin linking de módulos nativos.

## El servidor

Creá `src/test-utils/msw/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Tres líneas. El servidor toma tus handlers por defecto (respuestas exitosas) e intercepta las peticiones que matchean.

## Conectándolo con Jest

En tu `jest.setup.ts` (o `.js`), agregá el ciclo de vida de MSW:

```typescript
import { server } from './src/test-utils/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

| Hook | Qué hace |
|---|---|
| `beforeAll` | Inicia el servidor antes de que corra cualquier test |
| `afterEach` | Resetea los handlers a los defaults entre tests (para que los overrides de un test no se filtren) |
| `afterAll` | Apaga el servidor después de que todos los tests terminan |

La opción `onUnhandledRequest: 'warn'` loguea un warning si tu código hace una petición que ningún handler matchea. Esto atrapa handlers faltantes temprano en vez de dejar que los tests fallen con errores de red crípticos.

## Escribiendo handlers

Cada handler es una función que matchea un método HTTP y una URL, y devuelve una respuesta.

Un handler básico para una REST API:

```typescript
import { http, HttpResponse } from 'msw';

const BASE_URL = 'https://api.example.com';

export const handlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.json([
      { id: 1, name: 'Item One' },
      { id: 2, name: 'Item Two' },
    ]);
  }),

  http.get(`${BASE_URL}/items/:id`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({ id: Number(id), name: `Item ${id}` });
  }),

  http.post(`${BASE_URL}/items`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),
];
```

Cosas clave a notar:

- ✅ `http.get`, `http.post`, etc. matchean el método HTTP
- ✅ Los parámetros de URL (`:id`) se extraen automáticamente
- ✅ El body del request está disponible vía `request.json()`
- ✅ `HttpResponse.json()` devuelve respuestas JSON tipadas con códigos de estado

## Handler sets para cada escenario

Los handlers de éxito por defecto son el punto de partida. Pero las apps reales necesitan manejar errores también. Acá es donde la mayoría de los setups de MSW se detienen. **No te detengas acá.**

Yo creo handler sets separados para cada escenario de error que la app necesita manejar:

```typescript
// Éxito (default)
export const handlers = [...apiHandlers, ...authHandlers];

// Errores del servidor
export const errorHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }),
];

// No autorizado (token expirado)
export const unauthorizedHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.json(
      { error: 'invalid_token', message: 'Token has expired' },
      { status: 401 }
    );
  }),
];

// Rate limiting
export const rateLimitHandlers = [
  http.post(`${BASE_URL}/auth/token`, () => {
    return HttpResponse.json(
      { error: 'too_many_requests', message: 'Try again in 60 seconds' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }),
];

// Timeout (nunca resuelve)
export const timeoutHandlers = [
  http.get(`${BASE_URL}/items`, async () => {
    await new Promise(resolve => setTimeout(resolve, 60000));
    return HttpResponse.json({}, { status: 408 });
  }),
];

// Offline (falla de red)
export const offlineHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.error();
  }),
];
```

En mi proyecto, tengo **11 handler sets**:

| Handler set | Status | Qué testea |
|---|---|---|
| `handlers` | 200 | Respuestas exitosas por defecto |
| `errorHandlers` | 500 | Manejo de errores del servidor |
| `unauthorizedHandlers` | 401 | Flujos de token expirado/inválido |
| `forbiddenHandlers` | 403 | Cuentas baneadas/suspendidas |
| `conflictHandlers` | 409 | Registro duplicado |
| `validationErrorHandlers` | 422 | Errores de validación de formularios |
| `rateLimitHandlers` | 429 | Rate limiting con Retry-After |
| `emailNotConfirmedHandlers` | 400 | Verificación de email requerida |
| `storageErrorHandlers` | 413/404 | Errores de subida/eliminación de archivos |
| `timeoutHandlers` | 408 | Simulación de timeout de red |
| `offlineHandlers` | Error | Falla total de red |

Cada set se exporta y se puede intercambiar por test.

> 💡 **Tip:** El handler de timeout usa `await new Promise(resolve => setTimeout(resolve, 60000))` para simular una petición que nunca termina. El timeout de tu código se disparará primero, testeando el path de manejo de timeout.

## Usando handlers en tests

Los handlers por defecto corren automáticamente (registrados en `setupServer`). Para testear escenarios de error, sobrescríbelos por test:

```typescript
import { server } from '@app/test-utils/msw/server';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';

describe('API error handling', () => {
  it('shows error message on server failure', async () => {
    server.use(...errorHandlers);

    // Renderizar componente, disparar fetch, verificar UI de error
  });

  it('redirects to login on 401', async () => {
    server.use(...unauthorizedHandlers);

    // Renderizar componente, disparar fetch, verificar redirección
  });

  // No hace falta limpiar - afterEach en jest.setup resetea los handlers
});
```

El spread (`...errorHandlers`) reemplaza los handlers que matchean. Los handlers del set por defecto que no matchean siguen activos. Después del test, `server.resetHandlers()` restaura los defaults.

## El wrapper de render personalizado

MSW funciona mejor con un store real de Redux, no uno mockeado. El punto es testear la integración completa: componente → thunk de Redux → petición HTTP → intercepción de MSW → respuesta → actualización de estado → actualización de UI.

```typescript
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { render } from '@testing-library/react-native';

const rootReducer = combineReducers({
  items: itemsReducer,
  auth: authReducer,
});

type RootState = ReturnType<typeof rootReducer>;

function createTestStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  { preloadedState, store, ...options } = {}
) {
  const createdStore = store || createTestStore(preloadedState);

  function Wrapper({ children }) {
    return (
      <Provider store={createdStore}>
        {children}
      </Provider>
    );
  }

  return {
    store: createdStore,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
```

Ahora tus tests renderizan con un store real, despachan thunks reales, y MSW maneja la red:

```typescript
it('loads and displays items', async () => {
  // Los handlers por defecto devuelven respuesta exitosa
  const { getByText } = renderWithProviders(<ItemList />);

  await waitFor(() => {
    expect(getByText('Item One')).toBeTruthy();
  });
});

it('shows error state on failure', async () => {
  server.use(...errorHandlers);

  const { getByText } = renderWithProviders(<ItemList />);

  await waitFor(() => {
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});
```

Sin mockeo manual de dispatch, selectores o fetch. Todo el stack es real excepto la red.

## Overrides de handlers inline

A veces necesitás una respuesta puntual que no encaja en ningún handler set. Definila inline:

```typescript
it('handles unexpected response shape', async () => {
  server.use(
    http.get('https://api.example.com/items', () => {
      return HttpResponse.json({ unexpected: 'shape' });
    })
  );

  // Testear que el código maneja respuestas malformadas correctamente
});
```

Esto es útil para edge cases como JSON malformado, campos faltantes o códigos de estado inesperados que no ameritan un handler set completo.

## Errores comunes

**Los handlers se matchean en orden.** Si dos handlers matchean la misma petición, el primero gana. Cuando usás `server.use(...overrides)`, los overrides se agregan al principio, así que tienen prioridad sobre los defaults.

**`HttpResponse.error()` simula una falla de red**, no un error HTTP. La petición nunca recibe respuesta. Usá esto para escenarios offline/sin red. Para errores HTTP (500, 401, etc.), usá `HttpResponse.json()` con un código de estado.

**Los handlers async necesitan `await`.** Si tu handler lee el body del request (`request.json()`), la función del handler tiene que ser `async`. Olvidar esto hace que el handler devuelva `undefined` en vez de una respuesta.

**Las peticiones sin handler son silenciosas por defecto.** Siempre usá `onUnhandledRequest: 'warn'` (o `'error'` en CI) para atrapar handlers faltantes. Una petición sin handler silenciosa significa que tu test pasa por la razón equivocada.

## La estructura de archivos completa

```
src/
  test-utils/
    msw/
      handlers.ts       # Todos los handler sets (éxito, error, 401, etc.)
      server.ts          # setupServer con handlers por defecto
      mockData.ts        # Datos fixture usados por los handlers
    renderWithProviders.tsx  # Render personalizado con store real + providers
    index.ts             # Barrel export
```

El barrel export (`index.ts`) permite que los tests importen utilidades comunes desde un solo lugar. Para handler sets específicos, importá directamente del archivo de handlers:

```typescript
import { server, renderWithProviders } from '@app/test-utils';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';
```

## En resumen

Sí. El setup lleva unos 30 minutos. Después de eso, cada test nuevo es más simple que el equivalente con mocks manuales. Escribís `server.use(...errorHandlers)` en vez de `jest.fn().mockRejectedValue(new Error('Network error'))`. Los handlers son reutilizables en cada archivo de test. Y estás testeando comportamiento de integración real, no comportamiento de mocks.

Los 11 handler sets de mi proyecto cubren cada path de error que la app maneja. Cuando agrego un nuevo endpoint de API, agrego handlers una vez, y cada test que toca ese endpoint obtiene mocking correcto gratis.

> Si escribir el próximo test es más difícil que salteártelo, tu infraestructura de test es el problema.

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. El setup completo de MSW, los handler sets y el wrapper de render personalizado están en el repo.*
