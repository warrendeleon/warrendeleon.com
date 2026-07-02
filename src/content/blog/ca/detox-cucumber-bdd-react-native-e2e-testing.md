---
title: "Detox + Cucumber BDD per a tests E2E a React Native"
description: "Detox + Cucumber per a E2E a React Native. Definicions de passos, formatter propi, execució paral·lela i tests de regressió d'accessibilitat en Gherkin pla."
tags: ["react-native", "testing", "e2e-testing", "bdd"]
locale: ca
heroImage: "/images/blog/detox-cucumber-rn.webp"
heroAlt: "Detox i Cucumber BDD per a tests E2E a React Native"
campaign: "detox-cucumber-bdd"
relatedPosts: ["setting-up-msw-v2-in-react-native", "metro-runtime-mocking-react-native-e2e", "accessibility-testing-react-native"]
---

Al final d'aquest post tindràs Detox conduint un simulador iOS i un emulador Android, amb fitxers feature de Cucumber escrits en anglès pla per sobre. Cinc passos: instal·la Detox, connecta Cucumber, escriu la capa de suport, escriu una feature, executa-la.

## Una nota sobre la combinació

Detox + Cucumber no és el stack E2E per defecte a React Native. La majoria d'equips es queden amb Jest com a runner i un estil imperatiu, o opten per WebdriverIO o Maestro quan volen tests amb estil de flux. Són opcions raonables. Maestro és especialment agradable si l'únic que vols és gravar un flux.

Per què afegir, doncs, una capa BDD sobre Detox?

Perquè un cop existeixen els fitxers feature, QA i product managers els poden llegir. Poden demanar escenaris que mai se't haurien acudit. El Detox imperatiu manté el disseny dels tests dins d'enginyeria. Cucumber el treu fora.

El cost són dues dependències més i una capa de suport. En la meva experiència, és un cost petit un cop les definicions de passos s'estabilitzen. Els nous escenaris es resolen en cinc minuts.

## Per què BDD per a tests E2E

La majoria d'exemples de Detox mostren codi de test imperatiu:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

Funciona. Es llegeix com a codi, no com una especificació de test. Quan un PM pregunta "què cobreix realment el test de login?", li assenyales un fitxer TypeScript.

Cucumber et permet escriure el mateix test en Gherkin:

```
Feature: User Authentication

  Scenario: Successful login
    Given the app is launched
    And I am on the "Login" screen
    When I type "user@example.com" into the input with testID "email-input"
    And I type "password123" into the input with testID "password-input"
    And I tap the "Login" button
    Then I should see the "Home" screen
```

Les mateixes comandes de Detox per sota. Ara qualsevol persona de l'equip pot llegir el test, revisar-lo i suggerir els escenaris que t'has deixat. Quan un falla, la línia que s'ha trencat surt en llenguatge pla, no en TypeScript.

## Supòsits

Aquesta guia està escrita per a:

- React Native 0.74+ (bare workflow, no Expo)
- TypeScript amb la configuració estàndard de Babel de RN
- Host macOS (simulador iOS i emulador Android)
- Xcode 16+ amb les Command Line Tools, més un simulador iOS creat (per exemple iPhone 16)
- Android Studio amb almenys un AVD creat (per exemple Pixel 7 API 35)
- Node 18 o posterior

Ho vaig construir sobre Detox 20, `@cucumber/cucumber` 12, `ts-node` i un React Native recent. Les peces amb més probabilitat de canviar són la firma de l'init de Detox i les claus de configuració de Cucumber, així que he anotat totes dues inline.

Si estàs a Expo, Detox necessita un dev client personalitzat. La capa de Cucumber és la mateixa igualment.

## Pas 1. Instal·lar Detox i Cucumber

Detox, Cucumber i el carregador de TypeScript com a dependències de desenvolupament:

```bash
yarn add -D detox @cucumber/cucumber ts-node tsconfig-paths
cd ios && pod install && cd ..
```

El `pod install` d'iOS cal perquè Detox porta codi natiu que s'ha d'enllaçar a la build de test.

També necessites dues eines a nivell de host que no són paquets npm:

```bash
brew tap wix/brew
brew install applesimutils
```

`applesimutils` és el que fa servir Detox per controlar el simulador iOS. Per a Android necessites un emulador funcional. El CLI de Detox s'invoca via `npx detox`, així que no cal cap instal·lació global.

