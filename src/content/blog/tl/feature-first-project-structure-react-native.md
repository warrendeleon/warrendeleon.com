---
title: "Feature-first na project structure sa React Native"
description: "Bakit nasisira ang type-first na folder structures kapag lumaki na ang app, at paano nakakatulong ang pag-organisa by feature na may co-located stores, tests, at screens para mapanatiling maintainable ang React Native codebase habang lumalaki ito."
publishDate: 2026-05-25
tags: ["react-native", "architecture", "project-structure"]
locale: tl
heroImage: "/images/blog/feature-first-rn.jpg"
heroAlt: "Feature-first na project structure sa React Native"
campaign: "feature-first-structure"
relatedPosts: ["building-a-supabase-rest-client-without-the-sdk", "setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing"]
---

## 85 files para sa isang feature

Ganyan karami ang TypeScript files ng Auth feature ko. Anim na screens, isang Redux store, isang React context, isang custom hook, mga PIN components na may Storybook stories, form validation schemas laban sa **common password blacklist**, rate limiting, lockout service, at tests sa bawat level.

Sa karamihan ng React Native projects, ang 85 files na 'yan ay nakakalat sa **7 magkakaibang folders**. Screens sa isang lugar, hooks sa isa pa, store slice sa iba, validation sa isa pa. Para maintindihan kung paano gumagana ang authentication, kailangan mong buksan ang 7 folders at mentally i-reconstruct ang relationships ng mga files na wala namang kalapit-lapit sa isa't isa.

Na-try ko ang structure na 'yan dati. Tumagal lang ng mga apat na features bago ko na hindi ma-track kung ano ang naka-belong sa alin.

## Ang structure na hindi na nag-i-scale

Kilala mo 'tong layout na 'to:

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

Mga files na grouped ayon sa kung ano sila, hindi sa kung ano ang ginagawa nila. **Type-first.** Malinis siya kapag tatlong screens lang ang app. Kung nag-take-home tech test ka na, [ang folder structure mo ay isa sa mga unang tinitingnan ng reviewer](/blog/how-to-pass-a-react-native-tech-test/).

Tapos magdadagdag ka ng authentication na may PIN setup, email verification, password recovery. Magdadagdag ka ng profile management na may picture uploads, account editing, password changes. Bigla na lang 25 files na ang `screens/` at para mahanap ang hook na para sa profile picture upload, kailangan mong mag-scan ng alphabetical list ng *bawat hook sa buong app*.

Ngayon subukan mong **mag-delete ng feature**. I-remove ang screen mula sa `screens/`. Hanapin ang hook nito sa `hooks/`. Ang service nito sa `services/`. Ang store slice nito. Ang components nito. Ang validation schema nito. Ang tests nito, na nasa completely different na `__tests__/` tree. Makalamiss ka ng isang file at may dead code ka na tatambay dyan ng ilang buwan.

'Yan ang test. Kung mas matagal mag-remove ng feature kaysa mag-build ng isa, ang structure mo ay lumalaban sa 'yo.

## Isang folder per feature

May 13 features ang app ko. Bawat isa ay nasa iisang directory lang:

```
src/features/
├── Auth/          # 85 files. Login, registration, PIN, lockout
├── Profile/       # API, store, picture upload, 5 screens
├── Settings/      # Theme, language, 3 screens
├── Education/     # Store, API, 1 screen
├── WorkExperience/# Store, API, 4 screens
├── Home/          # 1 screen, 1 export
├── Legal/         # Privacy policy, T&Cs
└── Splash/        # Splash screen
```

Lahat ng iba pa ay nasa labas ng features: `shared/` para sa reusable components, `store/` para sa Redux config, `navigation/`, `httpClients/`, `utils/`, `i18n/`.

Ang pinakasimple na feature ay dalawang files. Ang pinaka-complex ay 85. **Bawat isa ay may mga folders lang na talagang kailangan niya.** Walang empty na `services/` directory dahil lang sinabi ng template na dapat nandoon.

## Ano ang itsura ng 85 files kapag co-located

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

Ang PIN hashing ay katabi ng PIN validation na katabi ng PIN components na katabi ng PIN setup screen. **Ang relationship ng mga files ay nakikita mismo sa folder structure.** Binubuksan ko ang `Auth/` at nakikita ko na ang bawat piraso ng authentication system nang hindi na tinitignan ang ibang lugar.

Sa type-first na structure, ang mga PIN files na 'yan ay nasa `components/`, `utils/`, `services/`, at `screens/`. *Apat na folders para sa isang concept.*

## Ang delete test

Naaalala mo 'yung acid test? Ganito na ang itsura ng pag-remove ng feature ngayon.

