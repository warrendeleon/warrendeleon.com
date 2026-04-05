---
title: "Validació de respostes d'API en temps d'execució amb Zod a React Native"
description: "Els teus tipus de TypeScript no et protegeixen en temps d'execució. Com detectar canvis de contracte del backend abans que l'app peti usant esquemes Zod que també serveixen com a definicions de tipus."
publishDate: 2026-06-01
tags: ["react-native", "typescript", "security", "tutorial"]
locale: ca
heroImage: "/images/blog/zod-runtime-validation.jpg"
heroAlt: "Validació de respostes d'API en temps d'execució amb Zod a React Native"
campaign: "zod-runtime-validation"
---

## TypeScript no et protegeix en temps d'execució

Tens una interfície `Profile`. La teva API retorna un objecte de perfil. TypeScript diu que els tipus coincideixen. Tot compila. L'app es publica.

Llavors l'equip de backend reanomena `profilePicture` a `avatar`. O canvia `phone` d'un string a un objecte amb camps `countryCode` i `number`. O comença a retornar `null` on abans retornava un string buit.

TypeScript no pot detectar res d'això. Comprova els tipus en temps de compilació. Les respostes de l'API arriben en temps d'execució. Quan les dades arriben al teu component, TypeScript ja ha fet la seva feina i ha plegat.

El resultat: l'app peta en accedir a una propietat, mostra camps buits o emmagatzema dades corruptes silenciosament. I el missatge d'error no et dóna res útil perquè la fallada està tres capes lluny de la causa.

> 💡 **La bretxa:** TypeScript valida la forma del teu codi. Zod valida la forma de les teves dades. Necessites tots dos.

## Què fa Zod

Zod és una llibreria de declaració i validació d'esquemes. Defineixes un esquema un cop, i et dóna dues coses:

1. **Validació en temps d'execució.** Analitza qualsevol dada `unknown` contra l'esquema. Si no coincideix, obtens un error detallat amb el camp exacte i el motiu.
2. **Tipus TypeScript.** Infereix el tipus directament de l'esquema amb `z.infer`. Sense definicions d'interfície duplicades. El tipus i la validació són la mateixa font de veritat.

```typescript
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  profilePicture: z.string().url(),
});

// Tipus TypeScript inferit de l'esquema
type Profile = z.infer<typeof ProfileSchema>;

// Validació en temps d'execució
const data: unknown = await api.getProfile();
const profile = ProfileSchema.parse(data); // llança excepció si és invàlid
```

Si l'API retorna `{ name: "Warren", email: "not-an-email" }`, Zod llança un `ZodError` amb el camp exacte (`email`) i el motiu (`Invalid email`). No un críptic `Cannot read property of undefined` tres pantalles més tard.

## Instal·lació

```bash
yarn add zod
```

Sense mòduls natius, sense config de Metro, sense polyfills.

## Escrivint esquemes

Cada resposta d'API té el seu propi fitxer d'esquema. Els esquemes es componen: esquemes petits construeixen esquemes més grans.

### Esquema simple

```typescript
// src/schemas/profile.schema.ts
import { z } from 'zod';

const CoordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const LocationSchema = z.object({
  cityTown: z.string(),
  county: z.string(),
  country: z.string(),
  coordinates: CoordinatesSchema,
});

const SocialsSchema = z.object({
  facebook: z.string().url(),
  twitter: z.string().url(),
  instagram: z.string().url(),
  linkedIn: z.string().url(),
});

export const ProfileSchema = z.object({
  profilePicture: z.string().url(),
  name: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  birthday: z.string().min(1),
  location: LocationSchema,
  galleryImages: z.array(z.string().url()),
  socials: SocialsSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Coordinates = z.infer<typeof CoordinatesSchema>;
```

Cada camp té una regla de validació. `z.string().url()` comprova que és una URL vàlida. `z.string().email()` comprova el format d'email. `z.string().min(1)` rebutja strings buits. No són simples assertions de tipus. Són comprovacions en temps d'execució que s'executen cada cop que les dades passen per allà.

### Validadors personalitzats

Alguns camps necessiten validació personalitzada. Les dates a la meva API arriben com `"2024"` o `"2024-06"`. Cap validador estàndard de Zod gestiona això:

```typescript
// src/schemas/education.schema.ts
const dateSchema = z.string().refine(
  val => /^\d{4}(-\d{2})?$/.test(val),
  'Must be YYYY or YYYY-MM format'
);

export const EducationItemSchema = z.object({
  id: z.string().uuid(),
  institution: z.string().min(1),
  title: z.string().min(1),
  logo: z.string().url(),
  startDate: dateSchema,
  endDate: dateSchema.nullable(),
  certificateUrl: z.string().url().nullable(),
});

export const EducationSchema = z.array(EducationItemSchema);
export type Education = z.infer<typeof EducationItemSchema>;
```