## Pas 2. Els tres fitxers de configuració

Tres fitxers connecten tot el conjunt: `.detoxrc.js` (o `detox.config.js`. Detox accepta tots dos), `cucumber.js` i un `tsconfig.cucumber.json` reduït. La configuració de Cucumber s'ha de dir `cucumber.js` (o `.cjs`/`.mjs`/`.json`): és el nom de fitxer que cucumber-js carrega per defecte, i res en aquest setup passa cap `--config` explícit.

### .detoxrc.js

La configuració de Detox defineix les compilacions de l'app i els dispositius objectiu:

Una cosa que `.detoxrc.js` NO fa aquí: connectar Detox amb Cucumber. Quan Cucumber és el runner, invoques `cucumber-js` directament i la configuració `testRunner` de Detox no es consulta mai; el fitxer de suport del pas 3 és l'únic pont. `.detoxrc.js` només descriu apps i dispositius:

```typescript
module.exports = {
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/YourApp.app',
      build: 'xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 16' },
    },
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_7_API_35' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
```

### cucumber.js

La configuració de Cucumber diu on viuen els fitxers feature, on viuen les definicions de passos i com formatar la sortida:

```javascript
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', jsx: 'react' },
});

module.exports = {
  default: {
    paths: ['src/features/**/__tests__/*.feature', 'e2e/**/*.feature'],
    require: [
      'src/test-utils/cucumber/support/**/*.ts',
      'src/test-utils/cucumber/step-definitions/**/*.{ts,tsx}',
      'src/**/__tests__/**/*.cucumber.{ts,tsx}',
    ],
    format: ['./src/test-utils/cucumber/formatters/CheckmarkFormatter.js'],
    formatOptions: { colorsEnabled: true },
    strict: true,
    parallel: 2,
    retry: 1,
  },
};
```

Registrar `ts-node` a dalt del fitxer de configuració (en lloc de fer-ho via `requireModule`) és el camí menys friccionat amb les versions actuals de Cucumber. També et permet mantenir les opcions del compilador locals.

| Opció | Què fa |
|---|---|
| `paths` | On viuen els fitxers feature de Gherkin |
| `require` | On viuen les definicions de passos i fitxers de suport |
| `format` | Formatter personalitzat per a sortida llegible |
| `strict` | Falla si hi ha passos indefinits o pendents |
| `parallel` | Nombre de workers paral·lels |
| `retry` | Reintents per a tests inestables en mode paral·lel |

### tsconfig.cucumber.json

Una configuració reduïda de TypeScript per al runtime de Cucumber, separada del `tsconfig` principal de l'app:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "jsx": "react",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "strict": false,
    "baseUrl": ".",
    "paths": { "@app/*": ["src/*"] },
    "types": ["node", "detox"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Dues coses per remarcar. `"types": ["node", "detox"]` és el que ensenya a TypeScript que `device`, `element`, `by` i `waitFor` són globals. Sense això, cada definició de pas s'encén en vermell sobre `device.launchApp`. `"strict": false` és una elecció pragmàtica per a fitxers de test (ho agrairàs quan lluitis amb optional chains dins dels resultats d'escenari).

Apunta `cucumber-js` a aquesta configuració via `TS_NODE_PROJECT=tsconfig.cucumber.json` dins de l'script npm.

## Pas 3. La capa de suport

Tres fitxers configuren el cicle de vida de Detox dins de Cucumber: `detox-setup.ts`, `hooks.ts` i `world.ts`.

### detox-setup.ts

Detox 20 exposa el seu cicle de vida programàtic via l'entrada `detox/internals`. L'import públic de `'detox'` et dona `device`, `element`, `by`, `waitFor`. Els hooks del cicle de vida (`init`, `cleanup`, `onTestStart`, `onTestDone`) viuen sota `'detox/internals'`:

```typescript
import detox from 'detox/internals';

export const setupDetox = async (workerId: string = '0') => {
  const config = process.env.DETOX_CONFIGURATION;
  if (!config) {
    throw new Error('DETOX_CONFIGURATION is not set (e.g. ios.sim.debug)');
  }
  await detox.init({ workerId: `cucumber-worker-${workerId}` });
};

export const cleanupDetox = async () => {
  await detox.cleanup();
};

export { detox };
```

### hooks.ts