**Type-first:** mag-delete ng files mula sa `screens/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `validation/`, at `__tests__/`. Maka-miss ka ng isang file at may orphan ka na. Maka-miss ka ng import at mag-crash ang app.

**Feature-first:** i-delete ang `src/features/Auth/`, i-remove ang `authReducer` mula sa store config, i-remove ang navigation routes. **Tatlong steps.** Sasabihin ng compiler kung may na-miss akong reference.

Nagawa ko na 'to. Pag-remove ng feature na may 40+ files ay wala pang isang minuto. Karamihan ng minuto na 'yon ay pag-update ng navigation config.

## Ang contract na nagpapaligtas sa refactoring

Bawat feature ay nag-e-export lang ng kailangan ng iba pang bahagi ng app. Ang `index.ts` sa feature root ang siyang contract:

```typescript
// src/features/Auth/index.ts
export { authReducer, login, logout, selectIsAuthenticated } from './store';
export { AuthProvider } from './context';
export { useAuth } from './hooks';
export { LoginScreen, RegistrationScreen } from './screens';
```

PIN hashing, rate limiting, lockout logic: **wala sa mga 'yan ang naka-export.** Internal lahat sa Auth. Puwede kong i-rewrite ang *buong* PIN implementation, at basta hindi nagbabago ang exports, walang napapansin sa labas ng Auth.

Ang store config ay nag-i-import ng `authReducer`. Ang navigation ay nag-i-import ng screens. 'Yon lang. Ang 80+ internal files ay invisible sa natitirang codebase.

## Ang mga features ay hindi nag-i-import mula sa ibang features

Ito ang rule na nagbubuklod sa lahat.

Kung kailangan malaman ng Auth kung naka-load na ang profile, nagbabasa ito mula sa Redux store gamit ang selector. Hindi ito nag-i-import mula sa `@app/features/Profile` nang direkta. **Ang store lang ang communication layer sa pagitan ng features.**

Bawat feature ay may-ari ng sarili nitong Redux slice. Ang root store ang nag-combine sa kanila:

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

I-break mo ang no-cross-import rule nang isang beses at magkakaroon ka ng circular dependencies within a week. Nag-i-import ang Feature A mula sa Feature B na nag-i-import mula sa Feature C na nag-i-import mula sa Feature A. Maglalabas ang bundler ng cryptic error at walang nakakaalam kung saan nagsimula ang cycle.

## Ang shared code ay kailangang deserve ang lugar niya

Kung isang feature lang ang gumagamit ng component, nananatili ito sa feature na 'yon. Kung dalawa o higit pang features ang nangangailangan, lilipat ito sa `src/shared/`. Pero mataas ang bar.

Bawat shared abstraction ay isang **coupling point**. Sa sandaling mapunta ang `AlertBox` sa `shared/`, limang features ang naka-depend sa interface nito. Kapag binago mo ito, kailangan mong i-check ang limang features. Mas gusto ko pang mag-duplicate ng tatlong linya sa dalawang features kaysa gumawa ng shared utility na nagpapahirap sa pag-change ng bawat isa nang independently.

Ang mga hooks na napupunta sa `shared/` ay 'yung talagang cross-cutting: `useAppColorScheme`, `useHapticFeedback`, `useReducedMotion`. Mga bagay na maaaring kailanganin ng bawat screen. Hindi mga bagay na *dalawang screens* lang naman ang nagkataong kailangan ngayon.

## Ang tests ay sumusunod sa parehong prinsipyo

Ang tests ay katabi ng code na tine-test nila. Ang Auth store tests ay nasa `Auth/store/__tests__/`. Ang Auth validation tests ay nasa `Auth/validation/__tests__/`. Walang hiwalay na test tree sa project root.

Ang isang exception: **cross-feature integration tests**. Login na nag-f-flow papunta sa profile loading. Settings changes na nagpo-propagate sa UI. Tumatawid ang mga ito sa maraming features, kaya nasa `src/features/__tests__/` sila, sa labas ng kahit anong single feature.

```
src/features/__tests__/
├── CrossFeatureIntegration.rntl.tsx
├── OnboardingJourney.integration.rntl.tsx
└── ProfileCompletionJourney.integration.rntl.tsx
```

Kapag nag-break ang isang test, alam ko kung saan titingnan. Kung nasa `Auth/store/__tests__/`, ang problema ay sa auth store. Kung nasa `features/__tests__/`, ang problema ay sa kung paano nag-i-interact ang mga features. Ang location mismo *ang* diagnosis.

## Kailan mo dapat mag-switch

Kung tatlong screens lang ang app mo at walang state management, *huwag gawin 'to*. Sapat na ang flat list ng screens at ilang shared hooks. Nagdadagdag ng overhead ang feature-first na hindi kailangan ng maliliit na projects.

Ang crossover point ay nasa bandang **5 features na may sariling state**. Sa ilalim no'n, mas mahal ang structure kaysa sa naitatabi nito. Sa ibabaw no'n, ang type-first na ang nagpapabagal sa 'yo.

Buksan mo ang `screens/` folder mo ngayon. Bilangin ang files. Kung hindi mo masabi kung alin ang magkakasama sa tingin lang sa list, hindi ka na tinutulungan ng structure mo.

Ang buong project source ay nasa [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).
