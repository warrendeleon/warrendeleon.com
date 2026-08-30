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

function stripCodeFences(text) {
  return text.replace(/^```[\s\S]*?^```\s*$/gm, '');
}

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
  // The fence regex matches scripts/render-mermaid.mjs exactly, so the validator and the
  // renderer can never disagree about what counts as a diagram.
  const fences = [...src.matchAll(/^```mermaid[ \t]*\r?\n([\s\S]*?)^```/gm)];
  for (const m of fences) {
    const hash = createHash('sha256').update(configText).update(m[1].trim()).digest('hex').slice(0, 12);
    const svgPath = join(mermaidDir, `${hash}.svg`);
    if (!existsSync(svgPath)) {
      failures.push(`${p.replace(root + '/', '')}: mermaid fence has no ${hash}.svg — run: npm run mermaid`);
      continue;
    }
    const svg = readFileSync(svgPath, 'utf8');
    if (!svg.trimStart().startsWith('<svg') || svg.length < 200) {
      failures.push(`${p.replace(root + '/', '')}: ${hash}.svg is not a usable diagram — re-run: npm run mermaid`);
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
    // Count only real headings. A fenced block can legitimately contain lines that start with
    // "## " — a post quoting generated Markdown, for instance — and counting those made the gate
    // demand more <h2> than the page could ever render.
    const srcH2 = (stripCodeFences(readFileSync(srcPath, 'utf8')).match(/^## /gm) || []).length;
    const html = readFileSync(page, 'utf8');
    // Scope to the article so global page headings can never mask missing sections.
    const artStart = html.indexOf('<article');
    const artEnd = html.indexOf('</article>', artStart);
    const scope = artStart > -1 && artEnd > -1 ? html.slice(artStart, artEnd) : html;
    const distH2 = (scope.match(/<h2/g) || []).length;
    if (distH2 < srcH2) {
      failures.push(`${locale || 'en'}/${e.name}: article carries ${distH2} <h2> for ${srcH2} source sections — body did not render`);
    }
  }
}

// --- 3. Every due post has a route at all: a page astro never emitted would otherwise
// slip past the per-directory checks above. ---
function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"\n]*)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}
const now = new Date();
for (const p of mdFiles(contentDir)) {
  const rel = p.replace(contentDir + '/', '');
  const parts = rel.split('/');
  const locale = parts.length > 1 ? parts[0] : '';
  const slug = parts[parts.length - 1].replace(/\.md$/, '');
  const fm = frontmatter(readFileSync(p, 'utf8'));
  if (fm.draft === 'true') continue;
  // Translations inherit the English master's date; resolve it for the slot check.
  let dateStr = fm.publishDate;
  if (!dateStr && locale) {
    const master = join(contentDir, `${slug}.md`);
    if (existsSync(master)) dateStr = frontmatter(readFileSync(master, 'utf8')).publishDate;
  }
  if (!dateStr) continue;
  if (new Date(`${dateStr}T08:30:00`) > now) continue;
  const page = join(root, 'dist', locale, 'blog', slug, 'index.html');
  if (!existsSync(page)) {
    failures.push(`${locale || 'en'}/${slug}: due since ${dateStr} but the built site has no route for it`);
  }
}

// Every built table wrapper must carry the keyboard attributes the rehype plugin gives it.
// This is here because a plugin change does not invalidate Astro's content-layer store, which is
// keyed on content digests: an incremental build re-emitted 84 wrappers with the plugin's own
// output missing, and no gate noticed. The prebuild step now clears that store, and this is the
// check that would have caught it either way.
{
  const pages = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') pages.push(p);
    }
  };
  const distDir = join(root, 'dist');
  if (existsSync(distDir)) walk(distDir);
  let bare = 0;
  let unwrapped = 0;
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    for (const m of html.matchAll(/<div class="table-wrapper"([^>]*)>/g)) {
      if (!/tabindex="0"/.test(m[1]) || !/role="region"/.test(m[1]) || !/aria-label=/.test(m[1])) {
        bare++;
      }
    }
    // Count, not just quality. Checking only the wrappers that exist cannot see the plugin's
    // output vanishing altogether, which is the other half of the same stale-cache fault: a
    // build with the plugin disabled emitted 84 raw <table> elements on 63 pages — no scroll
    // container, no keyboard reach, no region — and this gate printed that everything was fine.
    // Every table inside an article body must have a wrapper as its parent.
    const article = /<article[\s\S]*?<\/article>/.exec(html);
    if (article) {
      for (const m of article[0].matchAll(/(<div class="table-wrapper"[^>]*>\s*)?<table/g)) {
        if (!m[1]) unwrapped++;
      }
    }
  }
  if (bare) {
    failures.push(
      `${bare} table wrapper(s) built without tabindex/role/aria-label — stale content cache? ` +
        'remove node_modules/.astro and rebuild',
    );
  }
  if (unwrapped) {
    failures.push(
      `${unwrapped} article table(s) built with no .table-wrapper parent — the rehype plugin's ` +
        'output is missing entirely; remove node_modules/.astro and rebuild',
    );
  }

  // The diagram has to reach the page, not merely exist on disk. The check above this file's
  // first section proves the SVG was generated; nothing proved it was inserted. With a no-op
  // inliner the build stayed green and a post shipped its only diagram as a raw markdown fence,
  // which is the same count-the-output fault the table check exists for, on the sibling asset.
  let rawFences = 0;
  let emptyBlocks = 0;
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    // A fence that never went through the inliner survives as Shiki-highlighted markdown.
    for (const _ of html.matchAll(/<pre[^>]*class="[^"]*astro-code[^"]*"[^>]*data-language="mermaid"/g)) rawFences++;
    for (const _ of html.matchAll(/<code[^>]*class="[^"]*language-mermaid[^"]*"/g)) rawFences++;
    // A prerendered block that carries no inline SVG is an empty frame.
    for (const m of html.matchAll(/<pre[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)) {
      if (!/<svg[\s>]/.test(m[1])) emptyBlocks++;
    }
  }
  if (rawFences) {
    failures.push(
      `${rawFences} mermaid fence(s) shipped as raw markdown — the prerender plugin did not run; ` +
        'remove node_modules/.astro and rebuild',
    );
  }
  if (emptyBlocks) {
    failures.push(
      `${emptyBlocks} prerendered mermaid block(s) carry no inline <svg> — the SVG exists on disk ` +
        'but was not inserted into the page',
    );
  }
}

if (failures.length) {
  console.error(`verify-render: ${failures.length} failure(s)`);
  for (const f of failures) console.error('  ✖ ' + f);
  process.exit(1);
}
console.log('verify-render: all built blog pages carry their full bodies; all mermaid SVGs present.');
