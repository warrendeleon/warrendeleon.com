---
title: "i18n with automated parity tests in React Native"
description: "Set up type-safe i18n in React Native with device locale detection and Jest parity tests that catch missing translation keys before they ship."
publishDate: 2027-01-04
series: "Testing and Infrastructure"
tags: ["react-native", "i18n", "testing", "localisation"]
locale: en
heroImage: "/images/blog/i18n-parity-tests.webp"
heroImgPrompt: "Several plain tiles aligned in matching rows against a taller reference column, one slot in the grid left empty, a small globe and a magnifying lens"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#D3E7EE"
heroAlt: "Rows of tiles aligned against a reference column with one slot left empty, beside a globe and a magnifying lens"
campaign: "i18n-parity-tests"
relatedPosts: ["accessibility-testing-react-native", "setting-up-msw-v2-in-react-native", "feature-first-project-structure-react-native"]
---

## The translation nobody notices is missing

You add a new feature. You write the English strings. You translate them to Spanish, Catalan, Polish, and Tagalog. You ship.

Three weeks later, someone reports that the error message on the password reset screen is in English for Spanish users. You check the Spanish JSON file. The key exists for every other screen. Not this one. It was added to `en.json` and never copied to `es.json`.

This happens in every multilingual app. Translators aren't careless. There's no system catching it. The app doesn't crash. i18next falls back to English quietly. The user sees one English string in an otherwise Spanish interface and wonders if the app is broken.

Most teams skip i18n parity testing, and at one or two locales that's a reasonable call. You can eyeball the JSON in a PR review. At five locales it stops working. The manual diff becomes the bug source. A single test that compares every locale's keys against the reference locale catches the drift before it ships. If `en.json` has a key that `es.json` doesn't, the test fails. Run it on every PR.

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare workflow)
- TypeScript with the standard RN Babel config
- Jest configured for unit tests (the parity test runs in Jest)
- One reference locale (English in this post) that all others are validated against

If you're on Expo, swap `react-native-localize` for `expo-localization`. The resolution logic is the same shape.

One note on structure: the setup comes first and the parity test itself is in the second half. If your i18n already works, skip ahead to it.

## The setup

Five pieces. The locale JSONs, the i18next config, a resources file, a TypeScript declaration, and the parity test.

### Dependencies

```bash
yarn add i18next react-i18next react-native-localize
cd ios && pod install && cd ..
```

`react-native-localize` is a native module, so iOS needs a pod install. Skip it and the app errors on import with a missing-native-module message; there's no silent fallback.

| Library | What it does |
|---|---|
| `i18next` | Core i18n framework. Key lookup, interpolation, plurals, fallbacks. |
| `react-i18next` | React hooks (`useTranslation`) and context provider. |
| `react-native-localize` | Reads the device's preferred language. |

### The locale files

Each language gets a JSON file with identical key structure:

```json
// src/i18n/locales/en.json (abbreviated)
{
  "auth": {
    "login": {
      "title": "Welcome Back",
      "subtitle": "Log in to your account to continue",
      "email": "Email Address",
      "password": "Password",
      "forgotPassword": "Forgot password?",
      "loginButton": "Log In",
      "loginButtonHint": "Tap to log in to your account",
      "noAccount": "Don't have an account?",
      "registerLink": "Sign up",
      "errors": {
        "emailRequired": "Email is required",
        "emailInvalid": "Please enter a valid email address",
        "passwordRequired": "Password is required"
      }
    },
    "forgotPassword": {
      "title": "Reset Password",
      "successMessage": "We've sent a password reset link to {{email}}. Please check your inbox."
    }
  },
  "common": {
    "ok": "OK",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close"
  },
  "workExperience": {
    "clientsHint_one": "Tap to view {{count}} client",
    "clientsHint_other": "Tap to view {{count}} clients"
  }
}
```

Key patterns to notice:

