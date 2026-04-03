---
title: "i18n na may automated parity tests sa React Native"
description: "5 wika na may test na nagve-verify na magkapareho ang keys ng bawat locale. Paano mag-set up ng i18next na may TypeScript type safety, device locale detection, at automated parity testing na humuhuling mga nawawalang translations bago mag-ship."
publishDate: 2026-06-08
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: tl
heroImage: "/images/blog/i18n-parity-tests.jpg"
heroAlt: "i18n na may automated parity tests sa React Native"
---

## Ang translation na hindi napapansin na nawawala

Nagdagdag ka ng bagong feature. Sinulat mo ang English strings. In-translate mo sa Spanish, Catalan, Polish, at Tagalog. Ini-ship mo.

Pagkaraan ng tatlong linggo, may nag-report na ang error message sa password reset screen ay nasa English para sa Spanish users. Tiningnan mo ang Spanish JSON file. Nandoon ang key sa lahat ng ibang screen. Pero hindi dito. Idinagdag ito sa `en.json` at hindi na-copy sa `es.json`.

Nangyayari ito sa bawat multilingual app. Hindi dahil pabaya ang mga translators, kundi dahil walang system na humuhuling nito. Hindi nagca-crash ang app. Tahimik na bumabalik sa English ang i18next. Nakikita ng user ang isang English string sa isang otherwise Spanish na interface at nagtataka kung sira ang app.

> 💡 **Ang solusyon:** isang test na nagko-compare ng keys ng bawat locale laban sa reference locale. Kung may key ang `en.json` na wala sa `es.json`, babagsak ang test. Patakbuhin ito sa bawat PR.

## Ang setup

Limang files ang bumubuo ng buong i18n system.

### Dependencies

```bash
yarn add i18next react-i18next react-native-localize
```

| Library | Ano ang ginagawa nito |
|---|---|
| `i18next` | Core i18n framework. Key lookup, interpolation, plurals, fallbacks. |
| `react-i18next` | React hooks (`useTranslation`) at context provider. |
| `react-native-localize` | Binabasa ang preferred language ng device. |

### Ang locale files

Bawat wika ay may JSON file na may magkaparehong key structure:

```json
// src/i18n/locales/en.json (pinaikli)
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

Mga pattern na dapat pansinin:

- ✅ **Nested structure.** `auth.login.title` ay nababasa bilang path. Pinagsasama ang magkakaugnay na strings. Ang errors ay mas malalim pa: `auth.login.errors.emailRequired`
- ✅ **Interpolation.** `{{email}}` ay pinapalitan sa runtime. Parehong placeholder name sa lahat ng locales.
- ✅ **Pluralisation.** `_one` at `_other` suffixes ang nagpapahintulot sa i18next na piliin ang tamang form batay sa `count`.
- ✅ **Accessibility hints.** Hiwalay na keys para sa screen reader text (`loginButtonHint`) para alam ng mga translators ang context.

Ang Spanish file ay may parehong keys, magkaibang values:

```json
// src/i18n/locales/es.json (pinaikli)
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

Parehong keys. Parehong nesting. Parehong interpolation variables. Ibang wika. Ang structural parity na ito ang vine-verify ng automated test.

### Ang i18n configuration

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

    // 1) Exact tag match (hal. "en", "es")
    if (languageTag && supported.includes(languageTag)) {
      return languageTag;
    }

    // 2) Base language match (hal. "es-ES" -> "es")
    if (languageCode) {
      const baseMatch = supported.find(code => code === languageCode);
      if (baseMatch) {
        return baseMatch;
      }
    }
  }

  // 3) Fallback sa English kung walang tugma
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

Ang language resolution ay chine-check ang primary locale ng device gamit ang three-step fallback:

1. **Exact match.** Ang primary locale ng device ay `es`, sinusuportahan natin ang `es`. Gamitin ito.
2. **Base language.** Ang device ay nagsasabing `es-MX`, hindi natin sinusuportahan ang exact tag na iyon, pero ang base code na `es` ay tumutugma. Gamitin ito.
3. **Fallback.** Ang device ay nagsasabing `de`, hindi natin sinusuportahan ang German. Bumalik sa English.

Ang function ay tumatanggap ng `LocalizeModule` parameter sa halip na direktang tawagan ang `getLocales`. Ginagawa nitong testable: sa tests, nagpapasa ka ng mock. Sa production, pinapasa mo ang tunay na `{ getLocales }` mula sa react-native-localize.

Ang `escapeValue: false` ay mahalaga para sa React Native. Ine-escape ng i18next ang HTML bilang default (para sa web). Hindi nagre-render ng HTML ang React Native, kaya hindi kailangan ang escaping at puwedeng masira ang mga strings na may special characters.

Ang `compatibilityJSON: 'v4'` ay nagpe-enable ng tamang plural handling. Kung wala ito, hindi gumagana nang tama ang plural keys tulad ng `_one`/`_other`.

### Ang resources file

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

Ang `as const` ay nagpapakitid ng type. Alam ng TypeScript ang exact shape ng bawat translation key. Ini-feed nito ang type declaration.

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

Ang module augmentation na ito ang nagsasabi sa TypeScript: "ang `t()` function ay tumatanggap lang ng keys na nasa `en.json`." Kung nag-type ka ng `t('auth.login.titl')` (typo), mahuhuli ito ng compiler. Full autocomplete sa iyong IDE.

