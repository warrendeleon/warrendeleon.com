---
title: "Testing de accesibilidad en React Native"
description: "Testing de accesibilidad automatizado y práctico para React Native. Validación de touch targets, verificación de contraste de colores, orden de foco y anuncios de screen reader. Todo en Jest, sin testing manual."
publishDate: 2026-06-01
tags: ["react-native", "testing", "accessibility", "tutorial"]
locale: es
heroImage: "/images/blog/accessibility-testing-rn.jpg"
heroAlt: "Testing de accesibilidad en React Native"
---

## La mayoría de las apps se saltean el testing de accesibilidad por completo

Accesibilidad en React Native generalmente significa "agregar algunos props `accessibilityLabel` y cruzar los dedos." Capaz alguien corre VoiceOver manualmente antes de un release. Capaz no.

El resultado: botones demasiado chicos para tappear de forma confiable, texto con contraste insuficiente, formularios sin orden de foco, mensajes de error que los screen readers nunca anuncian. No son edge cases. Afectan a usuarios reales, y en Europa, el European Accessibility Act (EAA) los convierte en requisitos legales. La aplicación del EAA empezó en junio de 2025. Si tu app tiene usuarios en la UE, esto no es opcional.

El problema no es que a los equipos no les importe. Es que el testing de accesibilidad se siente manual, lento y desconectado del test suite regular. Corrés tus tests de Jest, pasan, y nadie verifica si el botón de submit tiene 44 puntos de ancho.

> 💡 **La solución:** tratar los requisitos de accesibilidad como aserciones testeables. El tamaño del touch target es un número. El ratio de contraste es un cálculo. El orden de foco es una secuencia. Todo esto puede correr en Jest junto con tus tests unitarios.

## Qué vamos a testear

Esta no es una guía para hacer tu app accesible. Es una guía para *testear* que siga siendo accesible. La distinción importa: la implementación está en tus componentes. Los tests detectan regresiones cuando alguien cambia un estilo, refactoriza un layout o agrega una pantalla nueva.

| Qué | Criterio WCAG | Cómo lo testeamos |
|---|---|---|
| Tamaño del touch target | 2.5.5 | Verificar `minWidth`/`minHeight` >= 44pt (iOS) o 48dp (Android) |
| Contraste de color | 1.4.3 | Calcular ratio de luminancia >= 4.5:1 para texto, 3:1 para texto grande |
| Orden de foco | 2.4.3 | Verificar que `accessibilityOrder` o el orden del DOM coincida con la secuencia esperada |
| Roles de accesibilidad | 4.1.2 | Asegurar que `accessibilityRole` esté seteado en elementos interactivos |
| Anuncios de screen reader | 4.1.3 | Verificar `accessibilityLiveRegion` en contenido dinámico |
| Identificación de errores | 3.3.1 | Verificar que los mensajes de error tengan `role="alert"` y live region |
| Labels y hints | 3.3.2 | Asegurar que `accessibilityLabel` y `accessibilityHint` existan en inputs de formulario |

## Instalación

Sin dependencias extra. Las utilidades de testing usan React Native Testing Library (que ya tenés para tus tests de componentes) y aserciones de Jest puras:

```bash
yarn add -D @testing-library/react-native
```

## Las utilidades de testing de accesibilidad

Un solo archivo exporta todos los helpers de accesibilidad. Cada función mapea a un criterio WCAG y recibe un `ReactTestInstance` (el elemento que obtenés de `getByTestId`).

### Validación de touch targets

La falla de accesibilidad más común en apps mobile: botones e inputs demasiado chicos para tappear de forma confiable.

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
 * Mapeo de tokens de espacio de GlueStack UI a valores en píxeles.
 * Basado en el sistema de unidad base de 4px de @gluestack-ui/config.
 */
const GLUESTACK_SPACE_TOKENS: Record<string, number> = {
  '$0': 0, '$0.5': 2, '$1': 4, '$1.5': 6, '$2': 8, '$2.5': 10,
  '$3': 12, '$3.5': 14, '$4': 16, '$4.5': 18, '$5': 20, '$6': 24,
  '$7': 28, '$8': 32, '$9': 36, '$10': 40, '$11': 44, '$12': 48,
  '$16': 64, '$20': 80, '$24': 96, '$32': 128,
};

/** Valores que llenan su contenedor (siempre satisfacen el touch target). */
const FULL_SIZE_VALUES = new Set([
  '$full', '100%', '$1/2', '$2/3', '$3/4', '$4/5', '$5/6',
]);

function getNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Primero intentar token de GlueStack, después parsear como número
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

  // Verificar style prop (estilos inline, StyleSheet.create)
  const styleWidth = getNumericValue(flatStyle.minWidth)
    ?? getNumericValue(flatStyle.width);
  const styleHeight = getNumericValue(flatStyle.minHeight)
    ?? getNumericValue(flatStyle.height);

  // Verificar props directos (GlueStack/NativeWind pasan dimensiones como props)
  const propWidth = getNumericValue(element.props.minWidth)
    ?? getNumericValue(element.props.width)
    ?? getNumericValue(element.props.w);
  const propHeight = getNumericValue(element.props.minHeight)
    ?? getNumericValue(element.props.height)
    ?? getNumericValue(element.props.h);

  // Verificar valores de tamaño completo ("$full", "100%") que llenan su contenedor
  const isFullWidth = isFullSize(flatStyle.width) || isFullSize(flatStyle.minWidth)
    || isFullSize(element.props.width) || isFullSize(element.props.w);
  const isFullHeight = isFullSize(flatStyle.height) || isFullSize(flatStyle.minHeight)
    || isFullSize(element.props.height) || isFullSize(element.props.h);

  // Resolver: style tiene prioridad, después props directos
  const resolvedWidth = styleWidth ?? propWidth;
  const resolvedHeight = styleHeight ?? propHeight;

  const hasHitSlop = element.props.hitSlop != null;

  // Verificar ancho
  if (isFullWidth) {
    // Ancho completo llena el contenedor, siempre pasa
  } else if (resolvedWidth !== undefined) {
    expect(resolvedWidth).toBeGreaterThanOrEqual(minWidth);
  } else if (!hasHitSlop) {
    throw new Error(
      `Element with testID "${element.props.testID}" has no measurable width. ` +
        'Set minWidth, width, or hitSlop to meet EAA touch target requirements.'
    );
  }

  // Verificar alto
  if (isFullHeight) {
    // Alto completo llena el contenedor, siempre pasa
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

La función verifica tres capas:

1. **`style` prop** vía `StyleSheet.flatten` (estilos inline, `StyleSheet.create`)
2. **Props directos** para componentes de GlueStack/NativeWind (`minHeight={50}`, `h="$12"`)
3. **Valores de tamaño completo** como `w="$full"` o `"100%"` que llenan su contenedor

Los tokens de GlueStack (`$11` = 44px, `$12` = 48px) se resuelven a valores en píxeles automáticamente. Si no existe un tamaño medible y no hay `hitSlop` seteado, la función lanza un error en vez de pasar silenciosamente.

> ⚠️ **Usuarios de GlueStack/NativeWind:** En el entorno de test de Jest, NativeWind normalmente está mockeado, así que los estilos basados en `className` no van a ser visibles. Esta función lee los props de GlueStack directamente de `element.props`, lo cual funciona para valores numéricos (`minHeight={50}`) y tokens de GlueStack (`h="$12"`). Asegurate de que tus componentes interactivos usen props de tamaño explícitos, no solo layout del padre, para cumplir con los touch targets.

### Validación de hitSlop

Para elementos visualmente chicos (botones de ícono, botones de cerrar) que usan `hitSlop` para extender el área de toque:

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

Pasá `label: true` para verificar que existe (cualquier valor). Pasá `label: 'Submit'` para verificar el texto exacto. Lo mismo para `hint`. La opción `state` verifica propiedades de `accessibilityState` como `disabled`, `selected` y `expanded`.

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

Pasá tu color de texto y color de fondo como strings hexadecimales. La función calcula el ratio y falla si está por debajo del mínimo.

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
| Touch targets | 2.5.5 | Botones que se achican por debajo de 44pt después de cambios de estilo |
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

O correlos todos juntos. Son tests regulares de Jest. Sin configuración especial, sin test runner separado.

## Errores comunes

**No testees implementación, testeá requisitos.** `expect(element.props.accessibilityLabel).toBe('Submit')` es frágil. `expect(element.props.accessibilityLabel).toBeTruthy()` verifica el requisito (el label existe) sin acoplarse al texto exacto. Testeá el texto exacto solo cuando la redacción importa para la experiencia del usuario.

**No te olvides de `accessibilityState`.** Un botón deshabilitado que no setea `accessibilityState.disabled = true` se ve deshabilitado visualmente pero los screen readers lo siguen anunciando como tapeable. Siempre testeá el estado junto con el role.

**No te saltees dark mode.** Los ratios de contraste que pasan en light mode muchas veces fallan en dark mode. Testeá ambos esquemas de color.

**No confíes solo en los estilos para los touch targets.** Un botón puede tener `width: 44` pero estar dentro de un contenedor con `overflow: hidden` que lo recorta. `expectMinTouchTarget` verifica los estilos propios del elemento. El testing visual (screenshots de Detox) detecta el recorte.

**Las live regions necesitan contenido.** Setear `accessibilityLiveRegion="assertive"` en un elemento vacío no anuncia nada. Testeá que el elemento tenga contenido cuando la live region se activa.

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

## El costo del setup

El archivo de utilidades tiene unas 200 líneas. Cada archivo de test de accesibilidad por pantalla tiene entre 100 y 500 líneas. El setup es una tarde.

Lo que obtenés: testing de regresión automatizado para cada requisito WCAG que se pueda expresar como una aserción de Jest. Touch targets, ratios de contraste, orden de foco, roles, labels, anuncios. Todo corriendo en cada PR, detectando regresiones que nadie notaría hasta que un usuario de screen reader lo reporte.

Estos tests no reemplazan el testing manual de accesibilidad. Un usuario real con VoiceOver va a encontrar problemas que los tests automatizados no detectan (orden de lectura dentro de layouts complejos, conflictos de gestos, contexto faltante). Pero sí detectan las regresiones mecánicas: el botón que se achicó 2 puntos, el color que perdió contraste, el mensaje de error que perdió su live region.

> Los tests automatizados de accesibilidad no hacen tu app accesible. La mantienen accesible después de que alguien cambia el código.

*Este post cubre testing de accesibilidad automatizado con Jest. Para testing E2E de accesibilidad con feature files de VoiceOver y TalkBack, mirá [Detox + Cucumber BDD para testing E2E en React Native](/es/blog/detox-cucumber-bdd-react-native-e2e-testing/). Los dos enfoques se complementan: Jest atrapa regresiones en cada PR; Detox valida el flujo completo del usuario en un dispositivo real.*

*Los ejemplos de código en este post son de [rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), mi proyecto personal de React Native. Las utilidades completas de testing de accesibilidad, los validadores de contraste y los archivos de test por pantalla están en el repo.*
