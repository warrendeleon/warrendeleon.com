---
title: "Mocking en temps d'execució amb Metro per a tests E2E deterministes a React Native"
description: "Mocking del backend a nivell del bundle de Metro per a Detox. Sense intercepció de xarxa, sense tests inestables, sense serveis externs. Per què bat MSW per a E2E."
tags: ["react-native", "testing", "e2e-testing", "mocking"]
locale: ca
heroImage: "/images/blog/metro-runtime-mocking.webp"
heroAlt: "Mocking en temps d'execució amb Metro per a testing E2E de React Native"
campaign: "metro-runtime-mocking"
relatedPosts: ["setting-up-msw-v2-in-react-native", "detox-cucumber-bdd-react-native-e2e-testing", "building-a-supabase-rest-client-without-the-sdk"]
---

## El problema dels backends reals en tests E2E

Els teus tests de Detox s'executen en un dispositiu real o un simulador. Toquen botons, escriuen text, naveguen per pantalles. En algun moment, l'app fa una crida a l'API. Aquí és on les coses es tornen fràgils.

El mateix test pot passar o fallar depenent de:

| Factor | Què falla |
|---|---|
| Latència de xarxa | Timeout al CI, passa en local |
| Rate limiting de l'API | Els tests fallen quan s'executen massa sovint |
| Dades de test compartides | Un altre test ha mutat el mateix usuari |
| Desplegaments del backend | L'API ha canviat entre el teu build i l'execució del test |
| Caigudes de tercers | El proveïdor d'auth està caigut, tots els tests de login fallen |
| Estat de la base de dades | El test espera 3 elements, algú n'ha afegit un 4t |

Cada un d'aquests ha causat una fallada de test en un projecte on he treballat. Cap era un bug real de l'app.

Un test inestable és pitjor que cap test. Entrena l'equip a ignorar les fallades. Un cop la gent comença a re-executar la suite "per si de cas", has perdut la confiança en la teva infraestructura de test.

## Per què no MSW, Mirage o un servidor mock?

Són les opcions evidents, i cadascuna encaixa amb una forma concreta. Val la pena dir què fan bé abans d'explicar per què les deixo de banda per a Detox.

**MSW** intercepta peticions a la capa de xarxa dins de Node. Va molt bé per als tests unitaris i d'integració amb Jest, i és on l'[uso en aquest mateix projecte](/blog/setting-up-msw-v2-in-react-native/). El mode Service Worker cobreix el navegador. En una execució de Detox, però, l'app corre en un procés natiu d'iOS o Android, i la petició surt del runtime de JS per NSURLSession o OkHttp. MSW no les pot veure.

**Mirage JS** corre un servidor mock en memòria dins de l'app. Parxeja `fetch` i `XMLHttpRequest` al runtime de JS, cosa que funciona per a llibreries que hi passen (Axios al costat JS, fins que comences a usar capes de xarxa natives). El model d'intercepció és sòlid per a desenvolupament i Jest; encaixa menys amb builds de Detox on vols el swap incorporat al binari.

**Servidors mock independents** (Prism, json-server, una petita app Express a localhost) són l'opció més realista. Exerciten tot l'stack de xarxa. El compromís és operatiu: ara tens un procés per arrencar, un port a gestionar, fontaneria de CI per aixecar-lo al costat del simulador i un build que depèn d'un sidecar actiu. Per a un projecte petit gestionat per una o dues persones, sol pesar més del que val.

L'enfocament que vull descriure aquí manté el swap dins del bundle. Sense sidecar, sense Service Worker, sense parxejar `fetch`. Un flag de build escull la implementació de l'API en temps de compilació; la resta de l'app no canvia. Encaixa amb apps on controles el client HTTP (Axios, un client REST fet a mà) i vols un binari per cada mode de test.

## Què hi perds

Simular no és gratis. Tries què canviar.

| Què guanyes | Què perds |
|---|---|
| Resultats deterministes | Confiança que la integració real amb l'API funciona |
| Execució ràpida | Cobertura de casos extrems de xarxa (timeouts, reintents) |
| Sense infraestructura necessària | Les dades fixture poden divergir de les respostes reals de l'API |
| Estats d'error verificables | Cal mantenir les fixtures quan l'API evoluciona |

La divisió honesta: simula per a la suite E2E diària que s'executa a cada PR, després executa un conjunt de smoke més petit contra el backend real amb una programació (cada nit, pre-release). La suite simulada detecta regressions ràpidament. La suite real detecta la deriva d'integració. Cap de les dues sola no és suficient.

## Per què el bundle i no la xarxa

Tres raons.

Determinisme. Mateixa entrada, mateixa sortida, cada cop. Sense reintents inestables d'un runner de CI lent, sense estat compartit entre execucions, sense una caiguda del proveïdor d'auth fent fallar vint tests alhora. Si un test de Detox falla, l'app està malament.