El nexe entre el cicle de vida de Cucumber i la gestió de dispositius de Detox:

```typescript
import { After, AfterAll, Before, BeforeAll, Status } from '@cucumber/cucumber';
import { device } from 'detox';

import { cleanupDetox, detox, setupDetox } from './detox-setup';
import { DetoxWorld } from './world';

BeforeAll({ timeout: 180 * 1000 }, async function () {
  const workerId = process.env.CUCUMBER_WORKER_ID ?? '0';
  await setupDetox(workerId);
  await device.launchApp({
    newInstance: true,
    launchArgs: { detoxEnableSynchronization: 0 },
  });
  await device.enableSynchronization();
});

Before({ timeout: 30000 }, async function (this: DetoxWorld, { pickle }) {
  await detox.onTestStart({
    title: pickle.name,
    fullName: pickle.name,
    status: 'running',
  });
  await device.reloadReactNative();
});

After(async function (this: DetoxWorld, { pickle, result }) {
  const testStatus = result?.status === Status.PASSED ? 'passed' : 'failed';
  if (result?.status === Status.FAILED) {
    try {
      await device.takeScreenshot(pickle.name);
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }
  }
  await detox.onTestDone({
    title: pickle.name,
    fullName: pickle.name,
    status: testStatus,
  });
});

AfterAll(async function () {
  await cleanupDetox();
});
```

| Hook | Timeout | Què fa |
|---|---|---|
| `BeforeAll` | 180s | Arrenca el simulador, llança l'app |
| `Before` | 30s | Recarrega React Native per tenir un estat net per escenari |
| `After` | per defecte | Fa una captura de pantalla si falla, notifica Detox |
| `AfterAll` | per defecte | Desmunta Detox |

La dansa de la sincronització importa. Llança l'app amb la sincronització desactivada (`detoxEnableSynchronization: 0`), i després reactiva-la un cop l'app ja està en marxa. Això evita el timeout de Detox que sorgeix quan la càrrega inicial del bundle és lenta.

### world.ts

Un World personalitzat de Cucumber que transporta el context de Detox entre passos:

```typescript
import { IWorldOptions, setWorldConstructor, World } from '@cucumber/cucumber';
import { device } from 'detox';

export class DetoxWorld extends World {
  device: typeof device;
  testID: string | null;

  constructor(options: IWorldOptions) {
    super(options);
    this.device = device;
    this.testID = null;
  }

  setTestID(id: string) { this.testID = id; }
  getTestID(): string {
    if (!this.testID) throw new Error('No testID set');
    return this.testID;
  }
}

setWorldConstructor(DetoxWorld);
```

Cridar `setWorldConstructor` és el que connecta aquesta classe a cada `this` dins d'un pas. Si oblides la crida, `this.device` és `undefined`.

## Pas 4. Escrivint el teu primer fitxer feature

Els fitxers feature són text pla amb sintaxi Gherkin. Cada escenari descriu un flux d'usuari. Deixa un fitxer a `src/features/Auth/__tests__/Login.feature`:

```
Feature: User Authentication

  Scenario: Successful login
    Given the app is launched
    And I navigate to the Login screen
    When I type "testuser@example.com" into the input with testID "email-input"
    And I type "SecurePass123" into the input with testID "password-input"
    And I tap the "Login" button
    Then I should see the "Home" screen

  Scenario: Login with invalid credentials
    Given the app is launched
    And I navigate to the Login screen
    When I type "testuser@example.com" into the input with testID "email-input"
    And I type "WrongPassword" into the input with testID "password-input"
    And I tap the "Login" button
    Then I should see text "Invalid email or password"

  Scenario: Deep link opens password reset
    Given the app is launched via password reset deep link
    Then I should see the "Reset Password" screen
```

Els tags permeten filtrar quins escenaris s'executen:

```
@accessibility @voiceover @ios
Feature: VoiceOver Gestures

  @eaa
  Scenario: Navigate login form with swipe gestures
    ...
```

Després, a la comanda de test:

```bash
yarn detox:ios:test --tags "@accessibility and @ios"
```

## Pas 5. Escrivint definicions de passos

Cada pas de Gherkin es mapeja a una funció. Les definicions de passos són les peces que reutilitzaràs entre tots els fitxers feature un cop existeixen.

