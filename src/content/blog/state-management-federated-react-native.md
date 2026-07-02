---
title: "Three lenses for picking state management in a federated React Native app"
description: "Module Federation changes the state-management question. Three lenses for the choice: runtime extensibility, cache invalidation and store ownership."
publishDate: 2026-08-31
series: "State Management"
tags: ["react-native", "state-management", "module-federation", "rtk-query", "tanstack-query", "zustand"]
locale: en
draft: true
heroImage: "/images/blog/state-mgmt-federated-rn.webp"
heroImgPrompt: "A flat central platform with one glowing core block, three separate module cubes docking into it with connector arrows, a single small lock on the core"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#CDE7E0"
heroAlt: "State management for federated React Native apps"
campaign: "state-mgmt-federated"
relatedPosts: ["server-state-and-client-state-react-native", "rtk-query-tags-vs-tanstack-query-keys", "feature-first-project-structure-react-native"]
---

## The library comparison changes when federation enters the room

Most state-management comparisons in React land are written for a single team building a single app. The shape of the question is: which library has the better developer experience, the better caching defaults, the smaller bundle. Those are fair questions, but they are the same questions whether you are building a portfolio site or a financial app, and the answer rarely depends on architecture.

Add Module Federation to the picture and the question changes.

A federated React Native app means the shell ships once (through the App Store, every release subject to review) and then loads remote micro-apps from a CDN at runtime, sometimes weeks or months after the shell was built. Each micro-app is owned by a different team. They can ship independently. They share the shell's runtime but they were never compiled together.

That setup makes some state-management decisions matter much more than they would in a monolith. Ergonomics still count, but the runtime composition primitives each library exposes now drive the choice as much as the developer experience does.

Three lenses help compare the options. None of them are deal-breakers in isolation. Together they shape the trade-offs you are walking into.

## Assumptions

The lenses below assume:

- React Native with Module Federation. Re.Pack is the bundler bringing the MF runtime to RN at our shop, still in PoC; the lenses apply to any RN MF setup.
- A shell app that boots first and loads remotes from a CDN.
- Remotes owned by separate teams with separate release cycles.
- Two state-management options on the table: TanStack Query + Zustand, or Redux Toolkit + RTK Query.

These are the two combinations I have seen most often in federated React stacks, and they make the trade-offs clearest. Other shapes exist and are worth a serious look before committing. A monorepo with internal packages keeps teams independent in code without paying for runtime composition. Native module loading lets you ship native code separately from JS bundles, though it is a different problem space. The lenses below speak to the federation case.

If you are new to the server-vs-client-state split that the comparison assumes, [start here first](/blog/server-state-and-client-state-react-native/).

## Lens 1: runtime extensibility

The first question federation asks of a state library is whether a remote, loaded weeks after the shell shipped, can extend the shell's state surface at runtime.

Concretely: portfolio team ships v3.5 of their micro-app on a Tuesday afternoon, pushes to the CDN, the remote loads into a running shell on a user's phone. That remote wants to add a new endpoint to the shared API and a new client-state slice. Can it?

Redux Toolkit ships two primitives in the library for exactly this case. `injectEndpoints` lets a remote add new queries to the shell's existing RTK Query API at runtime, sharing the cache, the middleware, and the tag graph. `reducer.inject` (via `combineSlices`) lets a remote register a new slice into an existing root reducer. The shell did not need to know either addition at build time. The library does the wiring.

```typescript
// portfolio remote, loaded after the shell shipped
sharedApi.injectEndpoints({
  endpoints: (builder) => ({
    getFractionalShares: builder.query({
      query: (id) => `/portfolio/${id}/fractional`,
      providesTags: ['Portfolio'],
    }),
  }),
});

rootReducer.inject(holdingsSlice);
```

Both are real APIs that ship in `@reduxjs/toolkit`. No abstraction to build, document, or maintain.

TanStack Query and Zustand take a different shape. TanStack handles basic runtime endpoint addition fine. A remote calling `useQuery` with a new key lands in the shared cache, caching and dedup all work. What weakens at multi-team scale is parity with what RTK Query gives you. Middleware lives on your HTTP client rather than in the library, so a remote that uses bare `fetch` skips auth headers without TanStack noticing. There is no central API surface to inspect. Invalidation behaves differently, which is the next lens.

Zustand has a sharper structural mismatch. Its design centres on small isolated stores, each from a separate `create()` call. There is no library API for "add a slice to this existing store." Federated apps end up choosing between two shapes:

- Each remote owns its own Zustand stores. Cross-app reads happen by importing the owning store's hook directly, which couples bundles at compile time. If the shell renames a field, the consuming remote's old bundle on the CDN keeps reading the old shape and breaks silently.
- The shell exports shared stores in a federation package, and all remotes import them. This is the pattern most federated React web apps use, and it works well there. On mobile, every new shared-state addition needs a shell release, which is an App Store cycle.

