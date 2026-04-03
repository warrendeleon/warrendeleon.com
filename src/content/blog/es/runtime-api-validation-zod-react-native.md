---
title: "Validación de respuestas de API en runtime con Zod en React Native"
description: "Tus tipos de TypeScript no te protegen en runtime. Cómo detectar cambios en el contrato del backend antes de que rompan tu app usando schemas de Zod que funcionan también como tus definiciones de tipos."
publishDate: 2026-05-25
tags: ["react-native", "typescript", "security", "tutorial"]
locale: es
heroImage: "/images/blog/zod-runtime-validation.jpg"
heroAlt: "Validación de respuestas de API en runtime con Zod en React Native"
---

## TypeScript no te protege en runtime

Tenés una interfaz `Profile`. Tu API devuelve un objeto de perfil. TypeScript dice que los tipos coinciden. Todo compila. La app se publica.

Después, el equipo de backend renombra `profilePicture` a `avatar`. O cambia `phone` de un string a un objeto con campos `countryCode` y `number`. O empieza a devolver `null` donde antes devolvía un string vacío.

TypeScript no puede atrapar nada de esto. Verifica tipos en tiempo de compilación. Las respuestas de la API llegan en runtime. Para cuando los datos llegan a tu componente, TypeScript ya hizo su trabajo y se fue.

El resultado: tu app crashea por un acceso a propiedad, muestra campos vacíos o guarda datos corruptos silenciosamente. Y el mensaje de error no te dice nada útil porque la falla está a tres capas de distancia de la causa.

> 💡 **La brecha:** TypeScript valida la forma de tu código. Zod valida la forma de tus datos. Necesitás ambos.

## Qué hace Zod

Zod es una librería de declaración y validación de schemas. Definís un schema una vez, y te da dos cosas:

1. **Validación en runtime.** Parseá cualquier dato `unknown` contra el schema. Si no coincide, obtenés un error detallado con el campo exacto y el motivo.
2. **Tipos de TypeScript.** Inferí el tipo directamente del schema con `z.infer`. Sin definiciones de interfaces duplicadas. El tipo y la validación son la misma fuente de verdad.

```typescript
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  profilePicture: z.string().url(),
});

// Tipo de TypeScript inferido del schema
type Profile = z.infer<typeof ProfileSchema>;

// Validación en runtime
const data: unknown = await api.getProfile();
const profile = ProfileSchema.parse(data); // lanza error si es inválido
```

Si la API devuelve `{ name: "Warren", email: "not-an-email" }`, Zod lanza un `ZodError` con el campo exacto (`email`) y el motivo (`Invalid email`). No un críptico `Cannot read property of undefined` tres pantallas después.

## Instalación

```bash
yarn add zod
```

Sin módulos nativos, sin config de Metro, sin polyfills.

## Escribiendo schemas

Cada respuesta de API tiene su propio archivo de schema. Los schemas se componen: schemas chicos se combinan en más grandes.

### Schema simple

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

Cada campo tiene una regla de validación. `z.string().url()` verifica que sea una URL válida. `z.string().email()` verifica el formato de email. `z.string().min(1)` rechaza strings vacíos. No son solo aserciones de tipos. Son verificaciones en runtime que corren cada vez que los datos pasan por ahí.

### Validadores personalizados

Algunos campos necesitan validación personalizada. Las fechas en mi API vienen como `"2024"` o `"2024-06"`. Ningún validador estándar de Zod maneja eso:

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

`.refine()` recibe una función que devuelve `true` o `false`. Si devuelve `false`, se usa el mensaje de error personalizado. Se puede componer con otros validadores: `dateSchema.nullable()` permite null o un string de fecha válido.

### Manejando APIs inconsistentes

Las APIs reales no siempre son consistentes. Mi proveedor de autenticación devuelve distintas formas de respuesta según la configuración:

```typescript
// src/schemas/supabase.auth.schema.ts

// Sign-up devuelve O un objeto user (si se requiere confirmación por email)
// O un wrapper { user, session } (si no se requiere confirmación)
export const SupabaseSignUpResponseSchema = z.union([
  SupabaseUserSchema,
  z.object({
    user: SupabaseUserSchema,
    session: SupabaseSessionSchema.nullable(),
  }),
]);

// Los datos de identidad pueden tener campos extra que no controlamos
export const SupabaseIdentityDataSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  phone_verified: z.boolean(),
  sub: z.string(),
}).passthrough(); // permitir campos adicionales
```

| Método de Zod | Qué hace |
|---|---|
| `z.union([A, B])` | Los datos deben matchear A o B |
| `.passthrough()` | Permite campos extra más allá de los definidos |
| `.nullable()` | Permite que el valor sea null |
| `.nullish()` | Permite null o undefined |
| `.optional()` | Permite undefined (pero no null) |

`.passthrough()` es importante para APIs de terceros. Sin él, Zod elimina los campos que no conoce. Con él, los campos extra pasan sin romper la validación.

## La capa de validación

