---
title: "Accessibility testing in React Native"
description: "Automated React Native accessibility tests: touch targets, contrast ratios, focus order, screen reader announcements. Plus where manual testing still wins."
publishDate: 2026-08-03
series: "Testing and Infrastructure"
tags: ["react-native", "accessibility", "wcag", "testing"]
locale: en
heroImage: "/images/blog/accessibility-testing-rn.webp"
heroAlt: "Accessibility testing in React Native"
campaign: "accessibility-testing"
relatedPosts: ["detox-cucumber-bdd-react-native-e2e-testing", "i18n-automated-parity-tests-react-native", "feature-first-project-structure-react-native"]
---

## Where automated tests fit alongside manual a11y work

Plenty of React Native teams already do accessibility well. Designers review for contrast and target size before a screen ships. QA runs VoiceOver and TalkBack passes ahead of release. That manual layer catches the things automation can't: reading order in complex layouts, gesture conflicts, the subjective question of whether a label is actually helpful.

What it doesn't catch is the regression. A stylesheet refactor drops a button from 44pt to 40pt. A theme update lowers the secondary text contrast under 4.5:1. The error toast loses its `accessibilityLiveRegion` when someone swaps the component. None of that surfaces in the next manual pass for weeks, by which point three more PRs have built on top of it.

Touch target size is a number. Contrast ratio is a calculation. Live regions and roles are props. The mechanical parts of WCAG can run in Jest alongside your unit tests, on every PR, with the rest of your test suite. That's the bit this post covers. The implementation itself is in your components. The tests just keep the components honest after the next refactor.

## What's in scope

| What | WCAG criterion | How I test it |
|---|---|---|
| Touch target size | 2.5.5 | Check `minWidth`/`minHeight` >= 44pt (iOS) or 48dp (Android) |
| Colour contrast | 1.4.3 | Calculate luminance ratio >= 4.5:1 for text, 3:1 for large text |
| Focus order | 2.4.3 | Smoke-check each element is focusable; reading order itself needs Detox |
| Accessibility roles | 4.1.2 | Assert `accessibilityRole` is set on interactive elements |
| Screen reader announcements | 4.1.3 | Check `accessibilityLiveRegion` on dynamic content |
| Error identification | 3.3.1 | Verify error messages have `role="alert"` and live region |
| Labels and hints | 3.3.2 | Assert `accessibilityLabel` and `accessibilityHint` exist on form inputs |

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare or Expo)
- TypeScript with the standard RN Babel config
- Jest configured (see [Setting up MSW v2 in React Native](/blog/setting-up-msw-v2-in-react-native/) for the polyfills, config, and `renderWithProviders`)
- Numeric or string-with-units dimensions on touchables (the helper parses both via `parseFloat`)

Style libraries that hand dimensions to components as theme tokens (`h="$12"`, `className="h-12"`) need to either resolve to a numeric value in the rendered tree or be replaced with numeric values in the components under test. The helper reads through `StyleSheet.flatten`, not through a theme resolver.

## Installation

No extra dependencies. The utilities use React Native Testing Library, which is already there for component tests, plus plain Jest assertions:

```bash
yarn add -D @testing-library/react-native
```

## A failing test, then the fix

Before the utilities, look at what the test loop feels like. Suppose the login button is sized at 40pt height because someone tightened up spacing in a recent PR:

```typescript
import { expectMinTouchTarget, renderWithProviders } from '@app/test-utils';
import { LoginScreen } from '../LoginScreen';

it('login button meets minimum touch target', () => {
  const { getByTestId } = renderWithProviders(<LoginScreen />);
  expectMinTouchTarget(getByTestId('login-button'));
});
```

The test fails:

```text
Expected: >= 44
Received: 40

  at expectMinTouchTarget (test-utils/accessibility.ts)
```

Bump the button's `minHeight` to 44 in the component, re-run, green. The loop is the same shape as any other unit-test fix. That's the whole point of moving these checks into Jest. The CI signal arrives when the regression lands, not weeks later when QA runs the next manual pass.

## The accessibility testing utilities

A single file exports the helpers. Each function maps to a WCAG criterion and takes a `ReactTestInstance` (the element you get back from `getByTestId`).