`.refine()` rep una funció que retorna `true` o `false`. Si retorna `false`, s'usa el missatge d'error personalitzat. Composable amb altres validadors: `dateSchema.nullable()` permet null o un string de data vàlid.

### Gestionant APIs inconsistents

Les APIs reals no sempre són consistents. El meu proveïdor d'autenticació retorna formes de resposta diferents segons la configuració:

```typescript
// src/schemas/supabase.auth.schema.ts

// Sign-up retorna O BÉ un objecte user (si es requereix confirmació d'email)
// O BÉ un wrapper { user, session } (si no cal confirmació)
export const SupabaseSignUpResponseSchema = z.union([
  SupabaseUserSchema,
  z.object({
    user: SupabaseUserSchema,
    session: SupabaseSessionSchema.nullable(),
  }),
]);

// Les dades d'identitat poden tenir camps extra que no controlem
export const SupabaseIdentityDataSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  phone_verified: z.boolean(),
  sub: z.string(),
}).passthrough(); // permet camps addicionals
```

| Mètode Zod | Què fa |
|---|---|
| `z.union([A, B])` | Les dades han de coincidir amb A o B |
| `.passthrough()` | Permet camps extra més enllà dels definits |
| `.nullable()` | Permet que el valor sigui null |
| `.nullish()` | Permet null o undefined |
| `.optional()` | Permet undefined (però no null) |

`.passthrough()` és important per a APIs de tercers. Sense ell, Zod elimina els camps que no coneix. Amb ell, els camps extra passen sense trencar la validació.

## La capa de validació

Dues funcions auxiliars es situen entre el teu client d'API i el codi de l'app. Una per a dades crítiques, una per a dades opcionals.

### Validació estricta (llança excepció si falla)

```typescript
// src/utils/validation/validateResponse.ts
import { z, ZodError } from 'zod';
import { logError } from '../logger';

export function validateResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      logError(`[${context}] Response validation failed`, error);
      if (firstError) {
        const fieldPath = firstError.path.join('.');
        throw new Error(
          `Invalid response from server: ${fieldPath} ${firstError.message}`
        );
      }
      throw new Error('Invalid response from server');
    }
    throw error;
  }
}
```

Quan la validació falla, el missatge d'error inclou el camí del primer camp que falla: `"Invalid response from server: user.profile.email Invalid email"`. Saps exactament què s'ha trencat i on.

### Validació segura (retorna null si falla)

```typescript
export function validateResponseSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      logWarning(`[${context}] Response validation failed (non-critical)`, {
        error,
      });
      return null;
    }
    throw error;
  }
}
```

Usa `validateResponse` per a dades sense les quals l'app no pot funcionar (tokens d'autenticació, contingut principal). Usa `validateResponseSafe` per a dades opcionals on un fallback a null és acceptable (contingut secundari, metadades d'analítica).

## Usant la validació a les funcions d'API

Cada funció d'API segueix el mateix patró: obtenir dades unknown, validar-les, retornar dades tipades.

```typescript
// src/features/Profile/api/api.ts
import { ProfileSchema, type Profile } from '@app/schemas';
import { GithubApiClient } from '@app/httpClients/GithubApiClient';

export const fetchProfileData = async (
  language: string
): Promise<AxiosResponse<Profile>> => {
  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );

  const validatedData = ProfileSchema.parse(response.data);

  return { ...response, data: validatedData };
};
```

El client d'API retorna `unknown`. L'esquema el valida. La funció retorna dades tipades i validades. Si el backend canvia la forma de la resposta, la validació llança una excepció abans que les dades arribin a Redux, components o emmagatzematge.

### Validació d'autenticació

Les respostes d'autenticació es validen a cada pas:

```typescript
// Dins SupabaseAuthClient
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSession> {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=password',
    request
  );

  const validatedData = validateResponse(
    SupabaseSignInResponseSchema,
    data,
    'Supabase Auth signIn'
  );

  await this.storeSession(validatedData);
  return validatedData;
}
```

Si el proveïdor d'autenticació canvia el format de la seva resposta, `validateResponse` ho detecta al límit. El missatge d'error inclou `"Supabase Auth signIn"` com a context, així saps quina crida ha fallat sense rastrejar la pila.

## Provant esquemes

Els esquemes són unitats provables. Cada esquema té el seu propi fitxer de test que valida contra dades fixture reals i comprova el rebuig d'entrades invàlides.

```typescript
// src/schemas/__tests__/profile.schema.rntl.ts
import { ProfileSchema } from '../profile.schema';
import { mockProfileEN } from '@app/test-utils/fixtures';

describe('ProfileSchema', () => {
  it('validates real fixture data', () => {
    const result = ProfileSchema.safeParse(mockProfileEN);
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = ProfileSchema.safeParse({
      ...mockProfileEN,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required field', () => {
    const { name, ...incomplete } = mockProfileEN;
    const result = ProfileSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL in gallery', () => {
    const result = ProfileSchema.safeParse({
      ...mockProfileEN,
      galleryImages: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });
});
```

El test de validació de fixture (`validates real fixture data`) és el més important. Detecta la deriva entre les teves dades mock i el teu esquema. Si algú actualitza l'API i la fixture però s'oblida de l'esquema (o a l'inrevés), aquest test falla.

