---
title: "Runtime API response validation gamit ang Zod sa React Native"
description: "Hindi ka pinoprotektahan ng TypeScript types mo sa runtime. Paano mahuhuli ang mga pagbabago sa backend contract bago mag-crash ang iyong app gamit ang Zod schemas na nagsisilbi ring type definitions."
publishDate: 2026-05-25
tags: ["react-native", "typescript", "security", "tutorial"]
locale: tl
heroImage: "/images/blog/zod-runtime-validation.jpg"
heroAlt: "Runtime API response validation gamit ang Zod sa React Native"
---

## Hindi ka pinoprotektahan ng TypeScript sa runtime

Mayroon kang `Profile` interface. Nagbabalik ng profile object ang API mo. Sabi ng TypeScript, tugma ang types. Nag-compile ang lahat. Nai-ship ang app.

Tapos pinalitan ng backend team ang `profilePicture` ng `avatar`. O ginawang object ang `phone` mula sa string, na may `countryCode` at `number` fields. O nagsimulang magbalik ng `null` kung saan dati ay empty string.

Wala sa mga ito ang mahuhuli ng TypeScript. Tini-check nito ang types sa compile time. Dumarating ang API responses sa runtime. Pagdating ng data sa component mo, tapos na ang trabaho ng TypeScript.

Ang resulta: nag-crash ang app mo sa property access, nagpapakita ng blangkong fields, o tahimik na nagse-save ng sirang data. At walang kwenta ang error message dahil tatlong layer ang pagitan ng failure at ng dahilan nito.

> 💡 **Ang puwang:** Vina-validate ng TypeScript ang hugis ng code mo. Vina-validate ng Zod ang hugis ng data mo. Kailangan mo pareho.

## Ano ang ginagawa ng Zod

Ang Zod ay isang schema declaration at validation library. Mag-define ka ng schema nang isang beses, at dalawang bagay ang ibibigay nito:

1. **Runtime validation.** I-parse ang kahit anong `unknown` na data laban sa schema. Kung hindi tugma, makakakuha ka ng detalyadong error na may eksaktong field at dahilan.
2. **TypeScript types.** I-infer ang type direkta mula sa schema gamit ang `z.infer`. Walang duplicate na interface definitions. Iisa ang pinagmumulan ng type at ng validation.

```typescript
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  profilePicture: z.string().url(),
});

// TypeScript type na inferred mula sa schema
type Profile = z.infer<typeof ProfileSchema>;

// Runtime validation
const data: unknown = await api.getProfile();
const profile = ProfileSchema.parse(data); // mag-throw kung invalid
```

Kung nagbalik ang API ng `{ name: "Warren", email: "not-an-email" }`, mag-throw ang Zod ng `ZodError` na may eksaktong field (`email`) at dahilan (`Invalid email`). Hindi cryptic na `Cannot read property of undefined` tatlong screen ang layo.

## Installation

```bash
yarn add zod
```

Walang native modules, walang Metro config, walang polyfills.

## Pagsusulat ng schemas

Bawat API response ay may sariling schema file. Nagko-compose ang schemas: mga maliliit na schema ang bumubuo sa mas malalaki.

### Simpleng schema

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

Bawat field ay may validation rule. Tini-check ng `z.string().url()` kung valid URL ito. Tini-check ng `z.string().email()` ang email format. Nire-reject ng `z.string().min(1)` ang mga empty string. Hindi lang type assertions ang mga ito. Runtime checks ang mga ito na tumatakbo tuwing dumadaan ang data.

### Mga custom validator

May mga field na nangangailangan ng custom validation. Ang mga date sa API ko ay dumarating bilang `"2024"` o `"2024-06"`. Walang standard Zod validator na tumutugma diyan:

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

Tumatanggap ang `.refine()` ng function na nagbabalik ng `true` o `false`. Kung `false`, gagamitin ang custom error message. Puwedeng i-compose kasama ng ibang validators: pinapayagan ng `dateSchema.nullable()` ang null o valid na date string.

### Pag-handle ng hindi consistent na APIs

Hindi palaging consistent ang mga tunay na API. Iba-iba ang response shapes na ibinabalik ng auth provider ko depende sa configuration:

```typescript
// src/schemas/supabase.auth.schema.ts

// Nagbabalik ang sign-up ng ALINMAN sa user object (kung kailangan ng email confirmation)
// O ng { user, session } wrapper (kung walang confirmation)
export const SupabaseSignUpResponseSchema = z.union([
  SupabaseUserSchema,
  z.object({
    user: SupabaseUserSchema,
    session: SupabaseSessionSchema.nullable(),
  }),
]);

// Puwedeng may extra fields ang identity data na hindi natin kontrolado
export const SupabaseIdentityDataSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  phone_verified: z.boolean(),
  sub: z.string(),
}).passthrough(); // payagan ang mga karagdagang field
```

| Zod method | Ano ang ginagawa |
|---|---|
| `z.union([A, B])` | Kailangang tumugma ang data sa A o B |
| `.passthrough()` | Payagan ang mga extra field na lampas sa na-define |
| `.nullable()` | Payagan ang value na maging null |
| `.nullish()` | Payagan ang null o undefined |
| `.optional()` | Payagan ang undefined (pero hindi null) |

Mahalaga ang `.passthrough()` para sa third-party APIs. Kung wala ito, inaalis ng Zod ang mga field na hindi nito kilala. Kapag mayroon, dumadaan ang mga extra field nang hindi sinisira ang validation.

## Ang validation layer