- Nested structure: `auth.login.title` reads as a path. Keeps related strings together. Errors nest further: `auth.login.errors.emailRequired`.
- Interpolation: `{{email}}` is replaced at runtime. Same placeholder name across all locales.
- Pluralisation: `_one` and `_other` suffixes let i18next pick the right form based on `count`.
- Accessibility hints: separate keys for screen reader text (`loginButtonHint`) so translators know the context.

The Spanish file has the same keys, different values:

```json
// src/i18n/locales/es.json (abbreviated)
{
  "auth": {
    "login": {
      "title": "Bienvenido de nuevo",
      "subtitle": "Inicia sesión en tu cuenta para continuar",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "forgotPassword": "¿Olvidaste tu contraseña?",
      "loginButton": "Iniciar sesión",
      "loginButtonHint": "Toca para iniciar sesión en tu cuenta",
      "noAccount": "¿No tienes una cuenta?",
      "registerLink": "Regístrate",
      "errors": {
        "emailRequired": "El correo electrónico es obligatorio",
        "emailInvalid": "Por favor introduce un correo electrónico válido",
        "passwordRequired": "La contraseña es obligatoria"
      }
    }
  }
}
```

Same keys. Same nesting. Same interpolation variables. Different language. This structural parity is what the automated test verifies.

### The i18n configuration

```typescript
// src/i18n/index.ts
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'react-native-localize';
import i18next from 'i18next';
import { resources } from './resources';

export { resources };
export const defaultNS = 'translation';

export type LanguageTagInfo = { languageTag: string; isRTL: boolean };

export interface LocalizeModule {
  getLocales?: () => Array<{
    languageTag: string;
    languageCode?: string;
  }>;
}

const fallback: LanguageTagInfo = { languageTag: 'en', isRTL: false };

export const resolveLanguageTag = (localize: LocalizeModule): string => {
  const supported = Object.keys(resources);
  const locales = localize.getLocales?.() ?? [];
  const primary = locales[0];

  if (primary) {
    const { languageTag, languageCode } = primary;

    // 1) Exact tag match (e.g. "en", "es")
    if (languageTag && supported.includes(languageTag)) {
      return languageTag;
    }

    // 2) Base language match (e.g. "es-ES" -> "es")
    if (languageCode) {
      const baseMatch = supported.find(code => code === languageCode);
      if (baseMatch) {
        return baseMatch;
      }
    }
  }

  // 3) Fallback to English if nothing matches
  return fallback.languageTag;
};

const languageTag = resolveLanguageTag({ getLocales });

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: languageTag,
  fallbackLng: 'en',
  defaultNS,
  resources,
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
```

The language resolution checks the device's primary locale with a three-step fallback:

1. Exact match: device primary locale is `es`, we support `es`. Use it.
2. Base language: device says `es-MX`, no exact tag, but base code `es` matches. Use it.
3. Otherwise fall back to English. Device says `de`, we don't support German, so the user gets English.

The function takes a `LocalizeModule` parameter instead of calling `getLocales` directly. This makes it testable: in tests, you pass a mock. In production, you pass the real `{ getLocales }` from react-native-localize.

`escapeValue: false` is important for React Native. i18next escapes HTML by default (for web). React Native doesn't render HTML, so escaping is unnecessary and can corrupt strings with special characters.

`compatibilityJSON: 'v4'` is a leftover from the v3 to v4 migration. In current i18next it's the default and the only accepted value, so it changes nothing; the `_one`/`_other` plural keys work with or without it.

### The resources file

```typescript
// src/i18n/resources.ts
import ca from './locales/ca.json';
import en from './locales/en.json';
import es from './locales/es.json';
import pl from './locales/pl.json';
import tl from './locales/tl.json';

export const resources = {
  ca: { translation: ca },
  en: { translation: en },
  es: { translation: es },
  pl: { translation: pl },
  tl: { translation: tl },
} as const;

export type Resources = typeof resources;
```

`as const` makes the type narrow. TypeScript knows the exact shape of every translation key. This feeds into the type declaration.

### TypeScript type safety

```typescript
// src/types/i18next.d.ts
import 'i18next';
import { defaultNS, resources } from '@app/i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}
```

