---
title: "Configurant MSW v2 a React Native"
description: "Una guia pràctica per configurar Mock Service Worker v2 en un projecte React Native. Des de la instal·lació fins a handler sets de nivell producció que cobreixen èxit, errors, timeouts i escenaris offline."
publishDate: 2026-05-04
tags: ["react-native", "testing", "mocking", "jest"]
locale: ca
heroImage: "/images/blog/msw-react-native.jpg"
heroAlt: "Configurant MSW v2 a React Native per a testing"
campaign: "msw-v2-react-native"
relatedPosts: ["detox-cucumber-bdd-react-native-e2e-testing", "metro-runtime-mocking-react-native-e2e", "runtime-api-validation-zod-react-native"]
---

## Per què MSW en comptes de mocks manuals

La majoria de projectes React Native simulen la seva capa d'API amb `jest.fn()`. Simules `fetch` o la teva instància d'Axios, defineixes què retorna, i proves contra això.

Funciona. Fins que no.

El problema: estàs verificant la interacció del teu codi amb un mock, no amb una capa HTTP. Si el teu client d'API canvia com construeix URLs, afegeix headers o gestiona reintents, el mock no detecta la regressió. (Una capa de [validació de respostes en temps d'execució amb Zod](/blog/runtime-api-validation-zod-react-native/) tampoc s'exercitaria). El mock sempre retorna el que li has dit, independentment del que el codi realment ha enviat.

**Mock Service Worker (MSW)** intercepta les peticions a nivell de xarxa. El teu codi fa crides HTTP reals. MSW les captura abans que surtin del procés i retorna les teves respostes simulades. Tot el que hi ha entre el teu component i la xarxa s'exercita: el thunk de Redux, els interceptors d'Axios, la gestió d'errors, el parseig de la resposta.

> 💡 **La diferència clau:** els mocks manuals reemplacen el teu codi. MSW reemplaça la xarxa. El teu codi s'executa exactament com ho faria en producció, fins al punt on la petició sortiria del dispositiu.

## Instal·lació

MSW v2 funciona a React Native a través del servidor de Node.js (per a tests de Jest). El service worker del navegador no és rellevant per a mòbil.

```bash
yarn add -D msw
```

Això és tot. Sense polyfills, sense canvis a la config de Metro, sense linking de mòduls natius.

## El servidor

Crea `src/test-utils/msw/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Tres línies. El servidor agafa els teus handlers per defecte (respostes exitoses) i intercepta les peticions que coincideixen.

## Connectant-lo amb Jest

Al teu `jest.setup.ts` (o `.js`), afegeix el cicle de vida de MSW:

```typescript
import { server } from './src/test-utils/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

