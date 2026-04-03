---
title: "Setting up MSW v2 in React Native"
description: "A practical guide to setting up Mock Service Worker v2 in a React Native project. From installation to production-grade handler sets covering success, errors, timeouts, and offline scenarios."
publishDate: 2026-04-27
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: en
heroImage: "/images/blog/msw-react-native.jpg"
heroAlt: "Setting up MSW v2 in React Native for testing"
---

## Why MSW over manual mocks

Most React Native projects mock their API layer with `jest.fn()`. You mock `fetch` or your Axios instance, define what it returns, and test against that.

It works. Until it doesn't.

The problem: you're testing your code's interaction with a mock, not with an HTTP layer. If your API client changes how it constructs URLs, adds headers, or handles retries, the mock doesn't catch the regression. The mock always returns what you told it to return, regardless of what the code actually sent.

**Mock Service Worker (MSW)** intercepts requests at the network level. Your code makes real HTTP calls. MSW catches them before they leave the process and returns your mock responses. Everything between your component and the network is exercised: the Redux thunk, the Axios interceptors, the error handling, the response parsing.

> 💡 **The key difference:** manual mocks replace your code. MSW replaces the network. Your code runs exactly as it would in production, up to the point where the request would leave the device.

## Installation

MSW v2 works in React Native via the Node.js server (for Jest tests). The browser service worker isn't relevant for mobile.

```bash
yarn add -D msw
```

That's it. No polyfills, no metro config changes, no native module linking.

## The server

Create `src/test-utils/msw/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Three lines. The server takes your default handlers (success responses) and intercepts matching requests.

## Wiring it into Jest

In your `jest.setup.ts` (or `.js`), add the MSW lifecycle:

```typescript
import { server } from './src/test-utils/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

| Hook | What it does |
|---|---|
| `beforeAll` | Starts the server before any test runs |
| `afterEach` | Resets handlers to defaults between tests (so one test's overrides don't leak) |
| `afterAll` | Shuts down the server after all tests complete |

The `onUnhandledRequest: 'warn'` option logs a warning if your code makes a request that no handler matches. This catches missing handlers early instead of letting tests fail with cryptic network errors.

## Writing handlers

This is where MSW shines. Each handler is a function that matches a request method and URL, and returns a response.

A basic handler for a REST API:

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

Key things to notice:

- ✅ `http.get`, `http.post`, etc. match the HTTP method
- ✅ URL params (`:id`) are extracted automatically
- ✅ Request body is available via `request.json()`
- ✅ `HttpResponse.json()` returns typed JSON responses with status codes

## Handler sets for every scenario

Default success handlers are the starting point. But real apps need to handle failures too. This is where most MSW setups stop. **Don't stop here.**

I create separate handler sets for every error scenario the app needs to handle:

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

// Timeout (never resolves)
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

In my project, I have **11 handler sets**:

| Handler set | Status | What it tests |
|---|---|---|
| `handlers` | 200 | Default success responses |
| `errorHandlers` | 500 | Server error handling |
| `unauthorizedHandlers` | 401 | Expired/invalid token flows |
| `forbiddenHandlers` | 403 | Banned/suspended accounts |
| `conflictHandlers` | 409 | Duplicate registration |
| `validationErrorHandlers` | 422 | Form validation errors |
| `rateLimitHandlers` | 429 | Rate limiting with Retry-After |
| `emailNotConfirmedHandlers` | 400 | Email verification required |
| `storageErrorHandlers` | 413/404 | File upload/delete errors |
| `timeoutHandlers` | 408 | Network timeout simulation |
| `offlineHandlers` | Error | Complete network failure |

Each set is exported and can be swapped in per test.

> 💡 **Tip:** The timeout handler uses `await new Promise(resolve => setTimeout(resolve, 60000))` to simulate a request that never completes. Your code's request timeout will fire first, testing the timeout handling path.

## Using handlers in tests

The default handlers run automatically (registered in `setupServer`). To test error scenarios, override them per test:

```typescript
import { server } from '@app/test-utils/msw/server';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';

describe('API error handling', () => {
  it('shows error message on server failure', async () => {
    server.use(...errorHandlers);

    // Render component, trigger fetch, assert error UI
  });

  it('redirects to login on 401', async () => {
    server.use(...unauthorizedHandlers);

    // Render component, trigger fetch, assert redirect
  });

  // No cleanup needed - afterEach in jest.setup resets handlers
});
```

The spread (`...errorHandlers`) replaces matching handlers. Non-matching handlers from the default set remain active. After the test, `server.resetHandlers()` restores the defaults.

## The custom render wrapper

MSW works best with a real Redux store, not a mocked one. The whole point is to test the actual integration: component → Redux thunk → HTTP request → MSW intercept → response → state update → UI update.

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

Now your tests render with a real store, dispatch real thunks, and MSW handles the network:

```typescript
it('loads and displays items', async () => {
  // Default handlers return success response
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

No manual mocking of dispatch, selectors, or fetch. The entire stack is real except the network.

## Inline handler overrides

Sometimes you need a one-off response that doesn't fit any handler set. Define it inline:

```typescript
it('handles unexpected response shape', async () => {
  server.use(
    http.get('https://api.example.com/items', () => {
      return HttpResponse.json({ unexpected: 'shape' });
    })
  );

  // Test that the code handles malformed responses gracefully
});
```

This is useful for edge cases like malformed JSON, missing fields, or unexpected status codes that don't warrant a full handler set.

## Common pitfalls

**Handlers are matched in order.** If two handlers match the same request, the first one wins. When you `server.use(...overrides)`, the overrides are prepended, so they take priority over defaults.

**`HttpResponse.error()` simulates a network failure**, not an HTTP error. The request never gets a response. Use this for offline/no-network scenarios. For HTTP errors (500, 401, etc.), use `HttpResponse.json()` with a status code.

**Async handlers need `await`.** If your handler reads the request body (`request.json()`), the handler function must be `async`. Forgetting this causes the handler to return `undefined` instead of a response.

**Unhandled requests are silent by default.** Always use `onUnhandledRequest: 'warn'` (or `'error'` in CI) to catch missing handlers. A silent unhandled request means your test passes for the wrong reason.

## The full file structure

```
src/
  test-utils/
    msw/
      handlers.ts       # All handler sets (success, error, 401, etc.)
      server.ts          # setupServer with default handlers
      mockData.ts        # Fixture data used by handlers
    renderWithProviders.tsx  # Custom render with real store + providers
    index.ts             # Barrel export
```

The barrel export (`index.ts`) lets tests import common utilities from one place. For specific handler sets, import directly from the handlers file:

```typescript
import { server, renderWithProviders } from '@app/test-utils';
import { errorHandlers, unauthorizedHandlers } from '@app/test-utils/msw/handlers';
```

## Is it worth the setup?

Yes. The setup is about 30 minutes. After that, every new test is simpler than the manual mock equivalent. You write `server.use(...errorHandlers)` instead of `jest.fn().mockRejectedValue(new Error('Network error'))`. The handlers are reusable across every test file. And you're testing real integration behaviour, not mock behaviour.

The 11 handler sets in my project cover every error path the app handles. When I add a new API endpoint, I add handlers for it once, and every test that touches that endpoint gets correct mocking for free.

> The best test infrastructure is the one that makes writing the next test easier than skipping it.

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full MSW setup, handler sets, and custom render wrapper are all in the repo.*
