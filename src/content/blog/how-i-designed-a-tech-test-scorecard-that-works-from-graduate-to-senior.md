---
title: "How I designed a tech test scorecard that works from Graduate to Senior"
description: "How a checklist-based scorecard made our React Native take-home test work for every level, from Graduate to Senior. A practical guide to designing a fair hiring process."
publishDate: 2026-04-13
tags: ["engineering-management", "hiring", "react-native"]
locale: en
heroImage: "/images/blog/tech-test-scorecard.jpg"
heroAlt: "Designing a tech test scorecard for React Native hiring"


---

## The problem with "is this a 3 or a 4?"

When I started building the hiring process for my squad, I knew I wanted a structured scorecard from day one. I wrote about the tech test itself in [an earlier post](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). The test worked. The scoring didn't. At least, not the way I first designed it.

My first scorecard used a 1–5 scale for each criterion. "TypeScript usage: score 1 to 5." "State management: score 1 to 5." Each criterion had a rubric describing what each score meant. It looked thorough on paper.

Then I tried to use it.

Two people reviewed the same submission. One scored the TypeScript a 3 ("types are there but not strict"). The other scored it a 4 ("clean types throughout, good use of typed hooks"). They were both looking at the same code. They just interpreted the rubric differently.

> 💡 **Tip:** If two reasonable people can disagree on the score, the rubric isn't specific enough. The problem isn't the reviewers. It's the tool.


## Checklists over rubrics

The fix was embarrassingly simple: replace every subjective score with a **yes/no checklist**.

A single criterion, before and after. This is TypeScript usage:

### Before: subjective rubric

| Score | Description |
|---|---|
| 5 | Strong typing throughout, strict mode, generics where appropriate |
| 4 | Clean types, minimal `any`, props and navigation typed |
| 3 | Types for main structures, some `any` leakage, works but not strict |
| 2 | TypeScript used poorly, frequent `any`, adds little safety |
| 1 | `any` everywhere, effectively JavaScript with `.tsx` extensions |

The problem: "clean types" and "types for main structures" are both reasonable descriptions of the same code. One reviewer sees a 3, another sees a 4. Both are right.

### After: observable checklist

```
✅ Source files use .ts/.tsx extensions
✅ Interfaces or types exist for API data, state shape, and component props
✅ Navigation params are typed
✅ Zero any in production code
☐  Typed hooks used (useAppSelector, useAppDispatch)
☐  Strict TypeScript enabled
☐  Zod or Yup schemas for validation
```

Same criterion. Seven checks. Each one is a fact you can verify by looking at the code. Two reviewers will tick the same boxes because there's nothing to interpret.

The first four checks are baseline (any competent candidate will have these in a 4–6 hour submission). The last three are signals of deeper experience. **The ordering does the levelling for you.**

I did this for every criterion across four sections:

- **Core Functionality**: does the app work?
- **Data Layer & API**: how does it fetch and manage data?
- **Code Quality**: is the code well-written and well-organised?
- **Testing**: is it tested, and how?

**100 checks. 100 points. One point each.**


## Same test, different ceiling

This is the part I'm most excited about. The checks are ordered by how much investment they represent.

The first few checks in each criterion are things any competent candidate will achieve in **4–6 hours**:

- Does the FlatList render items?
- Does pagination work?
- Does the party screen have an empty state?
- Are there types for the main data structures?
- Is there at least one test file?

These are the baseline. If you built the thing the brief asked for, you pass these.

The later checks require more time, deeper experience, or both:

- GraphQL instead of REST
- Runtime response validation with Zod
- MSW for HTTP mocking in tests
- Feature-first project structure
- BDD with Cucumber
- Coverage thresholds enforced

These aren't things you do in a weekend. They're patterns you've learnt from building real production apps.

> 💡 **Key insight:** A candidate investing 4–6 hours scores in the 50–65 range. A candidate investing a full week with years of experience might score 85–95. **The brief is the same. The expectations scale with the score.**


## How the levels map

The total score maps directly to a level:

