---
title: "Estructura de proyecto feature-first en React Native"
description: "Por qué las estructuras de carpetas por tipo dejan de funcionar a escala, y cómo organizar por feature con stores, tests y screens co-localizados mantiene un codebase de React Native manejable a medida que crece."
publishDate: 2026-05-18
tags: ["react-native", "architecture", "project-structure"]
locale: es
heroImage: "/images/blog/feature-first-rn.jpg"
heroAlt: "Estructura de proyecto feature-first en React Native"
campaign: "feature-first-structure"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing"]
---

## 85 ficheros para una sola feature

Esos son los ficheros TypeScript que tiene mi feature de Auth. Seis pantallas, un store de Redux, un contexto de React, un custom hook, componentes de PIN con stories de Storybook, schemas de validación de formularios contra una **blacklist de contraseñas comunes**, rate limiting, un servicio de lockout, y tests a todos los niveles.

En la mayoría de proyectos React Native, esos 85 ficheros estarían repartidos entre **7 carpetas diferentes**. Las pantallas en un sitio, los hooks en otro, el store slice en otro, la validación en otro más. Para entender cómo funciona la autenticación, tendrías que abrir 7 carpetas y reconstruir mentalmente las relaciones entre ficheros que no están cerca unos de otros.

Probé esa estructura una vez. Duró unas cuatro features antes de que dejara de saber qué pertenecía a qué.

## La estructura que deja de escalar

Conoces este layout:

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

Ficheros agrupados por lo que *son*, no por lo que *hacen*. **Type-first.** Queda limpio cuando la app tiene tres pantallas. Si alguna vez has hecho una prueba técnica, [la estructura de carpetas es una de las primeras cosas que mira un revisor](/blog/how-to-pass-a-react-native-tech-test/).

Luego añades autenticación con configuración de PIN, verificación de email, recuperación de contraseña. Añades gestión de perfil con subida de fotos, edición de cuenta, cambio de contraseña. De repente `screens/` tiene 25 ficheros y encontrar el hook que pertenece a la subida de foto de perfil implica escanear una lista alfabética de *todos los hooks de la app*.

Ahora intenta **eliminar una feature**. Borra la pantalla de `screens/`. Busca su hook en `hooks/`. Su servicio en `services/`. Su store slice. Sus componentes. Su schema de validación. Sus tests, en un árbol `__tests__/` completamente diferente. Si te dejas un fichero, tienes código muerto que va a quedarse ahí meses.

Esa es la prueba. Si eliminar una feature lleva más tiempo que construirla, tu estructura está jugando en tu contra.

## Una carpeta por feature

Mi app tiene 13 features. Cada una vive en un solo directorio:

```
src/features/
├── Auth/          # 85 ficheros. Login, registro, PIN, lockout
├── Profile/       # API, store, subida de foto, 5 pantallas
├── Settings/      # Tema, idioma, 3 pantallas
├── Education/     # Store, API, 1 pantalla
├── WorkExperience/# Store, API, 4 pantallas
├── Home/          # 1 pantalla, 1 export
├── Legal/         # Política de privacidad, T&Cs
└── Splash/        # Splash screen
```

Todo lo demás vive fuera de features: `shared/` para componentes reutilizables, `store/` para la configuración de Redux, `navigation/`, `httpClients/`, `utils/`, `i18n/`.

La feature más simple tiene dos ficheros. La más compleja, 85. **Cada una solo tiene las carpetas que realmente necesita.** Ningún directorio `services/` vacío porque una plantilla decía que debería estar ahí.

## Cómo se ven 85 ficheros cuando están co-localizados

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

El hashing del PIN está al lado de la validación del PIN, que está al lado de los componentes del PIN, que está al lado de la pantalla de configuración del PIN. **La relación entre ficheros es visible en la propia estructura de carpetas.** Abro `Auth/` y puedo ver cada pieza del sistema de autenticación sin mirar en ningún otro sitio.

En una estructura type-first, esos mismos ficheros del PIN estarían en `components/`, `utils/`, `services/` y `screens/`. *Cuatro carpetas para un solo concepto.*

## La prueba de eliminar

¿Recuerdas esa prueba de fuego? Así es como se ve eliminar una feature ahora.

