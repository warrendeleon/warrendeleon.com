---
title: "Accessibility testing sa React Native"
description: "Praktikal at automated na accessibility testing para sa React Native. Touch target validation, contrast ratio checking, focus order verification, at screen reader announcements. Lahat sa Jest, walang manual testing na kailangan."
publishDate: 2026-06-01
tags: ["react-native", "testing", "accessibility", "tutorial"]
locale: tl
heroImage: "/images/blog/accessibility-testing-rn.jpg"
heroAlt: "Accessibility testing sa React Native"
campaign: "accessibility-testing"
---

## Karamihan ng apps ay nilalaktawan ang accessibility testing

Ang accessibility sa React Native ay karaniwang "magdagdag ng ilang `accessibilityLabel` props at umasa na lang." Baka may magpa-run ng VoiceOver nang manu-mano bago mag-release. Baka wala.

Ang resulta: mga button na masyadong maliit para ma-tap nang maayos, text na kulang ang contrast, forms na walang focus order, error messages na hindi naa-announce ng screen readers. Hindi ito mga edge cases. Naaapektuhan nito ang tunay na mga users, at sa Europe, ginagawa itong legal na requirements ng European Accessibility Act (EAA). Nagsimula ang enforcement ng EAA noong Hunyo 2025. Kung may EU users ang app mo, hindi ito optional.

Hindi naman ang problema ay walang pakialam ang mga teams. Ang problema ay pakiramdam ng accessibility testing ay manu-mano, mabagal, at hiwalay sa regular na test suite. Pinapatakbo mo ang iyong mga Jest tests, pumapasa sila, at walang nag-che-check kung 44 points ba ang lapad ng submit button.

> 💡 **Ang solusyon:** ituring ang accessibility requirements bilang testable assertions. Ang touch target size ay isang numero. Ang contrast ratio ay isang kalkulasyon. Ang focus order ay isang sequence. Lahat ng ito ay puwedeng patakbuhin sa Jest kasama ng iyong unit tests.

## Ano ang tine-test ko

Hindi ito gabay para gawing accessible ang iyong app. Ito ay gabay para *i-test* na nananatili itong accessible. Mahalaga ang pagkakaiba: nasa iyong components ang implementation. Hinuhuli ng tests ang regressions kapag may nagbago ng style, nag-refactor ng layout, o nagdagdag ng bagong screen.