| Hook | Què fa |
|---|---|
| `beforeAll` | Inicia el servidor abans que s'executi cap test |
| `afterEach` | Reseteja els handlers als defaults entre tests (perquè els overrides d'un test no es filtrin) |
| `afterAll` | Atura el servidor després que tots els tests acabin |

L'opció `onUnhandledRequest: 'warn'` registra un warning si el teu codi fa una petició que cap handler coincideix. Això atrapa handlers que falten aviat en comptes de deixar que els tests fallin amb errors de xarxa críptics.

## Escrivint handlers

Cada handler és una funció que coincideix amb un mètode HTTP i una URL, i retorna una resposta.

Un handler bàsic per a una REST API:

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

Coses clau a notar:

- ✅ `http.get`, `http.post`, etc. coincideixen amb el mètode HTTP
- ✅ Els paràmetres d'URL (`:id`) s'extreuen automàticament
- ✅ El body de la petició està disponible via `request.json()`
- ✅ `HttpResponse.json()` retorna respostes JSON tipades amb codis d'estat

## Handler sets per a cada escenari

Els handlers d'èxit per defecte són el punt de partida. Però les apps reals necessiten gestionar errors també. Aquí és on la majoria de setups de MSW s'aturen. **No t'aturis aquí.**

Jo creo handler sets separats per a cada escenari d'error que l'app necessita gestionar:

```typescript
// Èxit (default)
export const handlers = [...apiHandlers, ...authHandlers];

// Errors del servidor
export const errorHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }),
];

// No autoritzat (token expirat)
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

// Timeout (mai resol)
export const timeoutHandlers = [
  http.get(`${BASE_URL}/items`, async () => {
    await new Promise(resolve => setTimeout(resolve, 60000));
    return HttpResponse.json({}, { status: 408 });
  }),
];

// Offline (fallada de xarxa)
export const offlineHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.error();
  }),
];
```

Al meu projecte, tinc **11 handler sets**:

| Handler set | Status | Què verifica |
|---|---|---|
| `handlers` | 200 | Respostes exitoses per defecte |
| `errorHandlers` | 500 | Gestió d'errors del servidor |
| `unauthorizedHandlers` | 401 | Fluxos de token expirat/invàlid |
| `forbiddenHandlers` | 403 | Comptes baneigs/suspesos |
| `conflictHandlers` | 409 | Registre duplicat |
| `validationErrorHandlers` | 422 | Errors de validació de formularis |
| `rateLimitHandlers` | 429 | Rate limiting amb Retry-After |
| `emailNotConfirmedHandlers` | 400 | Verificació d'email requerida |
| `storageErrorHandlers` | 413/404 | Errors de pujada/eliminació de fitxers |
| `timeoutHandlers` | 408 | Simulació de timeout de xarxa |
| `offlineHandlers` | Error | Fallada total de xarxa |

Cada set s'exporta i es pot intercanviar per test.

> 💡 **Consell:** El handler de timeout usa `await new Promise(resolve => setTimeout(resolve, 60000))` per simular una petició que mai acaba. El timeout del teu codi es dispararà primer, verificant el path de gestió de timeout.

## Usant handlers en tests

Els handlers per defecte s'executen automàticament (registrats a `setupServer`). Per provar escenaris d'error, sobreescriu-los per test:

```typescript
import { server } from '@app/test-utils/msw/server';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';

describe('API error handling', () => {
  it('shows error message on server failure', async () => {
    server.use(...errorHandlers);

    // Renderitzar component, disparar fetch, verificar UI d'error
  });

  it('redirects to login on 401', async () => {
    server.use(...unauthorizedHandlers);

    // Renderitzar component, disparar fetch, verificar redirecció
  });

  // No cal netejar - afterEach a jest.setup reseteja els handlers
});
```

L'spread (`...errorHandlers`) reemplaça els handlers que coincideixen. Els handlers del set per defecte que no coincideixen segueixen actius. Després del test, `server.resetHandlers()` restaura els defaults.

## El wrapper de render personalitzat

MSW funciona millor amb un store real de Redux, no un de simulat. El punt és provar la integració completa: component → thunk de Redux → petició HTTP → intercepció de MSW → resposta → actualització d'estat → actualització d'UI.

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

Ara els teus tests renderitzen amb un store real, despatxen thunks reals, i MSW gestiona la xarxa:

```typescript
it('loads and displays items', async () => {
  // Els handlers per defecte retornen resposta exitosa
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

Sense simulació manual de dispatch, selectors o fetch. Tot l'stack és real excepte la xarxa.

## Overrides de handlers inline

De vegades necessites una resposta puntual que no encaixa en cap handler set. Defineix-la inline:

```typescript
it('handles unexpected response shape', async () => {
  server.use(
    http.get('https://api.example.com/items', () => {
      return HttpResponse.json({ unexpected: 'shape' });
    })
  );

  // Verificar que el codi gestiona respostes malformades correctament
});
```

Això és útil per a edge cases com JSON malformat, camps que falten o codis d'estat inesperats que no mereixen un handler set complet.

## Errors comuns

**Els handlers es coincideixen en ordre.** Si dos handlers coincideixen amb la mateixa petició, el primer guanya. Quan uses `server.use(...overrides)`, els overrides s'afegeixen al principi, així que tenen prioritat sobre els defaults.

**`HttpResponse.error()` simula una fallada de xarxa**, no un error HTTP. La petició mai rep resposta. Usa això per a escenaris offline/sense xarxa. Per a errors HTTP (500, 401, etc.), usa `HttpResponse.json()` amb un codi d'estat.

**Els handlers async necessiten `await`.** Si el teu handler llegeix el body de la petició (`request.json()`), la funció del handler ha de ser `async`. Oblidar-ho fa que el handler retorni `undefined` en comptes d'una resposta.

**Les peticions sense handler són silencioses per defecte.** Sempre usa `onUnhandledRequest: 'warn'` (o `'error'` en CI) per atrapar handlers que falten. Una petició sense handler silenciosa significa que el teu test passa per la raó equivocada.

## L'estructura de fitxers completa

```
src/
  test-utils/
    msw/
      handlers.ts       # Tots els handler sets (èxit, error, 401, etc.)
      server.ts          # setupServer amb handlers per defecte
      mockData.ts        # Dades fixture usades pels handlers
    renderWithProviders.tsx  # Render personalitzat amb store real + providers
    index.ts             # Barrel export
```

El barrel export (`index.ts`) permet que els tests importin utilitats comunes des d'un sol lloc. Per a handler sets específics, importa directament del fitxer de handlers:

```typescript
import { server, renderWithProviders } from '@app/test-utils';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';
```

## En resum

Sí. El setup porta uns 30 minuts. Després d'això, cada test nou és més simple que l'equivalent amb mocks manuals. Escrius `server.use(...errorHandlers)` en comptes de `jest.fn().mockRejectedValue(new Error('Network error'))`. Els handlers són reutilitzables a cada fitxer de test. I estàs verificant comportament d'integració real, no comportament de mocks.

Els 11 handler sets del meu projecte cobreixen cada path d'error que l'app gestiona. Combinats amb [tests E2E escrits en Gherkin amb Detox + Cucumber](/blog/detox-cucumber-bdd-react-native-e2e-testing/) i [mocking en temps d'execució a nivell de Metro](/blog/metro-runtime-mocking-react-native-e2e/), els handler sets cobreixen des de tests unitaris fins a fluxos complets d'usuari. Quan afegeixo un nou endpoint d'API, afegeixo handlers un cop, i cada test que toca aquell endpoint obté mocking correcte gratis.

> Si escriure el pròxim test és més difícil que saltar-se'l, la teva infraestructura de test és el problema.

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. El setup complet de MSW, els handler sets i el wrapper de render personalitzat són al repo.*
