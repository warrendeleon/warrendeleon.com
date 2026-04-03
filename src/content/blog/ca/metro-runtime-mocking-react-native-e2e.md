---
title: "Mocking en temps d'execució amb Metro per a tests E2E deterministes a React Native"
description: "Per què mockejar el backend en tests E2E importa, i com fer-ho a nivell del bundle de Metro. Sense intercepció de xarxa, sense tests inestables, sense dependències externes."
publishDate: 2026-05-11
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: ca
heroImage: "/images/blog/metro-runtime-mocking.jpg"
heroAlt: "Mocking en temps d'execució amb Metro per a testing E2E de React Native"
---

## El problema dels backends reals en tests E2E

Els teus tests de Detox s'executen en un dispositiu real (o simulador). Toquen botons, escriuen text, naveguen per pantalles. En algun moment, l'app fa una crida a l'API. I aquí és on les coses es tornen fràgils.

**Els backends reals fan que els tests E2E siguin no deterministes.** El mateix test pot passar o fallar depenent de:

| Factor | Què falla |
|---|---|
| Latència de xarxa | Timeout al CI, passa en local |
| Rate limiting de l'API | Els tests fallen quan s'executen massa sovint |
| Dades de test compartides | Un altre test ha mutat el mateix usuari |
| Desplegaments del backend | L'API ha canviat entre el teu build i l'execució del test |
| Caigudes de tercers | El proveïdor d'auth està caigut, tots els tests de login fallen |
| Estat de la base de dades | El test espera 3 elements, algú n'ha afegit un 4t |

Cada un d'aquests ha causat una fallada de test en un projecte on he treballat. Cap d'ells era un bug real de l'app.

> 💡 **Un test inestable és pitjor que cap test.** Entrena l'equip a ignorar les fallades. Un cop la gent comença a re-executar la suite "per si de cas", has perdut la confiança en la teva infraestructura de test.

## Per què mockejar el backend?

Per què?

**1. Determinisme.** El mateix test produeix el mateix resultat cada cop. Sense variabilitat de xarxa, sense estat compartit, sense dependències externes. Si un test falla, és perquè l'app està trencada, no perquè l'API ha tingut un mal dia.

**2. Velocitat.** Sense viatges de xarxa d'anada i tornada. Sense esperar consultes a la base de dades. Les respostes mockejades retornen instantàniament. Una suite que triga 8 minuts contra un backend real pot baixar a 3 minuts amb mocks.

**3. Estats d'error testejables.** Amb un backend real, testejar un error 500 vol dir trencar el servidor o construir un endpoint especial. Amb mocks, passes un argument de llançament i l'app retorna l'error que necessitis.

## Els compromisos

Mockejar no és gratis. Tries què cedir.

| Què guanyes | Què perds |
|---|---|
| Resultats deterministes | Confiança que la integració real amb l'API funciona |
| Execució ràpida | Cobertura de casos extrems de xarxa (timeouts, reintents) |
| Sense infraestructura necessària | Les dades fixture poden divergir de les respostes reals de l'API |
| Estats d'error testejables | Cal mantenir les fixtures quan l'API evoluciona |

