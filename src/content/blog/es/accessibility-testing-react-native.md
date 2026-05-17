---
title: "Testing de accesibilidad en React Native"
description: "Tests automatizados de accesibilidad en React Native: touch targets, contraste, orden de foco, anuncios de screen reader. Y dónde gana el testing manual."
publishDate: 2026-06-22
tags: ["react-native", "accessibility", "wcag", "testing"]
locale: es
heroImage: "/images/blog/accessibility-testing-rn.webp"
heroAlt: "Testing de accesibilidad en React Native"
campaign: "accessibility-testing"
relatedPosts: ["detox-cucumber-bdd-react-native-e2e-testing", "i18n-automated-parity-tests-react-native", "feature-first-project-structure-react-native"]
---

## Dónde encajan los tests automatizados junto al trabajo manual de a11y

Muchos equipos de React Native ya hacen bien la accesibilidad. El diseño revisa contraste y tamaño de targets antes de que una pantalla salga. QA corre VoiceOver y TalkBack antes de cada release. Esa capa manual atrapa lo que la automatización no puede: el orden de lectura en layouts complejos, los conflictos de gestos, la pregunta subjetiva de si un label es realmente útil.

Lo que no atrapa es la regresión. Un refactor de stylesheets baja un botón de 44pt a 40pt. Un cambio de tema deja el texto secundario por debajo de 4.5:1 de contraste. El toast de error pierde su `accessibilityLiveRegion` cuando alguien intercambia el componente. Nada de eso aparece en la siguiente pasada manual hasta semanas después, cuando ya hay tres PRs más encima.

El tamaño del touch target es un número. El ratio de contraste es un cálculo. Las live regions y los roles son props. Las partes mecánicas de WCAG pueden correr en Jest junto a tus tests unitarios, en cada PR, con el resto de tu test suite. Esa es la parte que cubre este post. La implementación está en tus componentes. Los tests mantienen los componentes honestos después del próximo refactor.

## Qué cubre

| Qué | Criterio WCAG | Cómo lo testeo |
|---|---|---|
| Tamaño del touch target | 2.5.5 | Verificar `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Contraste de color | 1.4.3 | Calcular ratio de luminancia >= 4.5:1 para texto, 3:1 para texto grande |
| Orden de foco | 2.4.3 | Smoke-check de que cada elemento sea focuseable; el orden de lectura real necesita Detox |
| Roles de accesibilidad | 4.1.2 | Asegurar que `accessibilityRole` esté configurado en elementos interactivos |
| Anuncios de screen reader | 4.1.3 | Verificar `accessibilityLiveRegion` en contenido dinámico |
| Identificación de errores | 3.3.1 | Verificar que los mensajes de error tengan `role="alert"` y live region |
| Labels y hints | 3.3.2 | Asegurar que `accessibilityLabel` y `accessibilityHint` existan en inputs de formulario |

## Instalación

Sin dependencias extra. Las utilidades usan React Native Testing Library, que ya tienes para tus tests de componentes, más aserciones de Jest puras:

```bash
yarn add -D @testing-library/react-native
```

## Un test que falla, después el fix

Antes de las utilidades, mira cómo se siente el loop del test. Supón que el botón de login está dimensionado a 40pt de alto porque alguien apretó el espaciado en un PR reciente:

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

Subes el `minHeight` del botón a 44 en el componente, vuelves a correr, verde. El loop tiene la misma forma que cualquier otro fix de test unitario. Ese es el punto de mover estos checks a Jest. La señal de CI llega cuando la regresión aterriza, no semanas después cuando QA hace la siguiente pasada manual.

## Las utilidades de testing de accesibilidad

Un solo archivo exporta los helpers. Cada función mapea a un criterio WCAG y recibe un `ReactTestInstance` (el elemento que obtienes de `getByTestId`).

### Validación de touch targets

La falla de accesibilidad más común en apps mobile son los botones e inputs demasiado pequeños para pulsar de forma fiable. iOS pide un mínimo de 44pt, Android 48dp. El helper lee el style aplanado del elemento, cae a width/height si no hay `minWidth`/`minHeight`, y suma la contribución del padding antes de comparar contra el umbral:

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

  // minWidth/minHeight explícitos ganan.
  const styleMinWidth = getNumericValue(flatStyle.minWidth);
  const styleMinHeight = getNumericValue(flatStyle.minHeight);

  // Si no, caer a width/height.
  const styleWidth = getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.height);

  // El padding suma al touch target efectivo.
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
  // Si nada es explícito, lo controla el layout padre o el hitSlop. Pasa silenciosamente.

  if (styleMinHeight !== undefined) {
    expect(styleMinHeight).toBeGreaterThanOrEqual(minHeight);
  } else if (totalHeight !== undefined) {
    expect(totalHeight).toBeGreaterThanOrEqual(minHeight);
  }
}
```

