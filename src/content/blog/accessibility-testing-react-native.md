---
title: "Accessibility testing in React Native"
description: "Practical, automated accessibility testing for React Native. Touch target validation, contrast ratio checking, focus order verification, and screen reader announcements. All in Jest, no manual testing required."
publishDate: 2026-06-15
tags: ["react-native", "testing", "accessibility", "tutorial"]
locale: en
heroImage: "/images/blog/accessibility-testing-rn.jpg"
heroAlt: "Accessibility testing in React Native"
campaign: "accessibility-testing"
---

## Most apps skip accessibility testing entirely

Accessibility in React Native usually means "add some `accessibilityLabel` props and hope for the best." Maybe someone runs VoiceOver manually before a release. Maybe they don't.

The result: buttons too small to tap reliably, text with insufficient contrast, forms with no focus order, error messages that screen readers never announce. These aren't edge cases. They affect real users, and in Europe, the European Accessibility Act (EAA) makes them legal requirements. EAA enforcement started in June 2025. If your app serves EU users, this isn't optional.

The problem isn't that teams don't care. It's that accessibility testing feels manual, slow, and disconnected from the regular test suite. You run your Jest tests, they pass, and nobody checks whether the submit button is 44 points wide.

> 💡 **The fix:** treat accessibility requirements as testable assertions. Touch target size is a number. Contrast ratio is a calculation. Focus order is a sequence. All of these can run in Jest alongside your unit tests.

## What I'm testing

This isn't a guide to making your app accessible. It's a guide to *testing* that it stays accessible. The distinction matters: the implementation is in your components. The tests catch regressions when someone changes a style, refactors a layout, or adds a new screen.

| What | WCAG criterion | How I test it |
|---|---|---|
| Touch target size | 2.5.5 | Check `minWidth`/`minHeight` >= 44pt (iOS) or 48dp (Android) |
| Colour contrast | 1.4.3 | Calculate luminance ratio >= 4.5:1 for text, 3:1 for large text |
| Focus order | 2.4.3 | Verify `accessibilityOrder` or DOM order matches expected sequence |
| Accessibility roles | 4.1.2 | Assert `accessibilityRole` is set on interactive elements |
| Screen reader announcements | 4.1.3 | Check `accessibilityLiveRegion` on dynamic content |
| Error identification | 3.3.1 | Verify error messages have `role="alert"` and live region |
| Labels and hints | 3.3.2 | Assert `accessibilityLabel` and `accessibilityHint` exist on form inputs |

## Installation

No extra dependencies. The testing utilities use React Native Testing Library (which you already have for component tests) and plain Jest assertions:

```bash
yarn add -D @testing-library/react-native
```

## The accessibility testing utilities

A single file exports all the accessibility helpers. Each function maps to a WCAG criterion and takes a `ReactTestInstance` (the element you get from `getByTestId`).

### Touch target validation

The most common accessibility failure in mobile apps: buttons and inputs that are too small to tap reliably. If you use GlueStack UI or NativeWind, the function needs to handle both `style` props and direct component props, since GlueStack dimensions like `minHeight={50}` or `h="$12"` don't go through `StyleSheet`.

