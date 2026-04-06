---
title: "Why I redesigned our React Native tech test in my first week"
description: "I joined Hargreaves Lansdown as Engineering Manager and one of my first projects was rethinking the hiring process for platform roles. What I learned and what I built."
publishDate: 2026-03-29
tags: ["engineering-management", "hiring", "tech-interviews"]
locale: en
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Redesigning a tech test for React Native hiring"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
campaign: "rn-tech-test-redesign"
relatedPosts: ["how-to-pass-a-react-native-tech-test", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## A test built for a different time

Four days before I officially started at Hargreaves Lansdown, I went into the office for a passport check. While I was there, my manager mentioned I'd be hiring a team. My first question was whether I could change the interview process. He said yes. *I hadn't even had my first day yet.* By the time I started on the 23rd, I was already building the new test.

I'm the new Engineering Manager for the **Mobile Platform** squad. We're rebuilding HL's mobile app in React Native, a brownfield migration from the existing native iOS and Android apps. I need engineers who can work at the platform level.

I didn't need to ask to see the tech test. I'd been through it myself just weeks earlier. It's how HL hired *me*: a live coding exercise where you build a small app in about an hour with the interviewer watching, followed by technical questions from a questionnaire. The whole interview ran about 90 minutes.

The test made sense for its original context. When the team was smaller and hiring for different roles, it was a reasonable way to screen candidates quickly. But our needs had changed. We weren't hiring someone to build simple screens anymore. We were hiring **platform engineers** who'd own the architecture that every other mobile team at HL would ship through.

I needed the test to answer different questions:

- Can they structure a **multi-screen app** with navigation that doesn't fall apart?
- Can they call a **real API** and handle what happens when the network fails?
- Do they write **tests** because they care about working software, or because someone told them to?
- Can they sit across from me and explain *why* they built it that way?

The existing test was designed for different questions. I needed to build something around ours.

## The limits of live coding

Live coding can tell you whether someone codes comfortably under observation. For some roles, that matters. For ours, I needed to see something different.

I've been on both sides. As recently as January this year, I bombed a live coding exercise for a role I was perfectly qualified for. The problem was simple. I knew how to solve it. But with someone watching my every keystroke, my mind went blank. *I didn't pass.*

As an interviewer, I've watched the same thing happen to candidates. Strong engineers who freeze on problems they'd solve in five minutes at their own desk. Live coding measures composure under observation. That's a valid signal for some roles, but it wasn't the signal I needed.

For a platform engineering role, where the work is architecture decisions, design system components, and CI/CD pipelines, I wanted to see how candidates approach problems with time and context. **The kind of thinking the job actually requires.**

## Showing vs telling

The previous process also included a technical questionnaire. The interviewer would pick questions from a reference sheet covering React Native architecture, state management, testing strategies, and platform differences, then compare answers against expected responses. Sometimes candidates would naturally cover the topics during the live coding, and the interviewer would skip those questions.

These are all valid topics. They're *exactly* the things I want my engineers to understand. Asking someone to explain a concept tells you whether they understand the theory. Seeing how they apply it in their own code gives you a different kind of signal.

The new process tests the same topics through the candidate's own code. Instead of asking *"how would you structure navigation in a complex app?"*, I can open their submission and see how they approached it, then have a richer conversation about the choices they made. The walkthrough still covers architecture, trade-offs, and technical depth, but it's grounded in something the candidate *built*.

## What I built instead

I designed a take-home assessment. A small but real app: multiple screens, a public API, navigation, state management with actual business rules, TypeScript throughout. Not a toy. Not a weekend project either. Something that requires **genuine architectural thinking**.

Four principles guided the design:

**Mirror the actual job.** The test should feel like the work. If a candidate can build this app, they can contribute to our codebase on day one. If they can't, that's useful information too.

**Remove the boilerplate tax.** I give candidates a fully configured starter project. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *All set up.* I don't care whether someone can configure a bundler. I care whether they can write application code.

**Be clear about what, not how.** The brief explains what the app should do. It never says which state management library to use, how to structure the folders, or which API client to pick. Those decisions are the most revealing part of the submission. A candidate who picks Redux Toolkit for a three-screen app tells me something different from one who picks Zustand or React Context. Neither is wrong. *Both are interesting.*

**Respect people's time.** Candidates get a week. The work should take 4 to 6 hours. People have jobs, families, lives. No one should have to take a day off to do a tech test for a company that might not hire them.

## The walkthrough is where the magic happens

The take-home code is half the evaluation. The other half is a walkthrough call: the candidate **demos the app**, runs their tests live, and walks through the code.

This is where you learn how deeply someone understands what they built. In the age of AI-assisted development, that understanding matters more than ever.

Three things I'm looking for:

**Ownership.** *"Navigate to the file where you handle the API response."* If they wrote it, they'll jump straight there. If they're not fully comfortable with the codebase, that becomes clear quickly.

**Trade-off thinking.** I ask about every significant decision. *"Why this state management approach?"* The answer I want isn't "because it's the best." The answer I want is *"because it fits this scope, but here's where it would break down, and here's what I'd move to."* Engineers who think in trade-offs build better systems than engineers who think in absolutes.

**Self-awareness.** *"What would you change if you had more time?"* Strong candidates light up at this question. They have a list. They know where they cut corners. They know what's fragile. They've been thinking about improvements since they submitted. Less experienced candidates tend to say *"I'm happy with it"* and move on.

## Structured scoring

One thing I wanted from day one was a **structured scorecard**. When you're scaling a team and multiple people are involved in hiring, everyone needs to evaluate the same things in the same way. Without that, two interviewers can review the same candidate and reach different conclusions because they're weighting different things.

I built a scorecard that breaks the evaluation into weighted sections: does the app work, is the data layer sound, is the code well-structured, are there tests, and can the candidate explain it all in the walkthrough. Each section has specific criteria on a consistent scale. **Every interviewer evaluates the same things in the same order.**

The scorecard also maps scores to levels. A number tells you whether someone is Graduate, Associate, Software Engineer, or Senior level. This removes ambiguity from the levelling conversation. The rubric does the thinking. The humans verify it.

## Senior candidates get a harder round

For senior hires, there's an additional **system design** conversation. No whiteboard. No *"design Twitter in 45 minutes."* We talk through real scenarios relevant to the platform we're building. What changes when 20 teams build on the same mobile platform? How do you handle shared dependencies? What's your approach to backwards compatibility?

It's a conversation between two engineers, not a performance for an audience. The best candidates **push back** on my assumptions and ask clarifying questions. That's exactly the behaviour I want from a senior on the team.

## Early days

In my first week at HL, I hired a Senior Engineer through the existing process (that happened on day two, before the new test was ready). Going forward, the new process is the standard for all React Native hiring across the UCX-Core tribe. My peer EM, who runs another squad, reviewed the test and the scorecard and agreed to adopt it for his team's hires too. That's the advantage of a well-documented system: **it scales beyond one manager's squad.**

I'm about to hire two Software Engineers using the new process. Every candidate will get the same test, the same starter project, the same evaluation criteria, and the same scoring rubric. The bias surface area shrinks when you standardise.

## The lesson

If you're joining a new team as an engineering manager, **look at the hiring process early**. Don't wait until you've "learned the codebase" or "understood the culture." Hiring is one of the highest-leverage activities you have. Every person you bring on shapes the team for years.

And if your tech test no longer matches what you're hiring for, it's worth revisiting. The best hiring processes evolve alongside the team's needs.

Design a test that mirrors the actual job. Give candidates a starter project so you're testing *engineering*, not *configuration*. Make the requirements clear but let them make their own decisions. Then sit across from them and ask ***why***.

> The combination of thoughtful take-home code and a structured walkthrough gives you more signal in two hours than any live coding exercise gives you in two days.
