---
title: "Server state and client state: why React apps need two libraries"
description: "Most apps put everything in one store and call it state management. Server state and client state have different requirements. Modern React stacks split the job between two libraries for good reason."
publishDate: 2026-08-03
series: "State Management"
tags: ["react-native", "state-management", "redux", "redux-toolkit", "tanstack-query", "zustand"]
locale: en
heroImage: "/images/blog/server-vs-client-state.webp"
heroAlt: "Server state and client state in React"
campaign: "server-vs-client-state"
relatedPosts: ["state-management-federated-react-native", "rtk-query-tags-vs-tanstack-query-keys", "runtime-api-validation-zod-react-native"]
---

## The short version

Two combinations work. Pick one, do not blend them.

- **Redux Toolkit + RTK Query.** One package, one store, two specialised tools. RTK Query handles server state. `createSlice` handles client state. If your team is already on Redux, this is the path of least friction.
- **TanStack Query + Zustand.** Two separate libraries. TanStack handles server state. Zustand handles client state. Each one is purpose-built for its half and stays out of the other's way.

What you generally do not want is one library doing both jobs by force. Redux Toolkit with `createAsyncThunk` everywhere ends up rolling its own caching, refetching, and dedup. Holding UI flags in TanStack's cache makes the cache do work it was not designed for. Both shapes are common; both leave features on the table.

The rest of this post is the reasoning behind that pick, with code from a real app.

## One store for everything

A common pattern in older React codebases is one store for everything: API responses, UI flags, form drafts, user session, all in the same place. That is how my React Native portfolio app started. Auth in a Redux slice. Education data in another slice. Sort order in a third. Every screen reaches into the same store.

It works, and it has things going for it. One mental model. One devtool. One serialisation story for offline. Easy onboarding for anyone who already knows Redux. The pattern is still a defensible choice for plenty of apps, and the move to RTK Query keeps you inside that single mental model while solving the caching gap.

Modern React stacks more often split the work between two libraries, one for server state and one for client state. The split sounds like extra ceremony at first. The reason it caught on is that the two kinds of state have genuinely different requirements, and one library doing both well takes more bending than the result is worth.

## Assumptions

The examples below assume:

- React Native 0.74+ (bare or Expo; the libraries discussed have no native module dependencies)
- TypeScript
- Familiarity with hooks and a basic Redux Toolkit slice
- Working knowledge of `createAsyncThunk` if you have used it; if you have not, the comparison still reads cleanly