La resposta honesta: **necessites les dues coses.** Mockeja el backend per a la teva suite E2E diària (la que s'executa a cada PR). Executa un conjunt més petit de tests de smoke contra el backend real amb una programació (cada nit, pre-release). La suite mockejada detecta regressions ràpidament. La suite real detecta la deriva d'integració.

## Per què no MSW?

[MSW funciona bé per a tests unitaris i d'integració](/blog/setting-up-msw-v2-in-react-native/) perquè s'executen a Node.js (via Jest). MSW intercepta les peticions a nivell de xarxa dins del procés de Node.

Els tests E2E de Detox són diferents. L'app s'executa en un procés natiu d'iOS o Android, no a Node.js. MSW no pot interceptar peticions dins d'un procés natiu. Les crides de xarxa surten del runtime de JavaScript i passen per l'stack de xarxa natiu de la plataforma (NSURLSession a iOS, OkHttp a Android).

Necessites una estratègia de mocking que funcioni dins de la pròpia app. Aquí és on entra el mocking en temps d'execució amb Metro.

## Com funciona

La idea és senzilla: en temps de build, incorpora un flag al bundle de JavaScript. En temps d'execució, cada funció d'API comprova el flag. Si el mocking està activat, retorna dades fixture en comptes de fer una crida de xarxa real.

### Pas 1: La variable d'entorn

El plugin `transform-inline-environment-variables` de Babel incorpora variables d'entorn al bundle en temps de compilació:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'transform-inline-environment-variables',
  ],
};
```

Quan fas el build amb `E2E_MOCK=true`, cada referència a `process.env.E2E_MOCK` es converteix en la cadena `"true"` dins del JavaScript compilat. No és una consulta en temps d'execució. És un valor estàtic incorporat al bundle.

### Pas 2: El mòdul de configuració

Un sol mòdul llegeix el flag i l'exposa a la resta de l'app:

```typescript
// src/config/e2e.ts
import Config from 'react-native-config';

const envE2EMockEnabled = Config.E2E_MOCK === 'true';
let runtimeOverride: boolean | null = null;

export function isE2EMockEnabled(): boolean {
  if (runtimeOverride !== null) return runtimeOverride;
  return envE2EMockEnabled;
}

export function setE2EMockOverride(value: boolean | null): void {
  runtimeOverride = value;
}
```

L'override en temps d'execució és útil per a testing de desenvolupador. Un dev pot alternar el mocking sense reconstruir l'app. Per als tests E2E, el flag en temps de build és tot el que necessites.

### Pas 3: Els fitxers fixture

Les dades fixture viuen en fitxers JSON, organitzats per idioma:

```
src/test-utils/fixtures/api/
├── en/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── es/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── ca/
│   └── ...
└── tl/
    └── ...
```

Aquests fitxers s'importen en temps de bundle i s'exporten a través d'un barrel file:

```typescript
// src/test-utils/fixtures/index.ts
import profileEN from './api/en/profile.json';
import educationEN from './api/en/education.json';
import workxpEN from './api/en/workxp.json';

export const mockProfileEN = profileEN as Profile;
export const mockEducationEN = educationEN as Education[];
export const mockWorkXPEN = workxpEN as WorkExperience[];
```

Les fixtures estan tipades. Si la forma de la resposta de l'API canvia i la fixture no coincideix, TypeScript ho detecta en temps de compilació.

### Pas 4: L'interruptor d'API

Cada funció d'API comprova el flag al principi. Si el mocking està activat, retorna dades fixture embolcallades en una resposta compatible amb Axios:

```typescript
export const fetchProfileData = async (
  language: string
): Promise<AxiosResponse<Profile>> => {
  if (isE2EMockEnabled()) {
    const fixtureData = profileFixtures[language] || profileFixtures.en;
    return Promise.resolve({
      data: fixtureData,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    });
  }

  // Crida real a l'API
  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Detalls clau:

- ✅ El path mock retorna un objecte de resposta Axios complet. Redux, selectors i components no noten la diferència
- ✅ Fixtures específiques per idioma amb fallback a anglès
- ✅ El path real segueix validant amb Zod. El path mock salta la validació perquè les fixtures ja estan tipades
- ✅ Sense imports condicionals. Els dos paths existeixen dins la mateixa funció

### Pas 5: Simulació d'errors

El poder real d'aquest enfocament: testing d'errors determinista. Els arguments de llançament controlen quins endpoints fallen i com:

```typescript
// src/config/e2e-error.ts
export type E2EErrorMode =
  | 'none'
  | 'network'
  | 'server-500'
  | 'not-found-404'
  | 'timeout';

interface E2EErrorConfig {
  errorMode: E2EErrorMode;
  errorEndpoint: 'all' | 'profile' | 'education' | 'workExperience';
}
```

A la teva funció d'API, comprova la simulació d'error abans de retornar dades fixture:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    return Promise.reject(error);
  }
  // Retorna dades fixture normals
}
```

Al teu test de Detox, llança l'app amb arguments d'error:

```typescript
await device.launchApp({
  launchArgs: {
    errorMode: 'network',
    errorEndpoint: 'profile',
  },
});
```

Ara pots testejar cada estat d'error de forma determinista: fallades de xarxa, 500s, 404s, timeouts. Cada un és un argument de llançament, no un servidor trencat.

## Mocking d'autenticació

L'auth és la part més complicada. Els fluxos d'auth reals impliquen tokens, sessions, verificació d'email, restabliment de contrasenya. Mockejar-los requereix mantenir estat dins del mock:

```typescript
async signUp(request: SupabaseSignUpRequest): Promise<SupabaseSignUpResponse> {
  if (isE2EMockEnabled()) {
    const mockUser: SupabaseUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: request.email,
      created_at: new Date().toISOString(),
    };
    await EncryptedStore.set(EncryptedStoreKey.USER_EMAIL, mockUser.email);
    return { user: mockUser, session: null };
  }

  const { data } = await this.axiosInstance.post('/auth/v1/signup', request);
  return data;
}
```

El mock emmagatzema l'email de l'usuari a l'encrypted storage, igual que ho faria el flux real. Les crides d'API posteriors (login, obtenció del perfil) poden llegir aquest estat emmagatzemat per mantenir la consistència durant la sessió.

Per a testing d'errors, una convenció senzilla funciona bé: les contrasenyes que comencen amb "Wrong" provoquen un error d'auth. Sense cap configuració especial necessària.

## El flux de build i test

```bash
# Construeix l'app amb mocking activat
E2E_MOCK=true yarn detox:ios:build