| Level | Code review score |
|---|---|
| **Graduate** | 20–45 |
| **Associate** | 46–64 |
| **Software Engineer** | 65–88 |
| **Senior** | 89–100 |

The code review score isn't the whole picture. The walkthrough call adds more signal. But the code review is the foundation.


## Respecting the time constraint

A tech test is **not a production app**. Candidates have jobs, families, lives. They're giving you their evening or their weekend. Penalising someone for not implementing a caching layer or not co-locating their styles would be like marking down a timed essay for not having footnotes.

That's why the baseline checks matter. Getting all of them right scores you around **50–60 out of 100**. That's Associate to Software Engineer territory. On my old rubric, a "3 out of 5" *sounded* like a consolation prize. 55 out of 100 on the checklist is a positive result with a clear path to the next level.


## What "above baseline" looks like

The later checks are where candidates differentiate themselves. These aren't requirements. They're **signals**.

A candidate who adds **Detox E2E tests** with extracted helpers is telling me something about their testing culture.

A candidate who implements **GraphQL with Apollo** is telling me something about their API thinking.

A candidate who sets up **MSW with multiple handler sets** (success, error, 401, timeout, offline) is telling me they've debugged production API failures before.

None of these are required. **All of them are noticed.**

The stretch goals sit on top of the 100 points as bonuses: search, dark mode, accessibility, i18n, feature-first structure, Storybook, ErrorBoundary. These are the marks of someone who had time and chose to invest it wisely.


## The walkthrough changes everything

The code review gives me a number. The walkthrough gives me **context**.

A candidate who scores 65 on the code review might jump to 85 after the walkthrough if they can articulate every trade-off, explain what they'd change with more time, and navigate their codebase from memory. The number measures what they built. The conversation measures how they think.

I designed the walkthrough as a set of **question tables**. Each question has five signal descriptions, from "can't find the code" to "explains it from memory with edge cases." The interviewer ticks one row per question. No more "was that walkthrough a 3 or a 4?"

For Senior candidates, there's an additional **system design section** in the same call. No separate interview. The last 15–20 minutes shift from "show me your code" to "how would you design this for a team of 20 engineers?" The same question tables, the same tick-one-row format.


## What I learnt building this

Building this scorecard taught me more about hiring design than anything I've read about it. The lessons that stuck:

**Start with checklists, not rubrics.** Every time I wrote a rubric ("5 = excellent, 3 = good, 1 = poor"), it turned into a debate about what "good" means. Checklists end the debate. Either the thing exists in the code or it doesn't.

**Order the checks by investment, not importance.** The first checks aren't more important than the last. They're just more achievable in 4–6 hours. A Senior candidate who skips check 3 but nails check 7 isn't penalised for the skip because the total still reflects their level.

**Separate what you can see from what you need to ask.** The code review scorecard is 100% observable from the code. No "is the architecture clean?" questions. The walkthrough is 100% conversational. No code-reading during the call. Each document has one job.

**Respect the time constraint.** If a check would require more than 6 hours of work from a competent Software Engineer, it belongs in the upper half of the checklist, not the baseline. I kept catching myself writing baseline checks that were really Senior expectations. The question I kept asking: *"Would I expect this from someone doing this test after work on a Wednesday evening?"* If the answer was no, it moved up.


## It's still evolving

I've used this scorecard for our first round of React Native hiring. My peer EM reviewed it and adopted it for his squad's hires too. That's the test of a good system: **someone else can pick it up and use it without you in the room.**

I'm not pretending it's perfect. The levels might need recalibrating after more candidates go through. Some checks might turn out to be too easy or too hard. The stretch goals might need rebalancing.

The structure is right though:

- ✅ Checklists, not rubrics
- ✅ Observable facts, not opinions
- ✅ Ordered by investment
- ✅ Same test for everyone
- ✅ Different ceiling for different levels

If you're building a hiring process and your interviewers keep disagreeing on scores, try replacing your rubric with a checklist. You might be surprised how much agreement you get when you stop asking *"how good is this?"* and start asking *"is this here?"*

> The best scoring systems don't measure how you feel about the code. They measure what's in the code.