Dos funciones auxiliares se ubican entre tu cliente de API y el código de tu app. Una para datos críticos, otra para datos opcionales.

### Validación estricta (lanza error si falla)

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

Cuando la validación falla, el mensaje de error incluye la ruta del primer campo que falló: `"Invalid response from server: user.profile.email Invalid email"`. Sabés exactamente qué se rompió y dónde.

### Validación segura (devuelve null si falla)

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

Usá `validateResponse` para datos sin los cuales la app no puede funcionar (tokens de autenticación, contenido principal). Usá `validateResponseSafe` para datos opcionales donde un fallback a null es aceptable (contenido secundario, metadata de analytics).

## Usando validación en funciones de API

Cada función de API sigue el mismo patrón: obtener datos unknown, validarlos, devolver datos tipados.

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

El cliente de API devuelve `unknown`. El schema lo valida. La función devuelve datos tipados y validados. Si el backend cambia la forma de la respuesta, la validación lanza un error antes de que los datos lleguen a Redux, los componentes o el storage.

### Validación de autenticación

Las respuestas de autenticación se validan en cada paso:

```typescript
// Dentro de SupabaseAuthClient
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

Si el proveedor de autenticación cambia el formato de su respuesta, `validateResponse` lo atrapa en la frontera. El mensaje de error incluye `"Supabase Auth signIn"` como contexto, así sabés qué llamada falló sin rastrear el stack.

## Testeando schemas

Los schemas son unidades testeables. Cada schema tiene su propio archivo de test que valida contra datos fixture reales y verifica el rechazo de inputs inválidos.

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

El test de validación contra fixtures (`validates real fixture data`) es el más importante. Detecta divergencia entre tus datos mock y tu schema. Si alguien actualiza la API y la fixture pero se olvida del schema (o viceversa), este test falla.

## Los tests del helper de validación

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

## La estructura de archivos

```
src/
  schemas/
    profile.schema.ts              # Profile, Location, Socials
    education.schema.ts            # Items de educación con validador de fecha personalizado
    workExperience.schema.ts       # Experiencia laboral con posiciones anidadas
    supabase.auth.schema.ts        # Schemas de request/response de autenticación
    supabase.storage.schema.ts     # Schemas de subida/descarga de archivos
    env.schema.ts                  # Validación de variables de entorno
    index.ts                       # Barrel export (schemas + tipos)
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

El barrel export (`schemas/index.ts`) re-exporta todos los schemas y sus tipos inferidos desde un solo lugar:

```typescript
export { ProfileSchema, type Profile } from './profile.schema';
export { EducationSchema, type Education } from './education.schema';
export { WorkExperienceSchema, type WorkExperience } from './workExperience.schema';
```

## Errores comunes

**No definas tipos separados de los schemas.** Si tenés una interfaz `Profile` y un `ProfileSchema`, van a divergir. Usá `z.infer<typeof ProfileSchema>` como tu única fuente de verdad. Eliminá la interfaz.

**No uses `.parse()` en loops de render.** La validación tiene un costo. Parseá una sola vez cuando llegan los datos (en la capa de API), no cada vez que un componente se re-renderiza. Los datos validados y tipados fluyen por Redux y props sin re-validación.

**No ignores la variante segura.** No toda falla de validación debería crashear la app. Si un campo secundario es inválido pero los datos principales están bien, `validateResponseSafe` devuelve null y loguea un warning. La app sigue funcionando con un fallback elegante.

**No te saltees los tests de schemas.** Un schema sin tests es un schema en el que no podés confiar. El test de validación contra fixtures (`safeParse(mockData)`) es tu canario en la mina. Si falla, o la fixture o el schema están mal. De cualquier manera, necesitás saberlo antes de que la app se publique.

**No te olvides de `.passthrough()` para APIs de terceros.** Sin él, Zod elimina los campos desconocidos. Si un backend agrega un campo nuevo, tu objeto validado lo pierde. Para APIs que controlás, eliminar campos está bien (previene contaminación de datos). Para APIs de terceros, usá `.passthrough()` para estar preparado a futuro.

## Lo que cuesta, lo que atrapa

El setup es trabajo de una mañana. Un schema por respuesta de API, dos funciones auxiliares, un test por schema.

Lo que obtenés: cada respuesta de API se valida antes de que tu app la toque. Cuando el backend cambia, la validación lanza un error en la frontera con el campo exacto que se rompió. No más debuggear pantallas en blanco causadas por un campo renombrado a tres llamadas de API de profundidad.

En mi proyecto, los schemas de Zod detectaron dos cambios del backend durante el desarrollo que se habrían publicado como bugs silenciosos. Uno era un campo nullable que pasó a ser requerido. El otro era un campo de URL que empezó a devolver paths relativos en vez de URLs absolutas. Ambos fueron atrapados por la validación antes de llegar a un componente.

> Atrapalo en la frontera de la API o debuggealo en un reporte de crash. Tu decisión.

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. Las definiciones completas de schemas de Zod, los helpers de validación y los tests están en el repo.*