Neither is wrong as a design. Both ask the platform team to invent the runtime composition primitives that RTK ships in the box.

## Lens 2: cross-team cache invalidation

The second question is what happens when one team's mutation needs to invalidate another team's cached data.

The scenario is realistic enough to test against. Dealing executes a trade. The user just bought shares. Portfolio's cached holdings are now stale and something has to mark them.

RTK Query handles this with declarative tags. Portfolio team writes one line:

```typescript
getPortfolio: builder.query({
  query: (id) => `/portfolio/${id}`,
  providesTags: ['Portfolio'],
});
```

Dealing team writes one line in a different micro-app:

```typescript
executeTrade: builder.mutation({
  query: (order) => ({ url: '/trades', method: 'POST', body: order }),
  invalidatesTags: ['Portfolio'],
});
```

That is the wiring. When the mutation succeeds, the library scans its cache, finds every query providing the `Portfolio` tag, and refetches the ones currently subscribed. Dealing never reads portfolio's code. The teams are coupled to a category name, typically declared in a shared `tagTypes` enum, but not to each other's query shapes.

TanStack Query invalidates by key rather than by tag. The dealing team writes:

```typescript
queryClient.invalidateQueries({ queryKey: ['portfolio'] });
```

For that line to work, the dealing team has to know the portfolio team's exact query key shape. They have to look at portfolio's code, find the `useQuery` call, and copy the key into their own invalidation.

The part that bites at federation scale: the portfolio team can refactor that key any time. Say they rename `['portfolio', id]` to `['holdings', id]` because the domain term evolved. They ship to the CDN. Dealing's invalidation silently stops matching anything. No type error, no compile failure, no runtime exception. Just stale UI in production until support tickets surface it.

Both libraries produce the same outcome when teams stay coordinated. The difference is the blast radius when coordination drifts. With tags, the coupling is to a category name. With keys, the coupling is to a string convention scattered across files.

This lens stands on its own; [a longer post on it](/blog/rtk-query-tags-vs-tanstack-query-keys/) covers the contrast in more detail.

## Lens 3: store ownership at multi-team scale

The third question is independent of federation. It applies at any multi-team scale.

When a team owns a piece of state, can they prevent other teams from accidentally overwriting it?

Zustand exposes `setState` on every store hook. Any code that imports the hook can write directly to the store, and the library has no way to forbid it.

The failure mode is subtle rather than catastrophic. A developer on another team needs to change the currently selected account. They call `setState` directly:

```typescript
useUIStore.setState({ selectedAccountId: newId });
```

The owning team's `setSelectedAccount` action had extra logic: clearing stale filter state, sending an analytics event, validating that the account belongs to the user. The direct `setState` call skips all of it. Filters now reference the previous account's data. The bug is hard to trace because it only shows up under a particular combination of user action and prior state.

Redux Toolkit allows state changes only through declared actions. The slice file is a closed declaration of every legitimate mutation. To know what mutates a slice, you read one file. Other teams read state freely but they only write through the declared actions.

```typescript
dispatch(uiSlice.actions.setSelectedAccount(newId));
```

Ownership is enforced by the library, not by code review.

For a single team, convention works. The team agrees not to call `setState` directly, code review catches violations, life moves on. For multiple teams shipping independently to a CDN, the team that owns a store has no real way to enforce conventions on other teams' code. The structural enforcement starts to matter.

## What the lenses tell you

These three lenses are not a scoring system. None of them rule out a library on their own. They surface the trade-offs that the federation context makes visible.

If runtime extensibility, cross-team invalidation, and structural ownership all matter for your context, RTK plus RTK Query lines up well with what federated multi-team work asks for. The cost is a larger migration if you are already on TanStack or Apollo, and a steeper learning curve for engineers who only know thunks or only know hooks-first libraries.

If your federation reality is closer to single-team, or if you can absorb the coordination cost through team discipline and shared packages, TanStack plus Zustand is a fair choice. Plenty of federated React web apps run on it. The lenses help you see the cost rather than rule out the option.

Worth saying plainly: the lenses are not a verdict on library quality. TanStack Query is excellent at what it was designed for, and Zustand is one of the best small client-state libraries around. The question is fit for an architectural context, not what's good in isolation. Lens 3 holds at any multi-team scale, with or without federation. And a library decision that the engineers writing the code haven't bought into is one that will not survive contact with the codebase.

If your team is working through federation trade-offs, walking through these three lenses together is a more productive use of an afternoon than another generic library comparison. They surface the parts of the decision that depend on your architecture rather than on your library preferences.

For the conceptual foundation, [the prior post on server state vs client state](/blog/server-state-and-client-state-react-native/) covers it. For a closer look at lens 2 on its own, [the tags-vs-keys post](/blog/rtk-query-tags-vs-tanstack-query-keys/) takes it further.
