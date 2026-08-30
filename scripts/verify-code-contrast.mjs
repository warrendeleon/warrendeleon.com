// Post-build gate: syntax-highlighting colours are chosen by a theme nobody here wrote, applied
// by a transformer in astro.config.mjs, and painted on a background defined in global.css. Any of
// the three can move independently, and nothing in the build notices — the 2026-08-30 audit found
// two github-light tokens shipping at 3.20:1 and 4.20:1 on a post that publishes a WCAG bar.
//
// This reads the colours out of the BUILT HTML rather than the theme or the transformer, so it
// measures what a reader is actually served, and reads both code grounds out of global.css rather
// than repeating them here. It fails when a token falls under 4.5:1, when it can extract no
// tokens at all, and when the pages it expects to carry code blocks carry none — a checker that
// goes green because it saw nothing is the fault this whole post argues against.
//
// Run after `astro build`. Exits 1 on any failure.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const NORMAL_TEXT_AA = 4.5;

const failures = [];

function relativeLuminance(hex) {
  const s = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Both grounds come from the stylesheet, so moving --code-bg moves this gate with it.
function codeGrounds() {
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
  const all = [...css.matchAll(/--code-bg:\s*(#[0-9A-Fa-f]{3,6})\s*;/g)].map((m) => m[1]);
  if (all.length < 2) {
    failures.push(`global.css: expected a light and a dark --code-bg, found ${all.length}`);
    return null;
  }
  return { light: all[0], dark: all[1] };
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(p));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (!existsSync(distDir)) {
  failures.push('dist/ does not exist — run astro build first');
} else {
  const grounds = codeGrounds();
  const pages = htmlFiles(distDir);
  // light hex -> {count, pages}; dark tracked separately because the grounds differ.
  const light = new Map();
  const dark = new Map();
  let blocks = 0;

  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    for (const block of html.matchAll(/<pre[^>]*class="[^"]*astro-code[^"]*"[\s\S]*?<\/pre>/g)) {
      blocks += 1;
      const body = block[0];
      // Only <span> styles carry token colours; the <pre>'s own background-color must not be
      // mistaken for one, which is why the span is matched rather than the whole block.
      for (const span of body.matchAll(/<span style="([^"]*)"/g)) {
        const style = span[1];
        const fg = /(?:^|;)color:(#[0-9A-Fa-f]{6})/.exec(style);
        const bg = /--shiki-dark:(#[0-9A-Fa-f]{6})/.exec(style);
        if (fg) light.set(fg[1].toUpperCase(), (light.get(fg[1].toUpperCase()) || 0) + 1);
        if (bg) dark.set(bg[1].toUpperCase(), (dark.get(bg[1].toUpperCase()) || 0) + 1);
      }
    }
  }

  if (blocks === 0) {
    failures.push(`no highlighted code blocks found in ${pages.length} built page(s) — the gate cannot see what it measures`);
  }
  if (light.size === 0 && dark.size === 0) {
    failures.push('token extraction returned nothing — the markup shape changed, and this gate is blind');
  }

  if (grounds) {
    for (const [theme, tokens, ground] of [
      ['light', light, grounds.light],
      ['dark', dark, grounds.dark],
    ]) {
      for (const [hex, count] of [...tokens].sort()) {
        const ratio = contrast(hex, ground);
        if (ratio < NORMAL_TEXT_AA) {
          failures.push(
            `${theme}: ${hex} on ${ground} is ${ratio.toFixed(2)}:1, under ${NORMAL_TEXT_AA}:1 (${count} span${count === 1 ? '' : 's'})`,
          );
        }
      }
    }
    const line = (t, m, g) =>
      `  ${t.padEnd(5)} ground ${g}  ${m.size} token(s), worst ${Math.min(...[...m.keys()].map((h) => contrast(h, g))).toFixed(2)}:1`;
    if (light.size && dark.size) {
      console.log(`verify-code-contrast: ${blocks} code block(s) across ${pages.length} page(s)`);
      console.log(line('light', light, grounds.light));
      console.log(line('dark', dark, grounds.dark));
    }
  }
}

if (failures.length) {
  console.error('\n✖ code-contrast gate failed:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-code-contrast: every syntax token clears 4.5:1 on its own ground');
