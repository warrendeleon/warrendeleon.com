---
title: "How to pass a React Native tech test"
description: "Practical advice from someone who reviews take-home tech test submissions. What actually matters, what doesn't, and the mistakes that cost candidates the job."
publishDate: 2026-04-06
tags: ["react-native", "hiring", "career-advice"]
locale: en
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "How to pass a React Native tech test"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## This is from the other side of the table

I review React Native tech test submissions. I've seen what gets people hired and what gets them rejected. Most of the rejections aren't because the candidate can't code. They're because the candidate didn't show the right things.

This post is the advice I'd give a friend before they submitted a take-home tech test. Not theory. Specific, practical things that move you from "maybe" to "yes."

*I wrote about why I redesigned a tech test from the hiring manager's perspective in [a separate post](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). This one is the other side: how to pass one.*

## Read the brief twice. Then read it again.

Sounds obvious. It's the most common mistake.

If the brief says "build three screens with navigation," don't build two. If it says "use TypeScript," don't use JavaScript. If it says "manage a list of up to 6 items," make sure adding a 7th is handled gracefully.

**Reviewers check requirements like a checklist.** Every missing requirement is points dropped. Not because we're pedantic, but because following a spec is part of the job. If you miss requirements in a tech test with a clear brief, what happens with a vague Jira ticket?

Read the brief before you start. Read it again halfway through. Read it one final time before you submit.

## Project structure matters more than you think

The first thing I do when I open a submission is look at the folder structure. Before I read a single line of code, the structure tells me how you think.

**Type-first structure** (screens/, components/, hooks/, services/):
```
src/
  components/
  hooks/
  screens/
  services/
  types/
```

**Feature-first structure** (each feature is self-contained):
```
src/
  features/
    product-list/
    product-detail/
    favourites/
  shared/
    components/
    hooks/
```

Neither is wrong. But feature-first shows you've thought about how the app scales. If I ask "what happens when 5 teams work on this codebase?" and your structure already answers that question, you're ahead.

> 🚩 **Red flag:** Everything in a flat `src/` folder with no organisation. It suggests the coding started before the architecture was planned.

## TypeScript is not optional

Even if the brief says "TypeScript preferred," treat it as required. Submitting plain JavaScript in 2026 is an automatic downgrade.

But it's not enough to just use TypeScript. Use it *well*:

- **Type your props.** Every component should have a typed props interface.
- **Type your API responses.** Don't use `any` for the data that comes back from the server.
- **Type your navigation params.** React Navigation has excellent TypeScript support. Use it.

The one `any` I'll forgive: complex third-party library types that would take an hour to figure out. Acknowledge it in a comment. *"// TODO: type this properly — ran out of time"* is better than pretending it doesn't exist.

> 🚩 **Red flag:** `any` scattered throughout the codebase with no acknowledgment.

## State management: pick something and own it

I don't care whether you use Redux Toolkit, Zustand, React Context, or Jotai. I care that you picked it deliberately and can explain why.

- **Context** for a three-screen app? Perfectly reasonable. Lightweight, no dependencies.
- **Redux Toolkit** for a three-screen app? Fine, but I'll ask why. If you say "because that's what I know best," that's an honest answer. If you say "because it's the best," that's a weaker answer.
- **Zustand** with a clean store? Shows you're current with the ecosystem.

If you go with Redux, **use Redux Toolkit**. Not the old `switch/case` reducer pattern. If I see `createStore` instead of `configureStore`, or manual action type constants instead of `createSlice`, it suggests the Redux knowledge might need refreshing.

**Separate your concerns.** If using Redux Toolkit, split into `actions.ts`, `reducers.ts`, and `selectors.ts`. Write tests for each. Selectors are pure functions. They're trivial to test and the tests never flake. Reducer tests prove your business logic works. These are the highest-value tests you can write.