Velocitat. Sense viatges d'anada i tornada. Sense base de dades. Les respostes simulades es resolen síncronament dins de `Promise.resolve`. Una suite que trigava vuit minuts contra un backend real baixa a tres amb això muntat, al mateix projecte.

Estats d'error sense infraestructura. Provar un 500 contra un servidor real vol dir trencar-lo o cablejar un endpoint especial. Amb un flag i un argument de llançament, tens cada classe d'error a la carta: xarxa, 500, 404, timeout.

## Com funciona

En temps de build, incorpora un flag al build natiu. En temps d'execució, cada funció d'API comprova el flag. Si el mocking està activat, retorna dades fixture embolcallades en la mateixa forma de resposta; si no, fa la crida real. La decisió passa dins de la funció, així els consumidors (Redux, pantalles, hooks) queden idèntics.

### Pas 1: tria com entra el flag

Dues opcions pràctiques. No són excloents, però normalment vols una de les dues.

`react-native-config` llegeix un fitxer `.env` en temps de build natiu i exposa els valors a través de `Config.E2E_MOCK`. El valor es fixa quan Xcode o Gradle compilen el binari, així que executes `E2E_MOCK=true yarn detox:ios:build` per produir un build simulat.

```bash
yarn add react-native-config
cd ios && pod install && cd ..
```

L'alternativa al costat JS és el plugin de Babel `babel-plugin-transform-inline-environment-variables`. Reescriu `process.env.E2E_MOCK` al teu codi a la cadena literal en temps de bundle. Si vas per aquí, llegeixes el flag directament:

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-environment-variables'],
};
```

Tots dos enfocaments et donen la mateixa propietat: el flag és una constant al binari distribuït, no una consulta en temps d'execució. La resta del post fa servir `react-native-config`, que és el que fa servir el [repo rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon) en producció.

### Pas 2: el mòdul de configuració

Un sol mòdul llegeix el flag i l'exposa. La implementació de referència també admet un override en temps d'execució (útil per anar canviant els mocks en sessions manuals de dev sense reconstruir), però el flag en temps de build és el que sustenten les teves execucions de Detox.

```typescript
// src/config/e2e.ts
import Config from 'react-native-config';

const envE2EMockEnabled = Config.E2E_MOCK === 'true';
let runtimeOverride: boolean | null = null;

export const isE2EMockEnabled = (): boolean => {
  return runtimeOverride ?? envE2EMockEnabled;
};

export const setE2EMockOverride = (value: boolean | null): void => {
  runtimeOverride = value;
};
```

Al codi real, l'override es persisteix a `AsyncStorage` perquè sobrevisqui a una recàrrega; és una extensió, no la idea bàsica.

### Pas 3: els fitxers fixture

Les dades fixture viuen en fitxers JSON, organitzats per idioma:

```
src/test-utils/fixtures/api/
├── en/
│   ├── profile.json
│   ├── education.json
│   └── workxp.json
├── es/
├── ca/
├── pl/
└── tl/
```

Una fixture és JSON pla que coincideix amb la forma de resposta de l'API:

```json
// src/test-utils/fixtures/api/en/profile.json
{
  "name": "Warren",
  "email": "warren@example.com",
  "phone": "+44 7700 900000",
  "profilePicture": "https://example.com/avatar.png"
}
```

Un barrel file les exporta amb els tipus adjuntats, així una fixture que no quadra és un error de compilació:

```typescript
// src/test-utils/fixtures/index.ts
import profileENData from './api/en/profile.json';
import educationENData from './api/en/education.json';
import workxpENData from './api/en/workxp.json';

export const mockProfileEN = profileENData as Profile;
export const mockEducationEN = educationENData as Education[];
export const mockWorkXPEN = workxpENData as WorkExperience[];
```

### Pas 4: l'interruptor d'API

Cada funció d'API comprova el flag al principi. Si el mocking està activat, retorna dades fixture embolcallades en una resposta compatible amb Axios. Aquest patró depèn de tenir la propietat del límit HTTP, que és una de les raons per les quals vaig [construir el meu propi client REST](/blog/building-a-supabase-rest-client-without-the-sdk/) en lloc de prendre el SDK de Supabase.

```typescript
import profileEN from '@app/test-utils/fixtures/api/en/profile.json';
import profileES from '@app/test-utils/fixtures/api/es/profile.json';
import profileCA from '@app/test-utils/fixtures/api/ca/profile.json';
import profilePL from '@app/test-utils/fixtures/api/pl/profile.json';
import profileTL from '@app/test-utils/fixtures/api/tl/profile.json';