La función es deliberadamente permisiva con elementos que no tienen dimensiones inline. Muchos touchables están dimensionados por su contenedor padre (`flex: 1`, `alignSelf: 'stretch'`) o por `hitSlop`, y fallar en todos esos sería un muro de falsos positivos. El trade-off: un elemento que de verdad renderiza demasiado pequeño pero no tiene tamaño explícito va a pasar este check. Para eso está la pasada manual con VoiceOver o un test de screenshot con Detox.

Si un touchable sí declara su propio tamaño, el helper es estricto. `minWidth: 40` en un botón falla. `width: 44` con `padding: 4` pasa (efectivo 52). Para targets visualmente pequeños que dependen de `hitSlop`, hay un helper dedicado.

### Validación de hitSlop

Para elementos visualmente pequeños (botones de icono, botones de cerrar) que usan `hitSlop` para extender el área de toque:

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

### Validación de props de accesibilidad

Verifica que los elementos interactivos tengan los roles, labels, hints y estados correctos:

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

Pasa `label: true` para verificar que existe (cualquier valor). Pasa `label: 'Submit'` para verificar el texto exacto. Lo mismo para `hint`. La opción `state` verifica propiedades de `accessibilityState` como `disabled`, `selected` y `expanded`.

### Anuncios de screen reader

El contenido dinámico (mensajes de error, estados de carga, confirmaciones de éxito) necesita anunciarse a los screen readers vía live regions:

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

`'polite'` espera a que el usuario termine su interacción actual antes de anunciar. `'assertive'` interrumpe inmediatamente. Los mensajes de error deberían ser `'assertive'` con `role="alert"`. Las actualizaciones de estado deberían ser `'polite'`.

### Verificación del orden de foco

Los usuarios de screen reader navegan secuencialmente. Si los inputs de tu formulario están en el orden incorrecto, la experiencia se rompe:

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

### Verificación de ratio de contraste

WCAG requiere 4.5:1 para texto normal y 3:1 para texto grande. El cálculo sigue la fórmula de luminancia de WCAG:

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

Pasa tu color de texto y color de fondo como strings hexadecimales. La función calcula el ratio y falla si está por debajo del mínimo.

## Escribiendo tests de accesibilidad

Cada pantalla tiene su propio archivo de test `*.accessibility.rntl.tsx`. La convención de nombres mantiene los tests de accesibilidad separados de los tests funcionales para que puedas correrlos de forma independiente.

