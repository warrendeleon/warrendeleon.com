---
title: "Detox + Cucumber BDD for React Native E2E testing"
description: "Most teams don't know Gherkin feature files work with Detox. A step-by-step guide to setting up BDD-style E2E tests in React Native with custom formatters, parallel execution, and accessibility regression tests."
publishDate: 2026-05-11
tags: ["react-native", "testing", "e2e-testing", "bdd"]
locale: en
heroImage: "/images/blog/detox-cucumber-rn.jpg"
heroAlt: "Detox and Cucumber BDD for React Native E2E testing"
campaign: "detox-cucumber-bdd"
relatedPosts: ["setting-up-msw-v2-in-react-native", "metro-runtime-mocking-react-native-e2e"]
---

## Why BDD for E2E tests

Most Detox tutorials show you how to write imperative test code:

```typescript
await element(by.id('email-input')).typeText('user@example.com');
await element(by.id('password-input')).typeText('password123');
await element(by.id('login-button')).tap();
await expect(element(by.id('home-screen'))).toBeVisible();
```

This works. But it reads like code, not like a test specification. When a product manager asks "what does the login test cover?", you hand them a TypeScript file and hope for the best.

**Cucumber BDD** lets you write tests in plain English using Gherkin syntax:

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

Same test. Same Detox commands underneath. But now anyone on the team can read it, review it, and suggest missing scenarios.

> 💡 **The key advantage:** feature files become living documentation. When a scenario passes, you know the app supports that behaviour. When it fails, you know exactly which user flow broke, in plain language.

## Installation

You need Detox (for the device automation) and Cucumber (for the BDD layer):

```bash
yarn add -D detox @cucumber/cucumber ts-node
```

Detox also needs its CLI:

```bash
brew tap wix/brew
brew install applesimutils
```

## The configuration files

Three config files wire everything together.

### .detoxrc.js

The Detox configuration defines your app builds and device targets:

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

The Cucumber configuration tells it where to find feature files, step definitions, and how to format output:

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

| Option | What it does |
|---|---|
| `paths` | Where Gherkin feature files live |
| `require` | Where step definitions and support files live |
| `requireModule` | Enables TypeScript support |
| `format` | Custom formatter for readable output |
| `strict` | Fails on undefined or pending steps |
| `parallel` | Number of parallel workers |
| `retry` | Retries for flaky tests in parallel mode |

### tsconfig.cucumber.json

A minimal TypeScript config for the Cucumber runtime:

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

## The support layer

Three files set up the Detox lifecycle inside Cucumber.

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

This is the glue between Cucumber's lifecycle and Detox's device management:

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

| Hook | Timeout | What it does |
|---|---|---|
| `BeforeAll` | 180s | Boots the simulator, launches the app |
| `Before` | 30s | Reloads React Native for a fresh state per scenario |
| `After` | default | Takes a screenshot on failure, notifies Detox |
| `AfterAll` | default | Tears down Detox |

The synchronisation trick is worth noting: launch with synchronisation disabled (`detoxEnableSynchronization: 0`), then enable it after the app is running. This avoids Detox timing out during the initial bundle load.

### world.ts

A custom Cucumber World that carries Detox context between steps:

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

## Writing feature files

Feature files are plain text with Gherkin syntax. Each scenario describes a user flow:

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

Tags let you filter which scenarios to run:

```
@accessibility @voiceover @ios
Feature: VoiceOver Gestures

  @eaa
  Scenario: Navigate login form with swipe gestures
    ...
```

Then in your test command:

```bash
yarn detox test --tags "@accessibility and @ios"
```

## Writing step definitions

Each Gherkin step maps to a function. These are the reusable building blocks that make BDD powerful.

### Common steps

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

Key patterns:

- ✅ **Consistent testID convention:** screen names become kebab-case with a suffix. "Login" becomes `login-screen`, "Home" becomes `home-screen`
- ✅ **Explicit waits:** Every assertion uses `waitFor` with a timeout, not raw `expect`. Animations and network calls need settling time
- ✅ **`replaceText` over `typeText`:** `typeText` appends to existing text. `replaceText` clears first. Safer for form inputs

### Element finding strategies

Sometimes `by.id()` isn't enough. A resilient step definition tries multiple strategies:

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

Try `by.text()` first (visible text), fall back to `by.label()` (accessibility label), then `by.id()` (testID). This handles buttons that render text differently across platforms.

## The custom formatter

Cucumber's default output is verbose. A custom formatter gives you clean, scannable results:

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

