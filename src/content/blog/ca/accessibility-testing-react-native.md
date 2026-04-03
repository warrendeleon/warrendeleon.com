---
title: "Testing d'accessibilitat a React Native"
description: "Testing d'accessibilitat automatitzat i pràctic per a React Native. Validació de touch targets, comprovació de ràtios de contrast, verificació de l'ordre de focus i anuncis del lector de pantalla. Tot amb Jest, sense testing manual."
publishDate: 2026-06-01
tags: ["react-native", "testing", "accessibility", "tutorial"]
locale: ca
heroImage: "/images/blog/accessibility-testing-rn.jpg"
heroAlt: "Testing d'accessibilitat a React Native"
---

## La majoria d'apps s'estalvien el testing d'accessibilitat

L'accessibilitat a React Native normalment vol dir "afegir unes quantes props `accessibilityLabel` i creuar els dits." Potser algú passa VoiceOver manualment abans d'un release. Potser no.

El resultat: botons massa petits per tocar de manera fiable, text amb contrast insuficient, formularis sense ordre de focus, missatges d'error que el lector de pantalla mai anuncia. No són edge cases. Afecten usuaris reals, i a Europa, l'European Accessibility Act (EAA) els converteix en requisits legals. L'aplicació de l'EAA va començar el juny de 2025. Si la teva app té usuaris a la UE, això no és opcional.

El problema no és que els equips no s'hi preocupin. És que el testing d'accessibilitat es percep com a manual, lent i desconnectat de la suite de tests habitual. Executes els teus tests de Jest, passen, i ningú comprova si el botó de submit fa 44 punts d'ample.

> 💡 **La solució:** tractar els requisits d'accessibilitat com a assercions verificables. La mida del touch target és un número. El ràtio de contrast és un càlcul. L'ordre de focus és una seqüència. Tot això es pot executar a Jest al costat dels teus tests unitaris.

## Què estem verificant

Això no és una guia per fer la teva app accessible. És una guia per *verificar* que es manté accessible. La distinció és important: la implementació és als teus components. Els tests detecten regressions quan algú canvia un estil, refactoritza un layout o afegeix una pantalla nova.