**Don't dispatch a fetch every time a screen mounts.** If I navigate to a detail screen, go back, and navigate to the same detail screen, I shouldn't see a loading spinner again. Cache the data. Check if it already exists before dispatching. A simple `if (!data[id])` check before your `dispatch(fetchDetails(id))` is enough.

**What actually matters:** is the state logic separated from the UI? Can I find your state management code without searching? Are your updates predictable?

> 🚩 **Red flag:** Business logic living inside components. State that's scattered across `useState` calls with no clear pattern.

## Tests: quality over coverage

You don't need 90% coverage. You need *meaningful* tests. Three good tests beat twenty snapshot tests.

What I want to see:

- **Test your business logic.** If there's a rule (max 6 in a list, no duplicates), test it. Test your reducers, test your selectors. These are the highest-value tests because they prove the core logic works and they never flake.
- **Test user interactions with React Native Testing Library.** Render a component, press a button, check the result. Use `render`, `screen`, `fireEvent`, and `waitFor` from `@testing-library/react-native`. Not Enzyme. Not just snapshot tests.
- **Test edge cases.** What happens when you try to add a duplicate? What happens when the list is empty? What happens at the pagination boundary? Test the sad paths, not just the happy ones.
- **Make sure every test passes before you submit.** Run them. If a test fails, either fix it or remove it. Failing tests or commented-out test code signals unfinished work.

What I don't want to see:

- **Snapshot tests everywhere.** They break on every UI change and prove nothing about behaviour.
- **Tests that mock everything.** If your test mocks the function it's testing, it's testing the mock, not the code.
- **No tests at all.** This is a hard one to recover from in the walkthrough.

> 💡 **Tip:** 5-10 focused tests that cover the critical paths. Reducers, selectors, key interactions.

## Handle loading, errors, and empty states

This is where candidates stand out. Anyone can build the happy path. The question is: what happens when things go wrong?

**Loading states:** show a spinner or skeleton on first load. Show a subtle indicator when loading more data (pagination). Don't flash a full-screen spinner for 100ms.

**Error states:** if the API fails, tell the user. A retry button is better than nothing. An informative message is better than "Something went wrong."

**Empty states:** if the list is empty or there are no saved items, show something useful. Not a blank screen.

> 🚩 **Red flag:** The app crashes on a slow network. No loading state, no error handling. The reviewer opens DevTools, throttles the network, and the app falls apart.

## The API call matters

**GraphQL vs REST:** if the brief offers both, GraphQL is the stronger choice. It shows you can work with modern API patterns. But a well-implemented REST client beats a messy GraphQL setup.

**Caching:** if you fetch a detail screen, go back, and fetch it again, that's wasted work. Use React Query, Apollo's cache, or even a simple in-memory cache. The reviewer *will* notice if every navigation triggers a refetch.

**Pagination:** if the API supports it, use it. Don't fetch 1000 items on first load. Infinite scroll or paginated fetching shows you think about performance.

**Use FlatList or FlashList. Never ScrollView for lists.** This is a hard red flag. `ScrollView` renders every item at once. With 100+ items, you'll see frame drops, memory spikes, and eventual crashes. `FlatList` virtualises the list, only rendering what's on screen. If you don't know the difference, learn it before your tech test. If I see a `ScrollView` wrapping a `.map()` for a data list, it suggests a gap in understanding React Native's rendering model.

**Wrap your app in an ErrorBoundary.** This is a small thing that earns bonus points. A top-level `ErrorBoundary` component catches JavaScript errors and shows a fallback instead of a white screen. Most candidates don't do this. If you do, it signals you think about production resilience.

## Edge cases are where you stand out

The happy path is the minimum. What separates a Software Engineer submission from a Senior one is edge case handling:

- **Full list?** What happens when someone tries to add a 7th item? A toast, a disabled button, a modal. Anything except silently failing.
- **Empty list?** Show a meaningful empty state, not a blank screen.
- **Rapid taps?** Does pressing "add" five times fast cause duplicates or crashes?
- **Back navigation?** When I go from detail back to the list, is my scroll position preserved? If not, that's a noticeable UX issue.
- **End of list?** Does pagination stop cleanly when there's no more data? Or does it keep firing requests?