## Ang parity test

Ito ang core ng post. Isang test file na pumipigil sa mga nawawalang translations na ma-ship.

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

Rekursibong nila-lakad ng `collectKeys` ang JSON at kinokolekta ang bawat key path: `auth.login.title`, `auth.login.email`, `common.ok`, atbp. Parehong array ay sine-sort bago i-compare kaya hindi mahalaga ang pagkakasunod-sunod ng keys sa JSON files. Kino-compare ng test ang key list ng bawat locale laban sa English.

Kung kulang ang Spanish ng `auth.forgotPassword.successMessage`, ipinapakita ng test output kung aling key ang nawawala. Dahil parehong array ay naka-sort, madaling basahin ang diff:

```
Expected: [..., "auth.forgotPassword.successMessage", "auth.forgotPassword.successTitle", ...]
Received: [..., "auth.forgotPassword.successTitle", ...]
```

Walang hulaan. Walang manual na paghahambing. Isang test, pinapatakbo sa bawat PR.

## Edge case tests

Ang parity test ay humuhuling structural drift. Pero ang i18n ay may mas maraming failure modes kaysa sa nawawalang keys.

### Language resolution

```typescript
it('resolves regional variants to base language', () => {
  // ang es-MX ay dapat mag-resolve sa es, hindi bumalik sa en
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

Ang `resolveLanguageTag` ay tumatanggap ng `LocalizeModule` parameter, kaya ang tests ay nagpapasa ng mock object nang direkta sa halip na mag-spy sa isang global. Ginagawa nitong pure at madaling i-test ang function.

### Interpolation

```typescript
it('handles missing interpolation variables gracefully', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: undefined,
  });
  // ligtas na nire-render ng i18next ang string kahit may undefined variables
  expect(typeof result).toBe('string');
});

it('handles special characters in interpolation safely', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: '<script>alert("xss")</script>',
  });
  // false ang escapeValue, pero hindi nag-i-interpret ng HTML ang React Native
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

## Paggamit ng translations sa components

Ang `useTranslation` hook ay nagbibigay ng `t()` function para sa pagbabasa ng translations at `i18n` para sa pagpapalit ng wika:

```typescript
import { useTranslation } from 'react-i18next';

export const LanguageScreen: React.FC = () => {
  const { t, i18n } = useTranslation();

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

Ang language preference ay pine-persist sa pamamagitan ng Redux Persist (tingnan ang [Tiered secure storage](/blog/tiered-secure-storage-react-native/) para sa kung paano ito gumagana). Sa app launch, sini-sync ng persisted language ang i18next:

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

## Mga karaniwang pagkakamali

**Huwag gumamit ng string concatenation para sa translated text.** Ang `t('hello') + ' ' + name` ay nasisira sa mga wikang iba ang word order. Gumamit ng interpolation: `t('greeting', { name })` na may `"greeting": "Hello, {{name}}"` sa English at `"greeting": "{{name}}, merhaba"` sa Turkish.

**Huwag mag-assume na ang pluralisation ay "magdagdag lang ng s".** Dalawang form ang English (one/other). Apat ang Polish. Anim ang Arabic. Hina-handle ito ng `_one`/`_other`/`_few`/`_many` suffixes ng i18next, pero kung gumagamit ka lang ng `compatibilityJSON: 'v4'`.

**Huwag mag-ship nang walang parity test.** Limang minuto lang ang pagsulat nito. Hinuhuli nito ang bawat nawawalang key. Ang alternatibo ay malalaman mo na lang mula sa mga users sa production.

**Huwag mag-hardcode ng locale-specific formatting.** Iba ang format ng dates, numbers, at currencies sa bawat locale. Gumamit ng `Intl.NumberFormat` at `Intl.DateTimeFormat` gamit ang kasalukuyang i18next language, hindi string manipulation.

**Huwag kalimutan ang accessibility hints.** Iba ang pag-announce ng screen readers sa buttons at inputs. Ang hint na may katuturan sa English ay puwedeng nakakalito sa Spanish. Hiwalay na accessibility keys ang nagpapahintulot sa mga translators na magbigay ng context-appropriate hints.

## Ang file structure

```
src/
  i18n/
    index.ts                    # i18next config, language resolution
    resources.ts                # Nag-i-import ng lahat ng locales, nag-e-export ng typed resources
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

## Isang umaga, isang test, zero na nawawalang translations

Isang umaga ang setup. i18next configuration, limang JSON files, isang type declaration, isang parity test. Pagkatapos noon, ang pagdadagdag ng bagong wika ay: kopyahin ang `en.json`, i-translate, idagdag sa `resources.ts`, idagdag sa parity test. Agad na hinuhuli ng test ang anumang nawawalang keys.

Sa aking project, ilang beses nang nahuli ng parity test ang mga nawawalang keys habang nagde-develop. Bawat isa sa mga iyon ay magiging tahimik na English string sa isang non-English na interface. Tumatakbo ang test sa ilalim ng isang segundo at walang gastos sa maintenance.

> Ang tanging multilingual bug na mas masahol pa sa masamang translation ay ang nawawalang translation.

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Ang buong i18n configuration, locale files, type declarations, at parity tests ay nasa repo.*
