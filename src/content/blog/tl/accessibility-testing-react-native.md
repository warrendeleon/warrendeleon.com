---
title: "Accessibility testing sa React Native"
description: "Automated accessibility tests sa React Native: touch targets, contrast ratios, focus order, announcements. Plus kung saan pa rin nananalo ang manual testing."
tags: ["react-native", "accessibility", "wcag", "testing"]
locale: tl
heroImage: "/images/blog/accessibility-testing-rn.webp"
heroAlt: "Callipers at light-dark contrast swatch na sumusukat sa isang phone button, may checklist tick at screen-reader sound wave"
campaign: "accessibility-testing"
relatedPosts: ["detox-cucumber-bdd-react-native-e2e-testing", "i18n-automated-parity-tests-react-native", "feature-first-project-structure-react-native"]
---

## Kung saan kasya ang automated tests sa tabi ng manual a11y work

Maraming React Native teams ang maayos nang gumagawa ng accessibility. Nire-review ng designers ang contrast at target size bago mag-ship ng screen. Pinapatakbo ng QA ang VoiceOver at TalkBack passes bago mag-release. Nahuhuli ng manual layer na iyon ang mga bagay na hindi kaya ng automation: reading order sa mga kumplikadong layout, gesture conflicts, ang subjective na tanong kung talagang nakakatulong ba ang isang label.

Ang hindi nito nahuhuli ay ang regression. May stylesheet refactor na nagpapababa ng button mula 44pt patungong 40pt. May theme update na nagbababa sa secondary text contrast nang mas mababa sa 4.5:1. Nawawala sa error toast ang `accessibilityLiveRegion` nito kapag may nagpalit ng component. Wala sa mga iyon ang lalabas sa susunod na manual pass nang ilang linggo, at sa pagsapit niyon, may tatlo pang PRs na ang nakasandig sa ibabaw nito.

Ang touch target size ay isang numero. Ang contrast ratio ay isang kalkulasyon. Ang live regions at roles ay mga props. Ang mga mekanikal na bahagi ng WCAG ay puwedeng patakbuhin sa Jest kasama ng iyong unit tests, sa bawat PR, kasama ng iba mong test suite. Iyon ang sinasaklaw ng post na ito. Nasa iyong components ang implementation mismo. Pinananatili lang ng tests na tapat ang mga component pagkatapos ng susunod na refactor.

## Ano ang nasa scope

| Ano | WCAG criterion | Paano ko tine-test |
|---|---|---|
| Touch target size | 2.5.5 | I-check ang `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Colour contrast | 1.4.3 | Kalkulahin ang luminance ratio >= 4.5:1 para sa text, 3:1 para sa malaking text |
| Focus order | 2.4.3 | Smoke-check na focusable ang bawat element; ang reading order mismo ay kailangan ng Detox |
| Accessibility roles | 4.1.2 | I-assert ang `accessibilityRole` sa mga interactive elements |
| Screen reader announcements | 4.1.3 | I-check ang `accessibilityLiveRegion` sa dynamic content |
| Error identification | 3.3.1 | I-verify na ang error messages ay may `role="alert"` at live region |
| Labels at hints | 3.3.2 | I-assert na ang `accessibilityLabel` at `accessibilityHint` ay nandyan sa form inputs |

## Mga assumption

Ang setup sa ibaba ay isinulat laban sa:

- React Native 0.74+ (bare o Expo)
- TypeScript na may standard RN Babel config
- Naka-configure na Jest (tingnan ang [Setting up MSW v2 in React Native](/tl/blog/setting-up-msw-v2-in-react-native/) para sa polyfills, config, at `renderWithProviders`)
- Numeric o string-with-units dimensions sa mga touchable (binabasa ng helper ang dalawa sa pamamagitan ng `parseFloat`)

Ang mga style library na nagpapasa ng dimensions sa components bilang theme tokens (`h="$12"`, `className="h-12"`) ay kailangang mag-resolve sa isang numeric value sa rendered tree o palitan ng numeric values sa mga component na tine-test. Binabasa ng helper sa pamamagitan ng `StyleSheet.flatten`, hindi sa pamamagitan ng theme resolver.

## Installation

Walang karagdagang dependencies. Gumagamit ang utilities ng React Native Testing Library, na nandyan na para sa component tests, at plain Jest assertions:

```bash
yarn add -D @testing-library/react-native
```

## Isang failing test, tapos ang fix

Bago ang utilities, tingnan kung paano pakiramdam ang test loop. Ipagpalagay nating naka-set ang login button sa 40pt height dahil may nag-tighten ng spacing sa isang kamakailang PR:

```typescript
import { expectMinTouchTarget, renderWithProviders } from '@app/test-utils';
import { LoginScreen } from '../LoginScreen';

it('login button meets minimum touch target', () => {
  const { getByTestId } = renderWithProviders(<LoginScreen />);
  expectMinTouchTarget(getByTestId('login-button'));
});
```

Nag-fa-fail ang test:

```text
Expected: >= 44
Received: 40

  at expectMinTouchTarget (test-utils/accessibility.ts)
