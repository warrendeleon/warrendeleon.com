---
title: "I built an app the hiring panel will never open"
description: "How I went from Notion to markdown to a React app for running structured technical interviews. Three iterations to find the right format for live calls and hiring panel reports."
publishDate: 2026-04-27
tags: ["engineering-management", "hiring", "react", "internal-tools"]
locale: en
heroImage: "/images/blog/interview-kit.webp"
heroAlt: "HL Interview Kit running on a laptop during a technical interview"
campaign: "interview-kit"
relatedPosts: ["how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## The hiring panel will never see the app

That was the constraint I kept forgetting. I built a whole interview tool with wizards, timers, auto-save, keyboard shortcuts, colour-coded scores. The hiring panel gets *none of that*. They get a **7-page PDF** attached to an email.

The app exists for one person: the interviewer, during the call. The PDF is what actually matters. It carries the scores, the notes, the strengths and growth areas, the hire/reject decision, and four appendices of detailed evidence. Everything the panel needs to make an offer or move on.

Getting to that point took three attempts. And a bug that nearly cost a candidate their score.

## The format problem

I designed the scorecards for our React Native hiring process [earlier this year](/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/). Three assessments: a **100-check code review**, a **walkthrough interview** scored 1–5, and a **behavioural interview** mapped to HL's five values. The scoring worked. The format I was using to capture those scores during a live call did not.

Picture the walkthrough interview. A candidate is sharing their screen, walking you through [the tech test they've built](/blog/how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do/), explaining their decisions. I need to read them a scripted question, listen to the answer, score it 1–5, write notes, check the time, then move to the next question. All on a video call where I'm trying to maintain eye contact and keep the conversation natural.

Now imagine doing that in a **markdown table in VS Code**.

## Three attempts

**Notion** was my first thought. I use it for everything personal. But it's not a tool we use at HL. Building on a platform I'd be the only one using felt like a dead end, so I dropped it before starting.

**Markdown files** came next. One `.md` per scorecard, with tables for scores and space for notes. The code review worked well this way. It's 100 yes/no checks you complete *after* the interview at your own pace. But the walkthrough and behavioural scorecards needed to work *during* the call. Finding the right row, typing a number, scrolling to the next section. All while a candidate is talking to me. The markdown was accurate but slow, and I was spending more attention on the document than on the person.

The worst part came after the interview. Three separate markdown files, each with different formats. I had to manually combine them into one coherent document for the recruitment team. Every time, it took longer than I wanted.

**A localhost React app** was the third attempt. No backend, no database, no deployment. Just `npm run dev` and a browser tab. Everything persists in `localStorage`. The app dies when I close the tab and comes back when I open it again.

## Staying present during the call

The whole point was to stop fighting the tool during the interview. Three things made the difference:

**One question per screen.** The walkthrough is a wizard. Each step shows the script to read aloud (in a blue blockquote so I can find it instantly), the questions with large 1–5 buttons, and a notes field. No scrolling. No hunting for the right section. When I'm done, I press "Next" and the next group appears. For [senior candidates](/blog/how-to-pass-a-react-native-tech-test/), the wizard extends from 4 steps to 8 with an additional Part B on system design.

**Keyboard scoring.** Press 1 through 5 and the score registers immediately. No clicking, no dropdown menus, no confirmation dialogs. My eyes stay on the video call. The scoring happens in my peripheral vision.

**A section timer in the corner.** Not a countdown. Just a quiet elapsed time display. I glanced at it during the first walkthrough interview and realised I'd spent 8 minutes on a section that should take 4. Without the timer, I'd have run over and cut the last section short. The candidate would have lost the chance to answer questions that could have lifted their score.

## The bug that scored everyone the same

Here's where the technical decisions got interesting. The app is built with **React 19, TypeScript, Vite, and Tailwind v4**. No state management library. Just a custom `useLocalStorage` hook and React Router.

During testing, I scored a candidate's walkthrough. Every section. Every question. Full notes. I pressed "Next" to the summary screen and saw that **every section had the same score**: whatever I'd entered on the last step.

A stale closure bug. Each wizard step's `useCallback` captured the walkthrough data from the *previous* render. When step 3 saved, it overwrote steps 1 and 2 because it was still holding the old state. The classic React problem where state inside a callback doesn't update when you think it does.

The fix was to bypass React state entirely on writes. Every mutation reads the *current* candidate data directly from `localStorage` instead of relying on the closure. A `freshCandidate()` helper that hits `localStorage.getItem` on every save operation. It's not elegant. It works every time.

```typescript
function freshCandidate(id: string): Candidate | undefined {
  const raw = localStorage.getItem('hl-ik-candidates');
  if (!raw) return undefined;
  return JSON.parse(raw).find((c: Candidate) => c.id === id);
}
```

This pattern repeats across three hooks: `useWalkthrough`, `useBehavioural`, and `useCodeReview`. Each one reads fresh, writes fresh, and dispatches a custom event (`ls-sync`) so other hook instances pick up the change. Twenty lines of persistence code. No Redux, no context providers, no middleware.

## The PDF nobody sees me build

After the interview, I press "Print / PDF" and the browser generates a **Candidate Assessment Report**. No PDF library. Just print CSS.

Page 1 is the summary: a score table, the recommended level band, the hire/reject decision, and the offer level. Pages 2 and 3 show strengths and growth areas pulled from all three assessments, grouped by source. Then four appendices: code review breakdown, walkthrough scores with every question and note, behavioural scores by value, and a level bands reference table with the candidate's band highlighted in navy.

That level bands table maps the combined score to one of **12 tiers**: Graduate 1 through Senior 2+. The **2+** tier is intentionally hard to reach. It means someone at the very top of their category, pushing into the next one. When a panel member sees "Associate 2+" on the PDF, they know immediately: strong for Associate, not quite SE. That single label carries more signal than a paragraph of explanation.

The **behavioural gate** adds a second check. A candidate scoring below **10/25** on values alignment doesn't proceed, regardless of their technical score. Between 10 and 14 triggers a panel discussion. 15 or above clears the gate. Technical skills can be taught. Values misalignment creates problems that grow over time.

## Print CSS is its own discipline

I wrote more CSS for `@media print` than for screen. It deserves its own section because it's the part that surprised me the most.

The navy background on the combined score box? **Doesn't print.** Browsers strip background colours by default. I had to convert it to a white box with a heavy black border using `[style*="background: #002147"]` selectors in the print stylesheet. Tailwind utility classes like `bg-white` get targeted with attribute selectors (`[class*="bg-white"]`) to override padding, borders, and margins for print.

`page-break-inside: avoid` is a **suggestion**, not a command. The browser will break inside an element if the alternative is a mostly-empty page. I spent an hour debugging why a strengths section split across two pages until I realised the content was simply too tall for the remaining space.

Heading styles needed explicit inline `border-bottom` because Tailwind classes get stripped or overridden by the print reset. Font sizes switch from `rem` to `pt`. Interactive elements (textareas, checkboxes, dropdowns) are hidden. The entire print layout lives in a separate `CandidatePrintReport` component that renders inside `hidden print:block`. Clean separation. The screen never sees the print layout, the print never sees the buttons.

If I built this again, I'd design the print layout *first* and the screen layout second. The PDF is the deliverable. The screen is just the input form.

## What I'd change

**Tests before scoring logic.** Red flag deductions, stretch bonuses, level band lookups, the behavioural gate threshold. These are all pure functions now, extracted into `utils/scoring.ts`. They're the kind of code that breaks silently when you tweak a boundary. I wrote them last. They should have been first.

**The markdown import parser is fragile.** It uses regex to read Y/N values from scored code review files. It works for the specific format I designed, but it's brittle. A different table alignment or an extra column breaks it. A proper parser with error recovery would be more resilient.

**Accessibility was added late.** WCAG AA compliance (dynamic page titles, heading hierarchy, colour contrast ratios, roving tabindex on score selectors, aria-live on save indicators) was retrofitted rather than built in. It all passes now, but it would have been cleaner to build accessible from the start. Internal tools deserve the same standards as public-facing ones.

## The real test

I used this app for the first time in an actual interview last week. The candidate didn't know I was using anything unusual. They presented their [take-home submission](/blog/how-to-pass-a-react-native-tech-test/), I scored, we talked. I wasn't scrolling, I wasn't typing into markdown tables, I wasn't losing my place. After the call, I pressed one button and had the PDF ready in seconds.

That's the whole point. The best interview tool is the one that **disappears**. The candidate should feel like they're having a conversation, not being processed by a system. The scoring, the timers, the level calculations, the PDF generation: all of that should be invisible. If the tool is doing its job, nobody notices it's there.
