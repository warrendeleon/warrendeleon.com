---
title: "Detox + Cucumber BDD para testing E2E en React Native"
description: "Detox + Cucumber para tests E2E en React Native. Definiciones de pasos, formatter personalizado, ejecución en paralelo y tests de regresión de accesibilidad."
tags: ["react-native", "testing", "e2e-testing", "bdd"]
locale: es
heroImage: "/images/blog/detox-cucumber-rn.webp"
heroAlt: "Detox y Cucumber BDD para testing E2E en React Native"
campaign: "detox-cucumber-bdd"
relatedPosts: ["setting-up-msw-v2-in-react-native", "metro-runtime-mocking-react-native-e2e", "accessibility-testing-react-native"]
---

Al terminar este post vas a tener Detox controlando un simulador de iOS y un emulador de Android, con feature files de Cucumber escritos en lenguaje natural por encima. Cinco pasos: instalar Detox, conectar Cucumber, escribir la capa de soporte, escribir un feature, ejecutarlo.

## Un comentario sobre la combinación

Detox + Cucumber no es el stack por defecto de E2E en React Native. La mayoría de los equipos se queda en estilo imperativo con Jest como runner, o tira por WebdriverIO o Maestro cuando quiere tests estilo flujo. Son elecciones razonables. Maestro especialmente es una belleza si lo único que querés es grabar un flujo.

¿Por qué entonces sumar una capa de BDD encima de Detox?

Porque una vez que existen los feature files, QA y los PMs los pueden leer. Pueden pedirte escenarios que a vos no se te ocurriría escribir. Detox imperativo mantiene el diseño de los tests dentro de ingeniería. Cucumber lo saca afuera.

El coste son dos dependencias más y una capa de soporte. En mi experiencia, ese coste es bajo una vez que las definiciones de pasos se estabilizan. Sumar escenarios nuevos pasa a ser un trabajo de cinco minutos.

## Por qué BDD para tests E2E

La mayoría de los ejemplos de Detox muestran código de test imperativo:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

Funciona. Se lee como código, no como una especificación de test. Cuando un PM pregunta "¿qué cubre realmente el test de login?", lo mandás a un archivo TypeScript.

Cucumber te deja escribir el mismo test en Gherkin:

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

Los mismos comandos de Detox por debajo. Ahora cualquiera del equipo puede leer el test, revisarlo y sugerir los escenarios que te faltaron. Cuando uno falla, la línea que se rompió está en lenguaje claro, no en TypeScript.

## Paso 1. Instalar Detox y Cucumber

Necesitas Detox (para la automatización del dispositivo) y Cucumber (para la capa de BDD):

```bash
yarn add -D detox @cucumber/cucumber ts-node tsconfig-paths
```

Detox también necesita su CLI:

```bash
brew tap wix/brew
brew install applesimutils
```

## Paso 2. Los tres archivos de configuración

Tres archivos conectan todo: `.detoxrc.js` (o `detox.config.js`. Detox acepta los dos), `.cucumber.js` y un `tsconfig.cucumber.json` ligero.

### .detoxrc.js

La configuración de Detox define los builds de tu app y los dispositivos destino:

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

La configuración de Cucumber indica dónde viven los feature files, dónde viven las definiciones de pasos y cómo formatear la salida:

```javascript
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', jsx: 'react' },
});

module.exports = {
  default: {
    paths: ['src/features/**/__tests__/*.feature'],
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

Registrar `ts-node` al inicio del archivo de configuración (en vez de vía `requireModule`) es el camino de menor resistencia con el Cucumber actual. También te permite mantener las opciones del compilador locales.

| Opción | Qué hace |
|---|---|
| `paths` | Dónde viven los feature files de Gherkin |
| `require` | Dónde viven las definiciones de pasos y archivos de soporte |
| `format` | Formatter personalizado para salida legible |
| `strict` | Falla en pasos indefinidos o pendientes |
| `parallel` | Cantidad de workers en paralelo |
| `retry` | Reintentos para tests inestables en modo paralelo |

### tsconfig.cucumber.json

Un tsconfig ligero para el runtime de Cucumber, separado del `tsconfig` principal de la app:

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

Dos cosas vale la pena marcar. `"types": ["node", "detox"]` es lo que le enseña a TypeScript que `device`, `element`, `by` y `waitFor` son globales. Sin eso, cada definición de paso se llena de rojo en `device.launchApp`. `"strict": false` es una elección pragmática para archivos de test (te lo vas a agradecer cuando estés peleando con optional chains en los resultados de los escenarios).

Apuntá `cucumber-js` a este config con `TS_NODE_PROJECT=tsconfig.cucumber.json` en el script de npm.

## Paso 3. La capa de soporte

Tres archivos configuran el ciclo de vida de Detox dentro de Cucumber: `detox-setup.ts`, `hooks.ts` y `world.ts`.

### detox-setup.ts

Detox 20 expone su ciclo de vida programático a través del entrypoint `detox/internals`. El import público `'detox'` te da `device`, `element`, `by` y `waitFor`. Los hooks del ciclo de vida (`init`, `cleanup`, `onTestStart`, `onTestDone`) viven bajo `'detox/internals'`:

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

El nexo entre el ciclo de vida de Cucumber y el manejo de dispositivos de Detox:

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

| Hook | Timeout | Qué hace |
|---|---|---|
| `BeforeAll` | 180s | Levanta el simulador, lanza la app |
| `Before` | 30s | Recarga React Native para un estado limpio por escenario |
| `After` | default | Toma un screenshot si falla, notifica a Detox |
| `AfterAll` | default | Cierra Detox |

La danza de sincronización importa. Lanzá la app con la sincronización deshabilitada (`detoxEnableSynchronization: 0`), y después reactivala una vez que la app está corriendo. Esto esquiva el timeout de Detox que aparece cuando la carga inicial del bundle es lenta.

### world.ts

Un Cucumber World personalizado que lleva el contexto de Detox entre pasos:

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

Llamar a `setWorldConstructor` es lo que conecta esta clase a cada `this` dentro de un paso. Si te olvidás de esa llamada, `this.device` queda `undefined`.

## Paso 4. Escribiendo tu primer feature file

Los feature files son texto plano con sintaxis Gherkin. Cada escenario describe un flujo de usuario. Dejá un archivo en `src/features/Auth/__tests__/Login.feature`:

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

Los tags te permiten filtrar qué escenarios correr:

```
@accessibility @voiceover @ios
Feature: VoiceOver Gestures

  @eaa
  Scenario: Navigate login form with swipe gestures
    ...
