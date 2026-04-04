---
title: "i18n con tests automáticos de paridad en React Native"
description: "5 idiomas con un test que verifica que cada locale tiene las mismas claves. Cómo configurar i18next con seguridad de tipos en TypeScript, detección del idioma del dispositivo y tests automáticos de paridad que detectan traducciones faltantes antes de publicar."
publishDate: 2026-06-08
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: es
heroImage: "/images/blog/i18n-parity-tests.jpg"
heroAlt: "i18n con tests automáticos de paridad en React Native"
campaign: "i18n-parity-tests"
---

## La traducción que nadie nota que falta

Añades una funcionalidad nueva. Escribes las cadenas en inglés. Las traduces al español, catalán, polaco y tagalo. Publicas.

Tres semanas después, alguien reporta que el mensaje de error en la pantalla de restablecimiento de contraseña está en inglés para los usuarios en español. Compruebas el fichero JSON en español. La clave existe para todas las demás pantallas. Pero no para esta. Se añadió a `en.json` y nunca se copió a `es.json`.

Esto ocurre en todas las apps multilingües. No porque los traductores sean descuidados, sino porque no hay un sistema que lo detecte. La app no falla. i18next vuelve silenciosamente al inglés. El usuario ve una cadena en inglés en una interfaz que por lo demás está en español y se pregunta si la app está rota.

> 💡 **La solución:** un único test que compara las claves de cada locale con el locale de referencia. Si `en.json` tiene una clave que `es.json` no tiene, el test falla. Ejecútalo en cada PR.

## La configuración

Cinco ficheros hacen que todo el sistema de i18n funcione.

### Dependencias

```bash
yarn add i18next react-i18next react-native-localize
```

| Librería | Qué hace |
|---|---|
| `i18next` | Framework principal de i18n. Búsqueda de claves, interpolación, plurales, fallbacks. |
| `react-i18next` | Hooks de React (`useTranslation`) y context provider. |
| `react-native-localize` | Lee el idioma preferido del dispositivo. |

### Los ficheros de locale

Cada idioma tiene un fichero JSON con estructura de claves idéntica:

```json
// src/i18n/locales/en.json (abreviado)
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

Patrones clave a tener en cuenta:

- ✅ **Estructura anidada.** `auth.login.title` se lee como una ruta. Mantiene las cadenas relacionadas juntas. Los errores se anidan más: `auth.login.errors.emailRequired`
- ✅ **Interpolación.** `{{email}}` se reemplaza en tiempo de ejecución. El mismo nombre de placeholder en todos los locales.
- ✅ **Pluralización.** Los sufijos `_one` y `_other` permiten que i18next escoja la forma correcta según `count`.
- ✅ **Hints de accesibilidad.** Claves separadas para el texto del lector de pantalla (`loginButtonHint`) para que los traductores conozcan el contexto.

El fichero en español tiene las mismas claves, valores diferentes:

```json
// src/i18n/locales/es.json (abreviado)
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

Mismas claves. Mismo anidamiento. Mismas variables de interpolación. Idioma diferente. Esta paridad estructural es lo que verifica el test automático.

### La configuración de i18n

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

    // 1) Coincidencia exacta de tag (p. ej. "en", "es")
    if (languageTag && supported.includes(languageTag)) {
      return languageTag;
    }

    // 2) Coincidencia por idioma base (p. ej. "es-ES" -> "es")
    if (languageCode) {
      const baseMatch = supported.find(code => code === languageCode);
      if (baseMatch) {
        return baseMatch;
      }
    }
  }

  // 3) Fallback a inglés si nada coincide
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

La resolución del idioma comprueba el locale principal del dispositivo con un fallback de tres pasos:

1. **Coincidencia exacta.** El locale principal del dispositivo es `es`, soportamos `es`. Se usa.
2. **Idioma base.** El dispositivo dice `es-MX`, no soportamos esa etiqueta exacta, pero el código base `es` coincide. Se usa.
3. **Fallback.** El dispositivo dice `de`, no soportamos alemán. Se vuelve al inglés.

La función recibe un parámetro `LocalizeModule` en lugar de llamar a `getLocales` directamente. Esto la hace testeable: en los tests, pasas un mock. En producción, pasas el `{ getLocales }` real de react-native-localize.

`escapeValue: false` es importante para React Native. i18next escapa HTML por defecto (para web). React Native no renderiza HTML, así que el escapado es innecesario y puede corromper cadenas con caracteres especiales.

`compatibilityJSON: 'v4'` habilita el manejo correcto de plurales. Sin esto, las claves de plural como `_one`/`_other` no funcionan correctamente.

### El fichero de recursos

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

`as const` hace que el tipo sea estrecho. TypeScript conoce la forma exacta de cada clave de traducción. Esto alimenta la declaración de tipos.

### Seguridad de tipos con TypeScript

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

Esta augmentación de módulo le dice a TypeScript: "la función `t()` solo acepta claves que existan en `en.json`." Si escribes `t('auth.login.titl')` (errata), el compilador lo detecta. Autocompletado completo en tu IDE.

## El test de paridad

Esta es la parte central del artículo. Un único fichero de test que impide que se publiquen traducciones faltantes.

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

`collectKeys` recorre recursivamente el JSON y recopila cada ruta de clave: `auth.login.title`, `auth.login.email`, `common.ok`, etc. Ambos arrays se ordenan antes de comparar, así que el orden de las claves en los ficheros JSON no importa. El test compara la lista de claves de cada locale contra el inglés.

