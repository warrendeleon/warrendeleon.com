---
title: "i18n amb tests automatitzats de paritat a React Native"
description: "5 idiomes amb un test que verifica que cada locale té claus idèntiques. Com configurar i18next amb seguretat de tipus TypeScript, detecció de l'idioma del dispositiu i tests automatitzats de paritat que detecten traduccions que falten abans de publicar."
publishDate: 2026-06-15
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: ca
heroImage: "/images/blog/i18n-parity-tests.jpg"
heroAlt: "i18n amb tests automatitzats de paritat a React Native"
campaign: "i18n-parity-tests"
---

## La traducció que ningú nota que falta

Afegeixes una funcionalitat nova. Escrius les cadenes en anglès. Les tradueixes al castellà, català, polonès i tagal. Publiques.

Tres setmanes més tard, algú reporta que el missatge d'error a la pantalla de restabliment de contrasenya surt en anglès per als usuaris de castellà. Compoves el fitxer JSON de castellà. La clau existeix per a totes les altres pantalles. Excepte aquesta. Es va afegir a `en.json` i no es va copiar mai a `es.json`.

Això passa a totes les aplicacions multilingües. No perquè els traductors siguin descurats, sinó perquè no hi ha cap sistema que ho detecti. L'aplicació no peta. i18next fa fallback silenciosament a l'anglès. L'usuari veu una cadena en anglès en una interfície que hauria de ser en castellà i es pregunta si l'aplicació està trencada.

> 💡 **La solució:** un únic test que compara les claus de cada locale amb el locale de referència. Si `en.json` té una clau que `es.json` no té, el test falla. Executa'l a cada PR.

## La configuració

Cinc fitxers fan funcionar tot el sistema d'i18n.

### Dependències

```bash
yarn add i18next react-i18next react-native-localize
```

| Biblioteca | Què fa |
|---|---|
| `i18next` | Framework principal d'i18n. Cerca de claus, interpolació, plurals, fallbacks. |
| `react-i18next` | Hooks de React (`useTranslation`) i proveïdor de context. |
| `react-native-localize` | Llegeix l'idioma preferit del dispositiu. |

### Els fitxers de locale

Cada idioma té un fitxer JSON amb estructura de claus idèntica:

```json
// src/i18n/locales/en.json (abreujat)
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

Patrons clau a notar:

- ✅ **Estructura imbricada.** `auth.login.title` es llegeix com un camí. Manté les cadenes relacionades juntes. Els errors s'imbriquen més: `auth.login.errors.emailRequired`
- ✅ **Interpolació.** `{{email}}` es reemplaça en temps d'execució. El mateix nom de placeholder a tots els locales.
- ✅ **Pluralització.** Els sufixos `_one` i `_other` permeten que i18next triï la forma correcta segons `count`.
- ✅ **Indicacions d'accessibilitat.** Claus separades per al text del lector de pantalla (`loginButtonHint`) perquè els traductors sàpiguen el context.

El fitxer en castellà té les mateixes claus, valors diferents:

```json
// src/i18n/locales/es.json (abreujat)
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

Mateixes claus. Mateixa imbricació. Mateixes variables d'interpolació. Idioma diferent. Aquesta paritat estructural és el que el test automatitzat verifica.

### La configuració d'i18n

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

    // 1) Coincidència exacta de tag (p. ex. "en", "es")
    if (languageTag && supported.includes(languageTag)) {
      return languageTag;
    }

    // 2) Coincidència per idioma base (p. ex. "es-ES" -> "es")
    if (languageCode) {
      const baseMatch = supported.find(code => code === languageCode);
      if (baseMatch) {
        return baseMatch;
      }
    }
  }

  // 3) Fallback a anglès si no hi ha coincidència
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

La resolució d'idioma comprova el locale principal del dispositiu amb un fallback de tres passos:

1. **Coincidència exacta.** El locale principal del dispositiu és `es`, el suportem. S'utilitza.
2. **Idioma base.** El dispositiu diu `es-MX`, no suportem aquest tag exacte, però el codi base `es` coincideix. S'utilitza.
3. **Fallback.** El dispositiu diu `de`, no suportem l'alemany. Fa fallback a l'anglès.

La funció rep un paràmetre `LocalizeModule` en comptes de cridar `getLocales` directament. Això la fa verificable: als tests, passes un objecte simulat. En producció, passes el `{ getLocales }` real de react-native-localize.

`escapeValue: false` és important per a React Native. i18next escapa HTML per defecte (per a web). React Native no renderitza HTML, així que l'escapament és innecessari i pot corrompre cadenes amb caràcters especials.

`compatibilityJSON: 'v4'` activa la gestió correcta de plurals. Sense això, les claus de plural com `_one`/`_other` no funcionen correctament.

### El fitxer de recursos

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

`as const` fa que el tipus sigui estricte. TypeScript coneix la forma exacta de cada clau de traducció. Això alimenta la declaració de tipus.

### Seguretat de tipus amb TypeScript

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

Aquesta augmentació de mòdul diu a TypeScript: "la funció `t()` només accepta claus que existeixin a `en.json`." Si escrius `t('auth.login.titl')` (error tipogràfic), el compilador ho detecta. Autocompletat complet al teu IDE.

## El test de paritat

Aquesta és la part central de l'article. Un fitxer de test que impedeix que es publiquin traduccions que falten.

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

`collectKeys` recorre recursivament el JSON i recull tots els camins de claus: `auth.login.title`, `auth.login.email`, `common.ok`, etc. Els dos arrays s'ordenen abans de comparar-los per tal que l'ordre de les claus als fitxers JSON no importi. El test compara la llista de claus de cada locale contra l'anglès.

