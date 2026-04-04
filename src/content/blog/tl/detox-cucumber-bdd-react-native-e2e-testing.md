---
title: "Detox + Cucumber BDD para sa React Native E2E testing"
description: "Karamihan ng mga team ay hindi alam na gumagana ang Gherkin feature files sa Detox. Isang step-by-step na gabay sa pag-setup ng BDD-style E2E tests sa React Native gamit ang custom formatters, parallel execution, at accessibility testing."
publishDate: 2026-05-04
tags: ["react-native", "testing", "typescript", "tutorial"]
locale: tl
heroImage: "/images/blog/detox-cucumber-rn.jpg"
heroAlt: "Detox at Cucumber BDD para sa React Native E2E testing"
campaign: "detox-cucumber-bdd"
---

## Bakit BDD para sa E2E tests

Karamihan ng Detox tutorials ay nagpapakita kung paano sumulat ng imperative test code:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

Gumagana ito. Pero parang code ang basa, hindi test specification. Kapag tinanong ng product manager "ano ang sinasaklaw ng login test?", iaabot mo sa kanya ang isang TypeScript file at umaasa na lang.

**Cucumber BDD** ang nagbibigay-daan para sumulat ng tests sa plain English gamit ang Gherkin syntax:

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

Parehong test. Parehong Detox commands sa ilalim. Pero ngayon, kahit sino sa team ang makakabasa, makakapag-review, at makakapag-suggest ng mga nawawalang scenarios.

> 💡 **Ang pangunahing bentahe:** nagiging living documentation ang feature files. Kapag pumasa ang isang scenario, alam mong sinusuportahan ng app ang behaviour na iyon. Kapag bumagsak, alam mo kaagad kung anong user flow ang nasira, sa plain language.

## Installation

Kailangan mo ang Detox (para sa device automation) at Cucumber (para sa BDD layer):

```bash
yarn add -D detox @cucumber/cucumber ts-node
```

Kailangan din ng Detox ang CLI nito:

```bash
brew tap wix/brew
brew install applesimutils
```

## Ang mga configuration files

Tatlong config file ang nag-uugnay sa lahat.

### .detoxrc.js

Ang Detox configuration ang nagde-define ng app builds at device targets:

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

Ang Cucumber configuration ang nagsasabi kung saan hahanapin ang feature files, step definitions, at kung paano i-format ang output:

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

| Option | Ano ang ginagawa |
|---|---|
| `paths` | Kung saan nakalagay ang mga Gherkin feature file |
| `require` | Kung saan nakalagay ang step definitions at support files |
| `requireModule` | Nagpe-enable ng TypeScript support |
| `format` | Custom formatter para sa readable output |
| `strict` | Nagfa-fail kapag may undefined o pending steps |
| `parallel` | Bilang ng parallel workers |
| `retry` | Retries para sa flaky tests sa parallel mode |

### tsconfig.cucumber.json

Isang minimal na TypeScript config para sa Cucumber runtime:

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

## Ang support layer

Tatlong file ang nagse-set up ng Detox lifecycle sa loob ng Cucumber.

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

Ito ang nag-uugnay sa lifecycle ng Cucumber at sa device management ng Detox:

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

| Hook | Timeout | Ano ang ginagawa |
|---|---|---|
| `BeforeAll` | 180s | Nagbo-boot ng simulator, nagla-launch ng app |
| `Before` | 30s | Nagre-reload ng React Native para sa bagong state bawat scenario |
| `After` | default | Kumuha ng screenshot kapag bumagsak, nagno-notify sa Detox |
| `AfterAll` | default | Nilalaglag ang Detox |

Kapansin-pansin ang synchronisation trick: mag-launch na naka-disable ang synchronisation (`detoxEnableSynchronization: 0`), tapos i-enable pagkatapos tumakbo ang app. Iniiwasan nito ang Detox timeout habang naglo-load ang initial bundle.

### world.ts

Isang custom Cucumber World na nagdadala ng Detox context sa pagitan ng mga steps:

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

## Pagsusulat ng feature files