```typescript
// src/test-utils/accessibility.ts
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

export const TOUCH_TARGET_SIZES = {
  ios: { minWidth: 44, minHeight: 44 },
  android: { minWidth: 48, minHeight: 48 },
  default: { minWidth: 44, minHeight: 44 },
} as const;

/**
 * GlueStack UI space token to pixel value mapping.
 * Based on @gluestack-ui/config 4px base unit system.
 */
const GLUESTACK_SPACE_TOKENS: Record<string, number> = {
  '$0': 0, '$0.5': 2, '$1': 4, '$1.5': 6, '$2': 8, '$2.5': 10,
  '$3': 12, '$3.5': 14, '$4': 16, '$4.5': 18, '$5': 20, '$6': 24,
  '$7': 28, '$8': 32, '$9': 36, '$10': 40, '$11': 44, '$12': 48,
  '$16': 64, '$20': 80, '$24': 96, '$32': 128,
};

/** Values that fill their container (always satisfy touch target). */
const FULL_SIZE_VALUES = new Set([
  '$full', '100%', '$1/2', '$2/3', '$3/4', '$4/5', '$5/6',
]);

function getNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Try GlueStack token first, then parse as number
    if (GLUESTACK_SPACE_TOKENS[value] !== undefined) {
      return GLUESTACK_SPACE_TOKENS[value];
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function isFullSize(value: unknown): boolean {
  return typeof value === 'string' && FULL_SIZE_VALUES.has(value);
}

export function expectMinTouchTarget(
  element: ReactTestInstance,
  minWidth: number = TOUCH_TARGET_SIZES.default.minWidth,
  minHeight: number = TOUCH_TARGET_SIZES.default.minHeight
): void {
  const flatStyle = StyleSheet.flatten(element.props.style) ?? {};

  // Check style prop (inline styles, StyleSheet.create)
  const styleWidth = getNumericValue(flatStyle.minWidth)
    ?? getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.minHeight)
    ?? getNumericValue(flatStyle.height);

  // Check direct props (GlueStack/NativeWind pass dimensions as props)
  const propWidth = getNumericValue(element.props.minWidth)
    ?? getNumericValue(element.props.width)
    ?? getNumericValue(element.props.w);
  const propHeight = getNumericValue(element.props.minHeight)
    ?? getNumericValue(element.props.height)
    ?? getNumericValue(element.props.h);

  // Check for full-size values ("$full", "100%") that fill their container
  const isFullWidth = isFullSize(flatStyle.width) || isFullSize(flatStyle.minWidth)
    || isFullSize(element.props.width) || isFullSize(element.props.w);
  const isFullHeight = isFullSize(flatStyle.height) || isFullSize(flatStyle.minHeight)
    || isFullSize(element.props.height) || isFullSize(element.props.h);

  // Resolve: style takes priority, then direct props
  const resolvedWidth = styleWidth ?? propWidth;
  const resolvedHeight = styleHeight ?? propHeight;

  const hasHitSlop = element.props.hitSlop != null;

  // Verify width
  if (isFullWidth) {
    // Full-width fills container, always passes
  } else if (resolvedWidth !== undefined) {
    expect(resolvedWidth).toBeGreaterThanOrEqual(minWidth);
  } else if (!hasHitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no measurable width. ` +
        'Set minWidth, width, or hitSlop to meet EAA touch target requirements.'
    );
  }

  // Verify height
  if (isFullHeight) {
    // Full-height fills container, always passes
  } else if (resolvedHeight !== undefined) {
    expect(resolvedHeight).toBeGreaterThanOrEqual(minHeight);
  } else if (!hasHitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no measurable height. ` +
        'Set minHeight, height, or hitSlop to meet EAA touch target requirements.'
    );
  }
}
```

The function checks three layers:

1. **`style` prop** via `StyleSheet.flatten` (inline styles, `StyleSheet.create`)
2. **Direct props** for GlueStack/NativeWind components (`minHeight={50}`, `h="$12"`)
3. **Full-size values** like `w="$full"` or `"100%"` that fill their container

GlueStack tokens (`$11` = 44px, `$12` = 48px) are resolved to pixel values automatically. If no measurable size exists and no `hitSlop` is set, the function throws instead of silently passing.

> ⚠️ **GlueStack/NativeWind users:** In the Jest test environment, NativeWind is typically mocked, so `className`-based styles won't be visible. This function reads GlueStack props directly from `element.props`, which works for numeric values (`minHeight={50}`) and GlueStack tokens (`h="$12"`). Make sure your interactive components use explicit sizing props, not just parent layout, for touch target compliance.

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

Screen reader users navigate sequentially. If your form inputs are in the wrong order, the experience breaks:

```typescript
export function expectFocusOrder(elements: ReactTestInstance[]): void {
  for (let i = 0; i < elements.length - 1; i++) {
    const current = elements[i];
    const next = elements[i + 1];

    expect(current.props.accessible !== false).toBe(true);
    expect(next.props.accessible !== false).toBe(true);
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