Una nota sobre els globals de Detox abans de continuar: `device`, `element`, `by` i `waitFor` existeixen en temps de compilació perquè el `tsconfig.cucumber.json` del pas 2 els va declarar (`"types": ["detox", "node"]`). Salta-t'ho i cada definició de pas s'encén en vermell sobre `device.launchApp`.

### Passos comuns

```typescript
import { Given, When, Then } from '@cucumber/cucumber';

Given('the app is launched', async function () {
  await device.terminateApp();
  await device.clearKeychain(); // Només iOS: a Android és un no-op silenciós
  await device.launchApp({ newInstance: true });
  await new Promise(r => setTimeout(r, 500));
});

Given('I am on the {string} screen', async function (screen: string) {
  const testID = `${screen.toLowerCase().replace(/\s+/g, '-')}-screen`;
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(20000);
});

When('I tap the {string} button', async function (name: string) {
  const testID = `${name.toLowerCase().replace(/\s+/g, '-')}-button`;
  await element(by.id(testID)).tap();
});

When('I type {string} into the input with testID {string}',
  async function (text: string, testID: string) {
    await waitFor(element(by.id(testID)))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id(testID)).replaceText(text);
  }
);

Then('I should see the {string} screen', async function (screen: string) {
  const testID = `${screen.toLowerCase().replace(/\s+/g, '-')}-screen`;
  await new Promise(r => setTimeout(r, 500));
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(20000);
});

Then('I should see text {string}', async function (text: string) {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(5000);
});
```

Tres patrons per fixar aquí. Primer, una convenció consistent de testID: els noms de pantalla esdevenen kebab-case amb un sufix `-screen` o `-button`. "Login" es mapeja a `login-screen`, "Home" a `home-screen`, "Submit" a `submit-button`. Segon, cada asserció passa per `waitFor` amb timeout, no per un `expect` directe. Les animacions i les crides de xarxa necessiten temps per estabilitzar-se i `expect` no els el dona. Tercer, `replaceText` en lloc de `typeText`. `typeText` afegeix al que ja hi ha. `replaceText` ho esborra primer. Per a camps de formulari vols el segon.

Desa el fitxer com a `src/test-utils/cucumber/step-definitions/common.cucumber.tsx` i Cucumber el recull via el glob del teu `cucumber.js`.

### Estratègies de cerca d'elements

De vegades `by.id()` no és suficient. Una definició de passos que no es trenca entre iOS i Android prova múltiples estratègies:

```typescript
When('I tap the text {string}', async function (text: string) {
  try {
    await element(by.text(text)).tap();
  } catch {
    try {
      await element(by.label(text)).tap();
    } catch {
      const testID = text.toLowerCase().replace(/\s+/g, '-');
      await element(by.id(testID)).tap();
    }
  }
});
```