This module augmentation tells TypeScript: "the `t()` function only accepts keys that exist in `en.json`." If you type `t('auth.login.titl')` (typo), the compiler catches it. Full autocomplete in your IDE.

## The parity test

This is the core of the post. One test file that prevents missing translations from shipping.

```typescript
// src/i18n/__tests__/localesParity.rntl.ts
import ca from '../locales/ca.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import pl from '../locales/pl.json';
import tl from '../locales/tl.json';

type AnyRecord = Record<string, unknown>;

const collectKeys = (obj: AnyRecord, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return collectKeys(value as AnyRecord, path);
    }

    return [path];
  });

describe('i18n locales', () => {
  const enKeys = collectKeys(en as AnyRecord).sort();

  it('en and es have the same keys', () => {
    const esKeys = collectKeys(es as AnyRecord).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it('en and ca have the same keys', () => {
    const caKeys = collectKeys(ca as AnyRecord).sort();
    expect(caKeys).toEqual(enKeys);
  });

  it('en and pl have the same keys', () => {
    const plKeys = collectKeys(pl as AnyRecord).sort();
    expect(plKeys).toEqual(enKeys);
  });

  it('en and tl have the same keys', () => {
    const tlKeys = collectKeys(tl as AnyRecord).sort();
    expect(tlKeys).toEqual(enKeys);
  });
});
```

`collectKeys` recursively walks the JSON and collects every key path: `auth.login.title`, `auth.login.email`, `common.ok`, etc. Both arrays are sorted before comparison so key order in the JSON files doesn't matter. The test compares each locale's key list against English.

If Spanish is missing `auth.forgotPassword.successMessage`, the test output shows exactly which key is missing. Because both arrays are sorted, the diff is easy to read:

```
Expected: [..., "auth.forgotPassword.successMessage", "auth.forgotPassword.successTitle", ...]
Received: [..., "auth.forgotPassword.successTitle", ...]
```

No guessing. No manual comparison. One test, run on every PR.

What it doesn't catch: empty string values, or English text copy-pasted into `es.json` untranslated. Key parity is structural, not semantic; a human still has to read the translations.

## Running it

```bash
yarn jest src/i18n/__tests__/localesParity.rntl.ts
```

```text
PASS  src/i18n/__tests__/localesParity.rntl.ts
  i18n locales
    ✓ en and es have the same keys (4 ms)
    ✓ en and ca have the same keys (3 ms)
    ✓ en and pl have the same keys (3 ms)
    ✓ en and tl have the same keys (3 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

When a key is missing in a locale, the failure message points at the exact key path. No manual diff required. Add this to your CI step list and missing translations stop reaching production.

## Edge case tests

The parity test catches structural drift. But i18n has more failure modes than missing keys.

### Language resolution

```typescript
it('resolves regional variants to base language', () => {
  // es-MX should resolve to es, not fall back to en
  const resolved = resolveLanguageTag({
    getLocales: () => [{ languageTag: 'es-MX', languageCode: 'es' }],
  });
  expect(resolved).toBe('es');
});

it('falls back to English for unsupported languages', () => {
  const resolved = resolveLanguageTag({
    getLocales: () => [{ languageTag: 'de-DE', languageCode: 'de' }],
  });
  expect(resolved).toBe('en');
});
```

The `resolveLanguageTag` takes a `LocalizeModule` parameter, so tests pass a mock object directly instead of spying on a global. This makes the function pure and easy to test.

### Interpolation

```typescript
it('handles missing interpolation variables gracefully', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: undefined,
  });
  // i18next renders the string safely even with undefined variables
  expect(typeof result).toBe('string');
});