Ang feature files ay plain text na may Gherkin syntax. Bawat scenario ay naglalarawan ng isang user flow:

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

Pinapayagan ng tags na i-filter kung aling mga scenarios ang tatakbuhin:

```
@accessibility @voiceover @ios
Feature: VoiceOver Gestures

  @eaa
  Scenario: Navigate login form with swipe gestures
    ...
```

Tapos sa test command:

```bash
yarn detox test --tags "@accessibility and @ios"
```

## Pagsusulat ng step definitions

Bawat Gherkin step ay naka-map sa isang function. Ito ang mga reusable building blocks na nagbibigay-lakas sa BDD.

### Mga karaniwang steps

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

Mga pangunahing pattern:

- ✅ **Consistent na testID convention:** nagiging kebab-case ang screen names na may suffix. "Login" ay nagiging `login-screen`, "Home" ay nagiging `home-screen`
- ✅ **Explicit waits:** Gumagamit ng `waitFor` na may timeout ang bawat assertion, hindi raw `expect`. Kailangan ng settling time ng mga animations at network calls
- ✅ **`replaceText` kaysa `typeText`:** Nag-a-append sa existing text ang `typeText`. Nag-c-clear muna ang `replaceText`. Mas ligtas para sa form inputs

### Mga strategy sa paghahanap ng elements

Minsan hindi sapat ang `by.id()`. Isang matibay na step definition ay sumusubok ng maraming strategy:

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

Subukan muna ang `by.text()` (nakikitang text), bumalik sa `by.label()` (accessibility label), tapos `by.id()` (testID). Hina-handle nito ang mga buttons na magkaiba ang pag-render ng text sa iba't ibang platform.

## Ang custom formatter

Masyadong verbose ang default output ng Cucumber. Nagbibigay ang custom formatter ng malinis at madaling i-scan na results:

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

Ang formatter ay isang class na nakikinig sa Cucumber events:

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

Ang buong implementation sa aking project ay nagta-track ng pickles, nagma-map ng test steps sa kanilang Gherkin text, nagco-compute ng timing, at nag-o-output ng summary na may pass/fail counts.

## Parallel execution

Sinusuportahan ng Detox ang pagpapatakbo ng scenarios sa maraming simulators. Itinatakda ng `.cucumber.js` config ang bilang ng workers, at bawat worker ay may sariling simulator instance.