### Ejemplo de pantalla de login

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
      // El botón está deshabilitado antes de completar el formulario
      const button = getByTestId('login-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
```

Cada categoría de test mapea a un requisito WCAG:

| Grupo de tests | WCAG | Qué detecta |
|---|---|---|
| Orden de foco | 2.4.3 | Regresiones en el orden de tabulación después de cambios de layout |
| Touch targets | 2.5.5 | Botones que se reducen por debajo de 44pt después de cambios de estilo |
| Anuncios | 4.1.3 | `liveRegion` faltante después de refactorizar componentes de error |
| Roles y labels | 4.1.2 | `accessibilityRole` faltante en componentes nuevos |

### Testing de contraste

Los tests de contraste funcionan distinto. No renderizan componentes. Validan las constantes de color de tu design system. Si tus variables de color cumplen, cada componente que las usa también:

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

Si alguien cambia una variable de color, el test de contraste falla antes de que se shippe. Sin verificación manual en una herramienta de contraste de colores.

## Corriendo los tests de accesibilidad por separado

La convención de nombres `*.accessibility.rntl.tsx` te permite correrlos como un suite:

```bash
yarn jest --testPathPattern='accessibility'
```

O córrelos todos juntos. Son tests regulares de Jest. Sin configuración especial, sin test runner separado.

## Errores comunes

**No testees implementación, testea requisitos.** `expect(element.props.accessibilityLabel).toBe('Submit')` es frágil. `expect(element.props.accessibilityLabel).toBeTruthy()` verifica el requisito (el label existe) sin acoplarse al texto exacto. Testea el texto exacto solo cuando la redacción importa para la experiencia del usuario.

**No te olvides de `accessibilityState`.** Un botón deshabilitado que no setea `accessibilityState.disabled = true` se ve deshabilitado visualmente pero los screen readers lo siguen anunciando como tapeable. Siempre testea el estado junto con el role.

**No te saltes dark mode.** Los ratios de contraste que pasan en light mode muchas veces fallan en dark mode. Testea ambos esquemas de color.

**No confíes solo en los estilos para los touch targets.** Un botón puede tener `width: 44` pero estar dentro de un contenedor con `overflow: hidden` que lo recorta. `expectMinTouchTarget` verifica los estilos propios del elemento. El testing visual (screenshots de Detox) detecta el recorte.

**Las live regions necesitan contenido.** Setear `accessibilityLiveRegion="assertive"` en un elemento vacío no anuncia nada. Testea que el elemento tenga contenido cuando la live region se activa.

## La estructura de archivos

```
src/
  test-utils/
    accessibility.ts                  # Todos los helpers de accesibilidad
    __tests__/
      accessibility.rntl.tsx          # Self-tests de las utilidades
      highContrast.rntl.tsx           # Validación de contraste de colores
      designSystemContrast.rntl.ts    # Colores del design system
  features/
    Auth/__tests__/
      LoginScreen.accessibility.rntl.tsx
    PDF/__tests__/
      PDFScreen.accessibility.rntl.tsx
    Profile/__tests__/
      ProfileScreen.accessibility.rntl.tsx
```

## El coste del setup

El archivo de utilidades tiene unas 200 líneas. Cada archivo de test de accesibilidad por pantalla tiene entre 100 y 500 líneas. El setup es una tarde.

Lo que obtienes: testing de regresión automatizado para cada requisito WCAG que se pueda expresar como una aserción de Jest. Touch targets, ratios de contraste, orden de foco, roles, labels, anuncios. Todo corriendo en cada PR, detectando regresiones que nadie notaría hasta que un usuario de screen reader lo reporte.

Estos tests no reemplazan el testing manual de accesibilidad. Un usuario real con VoiceOver va a encontrar problemas que los tests automatizados no detectan (orden de lectura dentro de layouts complejos, conflictos de gestos, contexto faltante). Pero sí detectan las regresiones mecánicas: el botón que se redujo 2 puntos, el color que perdió contraste, el mensaje de error que perdió su live region.

> Los tests automatizados de accesibilidad no hacen tu app accesible. La mantienen accesible después de que alguien cambia el código.

*Este post cubre testing de accesibilidad automatizado con Jest. Para testing E2E de accesibilidad con feature files de VoiceOver y TalkBack, mira [Detox + Cucumber BDD para testing E2E en React Native](/es/blog/detox-cucumber-bdd-react-native-e2e-testing/). Los dos enfoques se complementan: Jest atrapa regresiones en cada PR; Detox valida el flujo completo del usuario en un dispositivo real.*

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. Las utilidades completas de testing de accesibilidad, los validadores de contraste y los archivos de test por pantalla están en el repo.*
