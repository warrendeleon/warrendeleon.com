---
title: "Estructura de projecte per funcionalitat a React Native"
description: "Per què les estructures de carpetes per tipus deixen de funcionar a escala, i com organitzar per funcionalitat amb stores, tests i pantalles co-localitzats manté un codebase React Native mantenible a mesura que creix."
publishDate: 2026-05-25
tags: ["react-native", "architecture", "project-structure"]
locale: ca
heroImage: "/images/blog/feature-first-rn.jpg"
heroAlt: "Estructura de projecte per funcionalitat a React Native"
campaign: "feature-first-structure"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing"]
---

## 85 fitxers per una sola funcionalitat

Aquests són els fitxers TypeScript que té la meva funcionalitat d'Auth. Sis pantalles, un store de Redux, un context de React, un hook personalitzat, components de PIN amb stories de Storybook, esquemes de validació de formularis contra una **llista negra de contrasenyes comunes**, limitació de peticions, un servei de bloqueig, i tests a tots els nivells.

A la majoria de projectes React Native, aquests 85 fitxers estarien repartits per **7 carpetes diferents**. Les pantalles en un lloc, els hooks en un altre, el slice del store en un altre, la validació en un altre. Per entendre com funciona l'autenticació, hauries d'obrir 7 carpetes i reconstruir mentalment les relacions entre fitxers que no estan a prop els uns dels altres.

Vaig provar aquesta estructura una vegada. Va aguantar unes quatre funcionalitats abans de perdre el fil de què pertanyia a què.

## L'estructura que no escala

Coneixes aquest esquema:

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

Fitxers agrupats pel que *són*, no pel que *fan*. **Per tipus.** Queda net quan l'app té tres pantalles. Si alguna vegada has fet una prova tècnica, [l'estructura de carpetes és una de les primeres coses que mira un revisor](/blog/how-to-pass-a-react-native-tech-test/).

Llavors afegeixes autenticació amb configuració de PIN, verificació per correu, recuperació de contrasenya. Afegeixes gestió del perfil amb pujada de fotos, edició del compte, canvi de contrasenya. De cop `screens/` té 25 fitxers i trobar el hook de la pujada de foto de perfil vol dir escanejar una llista alfabètica de *tots els hooks de l'app*.

Ara prova d'**eliminar una funcionalitat**. Treu la pantalla de `screens/`. Troba el seu hook a `hooks/`. El seu servei a `services/`. El seu slice del store. Els seus components. El seu esquema de validació. Els seus tests, en un arbre `__tests__/` completament diferent. Si et deixes un fitxer, tens codi mort que s'hi quedarà durant mesos.

Aquesta és la prova. Si eliminar una funcionalitat triga més que construir-la, la teva estructura t'està jugant en contra.

## Una carpeta per funcionalitat

La meva app té 13 funcionalitats. Cadascuna viu en un sol directori:

```
src/features/
├── Auth/          # 85 fitxers. Login, registre, PIN, bloqueig
├── Profile/       # API, store, pujada de foto, 5 pantalles
├── Settings/      # Tema, idioma, 3 pantalles
├── Education/     # Store, API, 1 pantalla
├── WorkExperience/# Store, API, 4 pantalles
├── Home/          # 1 pantalla, 1 export
├── Legal/         # Política de privacitat, T&Cs
└── Splash/        # Pantalla de splash
```

La resta queda fora de les funcionalitats: `shared/` per a components reutilitzables, `store/` per a la configuració de Redux, `navigation/`, `httpClients/`, `utils/`, `i18n/`.

La funcionalitat més senzilla són dos fitxers. La més complexa, 85. **Cadascuna només té les carpetes que realment necessita.** Cap directori `services/` buit perquè una plantilla deia que hi havia de ser.

## Com es veuen 85 fitxers quan estan co-localitzats

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

El hashing del PIN és al costat de la validació del PIN, que és al costat dels components de PIN, que és al costat de la pantalla de configuració del PIN. **La relació entre fitxers es veu a l'estructura de carpetes mateixa.** Obro `Auth/` i puc veure cada peça del sistema d'autenticació sense mirar enlloc més.

En una estructura per tipus, aquests mateixos fitxers de PIN estarien a `components/`, `utils/`, `services/` i `screens/`. *Quatre carpetes per un sol concepte.*

## La prova d'eliminació

Recordes aquella prova de foc? Així és com queda eliminar una funcionalitat ara.

