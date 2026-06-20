---
title: "How to pass a React Native tech test"
description: "Practical advice from someone who reviews take-home tech test submissions. What actually matters, what doesn't, and the mistakes that cost candidates the job."
publishDate: 2026-04-06
series: "Hiring"
tags: ["react-native", "hiring", "career-advice", "tech-interviews"]
locale: en
heroImage: "/images/blog/react-native-tech-test-tips.webp"
heroAlt: "How to pass a React Native tech test"
heroImgPrompt: "A forking path with a checkmark tag on the chosen branch and a spotlight circle waiting at its end, one standout figure ahead of a small crowd"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#F8DBC0"
campaign: "pass-rn-tech-test"
relatedPosts: ["why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## What panels actually score on

I review React Native tech test submissions. Most rejections aren't a coding problem. The candidate could code. They didn't show the right things.

This post is the advice I'd give a friend before they submitted a take-home. Specific, practical, panel-side. The shifts that move a submission from "maybe" to "yes."

*I wrote about why I redesigned a tech test from the hiring manager's perspective in [a separate post](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). This one is the other side: how to pass one.*

## Read the brief twice. Then read it again

Sounds obvious. It's the most common miss.

If the brief says "build three screens with navigation," don't build two. If it says "use TypeScript," don't use JavaScript. If it says "manage a list of up to 6 items," make sure adding a 7th is handled gracefully.

Reviewers check requirements like a checklist. Every missing requirement is points dropped. Following a spec is part of the job. If you miss requirements in a tech test with a clear brief, what happens with a vague Jira ticket? Read the brief before you start, read it again halfway through, and read it one final time before you submit.

## Project structure tells the panel how you think

The first thing I do when I open a submission is look at the folder structure. Before I read a line of code, the layout already says something about how you organise work.

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

Neither is wrong. Feature-first shows you've thought about how the app scales. If I ask "what happens when 5 teams work on this codebase?" and your structure already answers that question, you're ahead.

Red flag: everything in a flat `src/` folder with no organisation. It suggests the coding started before the architecture was planned.

## TypeScript is not optional

If the brief says "TypeScript preferred," treat it as required. Submitting plain JavaScript in 2026 is an automatic downgrade.

Using TypeScript isn't the bar. Using it well is:

| Do this | Why it matters |
|---|---|
| Type your props | Every component should have a typed props interface |
| Type your API responses | Don't use `any` for data from the server |
| Type your navigation params | React Navigation has good TypeScript support |

The one `any` I'll forgive: a third-party library type that would take an hour to model properly. Acknowledge it in a comment. `// TODO: type this properly, ran out of time` reads better than pretending it isn't there.

Red flag: `any` scattered throughout the codebase with no acknowledgment.

## State management: pick something and own it

I don't care whether you use Redux Toolkit, Zustand, React Context, or Jotai. I care that you picked it deliberately and can explain why.

| Choice | What it signals |
|---|---|
| **Context** for a three-screen app | Reasonable. Lightweight, no dependencies. |
| **Redux Toolkit** for a three-screen app | Fine, but I'll ask why. "It's what I know best" is an honest answer. |
| **Zustand** with a clean store | Shows you're current with what's in active use across recent RN codebases. |

If you go with Redux, use Redux Toolkit. Not the old `switch/case` reducer pattern. If I see `createStore` instead of `configureStore`, or manual action type constants instead of `createSlice`, the Redux knowledge probably needs refreshing.

What actually matters:

- ✅ State logic separated from the UI
- ✅ Actions, reducers, and selectors in their own files
- ✅ Business rules (like max party size) enforced in the state layer
- ✅ Updates are predictable
- ❌ Business logic living inside components
- ❌ State scattered across `useState` calls with no pattern

Don't dispatch a fetch every time a screen mounts. If I navigate to a detail screen, go back, and return to the same detail screen, I shouldn't see a loading spinner again. A simple `if (!data[id])` check before your `dispatch(fetchDetails(id))` is enough.

## Tests: quality over coverage

You don't need 90% coverage. You need meaningful tests. Three good tests beat twenty snapshot tests.

What I want to see:

| Test type | Example |
|---|---|
| Business logic | If there's a rule (max 6 in a list, no duplicates), test it. Reducers and selectors are the highest-value tests. |
| User interactions | Render a component with RNTL, press a button, check the result. Use `render`, `fireEvent`, `waitFor`. |
| Edge cases | What happens when you add a duplicate? When the list is empty? At the pagination boundary? |
| Passing tests | Run them before you submit. Failing tests signal unfinished work. |

What I don't want to see:

- ❌ Snapshot tests everywhere. They break on every UI change and prove nothing about behaviour.
- ❌ Tests that mock everything. If your test mocks the function it's testing, it's testing the mock.
- ❌ No tests at all. Hard to recover from in the walkthrough.

Aim for 5 to 10 focused tests covering the critical paths. Reducers, selectors, key interactions. That's enough.

## Handle loading, errors, and empty states

This is where candidates stand out. Anyone can build the happy path. The question is: what happens when things go wrong?

| State | What to do |
|---|---|
| **Loading** | Show a spinner or skeleton on first load. Show a subtle indicator during pagination. Don't flash a full-screen spinner for 100ms. |
| **Error** | If the API fails, tell the user. A retry button is better than nothing. An informative message beats "Something went wrong." |
| **Empty** | If the list is empty or there are no saved items, show something useful. Not a blank screen. |

Red flag: the app crashes on a slow network. No loading state, no error handling. The reviewer opens DevTools, throttles the network, and the app falls apart.

## The API call matters

**GraphQL vs REST.** If the brief offers both, the choice matters less than the execution. A well-implemented REST client beats a messy GraphQL setup. Pick the one you can do cleanly, and be ready to explain why.

**Use FlatList or FlashList. Never ScrollView for lists.** `ScrollView` renders every item at once. With 100+ items, you'll see frame drops, memory spikes, and eventual crashes. `FlatList` virtualises the list, only rendering what's on screen. A `ScrollView` wrapping a `.map()` over a data list suggests a gap in understanding RN's rendering model.

Other things that get noticed:

- ✅ Caching: don't refetch data you already have
- ✅ Pagination: don't fetch 1000 items on first load
- ✅ ErrorBoundary: catches JavaScript errors and shows a fallback instead of a white screen

## Edge cases are where you stand out

The happy path is the minimum. What separates a Software Engineer submission from a Senior one is edge case handling:

- **Full list?** What happens when someone tries to add a 7th item? A toast, a disabled button, a modal. Anything except silently failing.
- **Empty list?** Show a meaningful empty state, not a blank screen.
- **Rapid taps?** Does pressing "add" five times fast cause duplicates or crashes?
- **Back navigation?** When I go from detail back to the list, is my scroll position preserved?
- **End of list?** Does pagination stop cleanly when there's no more data?

You don't need to handle all of these. Handling some of them shows you think about real users, not just passing requirements.

## The README is part of the test

Write a README. Not a novel. A short document that covers:

| Section | What to write |
|---|---|
| **How to run it** | `yarn install`, `yarn ios`, done. Extra steps documented. |
| **What you built** | One paragraph summary. |
| **Decisions you made** | Why this state management? Why this folder structure? Two sentences each. |
| **What you'd improve** | The most important section. It shows self-awareness. |

The "what I'd improve" section is a cheat code. It lets you acknowledge shortcuts without the reviewer discovering them as flaws. *"With more time, I'd add E2E tests with Detox and implement proper caching"* turns a missing feature into a demonstration of judgement.

## The walkthrough: this is where jobs are won

If the test has a walkthrough call, prepare for it. The code gets you into the room. The walkthrough gets you the offer.

Know your code. If I say "show me where you handle the API response," you should navigate there in under 5 seconds. Hesitation raises questions about how well you actually know the codebase.

Explain your trade-offs without waiting to be asked. When you show a section of code, say *"I chose this approach because X, but I know the trade-off is Y."* That's the answer I'm looking for before I even ask the question.

Be honest about shortcuts. *"I used Context here because it was faster, but in a production app I'd move to Zustand once the state got more complex."* Strong answer. *"I think Context is the best approach"* is weaker, because the panel knows the trade-offs and you've just suggested you don't.

Have a list of improvements. When I ask "what would you change with more time?" the worst answer is "nothing, I'm happy with it." The best answer is a prioritised list: *"First I'd add caching, then E2E tests, then refactor to feature-first folders."*

Ask questions back. The best walkthroughs are conversations, not presentations. Ask about the team's architecture, their testing approach, their deployment process. It shows you're evaluating the role, not just hoping to pass.

## Stretch goals: do them, but do them well

If the brief mentions optional extras, pick one or two you can do well. Don't try to do all of them poorly. One well-executed stretch goal is worth more than three half-finished ones.

| Worth picking | Why |
|---|---|
| **Search/filter** | Quick to implement, immediately visible, shows UX thinking. |
| **Accessibility** | Labels, roles, contrast. Most candidates skip this. Even basic accessibility makes you stand out. |
| **Error/offline handling** | A retry button when the network fails. Shows real-world thinking. |

| Avoid unless you can do them properly | Why |
|---|---|
| **Animations** | Half-finished animations look worse than none. |
| **Dark mode** | Inconsistent across screens is a liability. |

## The mistakes that actually cost people the job

These are about signals, not code quality.

| Mistake | Why it hurts |
|---|---|
| **Not reading the brief properly** | Missing a core requirement. Building two screens when the brief says three. |
| **No tests at all** | Even two or three tests show you care about quality. Zero is a strong negative signal. |
| **AI-generated code you can't explain** | Using assistance is fine. Submitting code you don't understand is not. The walkthrough surfaces it quickly. |
| **Overengineering** | A tech test doesn't need a design system and a micro-frontend architecture. Build what the brief asks for, well. |
| **Submitting late without communicating** | If you need more time, ask. Going silent and submitting three days late is a red flag. |

## The one thing that matters most

Show that you think. Coding is the baseline, not the differentiator.

Anyone can build screens. The candidates who get hired demonstrate judgement: why they chose this approach, what they'd do differently, where the code would break at scale, what tests actually matter.

The tech test is checking whether you can make good decisions and communicate them clearly. The React Native code is the medium, not the question.

> Build something clean, test the important parts, document your thinking, and be ready to talk about it honestly. That's the whole secret.
