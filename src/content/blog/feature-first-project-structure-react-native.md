---
title: "Why I use feature-first project structure in React Native"
description: "An argument for organising React Native projects by feature, not by type. The delete test, import boundaries, where shared code lives."
publishDate: 2026-05-25
series: "React Native Foundations"
tags: ["react-native", "architecture", "project-structure", "opinion"]
locale: en
heroImage: "/images/blog/feature-first-rn.webp"
heroAlt: "Feature-first project structure in React Native"
heroImgPrompt: "Scattered pieces regrouped into self-contained sealed boxes, each with a single doorway and none reaching into another, around one shared central hub"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#D9E8D0"
campaign: "feature-first-structure"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing"]
---

The short version: below roughly five features with their own state, type-first folders (`screens/`, `hooks/`, `services/`) are fine. Above that, the same layout starts costing you more than it saves. This post is about why, and where the line sits.

## 85 files for one feature

That's how many TypeScript files my Auth feature has. Six screens, a Redux store, a React context, a custom hook, PIN components with Storybook stories, form validation schemas against a **common password blacklist**, rate limiting, a lockout service, and tests at every level.

In most React Native projects, those 85 files would be scattered across **seven different folders**. Screens in one place, hooks in another, the store slice somewhere else, validation in yet another. To understand how authentication works, you'd open seven folders and mentally reconstruct the relationships between files that sit nowhere near each other.

That layout looks tidy at three or four screens. Past that, the relationships go invisible. The hook for a feature lives nowhere near the screen that uses it. The validation rules sit in a separate folder from the form they validate. Reviewing a feature means scanning multiple alphabetised lists looking for the pieces.

## The type-first layout, and why it's the default

You know this one:

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

Files grouped by kind. **Type-first.** Most React Native tutorials lay things out this way, and there are good reasons for it. New contributors recognise the shape instantly. A reviewer skimming a take-home test can spot `screens/`, `hooks/`, `components/` without thinking. The folder names map onto the framework's vocabulary, so the mental model carries from one project to the next. For three or four screens, that's enough structure to keep things in order. If you've ever done a take-home tech test, [your folder structure is one of the first things a reviewer looks at](/blog/how-to-pass-a-react-native-tech-test/), and type-first is the safe pick there.

The shape holds while the app is small. Then you add authentication with PIN setup, email verification, password recovery. You add profile management with picture uploads, account editing, password changes. Suddenly `screens/` has 25 files, and finding the hook that belongs to the profile picture upload means scanning an alphabetical list of *every hook in the app*.

Now try to **delete a feature**. Remove the screen from `screens/`. Find its hook in `hooks/`. Its service in `services/`. Its store slice. Its components. Its validation schema. Its tests, sitting in a separate `__tests__/` tree. Miss one file and you've got dead code that'll sit there for months.

That's the test. If removing a feature takes longer than building one, the structure is working against you.

## One folder per feature

My app has 13 features. Each lives in a single directory:

```
src/features/
├── Auth/           # 85 files. Login, registration, PIN, lockout
├── Profile/        # API, store, picture upload, 5 screens
├── Settings/       # Theme, language, 3 screens
├── Education/      # Store, API, 1 screen
├── WorkExperience/ # Store, API, 4 screens
├── Home/           # 1 screen, 1 export
├── Legal/          # Privacy policy, T&Cs
├── Permissions/    # Camera, photo library, denial screens
├── MockStatus/     # Dev-only MSW status screen
├── PDF/            # PDF viewer
├── Placeholder/    # Chat, booking placeholders
├── WebView/        # Generic webview screen
└── Splash/         # Splash screen
```

Everything else sits outside features: `shared/` for reusable components and hooks, `store/` for the Redux config, `navigation/`, `httpClients/`, `utils/`, `i18n/`.

The simplest feature is two files. The most complex is 85. **Each one only has the folders it actually needs.** No empty `services/` directory because a template said it should be there.

## What 85 files look like when they're co-located

```
src/features/Auth/
├── __tests__/
├── api/
│   └── __tests__/
├── components/
│   ├── __tests__/
│   ├── PINDot.tsx
│   ├── PINDot.stories.tsx
│   ├── PINInput.tsx
│   ├── PINInput.stories.tsx
│   ├── PINKeypad.tsx
│   └── PINKeypad.stories.tsx
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
│   ├── __tests__/
│   ├── emailResendRateLimiter.ts
│   ├── pinHashing.ts
│   ├── pinValidation.ts
│   └── rateLimiter.ts
├── validation/
│   ├── __tests__/
│   ├── customRules.ts
│   ├── loginSchema.ts
│   ├── passwordRecoverySchema.ts
│   └── registrationSchema.ts
├── EmailVerificationScreen.tsx
├── ForgotPasswordScreen.tsx
├── LoginScreen.tsx
├── PINSetupScreen.tsx
├── RegistrationScreen.tsx
├── ResetPasswordScreen.tsx
└── index.ts
```

PIN hashing sits next to PIN validation, next to the PIN components, next to the PIN setup screen. **The relationship between files is visible in the folder layout.** I open `Auth/` and I can see every piece of the authentication system without going anywhere else.

In a type-first structure, those same PIN files would be in `components/`, `utils/`, `services/`, and `screens/`. *Four folders for one concept.*

## The delete test in practice

The acid test from earlier. What does it actually look like for each layout?