### Touch target validation

The most common accessibility miss in mobile apps is buttons and inputs that are too small to tap reliably. iOS asks for 44pt minimum, Android for 48dp. The helper reads the element's flattened style, falls back to width/height if `minWidth`/`minHeight` aren't set, and adds any padding contribution before comparing against the threshold:

```typescript
// src/test-utils/accessibility.ts
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

export const TOUCH_TARGET_SIZES = {
  ios: { minWidth: 44, minHeight: 44 },
  android: { minWidth: 48, minHeight: 48 },
  default: { minWidth: 44, minHeight: 44 },
} as const;

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  const flattened = StyleSheet.flatten(
    style as Parameters<typeof StyleSheet.flatten>[0]
  );
  return (flattened as Record<string, unknown>) || {};
}

function getNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function expectMinTouchTarget(
  element: ReactTestInstance,
  minWidth: number = TOUCH_TARGET_SIZES.default.minWidth,
  minHeight: number = TOUCH_TARGET_SIZES.default.minHeight
): void {
  const flatStyle = flattenStyle(element.props.style);

  // Explicit minWidth/minHeight wins.
  const styleMinWidth = getNumericValue(flatStyle.minWidth);
  const styleMinHeight = getNumericValue(flatStyle.minHeight);

  // Otherwise fall back to width/height.
  const styleWidth = getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.height);

  // Padding adds to effective touch target.
  const paddingHorizontal =
    getNumericValue(flatStyle.paddingHorizontal) ||
    (getNumericValue(flatStyle.paddingLeft) ?? 0) +
      (getNumericValue(flatStyle.paddingRight) ?? 0);
  const paddingVertical =
    getNumericValue(flatStyle.paddingVertical) ||
    (getNumericValue(flatStyle.paddingTop) ?? 0) +
      (getNumericValue(flatStyle.paddingBottom) ?? 0);
  const padding = getNumericValue(flatStyle.padding) ?? 0;

  const effectiveWidth = styleMinWidth ?? styleWidth;
  const effectiveHeight = styleMinHeight ?? styleHeight;

  const totalWidth =
    effectiveWidth !== undefined
      ? effectiveWidth + (paddingHorizontal || padding * 2)
      : undefined;
  const totalHeight =
    effectiveHeight !== undefined
      ? effectiveHeight + (paddingVertical || padding * 2)
      : undefined;

  if (styleMinWidth !== undefined) {
    expect(styleMinWidth).toBeGreaterThanOrEqual(minWidth);
  } else if (totalWidth !== undefined) {
    expect(totalWidth).toBeGreaterThanOrEqual(minWidth);
  }
  // If nothing explicit, parent layout or hitSlop controls it. Allow silently.

  if (styleMinHeight !== undefined) {
    expect(styleMinHeight).toBeGreaterThanOrEqual(minHeight);
  } else if (totalHeight !== undefined) {
    expect(totalHeight).toBeGreaterThanOrEqual(minHeight);
  }
}
```

The function is deliberately permissive about elements with no inline dimensions. Plenty of touchables are sized by their parent container (`flex: 1`, `alignSelf: 'stretch'`) or by `hitSlop`, and asserting failure on every one of those would mean a wall of false positives. The trade-off: an element that genuinely renders too small but has no explicit size will pass this check. That's where a manual VoiceOver pass or a Detox screenshot test catches it.

If a touchable does declare its own size, the helper is strict. `minWidth: 40` on a button fails. `width: 44` with `padding: 4` passes (effective 52). For visually small targets that rely on `hitSlop`, there's a dedicated helper.

### hitSlop validation

For visually small elements (icon buttons, close buttons) that use `hitSlop` to extend the touch area:

