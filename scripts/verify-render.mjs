// Post-build gate: astro can swallow a page's render error, log it, and still
// exit 0 with the article body truncated (the 2026-08-25 incident: two posts
// live with two <h2> elements instead of eleven). This script fails the build
// when a built blog page carries fewer <h2> sections than its markdown source,
// or when any mermaid fence lacks its pre-rendered SVG.
//
// Run after `astro build`. Exits 1 on the first class of failure found.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/content/blog');
const mermaidDir = join(root, 'src/generated/mermaid');
const configText = readFileSync(join(root, 'scripts/mermaid.config.json'), 'utf8');
const locales = ['', 'es', 'ca', 'tl'];

const failures = [];

// --- 1. Every mermaid fence in every source has its SVG. ---
function* mdFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* mdFiles(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}
for (const p of mdFiles(contentDir)) {
  const src = readFileSync(p, 'utf8');
  const fences = [...src.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)];
  for (const m of fences) {
    const hash = createHash('sha256').update(configText).update(m[1].trim()).digest('hex').slice(0, 12);
    if (!existsSync(join(mermaidDir, `${hash}.svg`))) {
      failures.push(`${p.replace(root + '/', '')}: mermaid fence has no ${hash}.svg — run: npm run mermaid`);
    }
  }
}

// --- 2. Every built blog page carries at least its source's section count. ---
for (const locale of locales) {
  const distBlog = join(root, 'dist', locale, 'blog');
  if (!existsSync(distBlog)) continue;
  for (const e of readdirSync(distBlog, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const page = join(distBlog, e.name, 'index.html');
    if (!existsSync(page)) continue;
    const srcPath = join(contentDir, locale, `${e.name}.md`);
    if (!existsSync(srcPath)) continue; // hub pages, non-post routes
    const srcH2 = (readFileSync(srcPath, 'utf8').match(/^## /gm) || []).length;
    const distH2 = (readFileSync(page, 'utf8').match(/<h2/g) || []).length;
    if (distH2 < srcH2) {
      failures.push(`${locale || 'en'}/${e.name}: built page has ${distH2} <h2> for ${srcH2} source sections — body did not render`);
    }
  }
}

if (failures.length) {
  console.error(`verify-render: ${failures.length} failure(s)`);
  for (const f of failures) console.error('  ✖ ' + f);
  process.exit(1);
}
console.log('verify-render: all built blog pages carry their full bodies; all mermaid SVGs present.');
