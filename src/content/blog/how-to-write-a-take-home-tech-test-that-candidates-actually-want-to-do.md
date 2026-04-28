---
title: "How to write a take-home tech test that candidates actually want to do"
description: "Most take-home tests fail because of setup friction, unclear briefs, or disrespecting people's time. This is how I designed one that candidates thank us for."
publishDate: 2026-04-20
tags: ["engineering-management", "hiring", "tech-interviews", "developer-experience"]
locale: en
heroImage: "/images/blog/take-home-tech-test-design.webp"
heroAlt: "Designing a take-home tech test for software engineers"
campaign: "take-home-tech-test"
relatedPosts: ["why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-pass-a-react-native-tech-test", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior"]
---

## The test nobody finishes

Most take-home tech tests fail before the candidate writes a single line of code.

They clone the repo. They run `npm install`. Something breaks.

**45 minutes later**, they're debugging a Ruby version mismatch, a missing CocoaPod, or a Node version that doesn't work with the bundler. By the time the app runs, they've burnt through their patience and half their evening.

The best candidates, the ones you actually want to hire, are the most likely to walk away. They have options. They'll pick the company that respects their time.

> 🚩 **This happened to us.** Our first candidate spent two hours fighting Ruby version issues before writing any application code. His system Ruby was too old. He upgraded to Ruby 4, which broke the bundler. He downgraded to 3.3, but the vendored bundler was incompatible. Each step was a back-and-forth message. Two hours. Zero lines of application code written.

That experience changed how I thought about the test. The questions were fine. **The developer experience was the problem.**

## Treat the test like a product

This became my guiding principle. The tech test is the first real interaction a candidate has with your engineering culture. Everything they experience tells them something about you.

If the setup is broken → they think your codebase is broken.
If the brief is vague → they think your specs are vague.
If the timeline is unrealistic → they think your deadlines are unrealistic.

I started treating the test the same way I'd treat a product:

| Product thinking | Applied to the tech test |
|---|---|
| User research | What frustrates candidates about tech tests? |
| Clear requirements | A detailed brief with wireframes and rules |
| Developer experience | Starter project, setup script, path aliases |
| Documentation | Linked guides for every question they might have |
| Continuous improvement | Update after every round based on what went wrong |

After the Ruby incident, I added a setup script, pinned the Ruby version, committed a Gemfile.lock with a modern bundler, and added a troubleshooting section to the README.

**The next candidate was coding in under two minutes.**

## The setup script

The single biggest improvement: a `setup.sh` that handles everything.

```bash
./setup.sh
```

One command. It:

- ✅ Checks Node version (installs via nvm if needed)
- ✅ Checks Ruby version (supports rbenv, rvm, and asdf)
- ✅ Checks for Xcode CLI tools and CocoaPods
- ✅ Runs `yarn install`
- ✅ Runs `bundle install` and `pod install`
- ✅ Tells you exactly what to fix if something is wrong

The key design choice: the script **asks before installing anything**. It detects what the candidate already has and works with it. A candidate using rbenv gets rbenv. A candidate using rvm gets rvm. Their environment is respected, not overwritten.

> 💡 **Tip:** Pin your versions in the repo: `.ruby-version`, `.nvmrc`, `Gemfile.lock` with a modern bundler. Then write a setup script that reads them. Every minute a candidate spends on setup is a minute they're not spending on code.

## The starter project

I give candidates a fully configured project. Not a blank repo. A working app.

| Included | Why |
|---|---|
| TypeScript in strict mode | No ambiguity about language expectations |
| React Navigation v7 with typed params | Navigation is boilerplate, not a test of skill |
| Jest + React Native Testing Library | Configured with native module mocks, ready to write tests |
| ESLint + Prettier | Consistent code style from line one |
| Path aliases (`@app/*`) | No `../../../` import chains |
| Custom test render wrapper | NavigationContainer included, just render and assert |
| Three placeholder screens | "Replace me", clear starting point |
| A passing smoke test | Proof the setup works before they change anything |

**Everything compiles. Everything runs. The smoke test passes.**

I'm not testing whether someone can configure a bundler or debug a TypeScript path alias. I'm testing whether they can **build application code**. The starter project removes every obstacle between "I cloned the repo" and "I'm writing my first component."

Some candidates start from scratch anyway. That's fine. The starter is optional. But most use it, and the result is the same: instead of spending their first hour fighting config, they spend it making architectural decisions.

## The brief: clear about what, not how

Some tech tests specify exactly how to build things: which state management library, which folder structure, which API client. That approach works when you want consistency. But for us, those decisions are the most interesting part of the submission.

Our brief takes a different approach. It explains **what** the app should do in detail, and says nothing about **how**.

- **Screen wireframes** show the data and interactions (ASCII layouts, not pixel designs)
- **A requirements table** spells out the rules (max 6 items, add from detail, remove from list)
- **A technical requirements table** lists the non-negotiables (React Native, TypeScript, React Navigation)

What's deliberately missing: architecture prescriptions. The candidate chooses the state management, the folder structure, the API client, the testing strategy.

A candidate who picks Redux Toolkit tells me something different from one who picks Zustand. Neither is wrong. *Both are interesting.* And the reasoning behind the choice is what the walkthrough conversation is built on.

> 💡 **Tip:** If your brief specifies the architecture, you're testing compliance, not engineering. The best briefs describe the *what* in detail and leave the *how* completely open.

## Respecting people's time

**Candidates get 7 days. The work should take 4 to 6 hours.**

We say this explicitly. In the brief and in the submission guide. Twice, because people miss it the first time.

7 days gives flexibility. Some people work across a weekend. Some do an hour each evening. Some block a Saturday morning. The timeline respects that candidates have jobs, families, and lives outside of interviewing.

The 4-to-6-hour estimate is honest. I built the test myself to verify it. A competent React Native developer can build all three screens with state management, API integration, basic tests, and a README in that time. Some choose to invest more. That's their choice, not our expectation.

If a candidate needs more time, we give it. No questions asked.

> ℹ️ Going silent and submitting three days late with no explanation is a different signal from sending a message saying "I need a couple more days." Communication matters.

## Tell them what you're looking for

Early on, a candidate told us they'd spent an hour styling buttons because they assumed UI polish mattered to us. It didn't. We were looking at architecture and testing. That hour was wasted because we hadn't told them what counted.

Now we're explicit:

```
✅ How you think about architecture and code organisation
✅ How you break down a problem into components and data flows
✅ How you make and justify technical decisions
✅ How you handle edge cases and error states
✅ How well you know your own code

❌ We're NOT judging visual design or pixel-perfect UI
❌ We're NOT expecting a production-ready app in a take-home
```

When candidates know we care about architecture and trade-offs more than styling, they allocate their time accordingly. **Better signal for us. Better experience for them.**

We also tell them upfront that we might use AI tooling as a pre-check, but every submission is manually reviewed and scored by the hiring panel. Transparency builds trust.

## The walkthrough is not an interrogation

The walkthrough is a conversation. The candidate drives for the first 10 minutes:

1. **Demo the app**: walk through all screens, show the features working
2. **Run the tests**: show them passing live
3. **Walk through the code**: explain structure and decisions

After the presentation, we ask questions. But the framing matters. We say:

> *"Don't worry if something doesn't work as expected during the demo. That happens. If it does, just talk me through what you think went wrong and how you'd fix it. That tells me more than a perfect demo would."*

This isn't just being nice. Watching someone diagnose a bug in their own code is one of the strongest signals you can get. A candidate who says *"Oh, I think the useEffect dependency array is wrong here"* is showing you exactly how they work.

A perfect demo shows you nothing except that they rehearsed.

## Documentation as a first-class feature

The test comes with proper documentation. Not just a README. A set of linked markdown files:

| Document | What it covers |
|---|---|
| **Assessment Brief** | Requirements, screen wireframes, party rules, technical requirements |
| **API Guide** | Endpoints, GraphQL vs REST options, client recommendations |
| **Starter Project** | What's included, project structure, available commands, testing setup |
| **Submission & Walkthrough** | How to submit, what happens in the walkthrough, tips |
| **Stretch Goals** | Optional extras and what each one demonstrates |

Every question a candidate might have is answered before they need to ask it. This isn't just about being helpful. It's about **removing ambiguity as a variable**. I don't want to evaluate how well someone interprets a vague brief. I want to evaluate how they build software when the requirements are clear.

## What I'd change next time

The test isn't perfect. What's on my list:

- **A video walkthrough of the starter project.** A 3-minute Loom showing the folder structure, how to run it, and where to start. Some people learn better from video than docs.
- **A `.env.example` file.** Even though the test uses a public API with no keys, it sets the right pattern.
- **Testing the setup on a clean machine.** I built the test on my own laptop with years of tooling. Every assumption about "everyone has this installed" was wrong. The first candidate proved it.

The structure is right though. Setup script. Starter project. Clear brief. Honest timeline. Proper documentation. Transparent evaluation criteria.

If you're designing a tech test and candidates keep dropping out, don't look at the questions first. Look at the developer experience. **The best tech test is one where the candidate spends 100% of their time on the thing you're actually evaluating, and 0% on everything else.**

*This is the last in a series about building a hiring process from scratch. The earlier posts cover [why I redesigned the test](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/), [advice for candidates taking one](/blog/how-to-pass-a-react-native-tech-test/), and [how the scoring works](/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/).*