Si al español le falta `auth.forgotPassword.successMessage`, la salida del test muestra exactamente qué clave falta. Como ambos arrays están ordenados, el diff es fácil de leer:

```
Expected: [..., "auth.forgotPassword.successMessage", "auth.forgotPassword.successTitle", ...]
Received: [..., "auth.forgotPassword.successTitle", ...]
```

Sin adivinanzas. Sin comparación manual. Un test, ejecutado en cada PR.

## Tests de casos extremos

El test de paridad detecta la divergencia estructural. Pero i18n tiene más modos de fallo que las claves faltantes.

### Resolución de idioma

```typescript
it('resolves regional variants to base language', () => {
  // es-MX debería resolverse a es, no volver a en
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

`resolveLanguageTag` recibe un parámetro `LocalizeModule`, así que los tests pasan un objeto mock directamente en lugar de espiar un global. Esto hace la función pura y fácil de testear.

### Interpolación

```typescript
it('handles missing interpolation variables gracefully', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: undefined,
  });
  // i18next renderiza la cadena de forma segura incluso con variables undefined
  expect(typeof result).toBe('string');
});

it('handles special characters in interpolation safely', () => {
  const result = i18next.t('auth.forgotPassword.successMessage', {
    email: '<script>alert("xss")</script>',
  });
  // escapeValue es false, pero React Native no interpreta HTML
  expect(result).toContain('<script>');
});
```

### Cambio de idioma

```typescript
it('switches language dynamically', async () => {
  await i18next.changeLanguage('es');
  expect(i18next.t('auth.login.title')).toBe('Bienvenido de nuevo');

  await i18next.changeLanguage('en');
  expect(i18next.t('auth.login.title')).toBe('Welcome Back');
});
```

### Verificación de configuración

```typescript
it('has correct configuration', () => {
  expect(i18next.options.fallbackLng).toContain('en');
  expect(i18next.options.defaultNS).toBe('translation');
  expect(i18next.options.compatibilityJSON).toBe('v4');
  expect(i18next.options.interpolation?.escapeValue).toBe(false);
  expect(i18next.isInitialized).toBe(true);
});
```

## Uso de traducciones en componentes

El hook `useTranslation` proporciona la función `t()` para leer traducciones e `i18n` para cambiar de idioma:

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

La preferencia de idioma se persiste con Redux Persist (consulta [Almacenamiento seguro por niveles](/blog/es/tiered-secure-storage-react-native/) para ver cómo funciona). Al iniciar la app, el idioma persistido se sincroniza con i18next:

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

## Errores comunes

**No uses concatenación de cadenas para texto traducido.** `t('hello') + ' ' + name` se rompe en idiomas donde el orden de las palabras es diferente. Usa interpolación: `t('greeting', { name })` con `"greeting": "Hello, {{name}}"` en inglés y `"greeting": "{{name}}, merhaba"` en turco.

**No asumas que la pluralización es solo "añadir una s".** El inglés tiene dos formas (one/other). El polaco tiene cuatro. El árabe tiene seis. Los sufijos `_one`/`_other`/`_few`/`_many` de i18next manejan esto, pero solo si usas `compatibilityJSON: 'v4'`.

**No publiques sin el test de paridad.** Lleva 5 minutos escribirlo. Detecta cada clave faltante. La alternativa es enterarte por los usuarios en producción.

**No hardcodees formato específico del locale.** Fechas, números y monedas se formatean de manera diferente según el locale. Usa `Intl.NumberFormat` e `Intl.DateTimeFormat` con el idioma actual de i18next, no manipulación de cadenas.

**No olvides los hints de accesibilidad.** Los lectores de pantalla anuncian botones e inputs de manera diferente. Un hint que tiene sentido en inglés puede ser confuso en español. Claves de accesibilidad separadas permiten a los traductores proporcionar hints adecuados al contexto.

## La estructura de ficheros

```
src/
  i18n/
    index.ts                    # Configuración de i18next, resolución de idioma
    resources.ts                # Importa todos los locales, exporta recursos tipados
    locales/
      en.json                   # Inglés (locale de referencia)
      es.json                   # Español
      ca.json                   # Catalán
      pl.json                   # Polaco
      tl.json                   # Tagalo
    __tests__/
      localesParity.rntl.ts     # Test de paridad de claves
      localeEdgeCases.rntl.ts   # Resolución, interpolación, cambio de idioma
  types/
    i18next.d.ts                # Augmentación de módulo TypeScript
```

## Una mañana, un test, cero traducciones perdidas

La configuración es una mañana. Configuración de i18next, cinco ficheros JSON, una declaración de tipos, un test de paridad. Después de eso, añadir un nuevo idioma es: copiar `en.json`, traducirlo, añadirlo a `resources.ts`, añadirlo al test de paridad. El test detecta cualquier clave faltante de inmediato.

En mi proyecto, el test de paridad ha detectado claves faltantes varias veces durante el desarrollo. Todas ellas habrían sido una cadena en inglés silenciosa en una interfaz que no es en inglés. El test se ejecuta en menos de un segundo y no cuesta nada mantenerlo.

> El único fallo multilingüe peor que una mala traducción es una traducción que falta.

*Los ejemplos de código en este artículo son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. La configuración completa de i18n, los ficheros de locale, las declaraciones de tipos y los tests de paridad están todos en el repositorio.*