```

Después en tu comando de test:

```bash
yarn detox test --tags "@accessibility and @ios"
```

## Paso 5. Escribiendo definiciones de pasos

Cada paso de Gherkin se mapea a una función. Las definiciones de pasos son las piezas que vas a reutilizar en cada feature file una vez que existan.

### Pasos comunes

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

Tres patrones para dejar fijos acá. Primero, una convención consistente de testID: los nombres de pantalla pasan a kebab-case con un sufijo `-screen` o `-button`. "Login" mapea a `login-screen`, "Home" a `home-screen`, "Submit" a `submit-button`. Segundo, cada aserción pasa por `waitFor` con un timeout, no `expect` directo. Las animaciones y llamadas de red necesitan tiempo para asentarse y `expect` no se los da. Tercero, `replaceText` en vez de `typeText`. `typeText` agrega al texto que ya está. `replaceText` limpia primero. Para inputs de formulario querés el segundo.

Guardá el archivo como `src/test-utils/cucumber/step-definitions/common.cucumber.tsx` y Cucumber lo va a recoger gracias al glob de tu `.cucumber.js`.

### Estrategias de búsqueda de elementos

A veces `by.id()` no alcanza. Una definición de paso que no se rompe entre iOS y Android prueba múltiples estrategias:

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

Prueba `by.text()` primero (texto visible), fallback a `by.label()` (accessibility label), después `by.id()` (testID). Esto maneja botones que renderizan texto de forma distinta entre plataformas.

## Un formatter personalizado

La salida por defecto de Cucumber es ruidosa. Un formatter personalizado te da resultados limpios, más fáciles de leer en los logs de CI:

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

El formatter es una clase que escucha eventos de Cucumber:

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

La versión completa en mi repo trackea pickles, mapea los pasos de test a su texto Gherkin, cronometra cada paso y muestra un resumen con conteo de pasados y fallidos. El esquema de arriba es la forma; el archivo completo está en `src/test-utils/cucumber/formatters/CheckmarkFormatter.js` en el repo enlazado al final.

## Ejecución en paralelo

Detox puede correr escenarios en múltiples simuladores. El setting `parallel` de Cucumber dirige la cantidad de workers, y cada worker recibe su propia instancia de Detox.

```bash
# Correr con 3 simuladores en paralelo
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

El hook `BeforeAll` lee `CUCUMBER_WORKER_ID` y se lo pasa a `setupDetox` para que cada worker se inicialice contra su propio simulador. Cucumber distribuye los escenarios entre los workers por vos.

| Configuración | Local | CI |
|---|---|---|
| Workers iOS | 2-3 | 3 |
| Workers Android | 1-2 | 2 |
| Reintentos en fallo | 1 | 1 |
| Fail fast | No | No |

Un consejo sobre las corridas en paralelo. Mantené el fail-fast desactivado cuando corras en paralelo. Un escenario inestable no debería matar a los otros workers, y con reintentos habilitados ese inestable tiene una segunda oportunidad mientras el resto sigue. En una corrida con un solo worker, fail-fast activo está bien.

## Testing de accesibilidad con BDD

