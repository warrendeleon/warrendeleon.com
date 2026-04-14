---
title: "Detox + Cucumber BDD para testing E2E en React Native"
description: "La mayoría de los equipos no saben que los feature files de Gherkin funcionan con Detox. Una guía paso a paso para configurar tests E2E estilo BDD en React Native con formatters personalizados, ejecución en paralelo y testing de accesibilidad."
publishDate: 2026-05-18
tags: ["react-native", "testing", "e2e-testing", "bdd"]
locale: es
heroImage: "/images/blog/detox-cucumber-rn.webp"
heroAlt: "Detox y Cucumber BDD para testing E2E en React Native"
campaign: "detox-cucumber-bdd"
relatedPosts: ["setting-up-msw-v2-in-react-native", "metro-runtime-mocking-react-native-e2e", "accessibility-testing-react-native"]
---

## Por qué BDD para tests E2E

La mayoría de los tutoriales de Detox te muestran cómo escribir código de test imperativo:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

Funciona. Pero se lee como código, no como una especificación de test. Cuando un product manager pregunta "¿qué cubre el test de login?", le pasas un archivo TypeScript y esperas lo mejor.

**Cucumber BDD** te permite escribir tests en lenguaje natural usando sintaxis Gherkin:

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

Mismo test. Los mismos comandos de Detox por debajo. Pero ahora cualquiera del equipo puede leerlo, revisarlo y sugerir escenarios faltantes.

> 💡 **La ventaja clave:** los feature files se convierten en documentación viva. Cuando un escenario pasa, sabes que la app soporta ese comportamiento. Cuando falla, sabes exactamente qué flujo de usuario se rompió, en lenguaje claro.

## Instalación

Necesitas Detox (para la automatización del dispositivo) y Cucumber (para la capa de BDD):

```bash
yarn add -D detox @cucumber/cucumber ts-node
```

Detox también necesita su CLI:

```bash
brew tap wix/brew
brew install applesimutils
```

## Los archivos de configuración

Tres archivos de configuración conectan todo.

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

La configuración de Cucumber le indica dónde encontrar los feature files, las definiciones de pasos y cómo formatear la salida:

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

| Opción | Qué hace |
|---|---|
| `paths` | Dónde viven los feature files de Gherkin |
| `require` | Dónde viven las definiciones de pasos y archivos de soporte |
| `requireModule` | Habilita soporte para TypeScript |
| `format` | Formatter personalizado para salida legible |
| `strict` | Falla en pasos indefinidos o pendientes |
| `parallel` | Cantidad de workers en paralelo |
| `retry` | Reintentos para tests inestables en modo paralelo |

### tsconfig.cucumber.json

Una configuración mínima de TypeScript para el runtime de Cucumber:

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

## La capa de soporte

Tres archivos configuran el ciclo de vida de Detox dentro de Cucumber.

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

Este es el nexo entre el ciclo de vida de Cucumber y el manejo de dispositivos de Detox:

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

| Hook | Timeout | Qué hace |
|---|---|---|
| `BeforeAll` | 180s | Levanta el simulador, lanza la app |
| `Before` | 30s | Recarga React Native para un estado limpio por escenario |
| `After` | default | Toma un screenshot si falla, notifica a Detox |
| `AfterAll` | default | Cierra Detox |

El truco de sincronización vale la pena mencionarlo: lanza la app con la sincronización deshabilitada (`detoxEnableSynchronization: 0`), y después habilítala una vez que la app está corriendo. Esto evita que Detox haga timeout durante la carga inicial del bundle.

### world.ts

Un Cucumber World personalizado que lleva el contexto de Detox entre pasos:

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

## Escribiendo feature files

Los feature files son texto plano con sintaxis Gherkin. Cada escenario describe un flujo de usuario:

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

## Escribiendo definiciones de pasos

Cada paso de Gherkin se mapea a una función. Estos son los bloques reutilizables que hacen poderoso al BDD.

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

Patrones clave:

- ✅ **Convención consistente de testID:** los nombres de pantalla se convierten a kebab-case con un sufijo. "Login" se transforma en `login-screen`, "Home" en `home-screen`
- ✅ **Esperas explícitas:** Cada aserción usa `waitFor` con un timeout, no `expect` directo. Las animaciones y llamadas de red necesitan tiempo para asentarse
- ✅ **`replaceText` en vez de `typeText`:** `typeText` agrega al texto existente. `replaceText` limpia primero. Más seguro para inputs de formularios

### Estrategias de búsqueda de elementos

A veces `by.id()` no alcanza. Una definición de paso resiliente prueba múltiples estrategias:

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