| Què | Criteri WCAG | Com ho testem |
|---|---|---|
| Mida del touch target | 2.5.5 | Comprovar `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Contrast de color | 1.4.3 | Calcular el ràtio de lluminositat >= 4.5:1 per a text, 3:1 per a text gran |
| Ordre de focus | 2.4.3 | Verificar que `accessibilityOrder` o l'ordre del DOM coincideix amb la seqüència esperada |
| Rols d'accessibilitat | 4.1.2 | Comprovar que `accessibilityRole` està definit als elements interactius |
| Anuncis del lector de pantalla | 4.1.3 | Comprovar `accessibilityLiveRegion` al contingut dinàmic |
| Identificació d'errors | 3.3.1 | Verificar que els missatges d'error tenen `role="alert"` i live region |
| Etiquetes i indicacions | 3.3.2 | Comprovar que `accessibilityLabel` i `accessibilityHint` existeixen als inputs de formulari |

## Instal·lació

Sense dependències addicionals. Les utilitats de testing fan servir React Native Testing Library (que ja tens per als tests de components) i assercions de Jest:

```bash
yarn add -D @testing-library/react-native
```

## Les utilitats de testing d'accessibilitat

Un sol fitxer exporta tots els helpers d'accessibilitat. Cada funció mapeja a un criteri WCAG i rep un `ReactTestInstance` (l'element que obtens de `getByTestId`).

### Validació de touch targets

La fallada d'accessibilitat més comú a apps mòbils: botons i inputs massa petits per tocar de manera fiable.

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
 * Mapatge de tokens d'espai de GlueStack UI a valors en píxels.
 * Basat en el sistema d'unitats base de 4px de @gluestack-ui/config.
 */
const GLUESTACK_SPACE_TOKENS: Record<string, number> = {
  '$0': 0, '$0.5': 2, '$1': 4, '$1.5': 6, '$2': 8, '$2.5': 10,
  '$3': 12, '$3.5': 14, '$4': 16, '$4.5': 18, '$5': 20, '$6': 24,
  '$7': 28, '$8': 32, '$9': 36, '$10': 40, '$11': 44, '$12': 48,
  '$16': 64, '$20': 80, '$24': 96, '$32': 128,
};

/** Valors que omplen el contenidor (sempre satisfan el touch target). */
const FULL_SIZE_VALUES = new Set([
  '$full', '100%', '$1/2', '$2/3', '$3/4', '$4/5', '$5/6',
]);

function getNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Primer prova el token de GlueStack, després analitzar com a número
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

  // Comprovar la prop style (estils inline, StyleSheet.create)
  const styleWidth = getNumericValue(flatStyle.minWidth)
    ?? getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.minHeight)
    ?? getNumericValue(flatStyle.height);

  // Comprovar props directes (GlueStack/NativeWind passen dimensions com a props)
  const propWidth = getNumericValue(element.props.minWidth)
    ?? getNumericValue(element.props.width)
    ?? getNumericValue(element.props.w);
  const propHeight = getNumericValue(element.props.minHeight)
    ?? getNumericValue(element.props.height)
    ?? getNumericValue(element.props.h);

  // Comprovar valors de mida completa ("$full", "100%") que omplen el contenidor
  const isFullWidth = isFullSize(flatStyle.width) || isFullSize(flatStyle.minWidth)
    || isFullSize(element.props.width) || isFullSize(element.props.w);
  const isFullHeight = isFullSize(flatStyle.height) || isFullSize(flatStyle.minHeight)
    || isFullSize(element.props.height) || isFullSize(element.props.h);

  // Resoldre: style té prioritat, després props directes
  const resolvedWidth = styleWidth ?? propWidth;
  const resolvedHeight = styleHeight ?? propHeight;

  const hasHitSlop = element.props.hitSlop != null;

  // Verificar amplada
  if (isFullWidth) {
    // Amplada completa omple el contenidor, sempre passa
  } else if (resolvedWidth !== undefined) {
    expect(resolvedWidth).toBeGreaterThanOrEqual(minWidth);
  } else if (!hasHitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no measurable width. ` +
        'Set minWidth, width, or hitSlop to meet EAA touch target requirements.'
    );
  }

  // Verificar alçada
  if (isFullHeight) {
    // Alçada completa omple el contenidor, sempre passa
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

La funció comprova tres capes:

1. **Prop `style`** via `StyleSheet.flatten` (estils inline, `StyleSheet.create`)
2. **Props directes** per a components GlueStack/NativeWind (`minHeight={50}`, `h="$12"`)
3. **Valors de mida completa** com `w="$full"` o `"100%"` que omplen el contenidor

Els tokens de GlueStack (`$11` = 44px, `$12` = 48px) es resolen a valors en píxels automàticament. Si no existeix cap mida mesurable i no hi ha `hitSlop` definit, la funció llança un error en comptes de passar silenciosament.

> ⚠️ **Usuaris de GlueStack/NativeWind:** A l'entorn de test de Jest, NativeWind normalment està simulat, així que els estils basats en `className` no seran visibles. Aquesta funció llegeix les props de GlueStack directament de `element.props`, cosa que funciona per a valors numèrics (`minHeight={50}`) i tokens de GlueStack (`h="$12"`). Assegura't que els teus components interactius usen props de dimensió explícites, no només el layout del pare, per al compliment dels touch targets.

### Validació de hitSlop

Per a elements visualment petits (botons d'icona, botons de tancar) que usen `hitSlop` per ampliar l'àrea de toc:

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

### Validació de props d'accessibilitat

Comprova que els elements interactius tenen els rols, etiquetes, indicacions i estats correctes:

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

Passa `label: true` per comprovar que existeix (qualsevol valor). Passa `label: 'Submit'` per comprovar el text exacte. El mateix per a `hint`. L'opció `state` verifica les propietats d'`accessibilityState` com `disabled`, `selected` i `expanded`.

### Anuncis del lector de pantalla

El contingut dinàmic (missatges d'error, estats de càrrega, confirmacions d'èxit) necessita anunciar-se al lector de pantalla via live regions:

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

`'polite'` espera que l'usuari acabi la seva interacció actual abans d'anunciar. `'assertive'` interromp immediatament. Els missatges d'error haurien de ser `'assertive'` amb `role="alert"`. Les actualitzacions d'estat haurien de ser `'polite'`.

### Verificació de l'ordre de focus

Els usuaris de lectors de pantalla naveguen seqüencialment. Si els inputs del teu formulari estan en l'ordre incorrecte, l'experiència es trenca:

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

### Comprovació del ràtio de contrast

WCAG requereix 4.5:1 per a text normal i 3:1 per a text gran. El càlcul segueix la fórmula de lluminositat de WCAG:

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

Passa el teu color de text i el color de fons com a cadenes hexadecimals. La funció calcula el ràtio i falla si és inferior al mínim.

## Escrivint tests d'accessibilitat

Cada pantalla té el seu propi fitxer de test `*.accessibility.rntl.tsx`. La convenció de nomenclatura manté els tests d'accessibilitat separats dels funcionals perquè els puguis executar de manera independent.

### Exemple de la pantalla de login

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
      // El botó està deshabilitat abans d'omplir el formulari
      const button = getByTestId('login-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
```

Cada categoria de test mapeja a un requisit WCAG:

| Grup de test | WCAG | Què detecta |
|---|---|---|
| Ordre de focus | 2.4.3 | Regressions d'ordre de tabulació després de canvis de layout |
| Touch targets | 2.5.5 | Botons que es redueixen per sota de 44pt després de canvis d'estil |
| Anuncis | 4.1.3 | `liveRegion` que falta després de refactoritzar components d'error |
| Rols i etiquetes | 4.1.2 | `accessibilityRole` que falta en components nous |

### Testing de contrast

Els tests de contrast funcionen diferent. No renderitzen components. Validen les constants de color del teu design system. Si les teves variables de color compleixen, cada component que les utilitza també:

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

Si algú canvia una variable de color, el test de contrast falla abans que s'enviï. Sense comprovació manual amb una eina de contrast de colors.

## Executant els tests d'accessibilitat per separat

La convenció de nomenclatura `*.accessibility.rntl.tsx` permet executar-los com a suite:

```bash
yarn jest --testPathPattern='accessibility'
```

O executar-ho tot junt. Són tests de Jest normals. Sense configuració especial, sense un runner de tests separat.

## Errors habituals

**No provis la implementació, prova els requisits.** `expect(element.props.accessibilityLabel).toBe('Submit')` és fràgil. `expect(element.props.accessibilityLabel).toBeTruthy()` comprova el requisit (l'etiqueta existeix) sense acoblar-se al text exacte. Prova el text exacte només quan la redacció importa per a l'experiència d'usuari.

**No oblidis `accessibilityState`.** Un botó deshabilitat que no defineix `accessibilityState.disabled = true` es veu deshabilitat visualment, però els lectors de pantalla el segueixen anunciant com a interactiu. Verifica sempre l'estat juntament amb el rol.

**No t'oblidis del dark mode.** Els ràtios de contrast que passen en light mode sovint fallen en dark mode. Prova els dos esquemes de color.

**No confiïs només en l'estil per als touch targets.** Un botó pot tenir `width: 44` però estar dins un contenidor amb `overflow: hidden` que el retalla. `expectMinTouchTarget` comprova els estils propis de l'element. El testing visual (captures de pantalla amb Detox) detecta el retallament.

**Les live regions necessiten contingut.** Definir `accessibilityLiveRegion="assertive"` en un element buit no anuncia res. Verifica que l'element té contingut quan la live region s'activa.

## L'estructura de fitxers

```
src/
  test-utils/
    accessibility.ts                  # Tots els helpers d'accessibilitat
    __tests__/
      accessibility.rntl.tsx          # Auto-tests de les utilitats
      highContrast.rntl.tsx           # Validació de contrast de color
      designSystemContrast.rntl.ts    # Colors del sistema de disseny
  features/
    Auth/__tests__/
      LoginScreen.accessibility.rntl.tsx
    PDF/__tests__/
      PDFScreen.accessibility.rntl.tsx
    Profile/__tests__/
      ProfileScreen.accessibility.rntl.tsx
```

## El cost del setup

El fitxer d'utilitats són unes 200 línies. Cada fitxer de test d'accessibilitat per pantalla són 100-500 línies. El setup és una tarda.

El que obtens: testing de regressió automatitzat per a cada requisit WCAG que es pot expressar com una asserció de Jest. Touch targets, ràtios de contrast, ordre de focus, rols, etiquetes, anuncis. Tot executant-se a cada PR, detectant regressions que ningú notaria fins que un usuari de lector de pantalla les reportés.

Aquests tests no substitueixen el testing manual d'accessibilitat. Un usuari real amb VoiceOver trobarà problemes que els tests automatitzats no detecten (ordre de lectura dins layouts complexos, conflictes de gestos, context que falta). Però detecten les regressions mecàniques: el botó que s'ha fet 2 punts més petit, el color que ha perdut contrast, el missatge d'error que ha perdut la seva live region.

> Els tests d'accessibilitat automatitzats no fan la teva app accessible. La mantenen accessible després que algú canviï el codi.

*Aquest post cobreix testing d'accessibilitat automatitzat amb Jest. Per a testing E2E d'accessibilitat amb fitxers feature de VoiceOver i TalkBack, mira [Detox + Cucumber BDD per a testing E2E a React Native](/ca/blog/detox-cucumber-bdd-react-native-e2e-testing/). Els dos enfocaments es complementen: Jest atrapa regressions a cada PR; Detox valida el flux complet de l'usuari en un dispositiu real.*

*Els exemples de codi d'aquest post són de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), el meu projecte personal de React Native. Les utilitats completes de testing d'accessibilitat, els validadors de contrast i els fitxers de test per pantalla són al repo.*