# Executa els tests E2E (l'app usa dades fixture)
yarn detox:ios:test

# Executa tests de smoke contra el backend real (build separat)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

El build mockejat i el build real són binaris d'app separats. El mockejat s'usa per a la suite E2E completa. El real s'usa per a una suite de smoke més petita.

## Errors comuns

**Les fixtures divergeixen de l'API real.** El risc més gran. Si el backend afegeix un camp i les teves fixtures no el tenen, els tests mock passen, però l'app real es trenca. Resol-ho executant la validació del teu esquema Zod contra les fixtures en un test unitari. Si la fixture no coincideix amb l'esquema, el test falla.

**Mockejar massa.** Si cada crida d'API està mockejada, estàs testejant les teves fixtures, no la teva app. Manté el mocking al límit HTTP. Redux, gestió d'estat, navegació i renderització d'UI han de ser reals.

**Oblidar-se de testejar la integració real.** Els tests E2E mockejats detecten regressions d'UI. No detecten canvis en el contracte de l'API. Executa una suite de smoke amb backend real amb una programació, encara que siguin només 5 paths crítics.

**Filtrar estat mock entre escenaris.** Cada escenari de Detox hauria de començar amb un estat d'app net. Usa `device.reloadReactNative()` al hook `Before` per reiniciar-ho tot. No confiïs en l'estat mock d'un escenari anterior.

## El resultat

El setup és un dia de feina. Després d'això, la teva suite E2E s'executa sense backend, sense dependències de xarxa i sense fallades inestables de serveis externs.

Al meu projecte, la suite mockejada s'executa en 3 minuts. Els mateixos tests contra un backend real trigaven 8 minuts i fallaven intermitentment. La suite mockejada ha estat verda durant setmanes. La suite real necessitava supervisió.

Els dos enfocaments funcionen junts. Mock per a velocitat i determinisme a cada PR. Backend real per a confiança d'integració amb una programació. Cap dels dos sol és suficient.

> El propòsit dels tests E2E és detectar regressions de l'app, no testejar la teva connexió de xarxa.

*Aquest post forma part d'una sèrie sobre testing d'apps React Native. Els posts anteriors cobreixen [MSW v2 per a tests unitaris i d'integració](/blog/setting-up-msw-v2-in-react-native/) i [Detox + Cucumber BDD per a testing E2E](/blog/detox-cucumber-bdd-react-native-e2e-testing/). Els exemples de codi són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
