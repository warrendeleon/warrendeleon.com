---
title: "Detox + Cucumber BDD per a tests E2E a React Native"
description: "La majoria d'equips no saben que els fitxers feature de Gherkin funcionen amb Detox. Una guia pas a pas per configurar tests E2E amb estil BDD a React Native amb formatters personalitzats, execució paral·lela i tests d'accessibilitat."
publishDate: 2026-05-18
tags: ["react-native", "testing", "e2e-testing", "bdd"]
locale: ca
heroImage: "/images/blog/detox-cucumber-rn.webp"
heroAlt: "Detox i Cucumber BDD per a tests E2E a React Native"
campaign: "detox-cucumber-bdd"
relatedPosts: ["setting-up-msw-v2-in-react-native", "metro-runtime-mocking-react-native-e2e", "accessibility-testing-react-native"]
---

## Per què BDD per a tests E2E

La majoria de tutorials de Detox t'ensenyen a escriure codi de test imperatiu:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

Funciona. Però es llegeix com a codi, no com una especificació de test. Quan un product manager pregunta "què cobreix el test de login?", li passes un fitxer TypeScript i esperes el millor.

**Cucumber BDD** et permet escriure tests en anglès pla amb sintaxi Gherkin:

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

El mateix test. Les mateixes comandes de Detox per sota. Però ara qualsevol persona de l'equip pot llegir-lo, revisar-lo i suggerir escenaris que falten.

> 💡 **L'avantatge clau:** els fitxers feature es converteixen en documentació viva. Quan un escenari passa, saps que l'app suporta aquell comportament. Quan falla, saps exactament quin flux d'usuari s'ha trencat, en llenguatge pla.

## Instal·lació

