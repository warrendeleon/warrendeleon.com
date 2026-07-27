// Resolves a real pre-rendered diagram by the post that owns it.
//
// Pre-rendered SVGs are named after a hash of their source, so any page that
// hardcodes a filename breaks the moment that post is edited: the SVG is
// renamed and the old one pruned. That is an ordinary authoring action, and it
// broke the /design specimen page twice. Ask for a post instead, and the
// manifest written by scripts/render-mermaid.mjs points at whatever that post's
// diagram currently hashes to.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), 'src/generated/mermaid');

type Manifest = Record<string, string[]>;

/**
 * The first diagram in a post, as SVG markup.
 *
 * @param slug post filename without extension, relative to src/content/blog
 *             (e.g. 'feature-first-project-structure-react-native', or
 *             'es/why-module-federation-react-native' for a translation)
 */
export function specimenDiagram(slug: string): string {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(outDir, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('No mermaid manifest. Run: npm run mermaid');
  }

  const [hash] = manifest[slug] ?? [];
  if (!hash) {
    throw new Error(
      `No pre-rendered diagram for the post "${slug}". Either that post no longer ` +
        'has a mermaid block, or it was renamed. Point the caller at a post that ' +
        'does, then run: npm run mermaid',
    );
  }

  return readFileSync(resolve(outDir, `${hash}.svg`), 'utf8');
}
