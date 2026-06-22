---
title: "Testing d'accessibilitat a React Native"
description: "Tests automatitzats d'accessibilitat per React Native: touch targets, ràtios de contrast, ordre de focus, anuncis del lector. I on el testing manual encara guanya."
tags: ["react-native", "accessibility", "wcag", "testing"]
locale: ca
heroImage: "/images/blog/accessibility-testing-rn.webp"
heroAlt: "Testing d'accessibilitat a React Native"
campaign: "accessibility-testing"
relatedPosts: ["detox-cucumber-bdd-react-native-e2e-testing", "i18n-automated-parity-tests-react-native", "feature-first-project-structure-react-native"]
---

## On encaixen els tests automatitzats al costat del testing manual d'accessibilitat

Molts equips de React Native ja fan bé l'accessibilitat. Els dissenyadors revisen contrast i mida del target abans que una pantalla surti. QA passa VoiceOver i TalkBack abans d'un release. Aquesta capa manual detecta el que l'automatització no pot: ordre de lectura en layouts complexos, conflictes de gestos, la pregunta subjectiva de si una etiqueta és realment útil.

El que no detecta és la regressió. Un refactor de l'stylesheet fa baixar un botó de 44pt a 40pt. Una actualització del tema baixa el contrast del text secundari per sota de 4.5:1. El toast d'error perd el seu `accessibilityLiveRegion` quan algú canvia el component. Res d'això apareix a la següent passada manual durant setmanes, i mentrestant tres PRs més s'hi han construït a sobre.

La mida del touch target és un número. El ràtio de contrast és un càlcul. Les live regions i els rols són props. Les parts mecàniques de WCAG es poden executar a Jest al costat dels teus tests unitaris, a cada PR, amb la resta de la suite. Això és el que cobreix aquest post. La implementació és als teus components. Els tests només eviten que es trenquin al següent refactor.

## Què entra en l'abast

| Què | Criteri WCAG | Com ho testo |
|---|---|---|
| Mida del touch target | 2.5.5 | Comprovar `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Contrast de color | 1.4.3 | Calcular el ràtio de lluminositat >= 4.5:1 per a text, 3:1 per a text gran |
| Ordre de focus | 2.4.3 | Comprovació ràpida que cada element és focusable; l'ordre de lectura en si necessita Detox |
| Rols d'accessibilitat | 4.1.2 | Comprovar que `accessibilityRole` està definit als elements interactius |
| Anuncis del lector de pantalla | 4.1.3 | Comprovar `accessibilityLiveRegion` al contingut dinàmic |
| Identificació d'errors | 3.3.1 | Verificar que els missatges d'error tenen `role="alert"` i live region |
| Etiquetes i indicacions | 3.3.2 | Comprovar que `accessibilityLabel` i `accessibilityHint` existeixen als inputs de formulari |

## Assumpcions

El setup de sota es va escriure contra:

- React Native 0.74+ (bare o Expo)
- TypeScript amb la config estàndard de Babel per a RN
- Jest configurat (mira [Configurant MSW v2 a React Native](/ca/blog/setting-up-msw-v2-in-react-native/) per als polyfills, la config i `renderWithProviders`)
- Dimensions numèriques o en string amb unitats als touchables (el helper parseja totes dues via `parseFloat`)

Les llibreries d'estils que passen les dimensions als components com a theme tokens (`h="$12"`, `className="h-12"`) necessiten o bé resoldre's a un valor numèric a l'arbre renderitzat, o bé substituir-se per valors numèrics als components sota test. El helper llegeix a través de `StyleSheet.flatten`, no a través d'un resolver de temes.

## Instal·lació

Sense dependències addicionals. Les utilitats fan servir React Native Testing Library, que ja tens per als tests de components, més assercions de Jest:

```bash
yarn add -D @testing-library/react-native
```

## Un test que falla, després l'arreglem

Abans de les utilitats, mira com es viu el bucle de test. Suposa que el botó de login té 40pt d'alçada perquè algú va apretar l'espaiat en un PR recent:

```typescript
import { expectMinTouchTarget, renderWithProviders } from '@app/test-utils';
import { LoginScreen } from '../LoginScreen';

it('login button meets minimum touch target', () => {
  const { getByTestId } = renderWithProviders(<LoginScreen />);
  expectMinTouchTarget(getByTestId('login-button'));
});
```

El test falla:

```text
Expected: >= 44
Received: 40

  at expectMinTouchTarget (test-utils/accessibility.ts)
```

Puja el `minHeight` del botó a 44 al component, re-executa, verd. El bucle té la mateixa forma que la correcció de qualsevol altre test unitari. Aquest és el sentit de moure aquestes comprovacions a Jest. El senyal de CI arriba quan la regressió s'introdueix, no setmanes més tard quan QA fa la propera passada manual.

## Les utilitats de testing d'accessibilitat

Un sol fitxer exporta els helpers. Cada funció mapeja a un criteri WCAG i rep un `ReactTestInstance` (l'element que obtens de `getByTestId`).

### Validació de touch targets

La falta d'accessibilitat més comuna a apps mòbils són botons i inputs massa petits per tocar de manera fiable. iOS demana 44pt com a mínim, Android 48dp. El helper llegeix l'estil aplanat de l'element, recorre a width/height si no hi ha `minWidth`/`minHeight`, i suma la contribució del padding abans de comparar contra el llindar:

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

  // minWidth/minHeight explícits guanyen.
  const styleMinWidth = getNumericValue(flatStyle.minWidth);
  const styleMinHeight = getNumericValue(flatStyle.minHeight);

  // Si no, recorre a width/height.
  const styleWidth = getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.height);

  // El padding suma al touch target efectiu.
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
  // Si no hi ha res explícit, ho controla el layout del pare o hitSlop. Passa silenciosament.

  if (styleMinHeight !== undefined) {
    expect(styleMinHeight).toBeGreaterThanOrEqual(minHeight);
  } else if (totalHeight !== undefined) {
    expect(totalHeight).toBeGreaterThanOrEqual(minHeight);
  }
}
```

La funció és deliberadament permissiva amb elements que no tenen dimensions inline. Molts touchables agafen mida del seu contenidor pare (`flex: 1`, `alignSelf: 'stretch'`) o de `hitSlop`, i fer-los fallar a tots significaria un mur de falsos positius. El compromís: un element que es renderitza realment massa petit però no té mida explícita passarà aquesta comprovació. És aquí on una passada manual de VoiceOver o un test de captura amb Detox ho detecten.

Si un touchable sí que declara la seva mida, el helper és estricte. `minWidth: 40` en un botó falla. `width: 44` amb `padding: 4` passa (efectiu 52). Per a targets visualment petits que depenen de `hitSlop`, hi ha un helper dedicat.

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

Els usuaris de lectors de pantalla naveguen seqüencialment. La comprovació de sota és un smoke test, no un verificador real de l'ordre de focus: confirma que cada element de l'array és enfocable, i l'*ordre en què els passes* documenta la seqüència esperada. L'ordre de lectura real el determina en temps d'execució el lector de pantalla i l'arbre de layout, que Jest no pot simular del tot. Per a comprovacions reals de l'ordre de lectura, fes servir els fitxers de feature de Detox + VoiceOver a [el post de BDD](/blog/detox-cucumber-bdd-react-native-e2e-testing/).

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
