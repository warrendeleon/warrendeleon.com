---
title: "Runtime API response validation with Zod in React Native"
description: "Your TypeScript types don't protect you at runtime. How to catch backend contract changes before they crash your app using Zod schemas that double as your type definitions."
publishDate: 2026-05-25
tags: ["react-native", "typescript", "security", "tutorial"]
locale: en
heroImage: "/images/blog/zod-runtime-validation.jpg"
heroAlt: "Runtime API response validation with Zod in React Native"
---

## TypeScript doesn't protect you at runtime

You have a `Profile` interface. Your API returns a profile object. TypeScript says the types match. Everything compiles. The app ships.

Then the backend team renames `profilePicture` to `avatar`. Or changes `phone` from a string to an object with `countryCode` and `number` fields. Or starts returning `null` where it used to return an empty string.

TypeScript can't catch any of this. It checks types at compile time. API responses arrive at runtime. By the time the data reaches your component, TypeScript has already done its job and gone home.

The result: your app crashes on a property access, shows blank fields, or silently stores corrupted data. And the error message gives you nothing useful because the failure is three layers away from the cause.

> 💡 **The gap:** TypeScript validates the shape of your code. Zod validates the shape of your data. You need both.

## What Zod does

Zod is a schema declaration and validation library. You define a schema once, and you get:

1. **Runtime validation.** Parse any `unknown` data against the schema. If it doesn't match, you get a detailed error with the exact field and reason.
2. **TypeScript types.** Infer the type directly from the schema with `z.infer`. No duplicate interface definitions. The type and the validation are the same source of truth.

```typescript
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  profilePicture: z.string().url(),
});

// TypeScript type inferred from the schema
type Profile = z.infer<typeof ProfileSchema>;

// Runtime validation
const data: unknown = await api.getProfile();
const profile = ProfileSchema.parse(data); // throws if invalid
```

If the API returns `{ name: "Warren", email: "not-an-email" }`, Zod throws a `ZodError` with the exact field (`email`) and the reason (`Invalid email`). Not a cryptic `Cannot read property of undefined` three screens later.

## Installation

```bash
yarn add zod
```

No native modules, no Metro config, no polyfills.

## Writing schemas

Each API response gets its own schema file. Schemas compose: small schemas build into larger ones.

### Simple schema

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

Every field has a validation rule. `z.string().url()` checks it's a valid URL. `z.string().email()` checks email format. `z.string().min(1)` rejects empty strings. These aren't just type assertions. They're runtime checks that run every time data passes through.

### Custom validators

Some fields need custom validation. Dates in my API come as either `"2024"` or `"2024-06"`. No standard Zod validator handles that:

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

`.refine()` takes a function that returns `true` or `false`. If `false`, the custom error message is used. Composable with other validators: `dateSchema.nullable()` allows null or a valid date string.

### Handling inconsistent APIs

Real APIs aren't always consistent. My auth provider returns different response shapes depending on the configuration:

```typescript
// src/schemas/supabase.auth.schema.ts

// Sign-up returns EITHER a user object (if email confirmation required)
// OR a { user, session } wrapper (if no confirmation)
export const SupabaseSignUpResponseSchema = z.union([
  SupabaseUserSchema,
  z.object({
    user: SupabaseUserSchema,
    session: SupabaseSessionSchema.nullable(),
  }),
]);

// Identity data can have extra fields we don't control
export const SupabaseIdentityDataSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  phone_verified: z.boolean(),
  sub: z.string(),
}).passthrough(); // allow additional fields
```

| Zod method | What it does |
|---|---|
| `z.union([A, B])` | Data must match A or B |
| `.passthrough()` | Allow extra fields beyond what's defined |
| `.nullable()` | Allow the value to be null |
| `.nullish()` | Allow null or undefined |
| `.optional()` | Allow undefined (but not null) |

`.passthrough()` is important for third-party APIs. Without it, Zod strips fields it doesn't know about. With it, extra fields pass through without breaking validation.

## The validation layer

Two helper functions sit between your API client and your app code. One for critical data, one for optional data.

### Strict validation (throws on failure)

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

When validation fails, the error message includes the first failing field path: `"Invalid response from server: user.profile.email Invalid email"`. You know exactly what broke and where.

### Safe validation (returns null on failure)

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

Use `validateResponse` for data the app can't function without (auth tokens, primary content). Use `validateResponseSafe` for optional data where a null fallback is acceptable (secondary content, analytics metadata).

## Using validation in API functions

Every API function follows the same pattern: fetch unknown data, validate it, return typed data.

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

The API client returns `unknown`. The schema validates it. The function returns typed, validated data. If the backend changes the response shape, the validation throws before the data reaches Redux, components, or storage.

### Auth validation

Auth responses are validated at every step:

```typescript
// Inside SupabaseAuthClient
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

If the auth provider changes their response format, `validateResponse` catches it at the boundary. The error message includes `"Supabase Auth signIn"` as context, so you know which call failed without tracing the stack.

## Testing schemas

Schemas are testable units. Each schema gets its own test file that validates against real fixture data and checks rejection of invalid inputs.

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

The fixture validation test (`validates real fixture data`) is the most important one. It catches drift between your mock data and your schema. If someone updates the API and the fixture but forgets the schema (or vice versa), this test fails.

## The validation helper tests

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

## The file structure

```
src/
  schemas/
    profile.schema.ts              # Profile, Location, Socials
    education.schema.ts            # Education items with custom date validator
    workExperience.schema.ts       # Work experience with nested positions
    supabase.auth.schema.ts        # Auth request/response schemas
    supabase.storage.schema.ts     # File upload/download schemas
    env.schema.ts                  # Environment variable validation
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

The barrel export (`schemas/index.ts`) re-exports all schemas and their inferred types from one place:

```typescript
export { ProfileSchema, type Profile } from './profile.schema';
export { EducationSchema, type Education } from './education.schema';
export { WorkExperienceSchema, type WorkExperience } from './workExperience.schema';
```

## Common pitfalls

**Don't define types separately from schemas.** If you have a `Profile` interface and a `ProfileSchema`, they will drift. Use `z.infer<typeof ProfileSchema>` as your single source of truth. Delete the interface.

**Don't use `.parse()` in render loops.** Validation has a cost. Parse once when the data arrives (in the API layer), not every time a component re-renders. The validated, typed data flows through Redux and props without re-validation.

**Don't ignore the safe variant.** Not every validation failure should crash the app. If a secondary field is invalid but the primary data is fine, `validateResponseSafe` returns null and logs a warning. The app continues with a graceful fallback.

**Don't skip schema tests.** A schema without tests is a schema you can't trust. The fixture validation test (`safeParse(mockData)`) is your canary. If it fails, either the fixture or the schema is wrong. Either way, you need to know before the app ships.

**Don't forget `.passthrough()` for third-party APIs.** Without it, Zod strips unknown fields. If a backend adds a new field, your validated object loses it. For APIs you control, stripping is fine (it prevents data pollution). For third-party APIs, use `.passthrough()` to stay future-proof.

## What it costs, what it catches

The setup is a morning's work. One schema per API response, two helper functions, a test per schema.

What you get: every API response is validated before your app touches it. When the backend changes, the validation throws at the boundary with the exact field that broke. No more debugging blank screens caused by a renamed field three API calls deep.

In my project, Zod schemas caught two backend changes during development that would have shipped as silent bugs. One was a nullable field that became required. The other was a URL field that started returning relative paths instead of absolute URLs. Both were caught by validation before reaching a component.

> Catch it at the API boundary or debug it in a crash report. Your choice.

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full Zod schema definitions, validation helpers, and tests are all in the repo.*
