---
title: "Pag-setup ng MSW v2 sa React Native"
description: "Isang praktikal na gabay sa pag-setup ng Mock Service Worker v2 sa isang React Native project. Mula sa installation hanggang sa production-grade na handler sets na sumasaklaw sa success, errors, timeouts, at offline scenarios."
publishDate: 2026-04-27
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: tl
heroImage: "/images/blog/msw-react-native.jpg"
heroAlt: "Pag-setup ng MSW v2 sa React Native para sa testing"
---

## Bakit MSW sa halip na manual mocks

Karamihan ng React Native projects ay nagmo-mock ng kanilang API layer gamit ang `jest.fn()`. Mino-mock mo ang `fetch` o ang iyong Axios instance, dine-define kung ano ang ibabalik, at tine-test laban doon.

Gumagana. Hanggang hindi na.

Ang problema: tine-test mo ang interaction ng iyong code sa isang mock, hindi sa isang HTTP layer. Kung ang iyong API client ay nagbago kung paano gumagawa ng URLs, nagdadagdag ng headers, o nagha-handle ng retries, hindi mahuhuli ng mock ang regression. Palaging ibinabalik ng mock ang sinabi mo, kahit ano pa ang talagang ipinadala ng code.

**Mock Service Worker (MSW)** nag-iintercept ng requests sa network level. Ang iyong code ay gumagawa ng tunay na HTTP calls. Hinuhuli ng MSW ang mga ito bago umalis sa process at ibinabalik ang iyong mock responses. Lahat ng nasa pagitan ng iyong component at ng network ay nae-exercise: ang Redux thunk, ang Axios interceptors, ang error handling, ang response parsing.

> 💡 **Ang pangunahing pagkakaiba:** pinapalitan ng manual mocks ang iyong code. Pinapalitan ng MSW ang network. Tumatakbo ang iyong code nang eksakto kung paano ito tatakbo sa production, hanggang sa punto kung saan aalis ang request sa device.

## Installation

Gumagana ang MSW v2 sa React Native sa pamamagitan ng Node.js server (para sa Jest tests). Hindi relevant ang browser service worker para sa mobile.

```bash
yarn add -D msw
```

Iyon lang. Walang polyfills, walang Metro config changes, walang native module linking.

## Ang server

Gumawa ng `src/test-utils/msw/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Tatlong linya. Kinukuha ng server ang iyong default handlers (success responses) at nag-iintercept ng mga tumutugmang requests.

## Pag-connect sa Jest

Sa iyong `jest.setup.ts` (o `.js`), idagdag ang MSW lifecycle:

```typescript
import { server } from './src/test-utils/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

| Hook | Ano ang ginagawa |
|---|---|
| `beforeAll` | Sinisimulan ang server bago tumakbo ang kahit anong test |
| `afterEach` | Nire-reset ang handlers sa defaults sa pagitan ng tests (para hindi mag-leak ang overrides ng isang test) |
| `afterAll` | Pinapatay ang server pagkatapos makumpleto ang lahat ng tests |

Ang `onUnhandledRequest: 'warn'` na option ay nagla-log ng warning kung ang iyong code ay gumagawa ng request na walang tumutugmang handler. Nahuhuli nito ang mga nawawalang handlers nang maaga sa halip na pabayaan ang tests na mag-fail na may cryptic na network errors.

## Pagsusulat ng handlers

Dito nagsi-shine ang MSW. Bawat handler ay isang function na tumutugma sa isang HTTP method at URL, at nagbabalik ng response.

Isang basic handler para sa REST API:

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

Mga pangunahing bagay na dapat pansinin:

- ✅ `http.get`, `http.post`, etc. tumutugma sa HTTP method
- ✅ Awtomatikong na-extract ang URL params (`:id`)
- ✅ Available ang request body sa pamamagitan ng `request.json()`
- ✅ `HttpResponse.json()` nagbabalik ng typed JSON responses na may status codes

## Handler sets para sa bawat scenario

Ang default success handlers ang simula. Pero kailangang mag-handle ng failures din ang mga tunay na apps. Dito humihinto ang karamihan ng MSW setups. **Huwag huminto dito.**

Gumagawa ako ng hiwalay na handler sets para sa bawat error scenario na kailangang i-handle ng app:

```typescript
// Success (default)
export const handlers = [...apiHandlers, ...authHandlers];

// Server errors
export const errorHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }),
];

// Unauthorized (expired token)
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

// Timeout (hindi kailanman nare-resolve)
export const timeoutHandlers = [
  http.get(`${BASE_URL}/items`, async () => {
    await new Promise(resolve => setTimeout(resolve, 60000));
    return HttpResponse.json({}, { status: 408 });
  }),
];

// Offline (network failure)
export const offlineHandlers = [
  http.get(`${BASE_URL}/items`, () => {
    return HttpResponse.error();
  }),
];
```

Sa aking project, mayroon akong **11 handler sets**:

| Handler set | Status | Ano ang tine-test |
|---|---|---|
| `handlers` | 200 | Default success responses |
| `errorHandlers` | 500 | Server error handling |
| `unauthorizedHandlers` | 401 | Expired/invalid token flows |
| `forbiddenHandlers` | 403 | Mga banned/suspended na accounts |
| `conflictHandlers` | 409 | Duplicate registration |
| `validationErrorHandlers` | 422 | Form validation errors |
| `rateLimitHandlers` | 429 | Rate limiting na may Retry-After |
| `emailNotConfirmedHandlers` | 400 | Kinakailangang email verification |
| `storageErrorHandlers` | 413/404 | File upload/delete errors |
| `timeoutHandlers` | 408 | Network timeout simulation |
| `offlineHandlers` | Error | Kumpletong network failure |