const profileFixtures: Record<string, Profile> = {
  en: profileEN as Profile,
  es: profileES as Profile,
  ca: profileCA as Profile,
  pl: profilePL as Profile,
  tl: profileTL as Profile,
};

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

  const response = await GithubApiClient.get<unknown>(
    `/${language}/profile.json`
  );
  const validatedData = ProfileSchema.parse(response.data);
  return { ...response, data: validatedData };
};
```

Val la pena destacar:

- El path mock retorna un objecte de resposta Axios complet. Redux, selectors i components no noten la diferència.
- Fixtures específiques per idioma amb fallback a anglès.
- El path real segueix [validant amb Zod](/blog/runtime-api-validation-zod-react-native/). El path mock es salta la validació perquè les fixtures ja estan tipades a la importació.
- Sense imports condicionals. Els dos paths viuen dins la mateixa funció.

### Pas 5: simulació d'errors

El flag et dona els happy paths simulats. Els arguments de llançament et donen estats d'error a la carta.

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

Comprova la simulació d'error abans de retornar dades fixture:

```typescript
if (isE2EMockEnabled()) {
  if (shouldEndpointFail('profile')) {
    const error = createE2EError();
    if (error) return Promise.reject(error);
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

Cada estat d'error es converteix en un argument de llançament: fallades de xarxa, 500s, 404s, timeouts. Cap necessita un servidor trencat.

`launchArgs` i `E2E_MOCK` fan feines diferents. `E2E_MOCK` queda incorporat al binari en temps de build natiu i fa que la capa d'API alterni entre crides reals i fixtures. `launchArgs` es llegeix en temps d'execució via `react-native-launch-arguments` i li diu a l'API ja simulada quin escenari ha de jugar per a aquest test concret. Un binari, molts escenaris.

## Mocking d'autenticació

L'auth és la part incòmoda. Els fluxos reals toquen tokens, sessions, verificació d'email, restabliment de contrasenya. Simular-los vol dir mantenir una mica d'estat dins del mock:

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

El mock escriu l'email de l'usuari a l'[encrypted storage](/blog/tiered-secure-storage-react-native/) de la mateixa manera que ho faria un alta real. Les crides posteriors (login, obtenció del perfil) llegeixen aquest estat emmagatzemat per mantenir la sessió coherent durant el test.

Per a testing d'errors, una petita convenció estalvia molt cablejat: les contrasenyes que comencen per "Wrong" provoquen un error d'auth. Sense argument de llançament per al cas comú de contrasenya incorrecta.

## El flux de build i test

```bash
# Construeix l'app amb mocking activat
E2E_MOCK=true yarn detox:ios:build

# Executa els tests E2E contra el binari simulat
yarn detox:ios:test

# Construeix i executa tests de smoke contra el backend real (binari separat)
yarn detox:ios:build
yarn detox:ios:test --tags @smoke
```

Dos binaris, dues suites. Simulat per a l'execució completa de cada PR, real per al conjunt de smoke.

## Errors comuns

**Les fixtures divergeixen de l'API real.** El risc més gran. Si el backend afegeix un camp i les teves fixtures no el tenen, els tests mock es queden en verd mentre l'app real es trenca. Executa els teus esquemes Zod contra les fixtures en un test unitari; una fixture que no satisfà l'esquema fa fallar el CI.

**Simular massa.** Simula al límit HTTP i para. Redux, gestió d'estat, navegació i renderització han de córrer reals. Si totes les capes estan falsejades, estàs provant les teves fixtures.

**Oblidar-se de la integració real.** Els tests E2E simulats detecten regressions d'UI. No detecten canvis de contracte. Manté una petita suite de smoke contra backend real amb una programació, encara que siguin cinc paths crítics.

**Fuga d'estat entre escenaris.** Cada escenari de Detox hauria de començar net. Crida `device.reloadReactNative()` (o rellança l'app) al hook `Before` perquè un mock escrit per un test no traspuï al següent.

## On et deixa això

Un dia de feina per a la bastida. Després, la suite E2E s'executa sense backend, sense xarxa, sense serveis externs.

Al projecte d'on ve aquest patró, la suite simulada es va estabilitzar als tres minuts. Els mateixos tests contra el backend real corrien en vuit i fallaven intermitentment. La suite simulada ha estat verda durant setmanes. La real necessitava supervisió.

Simula per a velocitat i determinisme a cada PR. Backend real per a confiança d'integració amb una programació. El sentit d'una suite E2E és detectar regressions de l'app, no provar la teva xarxa.

*Aquest post forma part d'una sèrie sobre testing d'apps React Native. Les entrades anteriors cobreixen [MSW v2 per a tests unitaris i d'integració](/blog/setting-up-msw-v2-in-react-native/) i [Detox amb Cucumber BDD per a E2E](/blog/detox-cucumber-bdd-react-native-e2e-testing/). El codi és de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon).*
