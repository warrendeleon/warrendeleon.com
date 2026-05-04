---
title: "Why I use feature-first project structure in React Native"
description: "An architectural argument for organising by feature instead of by type. Why type-first folder structures fall apart at scale, what the delete test reveals about your codebase, and the rule that keeps features from tangling into each other."
publishDate: 2026-05-25
tags: ["react-native", "architecture", "project-structure", "opinion"]
locale: en
heroImage: "/images/blog/feature-first-rn.webp"
heroAlt: "Feature-first project structure in React Native"
campaign: "feature-first-structure"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing"]
---

> **A note on shape.** This post argues for an architecture, not how to set one up. The mechanics (path aliases, ESLint rules) are at the bottom. If you want the *why*, read straight through. If you just want the config, jump to "Setting it up".

## 85 files for one feature

That's how many TypeScript files my Auth feature has. Six screens, a Redux store, a React context, a custom hook, PIN components with Storybook stories, form validation schemas against a **common password blacklist**, rate limiting, a lockout service, and tests at every level.

In most React Native projects, those 85 files would be scattered across **7 different folders**. Screens in one place, hooks in another, the store slice somewhere else, validation in yet another. To understand how authentication works, you'd need to open 7 folders and mentally reconstruct the relationships between files that sit nowhere near each other.

That layout looks clean at three or four screens. Past that, the relationship between files becomes invisible: the hook for a feature lives nowhere near the screen that uses it, the validation rules sit in a separate folder from the form they validate, and reviewing a feature means scanning multiple alphabetised lists looking for the relevant pieces.

## The structure that stops scaling

You know this layout:

```
src/
├── screens/
│   ├── LoginScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── SettingsScreen.tsx
│   └── WorkExperienceScreen.tsx
├── components/
│   ├── PINInput.tsx
│   ├── ProfileCard.tsx
│   └── AlertBox.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useProfile.ts
├── store/
│   ├── authSlice.ts
│   └── profileSlice.ts
└── utils/
    └── dateFormatter.ts
```

Files grouped by what they *are*, not by what they *do*. **Type-first.** It's clean when the app has three screens. If you've ever done a take-home tech test, [your folder structure is one of the first things a reviewer looks at](/blog/how-to-pass-a-react-native-tech-test/).

Then you add authentication with PIN setup, email verification, password recovery. You add profile management with picture uploads, account editing, password changes. Suddenly `screens/` has 25 files and finding the hook that belongs to the profile picture upload means scanning an alphabetical list of *every hook in the app*.

Now try to **delete a feature**. Remove the screen from `screens/`. Find its hook in `hooks/`. Its service in `services/`. Its store slice. Its components. Its validation schema. Its tests, sitting in a completely different `__tests__/` tree. Miss one file and you've got dead code that'll sit there for months.

That's the test. If removing a feature takes longer than building one, your structure is working against you.

## One folder per feature

My app has 13 features. Each one lives in a single directory:

```
src/features/
├── Auth/          # 85 files. Login, registration, PIN, lockout
├── Profile/       # API, store, picture upload, 5 screens
├── Settings/      # Theme, language, 3 screens
├── Education/     # Store, API, 1 screen
├── WorkExperience/# Store, API, 4 screens
├── Home/          # 1 screen, 1 export
├── Legal/         # Privacy policy, T&Cs
└── Splash/        # Splash screen
```

Everything else sits outside features: `shared/` for reusable components, `store/` for the Redux config, `navigation/`, `httpClients/`, `utils/`, `i18n/`.

The simplest feature is two files. The most complex is 85. **Each one only has the folders it actually needs.** No empty `services/` directory because a template said it should be there.

## What 85 files look like when they're co-located

```
src/features/Auth/
├── __tests__/
├── api/
│   └── __tests__/
├── components/
│   ├── PINDot.tsx
│   ├── PINDot.stories.tsx
│   ├── PINInput.tsx
│   └── PINKeypad.tsx
├── context/
│   └── AuthContext.tsx
├── hooks/
│   └── useAuth.ts
├── services/
│   └── pinLockoutService.ts
├── store/
│   ├── __tests__/
│   ├── actions.ts
│   ├── reducer.ts
│   └── selectors.ts
├── utils/
│   ├── pinHashing.ts
│   ├── pinValidation.ts
│   └── rateLimiter.ts
├── validation/
│   ├── customRules.ts
│   ├── loginSchema.ts
│   └── registrationSchema.ts
├── LoginScreen.tsx
├── RegistrationScreen.tsx
├── ForgotPasswordScreen.tsx
├── PINSetupScreen.tsx
└── index.ts
```

PIN hashing is next to PIN validation is next to PIN components is next to the PIN setup screen. **The relationship between files is visible in the folder structure itself.** I open `Auth/` and I can see every piece of the authentication system without looking anywhere else.

In a type-first structure, those same PIN files would be in `components/`, `utils/`, `services/`, and `screens/`. *Four folders for one concept.*

## The delete test

Remember that acid test? Here's what removing a feature looks like now.