Si al castellà li falta `auth.forgotPassword.successMessage`, la sortida del test mostra exactament quina clau falta. Com que els dos arrays estan ordenats, el diff és fàcil de llegir:

```
Expected: [..., "auth.forgotPassword.successMessage", "auth.forgotPassword.successTitle", ...]
Received: [..., "auth.forgotPassword.successTitle", ...]
```

Sense endevinar. Sense comparació manual. Un test, executat a cada PR.

## Tests de casos límit

El test de paritat detecta la deriva estructural. Però l'i18n té més modes de fallada que claus que falten.

### Resolució d'idioma

```typescript
it('resolves regional variants to base language', () => {
  // es-MX hauria de resoldre a es, no fer fallback a en
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

`resolveLanguageTag` rep un paràmetre `LocalizeModule`, així que els tests passen un objecte simulat directament en comptes d'espiar un global. Això fa que la funció sigui pura i fàcil de verificar.

### Interpolació

```typescript
it('handles missing interpolation variables gracefully', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: undefined,
  });
  // i18next renderitza la cadena de forma segura fins i tot amb variables undefined
  expect(typeof result).toBe('string');
});

it('handles special characters in interpolation safely', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: '<script>alert("xss")</script>',
  });
  // escapeValue és false, però React Native no interpreta HTML
  expect(result).toContain('<script>');
});
```

### Canvi d'idioma

```typescript
it('switches language dynamically', async () => {
  await i18next.changeLanguage('es');
  expect(i18next.t('auth.login.title')).toBe('Bienvenido de nuevo');

  await i18next.changeLanguage('en');
  expect(i18next.t('auth.login.title')).toBe('Welcome Back');
});
```

### Verificació de la configuració

```typescript
it('has correct configuration', () => {
  expect(i18next.options.fallbackLng).toContain('en');
  expect(i18next.options.defaultNS).toBe('translation');
  expect(i18next.options.compatibilityJSON).toBe('v4');
  expect(i18next.options.interpolation?.escapeValue).toBe(false);
  expect(i18next.isInitialized).toBe(true);
});
```

## Ús de les traduccions als components

El hook `useTranslation` proporciona la funció `t()` per llegir traduccions i `i18n` per canviar d'idioma:

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

La preferència d'idioma es persisteix via Redux Persist (consulta [Emmagatzematge segur per nivells](/blog/tiered-secure-storage-react-native/) per veure com funciona). A l'arrencada de l'aplicació, l'idioma persistit es sincronitza amb i18next:

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

## Errors habituals

**No utilitzis concatenació de cadenes per a text traduït.** `t('hello') + ' ' + name` falla en idiomes on l'ordre de les paraules és diferent. Utilitza interpolació: `t('greeting', { name })` amb `"greeting": "Hello, {{name}}"` en anglès i `"greeting": "{{name}}, merhaba"` en turc.

**No assumeixis que la pluralització és només "afegir una s".** L'anglès té dues formes (one/other). El polonès en té quatre. L'àrab en té sis. Els sufixos `_one`/`_other`/`_few`/`_many` d'i18next ho gestionen, però només si utilitzes `compatibilityJSON: 'v4'`.

**No publiquis sense el test de paritat.** Es triga 5 minuts a escriure. Detecta cada clau que falta. L'alternativa és descobrir-ho pels usuaris en producció.

**No codifiquis el format específic de locale directament al codi.** Dates, nombres i monedes es formaten diferent per locale. Utilitza `Intl.NumberFormat` i `Intl.DateTimeFormat` amb l'idioma actual d'i18next, no manipulació de cadenes.

**No oblidis les indicacions d'accessibilitat.** Els lectors de pantalla anuncien botons i camps d'entrada de manera diferent. Una indicació que té sentit en anglès pot ser confusa en castellà. Claus d'accessibilitat separades permeten als traductors proporcionar indicacions adequades al context.

## L'estructura de fitxers

```
src/
  i18n/
    index.ts                    # Configuració d'i18next, resolució d'idioma
    resources.ts                # Importa tots els locales, exporta recursos amb tipus
    locales/
      en.json                   # Anglès (locale de referència)
      es.json                   # Castellà
      ca.json                   # Català
      pl.json                   # Polonès
      tl.json                   # Tagal
    __tests__/
      localesParity.rntl.ts     # Test de paritat de claus
      localeEdgeCases.rntl.ts   # Resolució, interpolació, canvi d'idioma
  types/
    i18next.d.ts                # Augmentació de mòdul TypeScript
```

## Un matí, un test, zero traduccions perdudes

La configuració és un matí. Configuració d'i18next, cinc fitxers JSON, una declaració de tipus, un test de paritat. Després d'això, afegir un idioma nou és: copiar `en.json`, traduir-lo, afegir-lo a `resources.ts`, afegir-lo al test de paritat. El test detecta qualsevol clau que falti immediatament.

Al meu projecte, el test de paritat ha detectat claus que faltaven diverses vegades durant el desenvolupament. Cadascuna hauria estat una cadena en anglès silenciosa dins d'una interfície en un altre idioma. El test s'executa en menys d'un segon i no costa res de mantenir.

> L'únic error multilingüe pitjor que una mala traducció és una traducció que falta.

*Els exemples de codi d'aquest article són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. La configuració completa d'i18n, els fitxers de locale, les declaracions de tipus i els tests de paritat són tots al repositori.*