Prova `by.text()` primer (text visible), recorre a `by.label()` (etiqueta d'accessibilitat), i després a `by.id()` (testID). Això gestiona botons que renderitzen text diferent entre plataformes.

## Amb què parla l'app durant aquests tests

Els escenaris de sobre escriuen credencials i esperen una pantalla Home, cosa que planteja la pregunta que tot setup E2E ha de respondre: contra quin backend està picant l'app? Executa'ls contra un de real i la suite falla cada cop que staging ensopega. La resposta determinista és mockejar a nivell de bundle amb un flag de build E2E, que és un post per si sol: [Mocking en temps d'execució amb Metro per a tests E2E deterministes a React Native](/ca/blog/metro-runtime-mocking-react-native-e2e/). Fins que tinguis aquesta capa, apunta la build E2E a un entorn de test estable i tracta els flakes de xarxa com a fallades de la suite, no dels tests.

## Un formatter personalitzat

La sortida per defecte de Cucumber és sorollosa. Un formatter personalitzat et dona resultats nets, més fàcils de llegir als logs de CI:

```
✓ Feature: User Authentication
  ✓ Scenario: Successful login (2340ms)
    ✓ Given the app is launched (890ms)
    ✓ And I navigate to the Login screen (450ms)
    ✓ When I type "testuser@example.com" into the input with testID "email-input" (120ms)
    ✓ And I type "SecurePass123" into the input with testID "password-input" (95ms)
    ✓ And I tap the "Login" button (85ms)
    ✓ Then I should see the "Home" screen (700ms)

  ✗ Scenario: Login with expired token (1890ms)
    ✓ Given the app is launched (850ms)
    ✓ And I navigate to the Login screen (420ms)
    ✗ Then I should see the "Session Expired" screen (620ms)
      Error: Element not found: session-expired-screen

2 scenarios (1 passed, 1 failed)
12 steps (11 passed, 1 failed)
```

El formatter és una classe petita que se subscriu als esdeveniments `envelope` de Cucumber (`testStepFinished`, `testCaseFinished`), mapeja l'estat de cada pas a una icona i un color, i imprimeix la línia. Unes 80 línies en total.

La versió completa del meu repo fa seguiment dels pickles, mapeja els passos de test al seu text Gherkin, mesura el temps de cada pas i imprimeix un resum amb recompte de passes i fallades. El que tens a sobre és la forma; el fitxer complet és `src/test-utils/cucumber/formatters/CheckmarkFormatter.js` al repo enllaçat al final.

## Execució paral·lela

Detox pot executar escenaris en múltiples simuladors. L'opció `parallel` de Cucumber controla el nombre de workers i cada worker obté la seva pròpia instància de Detox.

```bash
# Executar amb 3 simuladors en paral·lel
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

El hook `BeforeAll` llegeix `CUCUMBER_WORKER_ID` i el passa a `setupDetox` perquè cada worker s'inicialitzi contra el seu propi simulador. Cucumber distribueix els escenaris entre workers automàticament.

| Configuració | Local | CI |
|---|---|---|
| Workers iOS | 2-3 | 3 |
| Workers Android | 1-2 | 2 |
| Reintents per fallada | 1 | 1 |
| Aturada ràpida | No | No |

Un consell sobre execucions paral·leles. Mantén l'aturada ràpida desactivada quan executes en paral·lel. Un escenari inestable no hauria de tombar els altres workers, i amb els reintents activats l'inestable té una segona oportunitat mentre la resta continua avançant. En una execució d'un sol worker, l'aturada ràpida activada està bé.

## Tests d'accessibilitat amb BDD

Detox no controla VoiceOver o TalkBack directament. El testing manual amb lector de pantalla segueix tenint la seva feina. El que Detox *sí pot* comprovar és que els labels, rols i traits d'accessibilitat estiguin correctes a cada element. Escrits com a escenaris Gherkin, aquests controls detecten una mena de regressió que ningú no notarà manualment fins que un usuari amb VoiceOver obri l'app.

El meu repo té dos fitxers feature per a això, un per a patrons d'iOS i un per a Android.

```
@accessibility @voiceover @ios @eaa
Feature: VoiceOver Gestures

  Scenario: Navigate login form with swipe right
    Given the app is launched
    And I am on the "Login" screen
    And VoiceOver focus is on the "Email" element
    When I swipe right to move to the next element
    Then VoiceOver focus should move to the next element
    And I should hear the accessibility label for "Password"

  Scenario: Activate login button with double tap
    Given the app is launched
    And I am on the "Login" screen
    And I have entered valid credentials
    And VoiceOver focus is on the "Login" button
    When I double tap to activate
    Then I should see the "Home" screen

  Scenario: Error announced via live region
    Given the app is launched
    And I am on the "Login" screen
    And I have entered invalid credentials
    When I double tap to activate
    Then the error message should be announced via a live region
```

Les definicions de passos per a tests d'accessibilitat mantenen estat:

```typescript
interface AccessibilityState {
  focusedElementIndex: number;
  visitedElements: string[];
  lastAnnouncement: string | null;
  granularity: 'characters' | 'words' | 'lines' | 'headings' | 'default';
}
```

Això fa seguiment de l'ordre de focus esperat, el text dels anuncis i la granularitat de lectura. Uns 50 escenaris entre els dos fitxers feature cobreixen labels, comportament de focus, anuncis de live regions i accions personalitzades. No reemplacen una passada manual amb un lector de pantalla real. Sí aturen les regressions òbvies abans que arribin a producció.

## Executar-ho

Els scripts que uso viuen a `package.json` així:

```json
{
  "scripts": {
    "detox:ios:build": "detox build -c ios.sim.debug",
    "detox:ios:test": "DETOX_CONFIGURATION=ios.sim.debug TS_NODE_PROJECT=tsconfig.cucumber.json cucumber-js",
    "detox:ios:test:parallel": "yarn detox:ios:test --parallel ${DETOX_WORKERS:-2} --retry 1",
    "e2e:ios": "yarn detox:ios:build && yarn detox:ios:test"
  }
}
```

Fixa't que l'script de test executa `cucumber-js` directament, no `detox test`. Amb Cucumber com a runner, no passes pel wrapper de runner de Detox. Detox s'inicialitza des del teu fitxer de suport.

Primera execució:

```bash
yarn e2e:ios
```

```text
$ detox build -c ios.sim.debug
Building app for ios.sim.debug...
xcodebuild ... ** BUILD SUCCEEDED **

$ cucumber-js
✓ Feature: User Authentication
  ✓ Scenario: Successful login (2340ms)
  ✓ Scenario: Login with invalid credentials (1820ms)

2 scenarios (2 passed)
12 steps (12 passed)
```

Si `xcodebuild` falla en la primera execució, comprova que el simulador anomenat a `.detoxrc.js` existeix realment (`xcrun simctl list devices`). El ensopec més habitual de la primera execució és un `iPhone 16` hardcodejat que mai vas crear a Xcode.

## Errors comuns

**La sincronització és la part més difícil.** Detox intenta esperar automàticament que l'app estigui ociosa, però les animacions, els temporitzadors i les crides de xarxa el poden confondre. El patró de llançar amb sincronització desactivada (`detoxEnableSynchronization: 0` i després `enableSynchronization()`) esquiva el timeout més habitual.

**`typeText` afegeix, `replaceText` reemplaça.** Si un camp té text de placeholder o entrada anterior, `typeText` hi afegeix. Usa `replaceText` per a camps de formulari on vols un valor net.

**Captures de pantalla quan falla.** El hook `After` captura una captura de pantalla quan un escenari falla. Sense això, depurar fallades al CI és aclucar els ulls davant dels logs. Anomena la captura de pantalla com l'escenari perquè puguis emparellar una fallada amb la seva imatge.

**Descriu comportament, no implementació.** Escriu "When I log in", no "When I type into email-input and tap login-button". Els detalls d'implementació pertanyen a les definicions de passos, no al Gherkin. Si un no-enginyer no pot llegir el fitxer feature en veu alta i entendre'l, has filtrat detalls a la capa equivocada.

## L'estructura completa de fitxers

```
src/
  test-utils/
    cucumber/
      formatters/
        CheckmarkFormatter.js    # Formatter personalitzat ✓/✗
      step-definitions/
        common.cucumber.tsx      # Passos compartits (tap, type, navigate)
        auth.cucumber.tsx         # Passos d'autenticació
        accessibility.cucumber.tsx # Passos de VoiceOver + TalkBack
      support/
        detox-setup.ts           # Inicialització de Detox
        hooks.ts                  # BeforeAll/Before/After/AfterAll
        world.ts                  # Context World de Cucumber
e2e/
  accessibility/
    VoiceOverGestures.feature    # Tests de lector de pantalla iOS
    TalkBackGestures.feature     # Tests de lector de pantalla Android
```

## Què guanyes

El setup és feina d'un matí. El primer fitxer feature, una tarda. Després, afegir escenaris és ràpid perquè les definicions de passos són reutilitzables entre features.

El que has construït al final:

1. Tests que qualsevol persona de l'equip pot llegir. Product, QA, dissenyadors. El fitxer Gherkin és l'especificació i el test alhora, i quan un escenari falla, el report anomena el pas que s'ha trencat en lloc d'una línia de codi de test.
2. Execució paral·lela que funciona amb Detox. Tres simuladors, tres workers, tres vegades més ràpid al CI.
3. Cobertura de regressions d'accessibilitat. Uns 50 escenaris verificant labels, rols i traits. No és un substitut del testing manual amb lector de pantalla, però sí una xarxa que atura les regressions òbvies abans que arribin a QA.

*Aquest post cobreix testing E2E. Per a tests unitaris i d'integració uso [MSW v2 per simular la capa de xarxa](/ca/blog/setting-up-msw-v2-in-react-native/) en comptes de `jest.fn()`. Els dos s'emparellen bé: MSW per a tests ràpids i enfocats contra crides HTTP reals; Detox + Cucumber per a fluxos complets d'usuari en un dispositiu real.*

*El codi d'aquest post és de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. El setup complet de Detox + Cucumber, les definicions de passos, el formatter personalitzat i els fitxers feature d'accessibilitat viuen tots allà.*
