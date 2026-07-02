// Mechanical pre-publish gates for blog content (Gate 7 of the authoring
// gates in the wiki's blog-content-strategy). Deterministic checks only; the
// judgement gates (execute-before-writing, mechanism reproduction, pitfall
// derivation) live with the authoring model, not here.
//
// Usage: npm run prepublish-checks   (exit 1 on any failure; warnings don't fail)

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(root, 'src/content/blog');

// Employer-identifying terms per the April 2026 disclosure incident.
const DISCLOSURE = [/\bsquads?\b/i, /hl-ik/, /Hargreaves/, /\bUCX-Core\b/i, /on the 23rd/];
// Words the corpus deliberately never uses (subset of the wiki avoid-list).
const BANNED = /\b(however|moreover|furthermore|therefore|additionally|leverages?d?|robust|seamless(ly)?|delve|foster)\b|it's important to note|that being said|in conclusion/i;

const failures = [];
const warnings = [];

function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* mdFiles(p);
    else if (entry.endsWith('.md')) yield p;
  }
}

function stripCodeFences(text) {
  return text.replace(/^```[\s\S]*?^```\s*$/gm, '');
}

const slugs = new Set(
  readdirSync(CONTENT).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
);

for (const file of mdFiles(CONTENT)) {
  const rel = file.slice(root.length + 1);
  const raw = readFileSync(file, 'utf8');
  const prose = stripCodeFences(raw);
  const lines = raw.split('\n');

  // 1. Disclosure terms (whole file, code included: the hl-ik leak was in a snippet)
  for (const re of DISCLOSURE) {
    lines.forEach((l, i) => {
      if (re.test(l)) failures.push(`${rel}:${i + 1} disclosure term ${re}: ${l.trim().slice(0, 90)}`);
    });
  }

  // 2. Banned words (prose only)
  prose.split('\n').forEach((l, i) => {
    const m = l.match(BANNED);
    if (m) failures.push(`${rel} banned word "${m[0]}": ${l.trim().slice(0, 90)}`);
  });

  // 3. Em-dashes outside code fences: warning, not failure (term — definition
  //    lists are allowed; judge each, never gate on a count).
  prose.split('\n').forEach((l) => {
    if (l.includes('—')) warnings.push(`${rel} em-dash (judge it): ${l.trim().slice(0, 90)}`);
  });

  // 4. Internal /blog/ links resolve to an existing EN master
  for (const m of raw.matchAll(/\]\((?:\/(?:es|ca|tl))?\/blog\/([a-z0-9-]+)\/?[)#]/g)) {
    if (!slugs.has(m[1]) && !['tags', 'series'].includes(m[1])) {
      failures.push(`${rel} link target missing: /blog/${m[1]}/`);
    }
  }

  // 5. TS/TSX snippet parse check. WARNING only: many blocks are deliberate
  //    fragments (diff-style excerpts, object-property slices, elided JSX)
  //    that can't parse as modules. A warning cues a human read, not a gate.
  for (const m of raw.matchAll(/^```(typescript|tsx|ts)\n([\s\S]*?)^```/gm)) {
    const sf = ts.createSourceFile('snippet.tsx', m[2], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const diags = sf.parseDiagnostics;
    if (diags.length > 0) {
      const d = diags[0];
      const pos = sf.getLineAndCharacterOfPosition(d.start ?? 0);
      warnings.push(`${rel} TS snippet parse (fragment?) block line ${pos.line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    }
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\nprepublish-checks: ${failures.length} failure(s), ${warnings.length} warning(s) across the blog content.`);
process.exit(failures.length > 0 ? 1 : 0);