**Type-first:** delete files from `screens/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `validation/`, and `__tests__/`. Miss a file and you've got an orphan. Miss an import and the app crashes at boot.

**Feature-first:** delete `src/features/Auth/`, remove `authReducer` from the store config, remove the navigation routes. **Three steps.** The compiler tells me if I missed a reference.

I've done this. Removing a feature that touched 40+ files took less than a minute. Most of that minute was the navigation config.

## The contract that makes refactoring safe

Every feature exports only what the rest of the app needs. The `index.ts` at the feature root is the contract:

```typescript
// src/features/Auth/index.ts
export { authReducer, login, logout, selectIsAuthenticated } from './store';
export { AuthProvider } from './context';
export { useAuth } from './hooks';
export { LoginScreen } from './LoginScreen';
export { RegistrationScreen } from './RegistrationScreen';
```

PIN hashing, rate limiting, lockout logic. **None of that is exported.** It's private to Auth. I can rewrite the *entire* PIN implementation, and as long as the exports don't change, nothing outside Auth notices.

The store config imports `authReducer`. Navigation imports the screens. That's it. The 80+ internal files are invisible to the rest of the codebase.

## Features never import from other features

This is the rule that holds everything together.

If Auth needs to know whether a profile is loaded, it reads from the Redux store via a selector. It doesn't import from `@app/features/Profile` directly. **The store is the only communication layer between features.**

Each feature owns its Redux slice. The root store combines them:

```typescript
import { authReducer } from '@app/features/Auth';
import { profileReducer } from '@app/features/Profile';
import { settingsReducer } from '@app/features/Settings';
import { educationReducer } from '@app/features/Education';
import { workExperienceReducer } from '@app/features/WorkExperience';

const rootReducer = combineReducers({
  settings: settingsReducer,
  auth: persistedAuthReducer,
  profile: profileReducer,
  workExperience: workExperienceReducer,
  education: educationReducer,
});
```

Break the no-cross-import rule once and you'll end up with circular dependencies within a week. Feature A imports from Feature B, which imports from Feature C, which imports from Feature A. The bundler throws a cryptic error and nobody knows where the cycle starts.

## Shared code earns its place

If a component is used by **one feature**, it stays in that feature. If two or more features need it, it moves to `src/shared/`. The bar is high.

Every shared abstraction is a **coupling point**. The moment `AlertBox` lives in `shared/`, five features depend on its interface. Changing it means checking all five. I'd rather duplicate three lines in two features than create a shared utility that makes both harder to change on their own.

The hooks that end up in `shared/` are the genuinely cross-cutting ones: `useAppColorScheme`, `useHapticFeedback`, `useReducedMotion`, `useCameraPermission`, `usePhotoLibraryPermission`. Things any screen might need. Not things that *two screens* happen to need right now.

## Tests follow the same rule

Tests live next to the code they test. Auth store tests are in `Auth/store/__tests__/`. Auth validation tests are in `Auth/validation/__tests__/`. No separate test tree at the project root.

The one exception: **cross-feature integration tests**. Login flowing into profile loading. Settings changes propagating to the UI. Background tasks running across features. These span multiple features, so they sit in `src/features/__tests__/`, outside any single feature.

```
src/features/__tests__/
├── BackgroundTasks.integration.rntl.tsx
├── CrossFeatureIntegration.rntl.tsx
├── OnboardingJourney.integration.rntl.tsx
├── ProfileCompletionJourney.integration.rntl.tsx
└── RealtimeSubscription.integration.rntl.tsx
```

When a test breaks, the location tells me where to look. If it's in `Auth/store/__tests__/`, the problem is in the auth store. If it's in `features/__tests__/`, the problem is in how features interact. The location *is* the diagnosis.

## When to switch

If your app has three screens and no state management, *don't do this*. A flat list of screens and a couple of shared hooks is fine. Feature-first adds overhead that small projects don't need.

The crossover sits around **five features with their own state**. Below that, the structure costs more than it saves. Above that, type-first becomes the thing slowing you down.

Open your `screens/` folder right now. Count the files. If you can't tell which ones belong together just by looking at the list, the structure has already stopped helping you.

## Setting it up

The structure above is a convention, not a tool. Two pieces of config make it stick.

**Path aliases.** Without them, you end up with `import { authReducer } from '../../../features/Auth'` everywhere. Add aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@app": ["src"],
      "@app/*": ["src/*"]
    }
  }
}
```

And in `babel.config.js` so the runtime resolves them:

```js
module.exports = {
  presets: ['@react-native/babel-preset'],
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

**An ESLint rule to keep the boundary honest.** Path aliases alone won't stop someone from writing `import { profileSelector } from '@app/features/Profile'` inside Auth. Once that ships, the structure starts collapsing. A `no-restricted-imports` rule pins the boundary:

```js
// eslint.config.mjs
export default [
  {
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@app/features/*/!(index)', '@app/features/*/*/**'],
            message: 'Import another feature through its public index (@app/features/X), not its internals. Within a feature, use relative imports.',
          },
        ],
      }],
    },
  },
  {
    // Tests can reach into a feature's internals to set up state.
    files: ['**/__tests__/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
```

The pattern blocks any import that reaches into another feature's internals. Within a feature you use relative imports (`./store`, `../components`), which never match the alias pattern, so a feature can always reach its own code. The one exemption is tests, which often need to reach inside a feature to set up state.

That's it. Path aliases, one ESLint rule, and the discipline to keep each feature's internals private. The architecture survives because the tooling enforces what the convention asks for.

The full project source is at [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).