**Type-first:** delete files from `screens/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `validation/`, and `__tests__/`. Miss a file and you've got an orphan. Miss an import and the app crashes.

**Feature-first:** delete `src/features/Auth/`, remove `authReducer` from the store config, remove the navigation routes. **Three steps.** The compiler tells me if I missed a reference.

I've done this. Removing a feature that touched 40+ files took less than a minute. Most of that minute was updating the navigation config.

## The contract that makes refactoring safe

Every feature exports only what the rest of the app needs. The `index.ts` at the feature root is the contract:

```typescript
// src/features/Auth/index.ts
export { authReducer, login, logout, selectIsAuthenticated } from './store';
export { AuthProvider } from './context';
export { useAuth } from './hooks';
export { LoginScreen, RegistrationScreen } from './screens';
```

PIN hashing, rate limiting, lockout logic: **none of that is exported.** It's internal to Auth. I can rewrite the *entire* PIN implementation, and as long as the exports don't change, nothing outside Auth notices.

The store config imports `authReducer`. Navigation imports the screens. That's it. The 80+ internal files are invisible to the rest of the codebase.

## Features never import from other features

This is the rule that holds everything together.

If Auth needs to know whether a profile is loaded, it reads from the Redux store via a selector. It doesn't import from `@app/features/Profile` directly. **The store is the only communication layer between features.**

Each feature owns its Redux slice. The root store combines them:

```typescript
import { authReducer } from '@app/features/Auth';
import { profileReducer } from '@app/features/Profile';
import { settingsReducer } from '@app/features/Settings/store';
import { educationReducer } from '@app/features/Education';
import { workExperienceReducer } from '@app/features/WorkExperience/store';

const rootReducer = combineReducers({
  settings: settingsReducer,
  auth: persistedAuthReducer,
  profile: profileReducer,
  workExperience: workExperienceReducer,
  education: educationReducer,
});
```

Break the no-cross-import rule once and you'll end up with circular dependencies within a week. Feature A imports from Feature B which imports from Feature C which imports from Feature A. The bundler throws a cryptic error and nobody knows where the cycle starts.

## Shared code earns its place

If a component is used by **one feature**, it stays in that feature. If two or more features need it, it moves to `src/shared/`. But the bar is high.

Every shared abstraction is a **coupling point**. The moment `AlertBox` lives in `shared/`, five features depend on its interface. Changing it means checking five features. I'd rather duplicate three lines in two features than create a shared utility that makes both harder to change independently.

The hooks that end up in `shared/` are the genuinely cross-cutting ones: `useAppColorScheme`, `useHapticFeedback`, `useReducedMotion`. Things every screen might need. Not things that *two screens* happen to need right now.

## Tests follow the same principle

Tests live next to the code they test. Auth store tests are in `Auth/store/__tests__/`. Auth validation tests are in `Auth/validation/__tests__/`. No separate test tree at the project root.

The one exception: **cross-feature integration tests**. Login flowing into profile loading. Settings changes propagating to the UI. These span multiple features, so they sit in `src/features/__tests__/`, outside any single feature.

```
src/features/__tests__/
├── CrossFeatureIntegration.rntl.tsx
├── OnboardingJourney.integration.rntl.tsx
└── ProfileCompletionJourney.integration.rntl.tsx
```

When a test breaks, I know exactly where to look. If it's in `Auth/store/__tests__/`, the problem is in the auth store. If it's in `features/__tests__/`, the problem is in how features interact. The location *is* the diagnosis.

## When to switch

If your app has three screens and no state management, *don't do this*. A flat list of screens and a couple of shared hooks is fine. Feature-first adds overhead that small projects don't need.

The crossover point is somewhere around **5 features with their own state**. Below that, the structure costs more than it saves. Above that, type-first becomes the thing slowing you down.

Open your `screens/` folder right now. Count the files. If you can't tell which ones belong together just by looking at the list, your structure has already stopped helping you.

## Setting it up

The structure above is a convention, not a tool, but two pieces of config make it stick.

**Path aliases.** Without them, you end up with `import { authReducer } from '../../../features/Auth'` everywhere. Add aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@app/*": ["./src/*"]
    }
  }
}
```

And in `babel.config.js` so the runtime resolves them:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@app': './src',
        },
      },
    ],
  ],
};
```

```bash
yarn add -D babel-plugin-module-resolver
```

Now `import { authReducer } from '@app/features/Auth'` resolves at compile time and runtime, regardless of where the importing file sits.

**ESLint rule for the no-cross-imports rule.** This is the one that actually keeps the structure honest. Without it, someone will eventually `import { profileSelector } from '@app/features/Profile'` from inside Auth, and the moment that ships, the structure starts collapsing.

```js
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@app/features/*/!(index)', '@app/features/*/*/**'],
          message: 'Import features only via their public index. Internals are private.',
        },
      ],
    }],
  },
  overrides: [
    {
      // Allow features to import from their own internals
      files: ['src/features/*/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      // Cross-feature integration tests are the only place cross-imports are allowed
      files: ['src/features/__tests__/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
```

The pattern blocks any import from inside another feature. The override allows imports from the feature's own `index.ts`. Cross-feature tests sit outside any single feature, so they get an explicit exemption.

That's it. Path aliases, one ESLint rule, and the discipline to keep each feature's internals private. The architecture survives because the tooling enforces what the convention asks for.

The full project source is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).