You don't need to handle all of these. But handling *some* of them shows you think about real users, not just passing requirements.

## The README is part of the test

Write a README. Not a novel. A short document that covers:

1. **How to run it.** `yarn install`, `yarn ios`, done. If there are extra steps, document them.
2. **What you built.** One paragraph summary.
3. **Decisions you made.** Why this state management? Why this folder structure? Two sentences each.
4. **What you'd improve.** This is the most important section. It shows self-awareness.

**The "what I'd improve" section is a cheat code.** It lets you acknowledge shortcuts you took without the reviewer discovering them as flaws. *"With more time, I'd add E2E tests with Detox and implement proper caching"* turns a missing feature into a demonstration of judgement.

## The walkthrough: this is where jobs are won

If the test has a walkthrough call, prepare for it. The code got you into the room. The walkthrough gets you the offer.

**Know your code.** If I say "show me where you handle the API response," you should navigate there in under 5 seconds. If you hesitate, it can raise questions about how well you know the codebase.

**Explain your trade-offs.** Don't wait for me to ask. When you show a section of code, say *"I chose this approach because X, but I know the trade-off is Y."* That's the answer I'm looking for before I even ask the question.

**Be honest about shortcuts.** *"I used Context here because it was faster, but in a production app I'd move to Zustand once the state got more complex."* That's a strong answer. *"I think Context is the best approach"* is a weaker one.

**Have a list of improvements.** When I ask "what would you change with more time?" the worst answer is "nothing, I'm happy with it." The best answer is a prioritised list: *"First I'd add caching, then E2E tests, then refactor to feature-first folders."*

**Ask questions back.** The best walkthroughs are conversations, not presentations. Ask about the team's architecture, their testing approach, their deployment process. It shows you're evaluating the role too, not just hoping to pass.

## Stretch goals: do them, but do them well

If the brief mentions optional extras (search, persistence, animations, dark mode, accessibility), pick one or two that you can do *well*. Don't try to do all of them poorly.

**Best stretch goals to pick:**
- **Search/filter** on the list. Quick to implement, immediately visible, shows you think about UX.
- **Accessibility.** Labels, roles, contrast. Most candidates skip this entirely. Doing even basic accessibility makes you stand out.
- **Error/offline handling.** A retry button when the network fails. Shows you think about real-world conditions.

**Stretch goals to avoid unless you can do them properly:**
- **Animations.** Half-finished animations look worse than no animations.
- **Dark mode.** If it's not consistent across every screen, it's a liability.

One well-executed stretch goal is worth more than three half-finished ones.

## The mistakes that actually cost people the job

These aren't about code quality. They're about signals.

**Not reading the brief properly.** Missing a core requirement. Building two screens when the brief says three.

**No tests at all.** Even two or three tests show you care about quality. Zero tests sends a strong negative signal.

**AI-generated code you can't explain.** Using AI to help is fine. Submitting code you don't understand is not. This becomes apparent during the walkthrough.

**Overengineering.** A tech test doesn't need a design system, a component library, and a micro-frontend architecture. Build what the brief asks for, well. Save the architecture astronautics for the system design interview.

**Submitting late without communicating.** If you need more time, ask. Most companies will give you an extra day or two. Going silent and submitting three days late with no explanation is a red flag.

## The one thing that matters most

**Show that you think.** Not just that you code.

Anyone can build screens. The candidates who get hired are the ones who demonstrate judgement: why they chose this approach, what they'd do differently, where the code would break at scale, what tests actually matter.

The tech test isn't testing whether you can write React Native. It's testing whether you can make good decisions and communicate them clearly.

> Build something clean, test the important parts, document your thinking, and be ready to talk about it honestly. That's it. That's the whole secret.
