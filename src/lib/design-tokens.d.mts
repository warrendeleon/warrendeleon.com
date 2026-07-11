// Type surface for the build-time token parser (design-tokens.mjs). Consumers
// import these so a renamed token is a compile error, not a silent gap.

export interface ColorToken {
  name: string;
  light: string;
  dark: string;
}

export type ShadowToken = ColorToken;

export interface ScaleToken {
  name: string;
  desktop: string;
  tablet: string;
  mobile: string;
}

export interface DesignTokens {
  colors: ColorToken[];
  shadows: ShadowToken[];
  type: ScaleToken[];
  spacing: ScaleToken[];
  env: ColorToken[];
}

export function getDesignTokens(): DesignTokens;
export function pickColors(names: string[]): ColorToken[];