```typescript
export function expectMinHitSlop(
  element: ReactTestInstance,
  minHitSlop: number = 8
): void {
  const hitSlop = element.props.hitSlop;

  if (!hitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no hitSlop defined.`
    );
  }

  if (typeof hitSlop === 'number') {
    expect(hitSlop).toBeGreaterThanOrEqual(minHitSlop);
  } else {
    expect(hitSlop.top ?? 0).toBeGreaterThanOrEqual(minHitSlop);
    expect(hitSlop.bottom ?? 0).toBeGreaterThanOrEqual(minHitSlop);
    expect(hitSlop.left ?? 0).toBeGreaterThanOrEqual(minHitSlop);
    expect(hitSlop.right ?? 0).toBeGreaterThanOrEqual(minHitSlop);
  }
}
```

### Accessibility props validation

Checks that interactive elements have the right roles, labels, hints, and states:

```typescript
export function expectAccessibilityProps(
  element: ReactTestInstance,
  options: {
    role?: string;
    label?: boolean | string;
    hint?: boolean | string;
    state?: Partial<{
      disabled: boolean;
      selected: boolean;
      checked: boolean | 'mixed';
      busy: boolean;
      expanded: boolean;
    }>;
  }
): void {
  if (options.role) {
    expect(element.props.accessibilityRole).toBe(options.role);
  }

  if (options.label === true) {
    expect(element.props.accessibilityLabel).toBeTruthy();
  } else if (typeof options.label === 'string') {
    expect(element.props.accessibilityLabel).toBe(options.label);
  }

  if (options.hint === true) {
    expect(element.props.accessibilityHint).toBeTruthy();
  } else if (typeof options.hint === 'string') {
    expect(element.props.accessibilityHint).toBe(options.hint);
  }

  if (options.state) {
    const actualState = element.props.accessibilityState || {};
    Object.entries(options.state).forEach(([key, value]) => {
      expect(actualState[key]).toBe(value);
    });
  }
}
```

Pass `label: true` to check it exists (any value). Pass `label: 'Submit'` to check the exact text. Same for `hint`. The `state` option verifies `accessibilityState` properties like `disabled`, `selected`, and `expanded`.

### Screen reader announcements

Dynamic content (error messages, loading states, success confirmations) needs to announce itself to screen readers via live regions:

```typescript
export function expectScreenReaderAnnouncement(
  element: ReactTestInstance,
  options: {
    liveRegion?: 'none' | 'polite' | 'assertive';
    role?: string;
  }
): void {
  if (options.liveRegion) {
    expect(element.props.accessibilityLiveRegion).toBe(options.liveRegion);
  }

  if (options.role) {
    expect(element.props.accessibilityRole).toBe(options.role);
  }
}
```

`'polite'` waits for the user to finish their current interaction before announcing. `'assertive'` interrupts immediately. Error messages should be `'assertive'` with `role="alert"`. Status updates should be `'polite'`.

### Focus order verification

Screen reader users navigate sequentially. The check below is a smoke test, not a real focus-order verifier: it confirms each element in the array is focusable, and the *order you pass them in* documents the expected sequence. The actual reading order is determined at runtime by the screen reader and the layout tree, which Jest can't fully simulate. For real reading-order checks, use the Detox + VoiceOver feature files in [the BDD post](/blog/detox-cucumber-bdd-react-native-e2e-testing/).

```typescript
export function expectFocusOrder(elements: ReactTestInstance[]): void {
  for (const element of elements) {
    expect(element.props.accessible !== false).toBe(true);
  }
}

export function expectCanReceiveFocus(element: ReactTestInstance): void {
  expect(element.props.accessible !== false).toBe(true);
  expect(
    element.props.accessibilityRole ||
    element.props.accessibilityLabel ||
    element.props.onPress
  ).toBeTruthy();
}
```

### Contrast ratio checking

WCAG requires 4.5:1 for normal text and 3:1 for large text. The calculation follows the WCAG luminance formula:

```typescript
export const CONTRAST_RATIOS = {
  normalText: 4.5,
  largeText: 3,
  uiComponents: 3,
} as const;

