// Build-time token extraction — the anti-drift mechanism behind /design.
//
// The design-system pages never hand-copy a value. They import this module,
// which reads the site's real global.css at build time and returns the tokens
// exactly as they ship. Rename or delete a custom property in the CSS and the
// docs follow on the next build — or, if a group comes back empty (a CSS
// restructure the parser no longer understands), the build FAILS here rather
// than rendering a silently-empty table.
//
// Scope: this reads the custom properties on :root / [data-theme="dark"] and
// the two media-query :root overrides. Values that live as literals in
// component rules (border-radius, container max-widths) are NOT tokens and are
// documented as verified constants on the pages themselves.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// At build the module is chunked into dist/.prerender, so import.meta.url no
// longer sits beside src/. The project root (cwd during astro dev/build) is the
// stable anchor; the source-relative path is the dev/standalone fallback.
function locateCss() {
  const candidates = [
    resolve(process.cwd(), 'src/styles/global.css'),
    fileURLToPath(new URL('../styles/global.css', import.meta.url)),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `[design-tokens] could not locate global.css. Tried:\n${candidates.join('\n')}`,
    );
  }
  return found;
}

/**
 * @typedef {{ name: string, light: string, dark: string }} ColorToken
 * @typedef {{ name: string, light: string, dark: string }} ShadowToken
 * @typedef {{ name: string, desktop: string, tablet: string, mobile: string }} ScaleToken
 * @typedef {{ colors: ColorToken[], shadows: ShadowToken[], type: ScaleToken[], spacing: ScaleToken[], env: ColorToken[] }} DesignTokens
 */

/** Return the body of the first `{ ... }` block whose header matches `headerRe`,
 *  brace-matched so it survives nested rules (needed for @media wrappers). */
function blockBody(css, headerRe) {
  const m = headerRe.exec(css);
  if (!m) return null;
  const open = css.indexOf('{', m.index);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/** Parse `--name: value;` declarations from a block body, ignoring comments. */
function parseVars(body) {
  if (!body) return {};
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {Record<string, string>} */
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(clean))) out[m[1]] = m[2].trim();
  return out;
}

/** Resolve a single level of `var(--x)` against a lookup map (dark greens point
 *  at the brand greens defined once on :root). */
function resolveVar(value, base) {
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  return m && base[m[1]] ? base[m[1]] : value;
}

/** @type {DesignTokens | null} */
let cache = null;

/** @returns {DesignTokens} */
export function getDesignTokens() {
  if (cache) return cache;

  const css = readFileSync(locateCss(), 'utf8');

  const light = parseVars(blockBody(css, /:root\s*\{/));
  const dark = parseVars(blockBody(css, /\[data-theme="dark"\]\s*\{/));
  const tabletBody = blockBody(css, /@media\s*\(max-width:\s*1279px\)\s*\{/);
  const mobileBody = blockBody(css, /@media\s*\(max-width:\s*699px\)\s*\{/);
  const tablet = parseVars(tabletBody && blockBody(tabletBody, /:root\s*\{/));
  const mobile = parseVars(mobileBody && blockBody(mobileBody, /:root\s*\{/));

  /** @type {ColorToken[]} */
  const colors = [];
  /** @type {ShadowToken[]} */
  const shadows = [];
  /** @type {ScaleToken[]} */
  const type = [];
  /** @type {ScaleToken[]} */
  const spacing = [];
  /** @type {ColorToken[]} */
  const env = [];

  for (const [name, lightVal] of Object.entries(light)) {
    if (/^--safe-/.test(name)) {
      env.push({ name, light: lightVal, dark: lightVal });
    } else if (/shadow/.test(name)) {
      shadows.push({ name, light: lightVal, dark: dark[name] ?? lightVal });
    } else if (/^--fs-|^--bar-|^--lh-/.test(name)) {
      type.push({
        name,
        desktop: lightVal,
        tablet: tablet[name] ?? lightVal,
        mobile: mobile[name] ?? tablet[name] ?? lightVal,
      });
    } else if (/^--sp-/.test(name)) {
      spacing.push({
        name,
        desktop: lightVal,
        tablet: tablet[name] ?? lightVal,
        mobile: mobile[name] ?? tablet[name] ?? lightVal,
      });
    } else {
      colors.push({
        name,
        light: resolveVar(lightVal, light),
        dark: resolveVar(dark[name] ?? lightVal, light),
      });
    }
  }

  const groups = { colors, shadows, type, spacing, env };
  for (const [group, list] of Object.entries(groups)) {
    if (!list.length) {
      throw new Error(
        `[design-tokens] parsed 0 "${group}" tokens from global.css. ` +
          `The CSS structure the parser expects has changed — fix the parser ` +
          `rather than shipping an empty design-system table.`,
      );
    }
  }

  cache = groups;
  return groups;
}

/** Pull a subset of colour tokens by exact name, preserving the given order.
 *  Throws if a requested name is missing, so a renamed token fails the build
 *  instead of dropping a swatch. */
export function pickColors(names) {
  const { colors } = getDesignTokens();
  const byName = Object.fromEntries(colors.map((c) => [c.name, c]));
  return names.map((name) => {
    if (!byName[name]) {
      throw new Error(`[design-tokens] colour token "${name}" not found in global.css.`);
    }
    return byName[name];
  });
}