Dalawang helper function ang nasa pagitan ng API client at ng app code mo. Isa para sa kritikal na data, isa para sa opsyonal na data.

### Strict validation (mag-throw kapag nabigo)

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

Kapag nabigo ang validation, kasama sa error message ang unang nag-fail na field path: `"Invalid response from server: user.profile.email Invalid email"`. Alam mo agad kung ano ang nasira at saan.

### Safe validation (magbalik ng null kapag nabigo)

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

Gamitin ang `validateResponse` para sa data na kailangan ng app para gumana (auth tokens, pangunahing content). Gamitin ang `validateResponseSafe` para sa opsyonal na data kung saan katanggap-tanggap ang null fallback (pangalawang content, analytics metadata).

## Paggamit ng validation sa API functions

Iisang pattern ang sinusunod ng bawat API function: kunin ang unknown na data, i-validate, ibalik ang typed na data.

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

Nagbabalik ng `unknown` ang API client. Vina-validate ito ng schema. Nagbabalik ang function ng typed at validated na data. Kung binago ng backend ang response shape, mag-throw ang validation bago umabot ang data sa Redux, components, o storage.

### Auth validation

Vina-validate ang auth responses sa bawat hakbang:

```typescript
// Sa loob ng SupabaseAuthClient
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

Kung binago ng auth provider ang response format nila, mahuhuli ito ng `validateResponse` sa boundary. Kasama sa error message ang `"Supabase Auth signIn"` bilang context, kaya alam mo kung aling call ang nabigo nang hindi kailangang i-trace ang stack.

## Pag-test ng schemas

Mga testable units ang schemas. Bawat schema ay may sariling test file na nagva-validate laban sa tunay na fixture data at tini-check ang pag-reject ng invalid inputs.

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

Ang fixture validation test (`validates real fixture data`) ang pinakamahalaga. Nahuhuli nito ang drift sa pagitan ng mock data at ng schema mo. Kung may nag-update ng API at ng fixture pero nakalimutan ang schema (o baliktad), mafe-fail ang test na ito.

## Mga test ng validation helper

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

## Ang file structure

```
src/
  schemas/
    profile.schema.ts              # Profile, Location, Socials
    education.schema.ts            # Mga education item na may custom date validator
    workExperience.schema.ts       # Work experience na may nested positions
    supabase.auth.schema.ts        # Mga auth request/response schema
    supabase.storage.schema.ts     # Mga file upload/download schema
    env.schema.ts                  # Validation ng environment variables
    index.ts                       # Barrel export (schemas + types)
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

Muli-export ng barrel export (`schemas/index.ts`) ang lahat ng schemas at mga inferred types mula sa iisang lugar:

```typescript
export { ProfileSchema, type Profile } from './profile.schema';
export { EducationSchema, type Education } from './education.schema';
export { WorkExperienceSchema, type WorkExperience } from './workExperience.schema';
```

## Mga karaniwang pagkakamali

**Huwag mag-define ng types nang hiwalay sa schemas.** Kung mayroon kang `Profile` interface at `ProfileSchema`, magkakaiba ang takbo nila sa kalaunan. Gamitin ang `z.infer<typeof ProfileSchema>` bilang iisang pinagmumulan ng katotohanan. Burahin ang interface.

**Huwag gamitin ang `.parse()` sa render loops.** May gastos ang validation. Mag-parse nang isang beses pagdating ng data (sa API layer), hindi sa bawat re-render ng component. Ang validated at typed na data ay dumadaloy sa Redux at props nang walang muling validation.

**Huwag balewalain ang safe variant.** Hindi lahat ng validation failure ay dapat mag-crash ng app. Kung invalid ang isang pangalawang field pero maayos ang pangunahing data, magbabalik ng null ang `validateResponseSafe` at magla-log ng warning. Magpapatuloy ang app na may maayos na fallback.

**Huwag laktawan ang schema tests.** Ang schema na walang tests ay schema na hindi mo mapagkakatiwalaan. Ang fixture validation test (`safeParse(mockData)`) ang iyong canary. Kung mafe-fail ito, mali ang fixture o ang schema. Parehong kailangan mong malaman bago mai-ship ang app.

**Huwag kalimutan ang `.passthrough()` para sa third-party APIs.** Kung wala ito, inaalis ng Zod ang mga hindi kilalang field. Kung nagdagdag ng bagong field ang backend, mawawala ito sa validated object mo. Para sa APIs na kontrolado mo, ayos lang ang pag-strip (pinipigilan ang data pollution). Para sa third-party APIs, gamitin ang `.passthrough()` para maging future-proof.

## Sulit ba?

Isang umaga lang ang setup. Isang schema bawat API response, dalawang helper function, isang test bawat schema.

Ang makukuha mo: bawat API response ay vina-validate bago ito galawin ng app mo. Kapag nagbago ang backend, mag-throw ang validation sa boundary na may eksaktong field na nasira. Wala nang pag-debug ng mga blangkong screen na dulot ng pinalitang field tatlong API call ang lalim.

Sa project ko, dalawang backend change ang nahuli ng Zod schemas habang nagde-develop na sana ay nai-ship bilang tahimik na bugs. Ang isa ay nullable field na naging required. Ang isa pa ay URL field na nagsimulang magbalik ng relative paths sa halip na absolute URLs. Pareho ay nahuli ng validation bago umabot sa component.

> Ang pinakamabuting oras para mahuli ang masamang API response ay sa boundary. Ang pinakamasamang oras ay sa crash report.

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong Zod schema definitions, validation helpers, at tests.*