Necessites Detox (per a l'automatització del dispositiu) i Cucumber (per a la capa BDD):

```bash
yarn add -D detox @cucumber/cucumber ts-node
```

Detox també necessita el seu CLI:

```bash
brew tap wix/brew
brew install applesimutils
```

## Els fitxers de configuració

Tres fitxers de configuració connecten tot el conjunt.

### .detoxrc.js

La configuració de Detox defineix les compilacions de l'app i els dispositius objectiu:

```typescript
module.exports = {
  testRunner: {
    args: {
      config: '.cucumber.js',
    },
    forwardEnv: true,
  },
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
      device: { type: 'iPhone 17 Pro' },
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

### .cucumber.js

La configuració de Cucumber indica on trobar els fitxers feature, les definicions de passos i com formatar la sortida:

```typescript
module.exports = {
  default: {
    paths: ['src/features/**/__tests__/*.feature'],
    require: [
      'src/test-utils/cucumber/support/**/*.{ts,tsx}',
      'src/test-utils/cucumber/step-definitions/**/*.cucumber.{ts,tsx}',
    ],
    requireModule: ['ts-node/register'],
    format: ['src/test-utils/cucumber/formatters/CheckmarkFormatter.js'],
    formatOptions: { colorsEnabled: true },
    strict: true,
    parallel: 2,
    retry: 1,
  },
};
```

| Opció | Què fa |
|---|---|
| `paths` | On viuen els fitxers feature de Gherkin |
| `require` | On viuen les definicions de passos i fitxers de suport |
| `requireModule` | Activa el suport per a TypeScript |
| `format` | Formatter personalitzat per a sortida llegible |
| `strict` | Falla si hi ha passos indefinits o pendents |
| `parallel` | Nombre de workers paral·lels |
| `retry` | Reintents per a tests inestables en mode paral·lel |

### tsconfig.cucumber.json

Una configuració mínima de TypeScript per al runtime de Cucumber:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "paths": { "@app/*": ["./src/*"] }
  }
}
```

## La capa de suport

Tres fitxers configuren el cicle de vida de Detox dins de Cucumber.

### detox-setup.ts

```typescript
import * as detox from 'detox';

export async function setupDetox(workerId: string) {
  await detox.init(undefined, { workerId });
}

export async function cleanupDetox() {
  await detox.cleanup();
}
```

### hooks.ts

Aquest és el nexe entre el cicle de vida de Cucumber i la gestió de dispositius de Detox:

```typescript
import { BeforeAll, Before, After, AfterAll } from '@cucumber/cucumber';
import { setupDetox, cleanupDetox } from './detox-setup';

BeforeAll({ timeout: 180000 }, async function () {
  const workerId = process.env.CUCUMBER_WORKER_ID || '0';
  await setupDetox(`cucumber-worker-${workerId}`);
  await device.launchApp({
    newInstance: true,
    launchArgs: { detoxEnableSynchronization: 0 },
  });
  await device.enableSynchronization();
});

Before({ timeout: 30000 }, async function () {
  await detox.onTestStart(this);
  await device.reloadReactNative();
});

After(async function (scenario) {
  if (scenario.result?.status === 'FAILED') {
    const name = scenario.pickle.name.replace(/\s+/g, '-');
    await device.takeScreenshot(name);
  }
  await detox.onTestDone(this);
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

El truc de sincronització val la pena remarcar: llança l'app amb la sincronització desactivada (`detoxEnableSynchronization: 0`), i després activa-la un cop l'app ja està en marxa. Això evita que Detox faci timeout durant la càrrega inicial del bundle.

### world.ts

Un World personalitzat de Cucumber que transporta el context de Detox entre passos:

```typescript
import { World } from '@cucumber/cucumber';

export class DetoxWorld extends World {
  device = device;
  testID: string | null = null;

  setTestID(id: string) { this.testID = id; }
  getTestID(): string {
    if (!this.testID) throw new Error('No testID set');
    return this.testID;
  }
}
```

## Escrivint fitxers feature

Els fitxers feature són text pla amb sintaxi Gherkin. Cada escenari descriu un flux d'usuari:

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
yarn detox test --tags "@accessibility and @ios"
```

## Escrivint definicions de passos

Cada pas de Gherkin es mapeja a una funció. Aquestes són les peces reutilitzables que fan que BDD sigui potent.

### Passos comuns

```typescript
import { Given, When, Then } from '@cucumber/cucumber';

Given('the app is launched', async function () {
  await device.terminateApp();
  await device.clearKeychain();
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

Patrons clau:

- ✅ **Convenció consistent de testID:** els noms de pantalla es converteixen a kebab-case amb un sufix. "Login" es converteix en `login-screen`, "Home" en `home-screen`
- ✅ **Esperes explícites:** Cada asserció usa `waitFor` amb timeout, no un `expect` directe. Les animacions i les crides de xarxa necessiten temps per estabilitzar-se
- ✅ **`replaceText` en comptes de `typeText`:** `typeText` afegeix al text existent. `replaceText` l'esborra primer. Més segur per a camps de formulari

### Estratègies de cerca d'elements

De vegades `by.id()` no és suficient. Una definició de passos resilient prova múltiples estratègies:

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

## El formatter personalitzat

La sortida per defecte de Cucumber és verbosa. Un formatter personalitzat et dona resultats nets i fàcils d'escanejar:

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

El formatter és una classe que escolta els esdeveniments de Cucumber:

```javascript
const { Formatter } = require('@cucumber/cucumber');

class CheckmarkFormatter extends Formatter {
  constructor(options) {
    super(options);

    options.eventBroadcaster.on('envelope', (envelope) => {
      if (envelope.testStepFinished) {
        this.onTestStepFinished(envelope.testStepFinished);
      }
      if (envelope.testCaseFinished) {
        this.onTestCaseFinished(envelope.testCaseFinished);
      }
    });
  }

  onTestStepFinished(event) {
    const { testStepResult } = event;
    const icon = testStepResult.status === 'PASSED' ? '✓' :
                 testStepResult.status === 'FAILED' ? '✗' :
                 testStepResult.status === 'SKIPPED' ? '○' : '?';
    const color = testStepResult.status === 'PASSED' ? '\x1b[32m' :
                  testStepResult.status === 'FAILED' ? '\x1b[31m' : '\x1b[33m';
    this.log(`${color}  ${icon}\x1b[0m ${this.getStepText(event)}\n`);
  }
}

module.exports = CheckmarkFormatter;
```

La implementació completa al meu projecte fa seguiment dels pickles, mapeja els passos de test al seu text Gherkin, calcula els temps i genera un resum amb recompte de passes/fallades.

## Execució paral·lela

Detox suporta l'execució d'escenaris en múltiples simuladors. La configuració de `.cucumber.js` defineix el nombre de workers, i cada worker obté la seva pròpia instància de simulador.

```bash
# Executar amb 3 simuladors en paral·lel
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

El hook `BeforeAll` llegeix `CUCUMBER_WORKER_ID` per inicialitzar cada worker amb la seva pròpia instància de Detox. Els escenaris es distribueixen entre workers automàticament.

| Configuració | Local | CI |
|---|---|---|
| Workers iOS | 2-3 | 3 |
| Workers Android | 1-2 | 2 |
| Reintents per fallada | 1 | 1 |
| Aturada ràpida | No | No |

> 💡 **Consell:** Desactiva l'aturada ràpida en mode paral·lel. Un escenari inestable no hauria d'aturar els altres workers. Amb els reintents activats, el test inestable té una segona oportunitat mentre la resta continua executant-se.

## Tests d'accessibilitat amb BDD

Detox no pot controlar VoiceOver o TalkBack directament. El testing manual amb lector de pantalla segueix sent essencial. Però el que Detox *sí pot* fer és verificar que els labels, rols i traits d'accessibilitat estiguin correctes a cada element. Escrits en Gherkin, aquests tests detecten regressions d'accessibilitat abans que un tester humà obri VoiceOver.

El meu projecte té dos fitxers feature que verifiquen propietats d'accessibilitat: un per a patrons d'iOS i un per a Android.

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

Això fa seguiment de l'ordre de focus esperat, el text dels anuncis i la granularitat de lectura. 50 escenaris entre els dos fitxers feature verifiquen labels d'accessibilitat, comportament de focus, anuncis de live regions i accions personalitzades. No reemplacen el testing manual amb un lector de pantalla real, però eviten que les regressions arribin a producció.

## Els scripts

Els scripts de package.json fan que el flux de treball sigui net:

```json
{
  "scripts": {
    "detox:ios:build": "detox build -c ios.sim.debug",
    "detox:ios:test": "detox test -c ios.sim.debug",
    "detox:ios:test:parallel": "DETOX_WORKERS=2 detox test -c ios.sim.debug",
    "e2e:ios": "yarn detox:ios:build && yarn detox:ios:test"
  }
}
```

## Errors comuns

**La sincronització és la part més difícil.** Detox intenta esperar automàticament que l'app estigui ociosa, però les animacions, els temporitzadors i les crides de xarxa el poden confondre. El patró de llançar amb sincronització desactivada (`detoxEnableSynchronization: 0` i després `enableSynchronization()`) evita el timeout més habitual.

**`typeText` afegeix, `replaceText` reemplaça.** Si un camp té text de placeholder o entrada anterior, `typeText` hi afegeix. Usa `replaceText` per a camps de formulari on vols un valor net.

**Les captures de pantalla quan falla són essencials.** El hook `After` captura una captura de pantalla quan un escenari falla. Sense això, depurar fallades al CI és pura endevinalla. Anomena la captura de pantalla com l'escenari perquè puguis emparellar fallades amb imatges.

**Els fitxers feature han de descriure comportament, no implementació.** Escriu "When I log in" en comptes de "When I type into email-input and tap login-button". Els detalls d'implementació pertanyen a les definicions de passos, no al Gherkin.

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

El setup porta un matí. Escriure el primer fitxer feature porta una tarda. Després, afegir nous escenaris és ràpid perquè les definicions de passos són reutilitzables.

El retorn:

1. **Tests que qualsevol pot llegir.** Product managers, QA, dissenyadors. Els fitxers Gherkin són l'especificació i el test alhora.
2. **Execució paral·lela de sèrie.** El paral·lelisme integrat de Cucumber funciona amb Detox. Tres simuladors, tres workers, tres vegades més ràpid.
3. **Detecció de regressions d'accessibilitat.** 50 escenaris verifiquen que labels, rols i traits siguin correctes. No reemplacen el testing manual amb lector de pantalla, però són una xarxa de seguretat que evita que les regressions arribin a QA.

> Quan un test E2E falla, hauries de saber què s'ha trencat sense llegir el codi del test.

*Aquest post cobreix testing E2E. Per a tests unitaris i d'integració, uso [MSW v2 per simular la capa de xarxa](/ca/blog/setting-up-msw-v2-in-react-native/) en comptes de `jest.fn()`. Els dos enfocaments es complementen: MSW per a tests ràpids i enfocats contra crides HTTP reals; Detox + Cucumber per a fluxos complets d'usuari en un dispositiu real.*

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. El setup complet de Detox + Cucumber, les definicions de passos, el formatter personalitzat i els fitxers feature d'accessibilitat són al repo.*