Bawat set ay nae-export at puwedeng i-swap bawat test.

> 💡 **Tip:** Gumagamit ang timeout handler ng `await new Promise(resolve => setTimeout(resolve, 60000))` para mag-simulate ng request na hindi kailanman natatapos. Mag-fi-fire muna ang request timeout ng iyong code, tine-test ang timeout handling path.

## Paggamit ng handlers sa tests

Awtomatikong tumatakbo ang default handlers (nakaregistro sa `setupServer`). Para mag-test ng error scenarios, i-override ang mga ito bawat test:

```typescript
import { server } from '@app/test-utils/msw/server';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';

describe('API error handling', () => {
  it('shows error message on server failure', async () => {
    server.use(...errorHandlers);

    // I-render ang component, i-trigger ang fetch, i-assert ang error UI
  });

  it('redirects to login on 401', async () => {
    server.use(...unauthorizedHandlers);

    // I-render ang component, i-trigger ang fetch, i-assert ang redirect
  });

  // Hindi kailangan mag-cleanup - nire-reset ng afterEach sa jest.setup ang handlers
});
```

Pinapalitan ng spread (`...errorHandlers`) ang mga tumutugmang handlers. Nananatiling aktibo ang mga handler mula sa default set na hindi tumutugma. Pagkatapos ng test, nire-restore ng `server.resetHandlers()` ang defaults.

## Ang custom render wrapper

Mas maganda ang MSW na may tunay na Redux store, hindi mockejado. Ang buong punto ay i-test ang tunay na integration: component → Redux thunk → HTTP request → MSW intercept → response → state update → UI update.

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

Ngayon ang iyong tests ay nagre-render na may tunay na store, nagdi-dispatch ng tunay na thunks, at ang MSW ang nagha-handle ng network:

```typescript
it('loads and displays items', async () => {
  // Nagbabalik ng success response ang default handlers
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

Walang manual mocking ng dispatch, selectors, o fetch. Tunay ang buong stack maliban sa network.

## Inline handler overrides

Minsan kailangan mo ng isang one-off response na hindi kasya sa kahit anong handler set. I-define ito inline:

```typescript
it('handles unexpected response shape', async () => {
  server.use(
    http.get('https://api.example.com/items', () => {
      return HttpResponse.json({ unexpected: 'shape' });
    })
  );

  // I-test na maayos na hina-handle ng code ang malformed responses
});
```

Kapaki-pakinabang ito para sa edge cases tulad ng malformed JSON, nawawalang fields, o hindi inaasahang status codes na hindi naman kailangan ng buong handler set.

## Mga karaniwang pagkakamali

**Ino-order match ang handlers.** Kung dalawang handlers ang tumutugma sa parehong request, ang una ang nanalo. Kapag gumagamit ng `server.use(...overrides)`, nasa harap ang mga overrides, kaya mas may priority sila kaysa sa defaults.

**Nag-si-simulate ng network failure ang `HttpResponse.error()`**, hindi HTTP error. Hindi kailanman nakakatanggap ng response ang request. Gamitin ito para sa offline/walang network scenarios. Para sa HTTP errors (500, 401, etc.), gamitin ang `HttpResponse.json()` na may status code.

**Kailangan ng `await` ng async handlers.** Kung ang iyong handler ay nagbabasa ng request body (`request.json()`), kailangang `async` ang handler function. Kapag nakalimutan ito, nagbabalik ang handler ng `undefined` sa halip na response.

**Tahimik ang mga unhandled requests bilang default.** Palaging gumamit ng `onUnhandledRequest: 'warn'` (o `'error'` sa CI) para mahuli ang mga nawawalang handlers. Ang isang tahimik na unhandled request ay nangangahulugang pumapasa ang iyong test sa maling dahilan.

## Ang kumpletong file structure

```
src/
  test-utils/
    msw/
      handlers.ts       # Lahat ng handler sets (success, error, 401, etc.)
      server.ts          # setupServer na may default handlers
      mockData.ts        # Fixture data na ginagamit ng handlers
    renderWithProviders.tsx  # Custom render na may tunay na store + providers
    index.ts             # Barrel export
```

Pinapayagan ng barrel export (`index.ts`) ang tests na mag-import ng mga karaniwang utilities mula sa iisang lugar. Para sa mga specific handler sets, mag-import nang direkta mula sa handlers file:

```typescript
import { server, renderWithProviders } from '@app/test-utils';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';
```

## Sulit ba ang setup?

Oo. Mga 30 minuto lang ang setup. Pagkatapos niyan, bawat bagong test ay mas simple kaysa sa manual mock equivalent. Nagsusulat ka ng `server.use(...errorHandlers)` sa halip na `jest.fn().mockRejectedValue(new Error('Network error'))`. Reusable ang handlers sa bawat test file. At tine-test mo ang tunay na integration behaviour, hindi mock behaviour.

Sinasaklaw ng 11 handler sets sa aking project ang bawat error path na hina-handle ng app. Kapag nagdagdag ako ng bagong API endpoint, nagdadagdag ako ng handlers isang beses, at bawat test na gumagamit ng endpoint na iyon ay nakakakuha ng tamang mocking nang libre.

> Ang pinakamahusay na test infrastructure ay ang isa na ginagawang mas madali ang pagsusulat ng susunod na test kaysa sa pag-skip nito.

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong MSW setup, handler sets, at custom render wrapper.*