```

I-bump ang `minHeight` ng button papuntang 44 sa component, i-rerun, green. Pareho ang hugis ng loop sa kahit anong unit-test fix. Iyon ang buong punto ng paglilipat ng mga check na ito sa Jest. Dumarating ang CI signal kapag dumating na ang regression, hindi linggo-linggo mamaya kapag pinatakbo ng QA ang susunod na manual pass.

## Ang mga accessibility testing utilities

Isang file lang ang nag-e-export ng mga helper. Bawat function ay tumutugma sa isang WCAG criterion at tumatanggap ng `ReactTestInstance` (ang element na ibinabalik sa iyo ng `getByTestId`).

### Touch target validation

Ang pinakakaraniwang accessibility miss sa mobile apps ay mga button at input na masyadong maliit para ma-tap nang maayos. Humihingi ang iOS ng 44pt minimum, ang Android ng 48dp. Binabasa ng helper ang flattened style ng element, bumabalik sa width/height kapag hindi naka-set ang `minWidth`/`minHeight`, at idinadagdag ang anumang kontribusyon ng padding bago ihambing sa threshold:

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

  // Mananalo ang explicit minWidth/minHeight.
  const styleMinWidth = getNumericValue(flatStyle.minWidth);
  const styleMinHeight = getNumericValue(flatStyle.minHeight);

  // Kung wala, babalik sa width/height.
  const styleWidth = getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.height);

  // Nagdadagdag ang padding sa effective touch target.
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
  // Kung walang explicit, parent layout o hitSlop ang kontrol. Tahimik na papayagan.

  if (styleMinHeight !== undefined) {
    expect(styleMinHeight).toBeGreaterThanOrEqual(minHeight);
  } else if (totalHeight !== undefined) {
    expect(totalHeight).toBeGreaterThanOrEqual(minHeight);
  }
}
```

Sinasadyang maluwag ang function sa mga element na walang inline dimensions. Maraming touchable ang nakakaayos ng laki sa pamamagitan ng parent container nila (`flex: 1`, `alignSelf: 'stretch'`) o sa pamamagitan ng `hitSlop`, at ang pag-assert ng failure sa bawat isa sa kanila ay nangangahulugan ng pader ng false positives. Ang trade-off: ang isang element na talagang nagre-render na masyadong maliit pero walang explicit size ay makakapasa sa check na ito. Diyan papasok ang manual VoiceOver pass o Detox screenshot test.

Kung mismong ang touchable ay nagde-declare ng sariling laki, mahigpit ang helper. Nag-fa-fail ang `minWidth: 40` sa isang button. Pumapasa ang `width: 44` na may `padding: 4` (effective 52). Para sa mga visually small target na umaasa sa `hitSlop`, may dedicated helper.

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

Sunud-sunod ang pag-navigate ng mga screen reader user. Ang check sa baba ay isang smoke test, hindi totoong focus-order verifier: kinukumpirma nito na bawat element sa array ay focusable, at ang *pagkakasunod ng pagpasa mo sa kanila* ang nagdo-document sa inaasahang sequence. Ang totoong reading order ay tinutukoy sa runtime ng screen reader at ng layout tree, na hindi kayang i-simulate nang buo ng Jest. Para sa totoong reading-order checks, gamitin ang Detox + VoiceOver feature files sa [ang BDD post](/blog/detox-cucumber-bdd-react-native-e2e-testing/).

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

Mga 200 linya ang utility file. Bawat screen accessibility test file ay 100-500 linya.

Ang nakukuha mo: automated regression testing para sa bawat WCAG requirement na puwedeng i-express bilang Jest assertion. Touch targets, contrast ratios, focus order, roles, labels, announcements. Lahat ay tumatakbo sa bawat PR, hinuhuli ang regressions na hindi mapapansin ng sinuman hanggang sa mag-report ang isang screen reader user.

Hindi pinapalitan ng mga test na ito ang manual accessibility testing. Makakahanap ng mga isyu ang isang tunay na user na may VoiceOver na hindi mahuhuli ng automated tests (reading order sa loob ng mga complex layouts, gesture conflicts, nawawalang context). Pero hinuhuli nila ang mga mekanikal na regressions: ang button na lumiit nang 2 points, ang kulay na nawalan ng contrast, ang error message na nawalan ng live region.

> Hindi ginagawang accessible ng automated accessibility tests ang iyong app. Pinapanatili nilang accessible ito pagkatapos may magbago ng code.

*Sinasaklaw ng post na ito ang automated accessibility testing gamit ang Jest. Para sa E2E accessibility testing na may VoiceOver at TalkBack feature files, tingnan ang [Detox + Cucumber BDD para sa React Native E2E testing](/tl/blog/detox-cucumber-bdd-react-native-e2e-testing/). Nagko-complement ang dalawang approach: nahuhuli ng Jest ang regressions sa bawat PR; vine-validate ng Detox ang buong user flow sa tunay na device.*

*Ang mga code examples sa post na ito ay mula sa [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), ang aking personal na React Native project. Nasa repo ang kumpletong accessibility testing utilities, contrast validators, at screen-specific test files.*