The code snippets reference my open-source portfolio app, [`rn-warrendeleon`](https://github.com/warrendeleon/rn-warrendeleon), which uses Redux Toolkit with `createAsyncThunk` for every feature that talks to the network. That is the starting point I will compare against.

## What server state actually means

Server state is data the server owns. The local copy is a view of something that exists somewhere else, and that somewhere-else can change at any moment.

Examples:

- A user's profile fetched from `/users/me`
- A list of products from `/products`
- A balance, an order status, a notification count

What server state needs:

- **Caching.** You do not want to refetch the same data every time a component mounts.
- **Background refetching.** When the user comes back to the screen, the data might be stale, and you want to refresh quietly.
- **Deduplication.** Two components asking for the same resource should not fire two requests.
- **Retry.** Transient network failures should retry, not crash the screen.
- **Stale-while-revalidate.** Show cached data immediately, fetch fresh data in the background, swap when ready.
- **Garbage collection.** Drop entries that no component is subscribed to anymore.

None of this is unique to React. It is the same problem any client app has when it caches server data.

## What client state actually means

Client state is data the app owns. There is no other source of truth; whatever the app holds is the truth.

Examples:

- The currently selected account in a multi-account UI
- A sort order or filter
- A form draft the user is editing
- An open or closed flag for a modal
- Auth tokens after login

What client state needs:

- **Be held.** Survives across components.
- **Be reactive.** Components that depend on it re-render when it changes.
- **Sometimes persist.** Survives the app being closed and reopened.

That is almost the whole list. Client state does not need caching (it cannot be stale; it is the truth). It does not need refetching. It does not need deduplication.

## Where one-store-for-everything starts to bite

Take my portfolio app's education data. It comes from a JSON file on GitHub, fetched per language. With one store and Redux Toolkit + thunks, fetching it looks like this:

```typescript
// src/features/Education/store/actions.ts
export const fetchEducation = createAsyncThunk<Education[], void, { state: RootState }>(
  'education/fetchEducation',
  async (_, { getState }) => {
    const state = getState();
    const response = await fetchEducationData(state.settings.language);
    return response.data;
  }
);

// src/features/Education/store/reducer.ts
const educationSlice = createSlice({
  name: 'education',
  initialState: { data: [], loading: false, error: null },
  reducers: {
    clearEducation: (state) => { state.data = []; state.error = null },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEducation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEducation.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchEducation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch education';
      });
  },
});

// src/features/Education/EducationScreen.tsx
const dispatch = useAppDispatch();
const education = useAppSelector(selectEducation);
const loading = useAppSelector(selectEducationLoading);
const error = useAppSelector(selectEducationError);
const language = useAppSelector((state) => state.settings.language);

useEffect(() => { dispatch(fetchEducation()) }, [dispatch, language]);
```

That is a thunk, a slice with three lifecycle cases, three selectors, and a `useEffect` that fires the dispatch on every mount. Multiply that by every screen that fetches data and the bookkeeping starts to dominate the feature code.

The bigger issue is the `useEffect`. It fires `fetchEducation()` every time the screen mounts. There is no caching. The component you visited five seconds ago refetches the moment you visit it again. You can build caching in (check the slice for fresh data before dispatching) but now you are rolling your own staleness logic for every slice.

## What a server-state library does

The same fetch using RTK Query, the modern Redux-team library for server state:

```typescript
// portfolioApi.ts
export const portfolioApi = createApi({
  reducerPath: 'portfolioApi',
  baseQuery: axiosBaseQuery,
  endpoints: (builder) => ({
    getEducation: builder.query<Education[], string>({
      query: (language) => ({ url: `/${language}/education.json` }),
      transformResponse: (raw: unknown) => EducationSchema.parse(raw),
    }),
  }),
});

export const { useGetEducationQuery } = portfolioApi;

// EducationScreen.tsx
const language = useAppSelector((state) => state.settings.language);
const { data: education = [], isLoading: loading, error } = useGetEducationQuery(language);
```

The thunk is gone. The slice is gone. The lifecycle cases are gone. The selectors are gone. The `useEffect` is gone.

What you gained on top of less code: caching with configurable `staleTime` and `gcTime`, deduplication, background refetching, retry on failure, all built in. The argument to the hook (`language`) becomes the cache key, so when the user switches language the query refetches automatically.

The same pattern exists with TanStack Query, which is independent of Redux:

```typescript
// useEducation.ts
export const useEducation = (language: string) => {
  return useQuery({
    queryKey: ['education', language],
    queryFn: () => fetchEducationData(language),
  });
};
```

Different library, same idea: declare what data you want, let the library handle the cache and the lifecycle.

## What a client-state library does

Now look at client state. In my portfolio app, `settings.language` is client state. It is the user's preference. There is no server to compare against, nothing to cache, nothing to refetch. The store just needs to hold it.

With Redux Toolkit, a settings slice for it looks like this:

```typescript
const settingsSlice = createSlice({
  name: 'settings',
  initialState: { language: 'en', theme: 'system' },
  reducers: {
    setLanguage: (state, action) => { state.language = action.payload },
    setTheme: (state, action) => { state.theme = action.payload },
  },
});
```

That works. It is also more ceremony than the problem needs. With Zustand, the same store is:

```typescript
const useSettingsStore = create((set) => ({
  language: 'en',
  theme: 'system',
  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
}));
```

No reducer, no action types, no dispatch. The store is a function that returns a hook. The hook gives you state and the methods that change it. For pure client state, that is all you need.

In components:

```typescript
const language = useSettingsStore((state) => state.language);
const setLanguage = useSettingsStore((state) => state.setLanguage);
```

Same selector pattern as Redux, just no boilerplate around it.

## Back to the pick

The verdict from the top of the post earns its keep here. Server state has its own shape: caching, dedup, refetching, retry, garbage collection. Client state has a much smaller shape: hold a value, react to changes, sometimes persist. The libraries that have settled out for each half are sharper at their half than a general-purpose store doing both.

RTK Query + `createSlice` is the cleaner one-store path because RTK Query was built by the Redux team to slot the server-state machinery into the same store. Zustand and TanStack Query work in the opposite direction: two small, focused libraries that compose without much overlap. Both are defensible. Redux Toolkit with `createAsyncThunk` for every fetch is the shape that quietly turns into homegrown cache work.

## The takeaway

When you reach for a Redux slice to hold an API response, ask whether what you actually need is server-state machinery (caching, refetching, dedup) or just a place to hold a value that is reactive. The answer usually tells you which library belongs there, and whether the split is worth paying for in your app.

Two posts coming up that build on this: [how to pick a server-state library when your app uses Module Federation](/blog/state-management-federated-react-native/), and [how RTK Query's tags differ from TanStack's query keys in a way that affects cross-team coordination](/blog/rtk-query-tags-vs-tanstack-query-keys/).