function parseColorToRGB(color: string): { r: number; g: number; b: number } | null {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function calculateContrastRatio(
  foreground: string,
  background: string
): number {
  const fgRGB = parseColorToRGB(foreground);
  const bgRGB = parseColorToRGB(background);

  if (!fgRGB || !bgRGB) {
    throw new Error(
      `Cannot parse colours: foreground="${foreground}", background="${background}"`
    );
  }

  const fgLuminance = getRelativeLuminance(fgRGB.r, fgRGB.g, fgRGB.b);
  const bgLuminance = getRelativeLuminance(bgRGB.r, bgRGB.g, bgRGB.b);

  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function expectColorContrast(
  foregroundColor: string,
  backgroundColor: string,
  options: {
    type?: 'normalText' | 'largeText' | 'uiComponents';
    minRatio?: number;
  } = {}
): void {
  const { type = 'normalText', minRatio } = options;
  const minimum = minRatio ?? CONTRAST_RATIOS[type];
  const ratio = calculateContrastRatio(foregroundColor, backgroundColor);
  expect(ratio).toBeGreaterThanOrEqual(minimum);
}
```

Pass your text colour and background colour as hex strings. The function calculates the ratio and fails if it's below the minimum.

## Writing accessibility tests

Each screen gets its own `*.accessibility.rntl.tsx` test file. The naming convention keeps accessibility tests separate from functional tests so you can run them independently.

### Login screen example

```typescript
// src/features/Auth/__tests__/LoginScreen.accessibility.rntl.tsx
import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  expectCanReceiveFocus,
  expectFocusOrder,
  expectMinTouchTarget,
  renderWithProviders,
} from '@app/test-utils';
import { LoginScreen } from '../LoginScreen';

describe('LoginScreen Accessibility', () => {
  describe('focus order', () => {
    it('has correct focus order for form elements', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);

      expectFocusOrder([
        getByTestId('email-input'),
        getByTestId('password-input'),
        getByTestId('login-button'),
      ]);
    });

    it('has focusable email input', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      expectCanReceiveFocus(getByTestId('email-input'));
    });
  });

  describe('touch targets', () => {
    it('login button meets minimum touch target', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      expectMinTouchTarget(getByTestId('login-button'));
    });

    it('register link meets minimum touch target', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      expectMinTouchTarget(getByTestId('register-link'));
    });
  });

  describe('screen reader announcements', () => {
    it('announces error message on failed login', async () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);

      fireEvent.changeText(getByTestId('email-input'), 'bad@email.com');
      fireEvent.changeText(getByTestId('password-input'), 'wrong');
      fireEvent.press(getByTestId('login-button'));

      await waitFor(() => {
        const error = getByTestId('login-error');
        expect(error.props.accessibilityRole).toBe('alert');
        expect(error.props.accessibilityLiveRegion).toBe('assertive');
      });
    });
  });

  describe('accessibility roles and labels', () => {
    it('email input has correct accessibility props', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      const input = getByTestId('email-input');

      expect(input.props.accessibilityLabel).toBeTruthy();
      expect(input.props.accessibilityRole).toBeDefined();
    });

    it('login button has correct role', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      expect(getByTestId('login-button').props.accessibilityRole).toBe('button');
    });

    it('disabled button announces disabled state', () => {
      const { getByTestId } = renderWithProviders(<LoginScreen />);
      // Button is disabled before form is filled
      const button = getByTestId('login-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
```

Each test category maps to a WCAG requirement:

| Test group | WCAG | What it catches |
|---|---|---|
| Focus order | 2.4.3 | Tab order regressions after layout changes |
| Touch targets | 2.5.5 | Buttons shrinking below 44pt after style changes |
| Announcements | 4.1.3 | Missing `liveRegion` after error component refactors |
| Roles and labels | 4.1.2 | Missing `accessibilityRole` on new components |

### Contrast testing

Contrast tests work differently. They don't render components. They validate your design system colour constants. If your colour variables are compliant, every component using them is too:

```typescript
// src/test-utils/__tests__/highContrast.rntl.tsx
import { expectColorContrast, CONTRAST_RATIOS } from '@app/test-utils';

describe('Colour contrast compliance', () => {
  const colors = {
    textPrimary: '#0e0c19',
    textSecondary: '#555555',
    background: '#ffffff',
    backgroundDark: '#111111',
    textPrimaryDark: '#f0f0f0',
    textSecondaryDark: '#b0b0b0',
  };

  describe('light mode', () => {
    it('primary text meets 4.5:1 ratio', () => {
      expectColorContrast(
        colors.textPrimary,
        colors.background,
        { type: 'normalText' }
      );
    });

    it('secondary text meets 4.5:1 ratio', () => {
      expectColorContrast(
        colors.textSecondary,
        colors.background,
        { type: 'normalText' }
      );
    });
  });

  describe('dark mode', () => {
    it('primary text meets 4.5:1 ratio', () => {
      expectColorContrast(
        colors.textPrimaryDark,
        colors.backgroundDark,
        { type: 'normalText' }
      );
    });

    it('secondary text meets 4.5:1 ratio', () => {
      expectColorContrast(
        colors.textSecondaryDark,
        colors.backgroundDark,
        { type: 'normalText' }
      );
    });
  });
});
```

If someone changes a colour variable, the contrast test fails before it ships. No manual checking in a colour contrast tool.

## Running accessibility tests separately

The `*.accessibility.rntl.tsx` naming convention lets you run them as a suite:

```bash
yarn jest --testPathPattern='accessibility'
```

```text
PASS  src/features/Auth/__tests__/LoginScreen.accessibility.rntl.tsx
  LoginScreen Accessibility
    focus order
      ✓ has correct focus order for form elements (12 ms)
      ✓ has focusable email input (4 ms)
    touch targets
      ✓ login button meets minimum touch target (5 ms)
      ✓ register link meets minimum touch target (3 ms)
    screen reader announcements
      ✓ announces error message on failed login (98 ms)
    accessibility roles and labels
      ✓ email input has correct accessibility props (3 ms)
      ✓ login button has correct role (2 ms)
      ✓ disabled button announces disabled state (3 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

Or run everything together. They're regular Jest tests. No special configuration, no separate test runner.

## Common pitfalls

**Don't test implementation, test requirements.** `expect(element.props.accessibilityLabel).toBe('Submit')` is brittle. `expect(element.props.accessibilityLabel).toBeTruthy()` checks the requirement (label exists) without coupling to the exact text. Test exact text only when the wording matters for the user experience.

**Don't forget `accessibilityState`.** A disabled button that doesn't set `accessibilityState.disabled = true` looks disabled visually but screen readers still announce it as tappable. Always test the state alongside the role.

**Don't skip dark mode.** Contrast ratios that pass in light mode often fail in dark mode. Test both colour schemes.

**Don't trust style alone for touch targets.** A button can have `width: 44` but be inside a container with `overflow: hidden` that clips it. `expectMinTouchTarget` checks the element's own styles. Visual testing (Detox screenshots) catches the clipping.

**Live regions need content.** Setting `accessibilityLiveRegion="assertive"` on an empty element announces nothing. Test that the element has content when the live region activates.

## The file structure

```
src/
  test-utils/
    accessibility.ts                  # All accessibility helpers
    __tests__/
      accessibility.rntl.tsx          # Self-tests for the utilities
      highContrast.rntl.tsx           # Colour contrast validation
      designSystemContrast.rntl.ts    # Design system colours
  features/
    Auth/__tests__/
      LoginScreen.accessibility.rntl.tsx
    PDF/__tests__/
      PDFScreen.accessibility.rntl.tsx
    Profile/__tests__/
      ProfileScreen.accessibility.rntl.tsx
```

## The setup cost

The utility file is about 200 lines. Each screen's accessibility test file is 100-500 lines. The setup is an afternoon.

What you get: automated regression testing for every WCAG requirement that can be expressed as a Jest assertion. Touch targets, contrast ratios, focus order, roles, labels, announcements. All running on every PR, catching regressions that no one would notice until a screen reader user reports them.

These tests don't replace manual accessibility testing. A real user with VoiceOver will find issues that automated tests miss (reading order within complex layouts, gesture conflicts, missing context). But they catch the mechanical regressions: the button that got 2 points smaller, the colour that lost contrast, the error message that lost its live region.

> Automated accessibility tests don't make your app accessible. They keep it accessible after someone changes the code.

*This post covers automated accessibility testing with Jest. For E2E accessibility testing with VoiceOver and TalkBack feature files, see [Detox + Cucumber BDD for React Native E2E testing](/blog/detox-cucumber-bdd-react-native-e2e-testing/). The two approaches complement each other: Jest catches regressions on every PR; Detox validates the full user flow on a real device.*

*The code examples in this post are from [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), my personal React Native project. The full accessibility testing utilities, contrast validators, and screen-specific test files are all in the repo.*