## Els tests de les funcions auxiliars de validació

```typescript
// src/utils/validation/__tests__/validateResponse.rntl.ts
describe('validateResponse', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it('returns validated data for valid input', () => {
    const result = validateResponse(schema, { name: 'Warren', age: 30 }, 'test');
    expect(result).toEqual({ name: 'Warren', age: 30 });
  });

  it('throws with field path for invalid input', () => {
    expect(() =>
      validateResponse(schema, { name: 'Warren', age: 'thirty' }, 'test')
    ).toThrow('Invalid response from server: age');
  });

  it('includes nested field paths in error', () => {
    const nested = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
        }),
      }),
    });

    expect(() =>
      validateResponse(nested, { user: { profile: { email: 'bad' } } }, 'test')
    ).toThrow('user.profile.email');
  });
});

describe('validateResponseSafe', () => {
  it('returns null for invalid input', () => {
    const result = validateResponseSafe(schema, { name: 123 }, 'test');
    expect(result).toBeNull();
  });
});
```

## L'estructura de fitxers

```
src/
  schemas/
    profile.schema.ts              # Profile, Location, Socials
    education.schema.ts            # Elements d'educació amb validador de dates personalitzat
    workExperience.schema.ts       # Experiència laboral amb posicions niuades
    supabase.auth.schema.ts        # Esquemes de petició/resposta d'autenticació
    supabase.storage.schema.ts     # Esquemes de pujada/descàrrega de fitxers
    env.schema.ts                  # Validació de variables d'entorn
    index.ts                       # Barrel export (esquemes + tipus)
    __tests__/
      profile.schema.rntl.ts
      education.schema.rntl.ts
      workExperience.schema.rntl.ts
      supabase.auth.schema.rntl.ts
      supabase.storage.schema.rntl.ts
  utils/
    validation/
      validateResponse.ts          # validateResponse + validateResponseSafe
      __tests__/
        validateResponse.rntl.ts
```

El barrel export (`schemas/index.ts`) re-exporta tots els esquemes i els seus tipus inferits des d'un sol lloc:

```typescript
export { ProfileSchema, type Profile } from './profile.schema';
export { EducationSchema, type Education } from './education.schema';
export { WorkExperienceSchema, type WorkExperience } from './workExperience.schema';
```

## Errors comuns

**No defineixis tipus separats dels esquemes.** Si tens una interfície `Profile` i un `ProfileSchema`, divergiran. Usa `z.infer<typeof ProfileSchema>` com a única font de veritat. Elimina la interfície.

**No usis `.parse()` en bucles de renderització.** La validació té un cost. Analitza un cop quan les dades arriben (a la capa d'API), no cada cop que un component es re-renderitza. Les dades validades i tipades flueixen per Redux i props sense re-validació.

**No ignoris la variant segura.** No totes les fallades de validació haurien de petar l'app. Si un camp secundari és invàlid però les dades principals estan bé, `validateResponseSafe` retorna null i registra un warning. L'app continua amb un fallback elegant.

**No et saltis els tests d'esquemes.** Un esquema sense tests és un esquema en què no pots confiar. El test de validació de fixture (`safeParse(mockData)`) és el teu canari. Si falla, o la fixture o l'esquema està malament. En qualsevol cas, ho has de saber abans que l'app es publiqui.

**No oblidis `.passthrough()` per a APIs de tercers.** Sense ell, Zod elimina els camps desconeguts. Si un backend afegeix un camp nou, el teu objecte validat el perd. Per a APIs que controles, eliminar camps està bé (prevé la contaminació de dades). Per a APIs de tercers, usa `.passthrough()` per ser compatible amb el futur.

## El que costa, el que atrapa

El setup és una feina d'un matí. Un esquema per resposta d'API, dues funcions auxiliars, un test per esquema.

Què obtens: cada resposta d'API es valida abans que l'app la toqui. Quan el backend canvia, la validació llança una excepció al límit amb el camp exacte que s'ha trencat. Prou de depurar pantalles en blanc causades per un camp reanomenat tres crides d'API enrere.

Al meu projecte, els esquemes Zod van detectar dos canvis de backend durant el desenvolupament que haurien sortit com a bugs silenciosos. Un era un camp nullable que va passar a ser obligatori. L'altre era un camp d'URL que va començar a retornar paths relatius en comptes d'URLs absolutes. La validació els va detectar tots dos abans que arribessin a cap component.

> Atrapa-ho al límit de l'API o depura-ho en un informe de crash. Tu tries.

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. Les definicions completes d'esquemes Zod, les funcions auxiliars de validació i els tests són al repo.*