## El formatter personalizado

La salida por defecto de Cucumber es verbosa. Un formatter personalizado te da resultados limpios y fáciles de escanear:

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

La implementación completa en mi proyecto trackea pickles, mapea los pasos de test a su texto Gherkin, calcula tiempos, y muestra un resumen con conteo de pasados/fallidos.

## Ejecución en paralelo

Detox soporta correr escenarios en múltiples simuladores. La config de `.cucumber.js` define la cantidad de workers, y cada worker recibe su propia instancia de simulador.

```bash
# Correr con 3 simuladores en paralelo
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

El hook `BeforeAll` lee `CUCUMBER_WORKER_ID` para inicializar cada worker con su propia instancia de Detox. Los escenarios se distribuyen entre workers automáticamente.

| Configuración | Local | CI |
|---|---|---|
| Workers iOS | 2-3 | 3 |
| Workers Android | 1-2 | 2 |
| Reintentos en fallo | 1 | 1 |
| Fail fast | No | No |

> 💡 **Tip:** Deshabilita fail-fast en modo paralelo. Un escenario inestable no debería frenar a los otros workers. Con reintentos habilitados, el test inestable tiene una segunda oportunidad mientras el resto sigue corriendo.

## Testing de accesibilidad con BDD

Detox no puede controlar VoiceOver o TalkBack directamente. El testing manual con screen reader sigue siendo esencial. Pero lo que Detox *sí puede* hacer es verificar que los labels, roles y traits de accesibilidad estén correctos en cada elemento. Escritos en Gherkin, estos tests detectan regresiones de accesibilidad antes de que un tester humano abra VoiceOver.

Mi proyecto tiene dos feature files que testean propiedades de accesibilidad: uno para patrones de iOS y otro para Android.

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

Esto trackea el orden de foco esperado, el texto de los anuncios y la granularidad de lectura. 50 escenarios en ambos feature files verifican labels de accesibilidad, comportamiento de foco, anuncios de live regions y acciones personalizadas. No reemplazan el testing manual con un screen reader real, pero evitan que las regresiones lleguen a producción.

## Los scripts

Los scripts de package.json hacen que el flujo de trabajo sea limpio:

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

## Errores comunes

**La sincronización es la parte más difícil.** Detox intenta esperar automáticamente a que la app esté idle, pero las animaciones, timers y llamadas de red pueden confundirlo. El patrón de lanzar con sincronización deshabilitada (`detoxEnableSynchronization: 0` y después `enableSynchronization()`) evita el timeout más común.

**`typeText` agrega, `replaceText` reemplaza.** Si un campo tiene texto placeholder o input previo, `typeText` le agrega encima. Usa `replaceText` para inputs de formularios donde quieres un valor limpio.

**Los screenshots en fallo son esenciales.** El hook `After` captura un screenshot cuando un escenario falla. Sin esto, debuggear fallos en CI es adivinanza. Nombra el screenshot con el nombre del escenario para poder relacionar fallos con imágenes.

**Los feature files deberían describir comportamiento, no implementación.** Escribe "When I log in", no "When I type into email-input and tap login-button". Los detalles de implementación van en las definiciones de pasos, no en el Gherkin.

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

El setup toma una mañana. Escribir el primer feature file toma una tarde. Después de eso, agregar nuevos escenarios es rápido porque las definiciones de pasos son reutilizables.

El beneficio:

1. **Tests que cualquiera puede leer.** Product managers, QA, diseñadores. Los archivos Gherkin son la especificación y el test en uno.
2. **Ejecución en paralelo lista para usar.** El paralelismo nativo de Cucumber funciona con Detox. Tres simuladores, tres workers, tres veces más rápido.
3. **Detección de regresiones de accesibilidad.** 50 escenarios verifican que labels, roles y traits estén correctos. No reemplazan el testing manual con screen reader, pero son una red de seguridad que evita que las regresiones lleguen a QA.

> Cuando un test E2E falla, deberías saber qué se rompió sin leer el código del test.

*Este post cubre testing E2E. Para tests unitarios y de integración, uso [MSW v2 para mockear la capa de red](/es/blog/setting-up-msw-v2-in-react-native/) en vez de `jest.fn()`. Los dos enfoques se complementan: MSW para tests rápidos y enfocados contra llamadas HTTP reales; Detox + Cucumber para flujos completos de usuario en un dispositivo real.*

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. El setup completo de Detox + Cucumber, las definiciones de pasos, el formatter personalizado y los feature files de accesibilidad están en el repo.*
