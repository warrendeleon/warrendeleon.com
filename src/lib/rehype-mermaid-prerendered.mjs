// Replaces ```mermaid code blocks with SVGs pre-rendered by
// scripts/render-mermaid.mjs, keeping the exact markup astro-mermaid used to
// produce client-side (`pre.mermaid[data-processed]`) so the theming CSS in
// global.css and MediaZoom's diagram zoom keep working unchanged.
//
// Fails the build if a diagram has no pre-rendered SVG: run `npm run mermaid`.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';
import { fromHtml } from 'hast-util-from-html';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'src/generated/mermaid');
const configText = readFileSync(join(root, 'scripts/mermaid.config.json'), 'utf8');

function hashDiagram(source) {
  return createHash('sha256').update(configText).update(source.trim()).digest('hex').slice(0, 12);
}

export default function rehypeMermaidPrerendered() {
  return (tree, file) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return;
      const code = node.children?.[0];
      if (!code || code.tagName !== 'code') return;
      const classes = code.properties?.className || [];
      if (!classes.includes('language-mermaid')) return;

      const source = code.children?.map((c) => c.value ?? '').join('') ?? '';
      const hash = hashDiagram(source);
      let svg;
      try {
        svg = readFileSync(join(outDir, `${hash}.svg`), 'utf8');
      } catch {
        throw new Error(
          `No pre-rendered SVG for a mermaid diagram in ${file?.path ?? 'unknown file'} ` +
          `(expected src/generated/mermaid/${hash}.svg). Run: npm run mermaid`
        );
      }

      // Parse the SVG into real hast nodes: a `raw` child renders in `astro
      // build` but truncates the article in dev mode.
      const svgTree = fromHtml(svg, { fragment: true, space: 'svg' });
      parent.children[index] = {
        type: 'element',
        tagName: 'pre',
        properties: { className: ['mermaid'], 'data-processed': 'true', 'data-prerendered': 'true' },
        children: svgTree.children,
      };
    });
  };
}
