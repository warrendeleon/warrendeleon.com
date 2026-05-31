---
title: "Tags vs query keys: a small API difference that changes how teams coordinate"
description: "RTK Query and TanStack Query both handle cache invalidation. The shapes look similar in single-team code. At multi-team scale, the difference between declarative tags and string-based keys changes what fails when teams drift out of sync."
publishDate: 2026-08-31
series: "State Management"
tags: ["react-native", "state-management", "rtk-query", "tanstack-query", "cache-invalidation"]
locale: en
heroImage: "/images/blog/tags-vs-query-keys.webp"
heroAlt: "RTK Query tags vs TanStack Query keys"
campaign: "tags-vs-query-keys"
relatedPosts: ["server-state-and-client-state-react-native", "runtime-api-validation-zod-react-native"]
---

## The punchline

Declarative tags scale to teams. String-based keys don't. That's the comparison in one line, and the rest of this post is the proof.

TanStack Query's keys are shorter, lighter, and pleasant to read inside a single codebase. For a feature team that owns every query, the key-based API is the obvious choice. RTK Query's tag system adds ceremony you don't need at that size.

The shape that works for one team becomes a liability across team boundaries. The failure mode shifts from "fix it before merge" to "find it from a support ticket."

## The scenario

Dealing team ships an `executeTrade` mutation. Portfolio team has a `getPortfolio` query that returns the user's holdings. When the trade succeeds, the portfolio cache is stale, and something has to mark it for refetch.

## With RTK Query tags

Portfolio team declares what their query holds:

```typescript
getPortfolio: builder.query({
  query: (id) => `/portfolio/${id}`,
  providesTags: ['Portfolio'],
});
```

Dealing team declares what their mutation affects:

```typescript
executeTrade: builder.mutation({
  query: (order) => ({ url: '/trades', method: 'POST', body: order }),
  invalidatesTags: ['Portfolio'],
});
```

When the mutation succeeds, the library walks its cache, finds queries that provide the `Portfolio` tag, and refetches the ones currently mounted. Dealing team never reads portfolio's code. They don't need to know what query key portfolio uses or what shape the cache entry takes. They declare intent at a categorical level and the library wires it.

Both teams are coupled to the string `'Portfolio'`. That coupling lives in a shared `tagTypes` enum declared in the API module, so it has a single source of truth.

## With TanStack Query keys

TanStack invalidates by key, not by category. The dealing team writes:

```typescript
queryClient.invalidateQueries({ queryKey: ['portfolio'] });
```

For that line to be correct, the dealing team has to know the portfolio team's exact query key shape. They go look at portfolio's code, find the `useQuery` call, read the key, and copy it into their own invalidation.

The teams are coupled to the same string `'portfolio'`, but the coupling lives in a different place. It's a magic string in the dealing team's mutation handler, with no contract pointing back to portfolio's query.

## What happens when teams drift

Both approaches produce the same outcome when teams stay coordinated. The cached portfolio data refetches, the UI updates, the user sees fresh holdings. The approaches diverge when coordination slips.

Take a rename. The portfolio team is refactoring. The domain term has shifted. What they used to call "portfolio" is now called "holdings" across the API, the docs, and the team's day-to-day language. They rename the query key:

```typescript
// before
useQuery({ queryKey: ['portfolio', accountId], queryFn: fetchPortfolio });

// after
useQuery({ queryKey: ['holdings', accountId], queryFn: fetchHoldings });
```

They ship to the CDN.

In an RTK Query world with tags, the rename has no effect on the dealing team's invalidation. Tags are independent of query keys. The portfolio team's query still provides `'Portfolio'`. The dealing team's mutation still invalidates `'Portfolio'`. The wiring holds.

In a TanStack Query world with keys, the rename breaks the dealing team without saying so. `invalidateQueries({ queryKey: ['portfolio'] })` now matches zero cached queries. The mutation succeeds. The library doesn't surface an error because finding zero matches isn't one. The user's portfolio cache stays stale until they navigate away and back, or until a support ticket surfaces the bug.

No type error. No compile failure. No runtime exception. Stale UI in production.

## Where the coupling lives

Both approaches encode the same coupling between the two teams. The difference is where the coupling lives, and what surfaces when it breaks.

Tags couple the teams through a **category name**: an abstract noun describing a kind of data. It lives in a shared enum. Renames need coordination through that enum, and the rename surfaces straight away because every endpoint referencing the old name is suddenly invalid.

Keys couple the teams through a **string identifier**: the literal shape that identifies a cached entry. It lives wherever someone types it. Renames don't need coordination because nothing forces it. They surface when the bug hits production.

That gap in surfacing isn't a flaw in TanStack Query's design. The key-based API is shorter, lighter, and well-suited to a single team that holds every query in its head. The shape stops fitting when the people writing the invalidation and the people writing the query stop being the same people.

## What this means in practice

A few things to take from this.

If your app is one team and one codebase, the difference is mostly aesthetic. TanStack's key-based API is shorter and gets out of the way. The risk of silent invalidation drift is small because you have full visibility into every query key.

If your app has multiple teams and they ship independently, the failure mode of key-based invalidation starts to compound. Each team's refactor is a possible silent break for any other team that referenced their keys. You can build conventions to soften that (shared key constants, code review checklists, integration tests across features), but you're rebuilding what the tag system gives you for free.

If you're early in a library choice and federation or multi-team coordination is on the horizon, the tag system is worth understanding before the API shape feels arbitrary. Picking between the two libraries means picking which failure modes you're willing to live with.

The broader question of how to think about state management in a federated context [is in this post](/blog/state-management-federated-react-native/). If you're new to the server-vs-client-state split this one assumes, [start here](/blog/server-state-and-client-state-react-native/).
