// Pre-renders every ```mermaid block in src/content/blog to an SVG under
// src/generated/mermaid/<hash>.svg, using the same base theme the site
// used when diagrams rendered client-side (scripts/mermaid.config.json —
// light/dark colour overrides still come from global.css at display time).
//
// Run whenever a post's diagram changes:  npm run mermaid
// The build fails loudly (src/lib/rehype-mermaid-prerendered.mjs) if a
// diagram has no pre-rendered SVG, so a forgotten run can't ship raw source.
//
// mermaid-cli is fetched ad hoc via npx and is deliberately NOT a package
// dependency: it pulls a headless Chromium, which the blog-publisher deploy
// container must never need.
//
// Cache caveat: Astro caches rendered markdown keyed on the .md content, so a
// re-rendered SVG only reaches pages whose .md also changed. In the normal
// flow that's always true (a diagram changes because its source block in the
// .md changed). After changing scripts/mermaid.config.json alone, clear the
// .astro/ cache before building.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/content/blog');
const outDir = join(root, 'src/generated/mermaid');
const configPath = join(root, 'scripts/mermaid.config.json');
const configText = readFileSync(configPath, 'utf8');

export function hashDiagram(source) {
  return createHash('sha256').update(configText).update(source.trim()).digest('hex').slice(0, 12);
}

const blocks = new Map(); // hash -> source
// Recursive: translated posts live in locale subdirectories (es/, ca/, tl/)
// and their diagrams hash differently (translated labels), so a flat scan
// left them without SVGs and every locale post with a diagram failed to build.
for (const file of readdirSync(contentDir, { recursive: true }).filter((f) => String(f).endsWith('.md'))) {
  const text = readFileSync(join(contentDir, String(file)), 'utf8');
  for (const m of text.matchAll(/^```mermaid[ \t]*\r?\n([\s\S]*?)^```/gm)) {
    const source = m[1].replace(/\r\n/g, '\n');
    blocks.set(hashDiagram(source), source);
  }
}

if (process.argv.includes('--check')) {
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const existing = new Set(readdirSync(outDir).filter((f) => f.endsWith('.svg')));

let rendered = 0;
for (const [hash, source] of blocks) {
  const outFile = `${hash}.svg`;
  if (existing.has(outFile)) continue;
  const tmp = join(outDir, `${hash}.mmd`);
  writeFileSync(tmp, source);
  try {
    execFileSync('npx', [
      '-y', '@mermaid-js/mermaid-cli',
      '-i', tmp,
      '-o', join(outDir, outFile),
      '--configFile', configPath,
      '--backgroundColor', 'transparent',
    ], { stdio: 'inherit' });
    rendered += 1;
  } finally {
    rmSync(tmp, { force: true });
  }
}

// prune SVGs whose diagram no longer exists in any post
let pruned = 0;
for (const f of readdirSync(outDir).filter((f) => f.endsWith('.svg'))) {
  if (!blocks.has(f.replace(/\.svg$/, ''))) {
    rmSync(join(outDir, f));
    pruned += 1;
  }
}

console.log(`mermaid: ${blocks.size} diagram(s), ${rendered} rendered, ${pruned} pruned.`);
if (blocks.size > 0 && !existsSync(outDir)) process.exit(1);