```bash
# Patakbuhin gamit ang 3 parallel simulators
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

Binabasa ng `BeforeAll` hook ang `CUCUMBER_WORKER_ID` para i-initialise ang bawat worker na may sariling Detox instance. Awtomatikong dini-distribute ang mga scenarios sa mga workers.

| Setting | Local | CI |
|---|---|---|
| iOS workers | 2-3 | 3 |
| Android workers | 1-2 | 2 |
| Retry kapag bumagsak | 1 | 1 |
| Fail fast | Hindi | Hindi |

> 💡 **Tip:** I-disable ang fail-fast sa parallel mode. Hindi dapat pinapahinto ng isang flaky scenario ang ibang workers. Kapag naka-enable ang retry, may ikalawang pagkakataon ang flaky test habang nagpapatuloy ang iba.

## Accessibility testing gamit ang BDD

Hindi kayang i-drive ng Detox ang VoiceOver o TalkBack nang direkta. Mahalaga pa rin ang manual na screen reader testing. Pero ang kaya ng Detox ay i-verify na tama ang mga accessibility labels, roles, at traits sa bawat element. Nakasulat sa Gherkin, nahuhuli ng mga tests na ito ang accessibility regressions bago pa man mag-bukas ng VoiceOver ang isang human tester.

Ang aking project ay may dalawang feature file na nagti-test ng accessibility properties: isa para sa iOS patterns at isa para sa Android.

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

Ang step definitions para sa accessibility testing ay nagpapanatili ng state:

```typescript
interface AccessibilityState {
  focusedElementIndex: number;
  visitedElements: string[];
  lastAnnouncement: string | null;
  granularity: 'characters' | 'words' | 'lines' | 'headings' | 'default';
}
```

Tina-track nito ang expected focus order, announcement text, at reading granularity. 50 scenarios sa dalawang feature file ang nagve-verify ng accessibility labels, focus behaviour, live region announcements, at custom actions. Hindi nito pinapalitan ang manual testing gamit ang tunay na screen reader, pero pinipigilan nito ang mga regression na ma-ship.

## Ang mga scripts

Pinapalinis ng package.json scripts ang workflow:

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

## Mga karaniwang pagkakamali

**Ang synchronisation ang pinakamahirap na bahagi.** Sinusubukan ng Detox na awtomatikong maghintay hanggang idle ang app, pero nakakalito ang mga animations, timers, at network calls. Ang launch-with-sync-disabled pattern (`detoxEnableSynchronization: 0` tapos `enableSynchronization()` pagkatapos) ang umiiwas sa pinakakaraniwang timeout.

**Nag-a-append ang `typeText`, nagpapalit ang `replaceText`.** Kung may placeholder text o dating input ang isang field, dinadagdagan ito ng `typeText`. Gamitin ang `replaceText` para sa form inputs kung saan gusto mo ng malinis na value.

**Mahalaga ang screenshots kapag bumagsak.** Kumukuha ng screenshot ang `After` hook kapag bumagsak ang isang scenario. Kung wala ito, hula-hula lang ang pag-debug ng CI failures. Ipangalan ang screenshot sa scenario para mapagtutugnay mo ang mga failures sa mga images.

**Dapat naglalarawan ng behaviour ang feature files, hindi ng implementation.** Isulat na "When I log in" hindi "When I type into email-input and tap login-button". Ang mga detalye ng implementation ay nasa step definitions, hindi sa Gherkin.

## Ang buong file structure

```
src/
  test-utils/
    cucumber/
      formatters/
        CheckmarkFormatter.js    # Custom na ✓/✗ formatter
      step-definitions/
        common.cucumber.tsx      # Mga shared steps (tap, type, navigate)
        auth.cucumber.tsx         # Mga authentication steps
        accessibility.cucumber.tsx # Mga VoiceOver + TalkBack steps
      support/
        detox-setup.ts           # Detox initialisation
        hooks.ts                  # BeforeAll/Before/After/AfterAll
        world.ts                  # Cucumber World context
e2e/
  accessibility/
    VoiceOverGestures.feature    # Mga iOS screen reader tests
    TalkBackGestures.feature     # Mga Android screen reader tests
```

## Ano ang nakukuha mo

Isang umaga lang ang setup. Isang hapon ang pagsulat ng unang feature file. Pagkatapos niyan, mabilis na ang pagdagdag ng bagong scenarios dahil reusable ang step definitions.

Ang balik:

1. **Tests na mababasa ng kahit sino.** Product managers, QA, designers. Ang Gherkin files ang spec at ang test na pinagsama.
2. **Parallel execution na kasama na agad.** Gumagana ang built-in parallelism ng Cucumber sa Detox. Tatlong simulators, tatlong workers, tatlong beses na mas mabilis.
3. **Pagkakahuli ng accessibility regressions.** 50 scenarios ang nagve-verify na tama ang mga labels, roles, at traits. Hindi pinapalitan ang manual screen reader testing, pero isa itong safety net na pumipigil sa mga regression na makarating sa QA.

> Kapag nag-fail ang E2E test, dapat alam mo kung ano ang nasira nang hindi binabasa ang test code.

*Sinasaklaw ng post na ito ang E2E testing. Para sa unit at integration tests, gumagamit ako ng [MSW v2 para i-mock ang network layer](/tl/blog/setting-up-msw-v2-in-react-native/) sa halip na `jest.fn()`. Nagko-complement ang dalawang approach: MSW para sa mabilis at focused na tests laban sa tunay na HTTP calls; Detox + Cucumber para sa buong user flows sa tunay na device.*

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong Detox + Cucumber setup, step definitions, custom formatter, at accessibility feature files.*