**Type-first:** borrar ficheros de `screens/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `validation/` y `__tests__/`. Si te dejas un fichero, tienes un huérfano. Si te dejas un import, la app falla.

**Feature-first:** borrar `src/features/Auth/`, quitar `authReducer` de la configuración del store, eliminar las rutas de navegación. **Tres pasos.** El compilador me dice si me dejé alguna referencia.

Lo he hecho. Eliminar una feature que tocaba más de 40 ficheros me llevó menos de un minuto. La mayor parte de ese minuto fue actualizar la configuración de navegación.

## El contrato que hace seguro refactorizar

Cada feature exporta solo lo que el resto de la app necesita. El `index.ts` en la raíz de la feature es el contrato:

```typescript
// src/features/Auth/index.ts
export { authReducer, login, logout, selectIsAuthenticated } from './store';
export { AuthProvider } from './context';
export { useAuth } from './hooks';
export { LoginScreen, RegistrationScreen } from './screens';
```

El hashing del PIN, el rate limiting, la lógica de lockout: **nada de eso se exporta.** Es interno de Auth. Puedo reescribir la implementación *entera* del PIN, y mientras los exports no cambien, nada fuera de Auth se entera.

La configuración del store importa `authReducer`. La navegación importa las pantallas. Eso es todo. Los más de 80 ficheros internos son invisibles para el resto del codebase.

## Las features nunca importan de otras features

Esta es la regla que mantiene todo unido.

Si Auth necesita saber si un perfil está cargado, lee del store de Redux a través de un selector. No importa de `@app/features/Profile` directamente. **El store es la única capa de comunicación entre features.**

Cada feature es dueña de su slice de Redux. El root store los combina:

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

Rompe la regla de no importar entre features una sola vez y acabarás con dependencias circulares en una semana. La Feature A importa de la Feature B, que importa de la Feature C, que importa de la Feature A. El bundler lanza un error críptico y nadie sabe dónde empieza el ciclo.

## El código compartido se gana su sitio

Si un componente lo usa **una sola feature**, se queda en esa feature. Si dos o más features lo necesitan, se mueve a `src/shared/`. Pero el listón es alto.

Cada abstracción compartida es un **punto de acoplamiento**. En el momento en que `AlertBox` vive en `shared/`, cinco features dependen de su interfaz. Cambiarlo implica revisar cinco features. Prefiero duplicar tres líneas en dos features que crear una utilidad compartida que haga a ambas más difíciles de cambiar de forma independiente.

Los hooks que acaban en `shared/` son los genuinamente transversales: `useAppColorScheme`, `useHapticFeedback`, `useReducedMotion`. Cosas que cualquier pantalla puede necesitar. No cosas que *dos pantallas* resulta que necesitan ahora mismo.

## Los tests siguen el mismo principio

Los tests viven al lado del código que testean. Los tests del store de Auth están en `Auth/store/__tests__/`. Los tests de validación de Auth están en `Auth/validation/__tests__/`. No hay un árbol de tests separado en la raíz del proyecto.

La única excepción: **tests de integración entre features**. El login fluyendo hacia la carga del perfil. Cambios en Settings propagándose a la UI. Estos abarcan múltiples features, así que viven en `src/features/__tests__/`, fuera de cualquier feature individual.

```
src/features/__tests__/
├── CrossFeatureIntegration.rntl.tsx
├── OnboardingJourney.integration.rntl.tsx
└── ProfileCompletionJourney.integration.rntl.tsx
```

Cuando un test falla, sé exactamente dónde mirar. Si está en `Auth/store/__tests__/`, el problema está en el store de auth. Si está en `features/__tests__/`, el problema está en cómo interactúan las features. La ubicación *es* el diagnóstico.

## Cuándo hacer el cambio

Si tu app tiene tres pantallas y ninguna gestión de estado, *no hagas esto*. Una lista plana de pantallas y un par de hooks compartidos es suficiente. Feature-first añade una sobrecarga que los proyectos pequeños no necesitan.

El punto de inflexión está en torno a las **5 features con su propio estado**. Por debajo, la estructura cuesta más de lo que ahorra. Por encima, type-first se convierte en lo que te frena.

Abre tu carpeta `screens/` ahora mismo. Cuenta los ficheros. Si no puedes decir cuáles van juntos solo mirando la lista, tu estructura ya ha dejado de ayudarte.

El código fuente completo del proyecto está en [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).