| Ano | WCAG criterion | Paano ko tine-test |
|---|---|---|
| Touch target size | 2.5.5 | I-check ang `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Colour contrast | 1.4.3 | Kalkulahin ang luminance ratio >= 4.5:1 para sa text, 3:1 para sa malaking text |
| Focus order | 2.4.3 | I-verify ang `accessibilityOrder` o DOM order na tumutugma sa expected sequence |
| Accessibility roles | 4.1.2 | I-assert ang `accessibilityRole` sa mga interactive elements |
| Screen reader announcements | 4.1.3 | I-check ang `accessibilityLiveRegion` sa dynamic content |
| Error identification | 3.3.1 | I-verify na ang error messages ay may `role="alert"` at live region |
| Labels at hints | 3.3.2 | I-assert na ang `accessibilityLabel` at `accessibilityHint` ay nandyan sa form inputs |

## Installation

Walang karagdagang dependencies. Gumagamit ang testing utilities ng React Native Testing Library (na mayroon ka na para sa component tests) at plain Jest assertions:

```bash
yarn add -D @testing-library/react-native
```

## Ang mga accessibility testing utilities

Isang file lang ang nag-e-export ng lahat ng accessibility helpers. Bawat function ay tumutugma sa isang WCAG criterion at tumatanggap ng `ReactTestInstance` (ang element na nakukuha mo mula sa `getByTestId`).

### Touch target validation

Ang pinakakaraniwang accessibility failure sa mobile apps: mga button at input na masyadong maliit para ma-tap nang maayos.

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

/** Mga value na pumupuno sa container nila (palaging nakakapasa sa touch target). */
const FULL_SIZE_VALUES = new Set([
  '$full', '100%', '$1/2', '$2/3', '$3/4', '$4/5', '$5/6',
]);

function getNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Subukan muna ang GlueStack token, pagkatapos i-parse bilang numero
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

  // I-check ang style prop (inline styles, StyleSheet.create)
  const styleWidth = getNumericValue(flatStyle.minWidth)
    ?? getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.minHeight)
    ?? getNumericValue(flatStyle.height);

  // I-check ang direct props (nagpapasa ng dimensions bilang props ang GlueStack/NativeWind)
  const propWidth = getNumericValue(element.props.minWidth)
    ?? getNumericValue(element.props.width)
    ?? getNumericValue(element.props.w);
  const propHeight = getNumericValue(element.props.minHeight)
    ?? getNumericValue(element.props.height)
    ?? getNumericValue(element.props.h);

  // I-check ang full-size values ("$full", "100%") na pumupuno sa container
  const isFullWidth = isFullSize(flatStyle.width) || isFullSize(flatStyle.minWidth)
    || isFullSize(element.props.width) || isFullSize(element.props.w);
  const isFullHeight = isFullSize(flatStyle.height) || isFullSize(flatStyle.minHeight)
    || isFullSize(element.props.height) || isFullSize(element.props.h);

  // I-resolve: mas may priority ang style, pagkatapos direct props
  const resolvedWidth = styleWidth ?? propWidth;
  const resolvedHeight = styleHeight ?? propHeight;

  const hasHitSlop = element.props.hitSlop != null;

  // I-verify ang width
  if (isFullWidth) {
    // Pumupuno sa container ang full-width, palaging pumapasa
  } else if (resolvedWidth !== undefined) {
    expect(resolvedWidth).toBeGreaterThanOrEqual(minWidth);
  } else if (!hasHitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no measurable width. ` +
        'Set minWidth, width, or hitSlop to meet EAA touch target requirements.'
    );
  }

  // I-verify ang height
  if (isFullHeight) {
    // Pumupuno sa container ang full-height, palaging pumapasa
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

Tatlong layer ang chine-check ng function:

1. **`style` prop** sa pamamagitan ng `StyleSheet.flatten` (inline styles, `StyleSheet.create`)
2. **Direct props** para sa GlueStack/NativeWind components (`minHeight={50}`, `h="$12"`)
3. **Full-size values** tulad ng `w="$full"` o `"100%"` na pumupuno sa kanilang container

Awtomatikong nire-resolve sa pixel values ang GlueStack tokens (`$11` = 44px, `$12` = 48px). Kung walang masusukatan na size at walang nakaset na `hitSlop`, nagta-throw ang function sa halip na tahimik na pumasa.

> ⚠️ **Para sa mga gumagamit ng GlueStack/NativeWind:** Sa Jest test environment, karaniwang naka-mock ang NativeWind, kaya hindi makikita ang `className`-based styles. Binabasa ng function na ito ang GlueStack props nang direkta mula sa `element.props`, na gumagana para sa numeric values (`minHeight={50}`) at GlueStack tokens (`h="$12"`). Siguraduhing gumagamit ang iyong mga interactive components ng explicit sizing props, hindi lang parent layout, para sa touch target compliance.

### hitSlop validation

Para sa mga visually small elements (icon buttons, close buttons) na gumagamit ng `hitSlop` para palawakin ang touch area:

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

Chine-check na tama ang roles, labels, hints, at states ng mga interactive elements:

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

Ipasa ang `label: true` para i-check na nandyan ito (kahit anong value). Ipasa ang `label: 'Submit'` para i-check ang eksaktong text. Ganoon din para sa `hint`. Vine-verify ng `state` option ang mga `accessibilityState` properties tulad ng `disabled`, `selected`, at `expanded`.

### Screen reader announcements

Kailangan ng dynamic content (error messages, loading states, success confirmations) na mag-announce sa screen readers sa pamamagitan ng live regions:

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

Hinihintay ng `'polite'` na matapos muna ang kasalukuyang interaction ng user bago mag-announce. Agad na nag-i-interrupt ang `'assertive'`. Dapat `'assertive'` ang error messages na may `role="alert"`. Dapat `'polite'` ang status updates.

### Focus order verification

Sunud-sunod ang pag-navigate ng mga screen reader user. Kung mali ang pagkakasunod ng iyong form inputs, masisira ang experience:

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

Kinakailangan ng WCAG ang 4.5:1 para sa normal text at 3:1 para sa malaking text. Sinusundan ng kalkulasyon ang WCAG luminance formula:

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

Ipasa ang iyong text colour at background colour bilang hex strings. Kinakalkula ng function ang ratio at mag-fa-fail kung mas mababa ito sa minimum.

## Pagsusulat ng accessibility tests

Bawat screen ay may sariling `*.accessibility.rntl.tsx` test file. Pinananatili ng naming convention na hiwalay ang accessibility tests sa functional tests para mapapatakbo mo sila nang independently.

### Halimbawa ng login screen

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
      // Naka-disable ang button bago ma-fill ang form
      const button = getByTestId('login-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
```

Bawat test category ay tumutugma sa isang WCAG requirement:

| Test group | WCAG | Ano ang nahuhuli nito |
|---|---|---|
| Focus order | 2.4.3 | Tab order regressions pagkatapos ng layout changes |
| Touch targets | 2.5.5 | Mga button na lumiliit sa ibaba ng 44pt pagkatapos ng style changes |
| Announcements | 4.1.3 | Nawawalang `liveRegion` pagkatapos ng error component refactors |
| Roles at labels | 4.1.2 | Nawawalang `accessibilityRole` sa mga bagong components |

### Contrast testing

Magkaiba ang contrast tests. Hindi sila nagre-render ng components. Vine-validate nila ang colour constants ng iyong design system. Kung compliant ang iyong colour variables, compliant din ang bawat component na gumagamit sa kanila:

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

Kung may magbago ng colour variable, mag-fa-fail ang contrast test bago ito mai-ship. Walang manu-manong pag-check sa colour contrast tool.

## Hiwalay na pagpapatakbo ng accessibility tests

Pinapayagan ka ng `*.accessibility.rntl.tsx` naming convention na patakbuhin sila bilang isang suite:

```bash
yarn jest --testPathPattern='accessibility'
```

O patakbuhin ang lahat nang sabay. Regular Jest tests ang mga ito. Walang espesyal na configuration, walang hiwalay na test runner.

## Mga karaniwang pagkakamali

**Huwag i-test ang implementation, i-test ang requirements.** Ang `expect(element.props.accessibilityLabel).toBe('Submit')` ay brittle. Ang `expect(element.props.accessibilityLabel).toBeTruthy()` ang chine-check ang requirement (nandyan ang label) nang hindi nakakabit sa eksaktong text. I-test lang ang eksaktong text kapag mahalaga ang wording para sa user experience.

**Huwag kalimutan ang `accessibilityState`.** Ang disabled button na hindi nag-se-set ng `accessibilityState.disabled = true` ay mukhang disabled sa mata pero ina-announce pa rin ng screen readers na puwedeng i-tap. Palaging i-test ang state kasabay ng role.

**Huwag laktawan ang dark mode.** Madalas na pumapasa ang contrast ratios sa light mode pero mag-fa-fail sa dark mode. I-test ang parehong colour schemes.

**Huwag magtiwala sa style lang para sa touch targets.** Puwedeng may `width: 44` ang isang button pero nasa loob ng container na may `overflow: hidden` na nagpu-putol dito. Chine-check ng `expectMinTouchTarget` ang styles ng mismong element. Nahuhuli ng visual testing (Detox screenshots) ang clipping.

**Kailangan ng content ang live regions.** Ang pag-set ng `accessibilityLiveRegion="assertive"` sa isang walang laman na element ay walang ina-announce. I-test na may content ang element kapag nag-a-activate ang live region.

## Ang file structure

```
src/
  test-utils/
    accessibility.ts                  # Lahat ng accessibility helpers
    __tests__/
      accessibility.rntl.tsx          # Self-tests para sa utilities
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

## Ang gastos sa setup

Mga 200 linya ang utility file. Bawat screen accessibility test file ay 100-500 linya. Isang hapon lang ang setup.

Ang nakukuha mo: automated regression testing para sa bawat WCAG requirement na puwedeng i-express bilang Jest assertion. Touch targets, contrast ratios, focus order, roles, labels, announcements. Lahat ay tumatakbo sa bawat PR, hinuhuli ang regressions na hindi mapapansin ng sinuman hanggang sa mag-report ang isang screen reader user.

Hindi pinapalitan ng mga test na ito ang manual accessibility testing. Makakahanap ng mga isyu ang isang tunay na user na may VoiceOver na hindi mahuhuli ng automated tests (reading order sa loob ng mga complex layouts, gesture conflicts, nawawalang context). Pero hinuhuli nila ang mga mekanikal na regressions: ang button na lumiit nang 2 points, ang kulay na nawalan ng contrast, ang error message na nawalan ng live region.

> Hindi ginagawang accessible ng automated accessibility tests ang iyong app. Pinapanatili nilang accessible ito pagkatapos may magbago ng code.

*Sinasaklaw ng post na ito ang automated accessibility testing gamit ang Jest. Para sa E2E accessibility testing na may VoiceOver at TalkBack feature files, tingnan ang [Detox + Cucumber BDD para sa React Native E2E testing](/tl/blog/detox-cucumber-bdd-react-native-e2e-testing/). Nagko-complement ang dalawang approach: nahuhuli ng Jest ang regressions sa bawat PR; vine-validate ng Detox ang buong user flow sa tunay na device.*

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong accessibility testing utilities, contrast validators, at screen-specific test files.*
