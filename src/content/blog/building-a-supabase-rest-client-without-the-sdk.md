---
title: "Building a Supabase integration in React Native without the SDK"
description: "Series intro: why I built a production-grade Supabase integration in React Native without the SDK. Auth, token refresh, storage, pinning, masking, RLS."
publishDate: 2026-06-01
tags: ["react-native", "architecture", "http", "authentication", "supabase"]
locale: en
heroImage: "/images/blog/supabase-rest-client.webp"
heroAlt: "Building a Supabase integration in React Native without the SDK"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

If you want to understand what an SDK actually does, the best exercise is to not use it.

This is the opening essay in a series on building a production-grade Supabase integration in React Native without the SDK. The series covers auth, token refresh race conditions, storage uploads with retry, certificate pinning, PII-masking interceptors, and backend hardening with RLS. Six tutorials and this essay on *why*.

The Supabase SDK gives you working auth in three lines. A custom client takes around 600. Both work. The difference is whether you can see what the auth layer is doing when something needs to change.

## What the SDK does for you (and hides from you)

The Supabase SDK handles authentication, storage, database queries, and real-time subscriptions. Install it, pass your project URL and anon key, and you're running. Three lines for login, two for file upload, one for a query.

The SDK exposes hooks for some of the cross-cutting concerns: you can pass a custom storage adapter via `auth: { storage }` and override `global.fetch` in `createClient`. The flexibility is real. The integration points are still awkward:

- **Token storage.** The default on React Native is AsyncStorage, plain text. You can swap it for a Keychain-backed adapter by writing your own `getItem`/`setItem`/`removeItem` shim, but the SDK calls into the adapter at moments you can't see, and you're still operating inside the SDK's session model. Auditing what's actually stored, when, and on which code path means stepping through SDK source.
- **Token refresh.** The SDK refreshes expired tokens internally. The refresh logic, the retry mechanism, and what happens when five requests fire simultaneously with the same expired token all live below your visibility line.
- **Error shapes.** The SDK throws its own error types. You get a message string and a class name; mapping that to a UI-friendly state with a machine-readable code that survives across SDK upgrades is your problem.
- **HTTP layer.** The SDK takes a `global.fetch` override, so you can wrap calls. But the SDK's *internal* call patterns are still opaque: which URLs fire, in what order, with what retry behaviour. Layering certificate pinning, observability, and a refresh queue on top of someone else's HTTP loop is harder than owning the loop yourself.

For a prototype, none of that matters. For an app that has to operate in production, with token rotation, intermittent networks, observability requirements, and a real security posture, all of it matters.

> 💡 **The SDK is a shortcut, and shortcuts are fine when you know what they skip.** The interesting part of building this from scratch is discovering exactly what those skipped pieces are.

## Why this codebase is open to clients and employers

I keep my React Native portfolio repo on GitHub as a record of how I think about the platform. When a coding exercise or tech test comes up, the resulting work goes into the same repo, alongside the rest of the codebase. Clients I've contracted for, and employers I've interviewed with, have all read it as part of evaluating my work.

That makes the repo a living artefact, not a tutorial project. The Supabase integration is the part of it where production decisions are most visible. SDK calls show that someone has read the docs. A custom REST client with typed interceptors, a token-refresh subscriber queue, certificate pinning, runtime validation, and tiered secure storage shows that someone has thought about how mobile apps actually run in production.

That visibility is the reason for the rebuild. The technical reasons follow from there.

## What this series covers

Six tutorials, each on one piece of the stack:

1. **Building an Axios-based Supabase auth client.** The base client, request interceptor for token attachment, sign-in/up/out, typed error mapping with `AuthError`, MSW test handlers.
2. **Token refresh race conditions.** What happens when five requests get a 401 simultaneously, and the subscriber queue pattern that prevents multiple refresh calls. With a test that proves the queue works.
3. **Building a Supabase storage client with retry.** File uploads with exponential backoff, content-type handling, image upload + delete patterns, retry tests.
4. **Certificate pinning in React Native.** TrustKit on iOS, `network_security_config.xml` on Android, pin extraction, rotation strategy without locking out users on already-deployed binaries.
5. **PII-masking interceptors.** Sentry breadcrumb logging that doesn't leak tokens, emails, or phone numbers. Regex patterns and a custom logger.
6. **Securing your Supabase backend with RLS.** Row Level Security policies that hold up under pressure, function-level security, rate limiting, and the OWASP-mobile attack surface that most "Supabase tutorial" content stops short of.

Each post stands alone. Read the ones that match what you're building. The series order is the order I'd build them in.

## What stays in the SDK

There's one thing the REST API can't do: **real-time subscriptions.** Supabase Realtime uses WebSockets, which you can't drive from Axios.

When the chat feature lands in my app, the Supabase SDK comes in for *just that one feature*. The auth client stays as Axios. The storage client stays as Axios. One SDK import, contained to one feature, with a clear scope. Not spread across the entire app touching every layer.

## The trade

Skipping the SDK means maintaining the auth logic against Supabase's REST API directly. If Supabase changes an endpoint, the client gets updated. If a new auth flow appears, it gets implemented. That's real work, and the SDK does it for free.

What the SDK doesn't do for free is *show* you the production patterns underneath. The auth client in this codebase is the most-read file in the repo, because it's where the production thinking is most concentrated. Tiered token storage. A subscriber queue for concurrent refreshes. Mapped error types that the UI can actually act on. Pinned HTTP. PII masking on the way to Sentry. Runtime validation against schema drift.

If you're building something that has to last past prototype, the rest of this series unpacks each of those pieces in turn.

The full implementation is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), in `src/httpClients/`. Each post in this series is filed under [the supabase tag at warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/) as it publishes.