it('handles special characters in interpolation safely', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: '<script>alert("xss")</script>',
  });
  // escapeValue is false, but React Native doesn't interpret HTML
  expect(result).toContain('<script>');
});
```

### Language switching

```typescript
it('switches language dynamically', async () => {
  await i18next.changeLanguage('es');
  expect(i18next.t('auth.login.title')).toBe('Bienvenido de nuevo');

  await i18next.changeLanguage('en');
  expect(i18next.t('auth.login.title')).toBe('Welcome Back');
});
```

### Configuration verification

```typescript
it('has correct configuration', () => {
  expect(i18next.options.fallbackLng).toContain('en');
  expect(i18next.options.defaultNS).toBe('translation');
  expect(i18next.options.compatibilityJSON).toBe('v4');
  expect(i18next.options.interpolation?.escapeValue).toBe(false);
  expect(i18next.isInitialized).toBe(true);
});
```

## Using translations in components

The `useTranslation` hook provides the `t()` function for reading translations and `i18n` for changing language:

```typescript
import { useTranslation } from 'react-i18next';

import { useAppDispatch } from '@app/store';
import { setLanguage } from '@app/store/settingsSlice';

export const LanguageScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();

  const languages = [
    { code: 'en', label: t('language.english') },
    { code: 'es', label: t('language.spanish') },
    { code: 'ca', label: t('language.catalan') },
    { code: 'pl', label: t('language.polish') },
    { code: 'tl', label: t('language.tagalog') },
  ];

  const handleLanguageSelect = async (code: string) => {
    dispatch(setLanguage(code));
    await i18n.changeLanguage(code);
  };

  // ...
};
```

Language preference is persisted via Redux Persist (see [Tiered secure storage](/blog/tiered-secure-storage-react-native/) for how that works). On app launch, the persisted language syncs with i18next:

```typescript
// App.tsx
const { i18n } = useTranslation();
const persistedLanguage = useAppSelector(selectLanguage);

useEffect(() => {
  if (persistedLanguage && i18n.language !== persistedLanguage) {
    i18n.changeLanguage(persistedLanguage);
  }
}, [persistedLanguage, i18n]);
```

## Common pitfalls

Don't concatenate translated text. `t('hello') + ' ' + name` breaks in languages where the grammar around a name changes the sentence. Polish declines names, and possessive constructions differ across the locales in this post, so the sentence has to be written as a whole. Use interpolation: `t('greeting', { name })`, and let each locale place `{{name}}` where its grammar needs it.

Don't assume pluralisation is just "add an s". English has two forms (one/other). Polish has four. Arabic has six. i18next's `_one`/`_other`/`_few`/`_many` suffixes handle this on the v4 JSON format, which is the default in current i18next.

Don't ship without the parity test. It takes five minutes to write. It catches every missing key. The alternative is finding out from users in production.

Don't hardcode locale-specific formatting. Dates, numbers, and currencies format differently per locale. Use `Intl.NumberFormat` and `Intl.DateTimeFormat` with the current i18next language, not string manipulation.

Don't forget accessibility hints. Screen readers announce buttons and inputs differently. A hint that makes sense in English might be confusing in Spanish. Separate accessibility keys let translators give context-appropriate hints.

## The file structure

```
src/
  i18n/
    index.ts                    # i18next config, language resolution
    resources.ts                # Imports all locales, exports typed resources
    locales/
      en.json                   # English (reference locale)
      es.json                   # Spanish
      ca.json                   # Catalan
      pl.json                   # Polish
      tl.json                   # Tagalog
    __tests__/
      localesParity.rntl.ts     # Key parity test
      localeEdgeCases.rntl.ts   # Resolution, interpolation, switching
  types/
    i18next.d.ts                # TypeScript module augmentation
```

## One morning, one test, zero missed translations

The whole setup is four moving parts: i18next configuration, five JSON files, one type declaration, one parity test. After that, adding a new language is: copy `en.json`, translate it, add it to `resources.ts`, add it to the parity test. The test catches any missed keys immediately.

In my project, the parity test has caught missing keys multiple times during development. Every one of them would have been a silent English string in a non-English interface, the one multilingual bug worse than a bad translation, because nobody reports a string they never saw. The test runs in under a second and costs nothing to maintain.

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full i18n configuration, locale files, type declarations, and parity tests are all in the repo.*