The formatter is a class that listens to Cucumber events:

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

The full implementation in my project tracks pickles, maps test steps to their Gherkin text, calculates timing, and outputs a summary with pass/fail counts.

## Parallel execution

Detox supports running scenarios across multiple simulators. The `.cucumber.js` config sets the worker count, and each worker gets its own simulator instance.

```bash
# Run with 3 parallel simulators
DETOX_WORKERS=3 yarn detox:ios:test:parallel
```

The `BeforeAll` hook reads `CUCUMBER_WORKER_ID` to initialise each worker with its own Detox instance. Scenarios are distributed across workers automatically.

| Setting | Local | CI |
|---|---|---|
| iOS workers | 2-3 | 3 |
| Android workers | 1-2 | 2 |
| Retry on failure | 1 | 1 |
| Fail fast | No | No |

> 💡 **Tip:** Disable fail-fast in parallel mode. One flaky scenario shouldn't stop the other workers. With retry enabled, the flaky test gets a second chance while the rest continue running.

## Accessibility testing with BDD

Detox can't drive VoiceOver or TalkBack directly. Manual screen reader testing is still essential. But what Detox *can* do is verify that the right accessibility labels, roles, and traits are set on every element. Written in Gherkin, these tests catch accessibility regressions before a human tester ever opens VoiceOver.

My project has two feature files that test accessibility properties: one for iOS patterns and one for Android.

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

The step definitions for accessibility testing maintain state:

```typescript
interface AccessibilityState {
  focusedElementIndex: number;
  visitedElements: string[];
  lastAnnouncement: string | null;
  granularity: 'characters' | 'words' | 'lines' | 'headings' | 'default';
}
```

This tracks expected focus order, announcement text, and reading granularity. 50 scenarios across both feature files verify accessibility labels, focus behaviour, live region announcements, and custom actions. They don't replace manual testing with a real screen reader, but they stop regressions from shipping.

## The scripts

Package.json scripts make the workflow clean:

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

## Common pitfalls

**Synchronisation is the hardest part.** Detox tries to automatically wait for the app to be idle, but animations, timers, and network calls can confuse it. The launch-with-sync-disabled pattern (`detoxEnableSynchronization: 0` then `enableSynchronization()` after) avoids the most common timeout.

**`typeText` appends, `replaceText` replaces.** If a field has placeholder text or previous input, `typeText` adds to it. Use `replaceText` for form inputs where you want a clean value.

**Screenshots on failure are essential.** The `After` hook captures a screenshot when a scenario fails. Without this, debugging CI failures is guesswork. Name the screenshot after the scenario so you can match failures to images.

**Feature files should describe behaviour, not implementation.** Write "When I log in" not "When I type into email-input and tap login-button". The implementation details belong in step definitions, not in the Gherkin.

## The full file structure

```
src/
  test-utils/
    cucumber/
      formatters/
        CheckmarkFormatter.js    # Custom ✓/✗ formatter
      step-definitions/
        common.cucumber.tsx      # Shared steps (tap, type, navigate)
        auth.cucumber.tsx         # Authentication steps
        accessibility.cucumber.tsx # VoiceOver + TalkBack steps
      support/
        detox-setup.ts           # Detox initialisation
        hooks.ts                  # BeforeAll/Before/After/AfterAll
        world.ts                  # Cucumber World context
e2e/
  accessibility/
    VoiceOverGestures.feature    # iOS screen reader tests
    TalkBackGestures.feature     # Android screen reader tests
```

## What you get

The setup takes a morning. Writing the first feature file takes an afternoon. After that, adding new scenarios is fast because the step definitions are reusable.

The payoff:

1. **Tests that anyone can read.** Product managers, QA, designers. The Gherkin files are the spec and the test rolled into one.
2. **Parallel execution out of the box.** Cucumber's built-in parallelism works with Detox. Three simulators, three workers, three times faster.
3. **Accessibility regression catching.** 50 scenarios verify that labels, roles, and traits are correct. Not a replacement for manual screen reader testing, but a safety net that stops regressions from reaching QA.

> When an E2E test fails, you should know what broke without reading the test code.

*This post covers E2E testing. For unit and integration tests, I use [MSW v2 to mock the network layer](/blog/setting-up-msw-v2-in-react-native/) instead of `jest.fn()`. The two approaches complement each other: MSW for fast, focused tests against real HTTP calls; Detox + Cucumber for full user flows on a real device.*

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full Detox + Cucumber setup, step definitions, custom formatter, and accessibility feature files are all in the repo.*