Detox no controla VoiceOver ni TalkBack directamente. El testing manual con screen reader sigue teniendo trabajo. Lo que Detox *sí puede* chequear es si los labels, roles y traits de accesibilidad están bien puestos en cada elemento. Escritos como escenarios de Gherkin, esos chequeos detectan una clase de regresión que nadie va a notar manualmente hasta que un usuario con VoiceOver abra la app.

Mi repo tiene dos feature files para esto, uno para patrones de iOS y otro para Android.

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

Las definiciones de pasos para testing de accesibilidad mantienen estado:

```typescript
interface AccessibilityState {
  focusedElementIndex: number;
  visitedElements: string[];
  lastAnnouncement: string | null;
  granularity: 'characters' | 'words' | 'lines' | 'headings' | 'default';
}
```

Esto trackea el orden de foco esperado, el texto de los anuncios y la granularidad de lectura. Unos 50 escenarios entre los dos feature files cubren labels, comportamiento de foco, anuncios de live regions y acciones personalizadas. No reemplazan una pasada manual con un screen reader real. Sí evitan que las regresiones obvias lleguen a producción.

## Cómo correrlo

Los scripts que uso viven en `package.json` así:

```json
{
  "scripts": {
    "detox:ios:build": "detox build -c ios.sim.debug",
    "detox:ios:test": "DETOX_CONFIGURATION=ios.sim.debug TS_NODE_PROJECT=tsconfig.cucumber.json cucumber-js",
    "detox:ios:test:parallel": "DETOX_WORKERS=2 yarn detox:ios:test --parallel 2 --retry 1",
    "e2e:ios": "yarn detox:ios:build && yarn detox:ios:test"
  }
}
```

Notá que el script de test corre `cucumber-js` directamente en vez de `detox test`. Con Cucumber como runner, no pasás por el wrapper de Detox. Detox se inicializa desde tu archivo de soporte.

## Errores comunes

**La sincronización es la parte más difícil.** Detox intenta esperar a que la app esté idle automáticamente, pero las animaciones, timers y llamadas de red lo pueden confundir. El patrón de lanzar con sincronización deshabilitada (`detoxEnableSynchronization: 0` y después `enableSynchronization()`) esquiva el timeout más común.

**`typeText` agrega, `replaceText` reemplaza.** Si un campo tiene texto placeholder o input previo, `typeText` le agrega encima. Usá `replaceText` para inputs de formularios donde querés un valor limpio.

**Screenshots cuando falla.** El hook `After` captura un screenshot cuando un escenario falla. Sin eso, debuggear fallos en CI es entrecerrar los ojos contra los logs. Nombrá el screenshot con el nombre del escenario para poder relacionar un fallo con su imagen.

**Describí comportamiento, no implementación.** Escribí "When I log in", no "When I type into email-input and tap login-button". Los detalles de implementación van en las definiciones de pasos, no en el Gherkin. Si alguien que no es ingeniero no puede leer el feature file en voz alta y entenderlo, dejaste filtrar detalle a la capa equivocada.

## La estructura de archivos completa

```
src/
  test-utils/
    cucumber/
      formatters/
        CheckmarkFormatter.js    # Formatter personalizado ✓/✗
      step-definitions/
        common.cucumber.tsx      # Pasos compartidos (tap, type, navigate)
        auth.cucumber.tsx         # Pasos de autenticación
        accessibility.cucumber.tsx # Pasos de VoiceOver + TalkBack
      support/
        detox-setup.ts           # Inicialización de Detox
        hooks.ts                  # BeforeAll/Before/After/AfterAll
        world.ts                  # Contexto del Cucumber World
e2e/
  accessibility/
    VoiceOverGestures.feature    # Tests de screen reader para iOS
    TalkBackGestures.feature     # Tests de screen reader para Android
```

## Qué ganas

El setup es un trabajo de una mañana. El primer feature file es una tarde. Después de eso, sumar escenarios es rápido porque las definiciones de pasos se reutilizan entre features.

Lo que armaste al final:

1. Tests que cualquiera del equipo puede leer. Producto, QA, diseñadores. El archivo Gherkin es la especificación y el test en el mismo lugar.
2. Ejecución en paralelo que funciona con Detox. Tres simuladores, tres workers, tres veces más rápido en CI.
3. Cobertura de regresión de accesibilidad. Unos 50 escenarios verificando labels, roles y traits. No es un reemplazo del testing manual con screen reader, pero es una red que evita que las regresiones obvias lleguen a QA.

> Cuando un test E2E falla, deberías saber qué se rompió sin leer el código del test.

*Este post cubre testing E2E. Para tests unitarios y de integración uso [MSW v2 para mockear la capa de red](/es/blog/setting-up-msw-v2-in-react-native/) en vez de `jest.fn()`. Los dos combinan bien: MSW para tests rápidos y enfocados contra llamadas HTTP reales; Detox + Cucumber para flujos completos de usuario en un dispositivo real.*

*El código de este post viene de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. El setup completo de Detox + Cucumber, las definiciones de pasos, el formatter personalizado y los feature files de accesibilidad viven todos ahí.*