**Per tipus:** esborra fitxers de `screens/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `validation/` i `__tests__/`. Si et deixes un fitxer, tens un orfe. Si et deixes un import, l'app peta.

**Per funcionalitat:** esborra `src/features/Auth/`, treu `authReducer` de la configuració del store, treu les rutes de navegació. **Tres passos.** El compilador m'avisa si m'he deixat alguna referència.

Ho he fet. Eliminar una funcionalitat que tocava més de 40 fitxers va trigar menys d'un minut. La major part d'aquell minut va ser actualitzar la configuració de navegació.

## El contracte que fa segur el refactoring

Cada funcionalitat només exporta el que la resta de l'app necessita. El `index.ts` a l'arrel de la funcionalitat és el contracte:

```typescript
// src/features/Auth/index.ts
export { authReducer, login, logout, selectIsAuthenticated } from './store';
export { AuthProvider } from './context';
export { useAuth } from './hooks';
export { LoginScreen, RegistrationScreen } from './screens';
```

El hashing del PIN, la limitació de peticions, la lògica de bloqueig: **res d'això s'exporta.** És intern d'Auth. Puc reescriure *tota* la implementació del PIN, i mentre els exports no canviïn, res fora d'Auth se n'assabenta.

La configuració del store importa `authReducer`. La navegació importa les pantalles. Prou. Els més de 80 fitxers interns són invisibles per a la resta del codebase.

## Les funcionalitats mai importen d'altres funcionalitats

Aquesta és la regla que ho aguanta tot.

Si Auth necessita saber si un perfil està carregat, llegeix del store de Redux via un selector. No importa de `@app/features/Profile` directament. **El store és l'única capa de comunicació entre funcionalitats.**

Cada funcionalitat és propietària del seu slice de Redux. El store arrel els combina:

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

Trenca la regla de no importar entre funcionalitats un cop i acabaràs amb dependències circulars en una setmana. La funcionalitat A importa de la B, que importa de la C, que importa de la A. El bundler llança un error críptic i ningú sap on comença el cicle.

## El codi compartit es guanya el seu lloc

Si un component el fa servir **una sola funcionalitat**, es queda dins d'aquella funcionalitat. Si dues o més el necessiten, es mou a `src/shared/`. Però el llistó és alt.

Cada abstracció compartida és un **punt d'acoblament**. En el moment que `AlertBox` viu a `shared/`, cinc funcionalitats depenen de la seva interfície. Canviar-lo vol dir revisar cinc funcionalitats. Prefereixo duplicar tres línies en dues funcionalitats que crear una utilitat compartida que faci les dues més difícils de canviar per separat.

Els hooks que acaben a `shared/` són els genuïnament transversals: `useAppColorScheme`, `useHapticFeedback`, `useReducedMotion`. Coses que qualsevol pantalla pot necessitar. No coses que *dues pantalles* resulta que necessiten ara mateix.

## Els tests segueixen el mateix principi

Els tests viuen al costat del codi que proven. Els tests del store d'Auth són a `Auth/store/__tests__/`. Els tests de validació d'Auth són a `Auth/validation/__tests__/`. Cap arbre de tests separat a l'arrel del projecte.

L'única excepció: **tests d'integració entre funcionalitats**. El login que flueix cap a la càrrega del perfil. Canvis de configuració que es propaguen a la UI. Aquests abasten múltiples funcionalitats, així que viuen a `src/features/__tests__/`, fora de cap funcionalitat individual.

```
src/features/__tests__/
├── CrossFeatureIntegration.rntl.tsx
├── OnboardingJourney.integration.rntl.tsx
└── ProfileCompletionJourney.integration.rntl.tsx
```

Quan un test falla, sé exactament on mirar. Si és a `Auth/store/__tests__/`, el problema és al store d'auth. Si és a `features/__tests__/`, el problema és en com interactuen les funcionalitats. La ubicació *és* el diagnòstic.

## Quan canviar

Si la teva app té tres pantalles i cap gestió d'estat, *no facis això*. Una llista plana de pantalles i un parell de hooks compartits ja va bé. L'estructura per funcionalitat afegeix sobrecàrrega que els projectes petits no necessiten.

El punt d'inflexió és al voltant de **5 funcionalitats amb el seu propi estat**. Per sota, l'estructura costa més del que estalvia. Per sobre, l'estructura per tipus es converteix en allò que et frena.

Obre la teva carpeta `screens/` ara mateix. Compta els fitxers. Si no pots dir quins van junts només mirant la llista, la teva estructura ja ha deixat d'ajudar-te.

El codi font complet del projecte és a [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).
