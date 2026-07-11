// Information architecture for the /design section. Structure (slugs, grouping,
// URL shape) is code; the human labels are content and live in the localised
// design-*.json files, keyed by these slugs.
//
// `built` gates a page in the rail and on the landing hub. A page ships false
// until its .astro file exists, so every deploy links only to live pages — no
// dead links mid-rollout. Flip to true in the same change that adds the page.

export const DESIGN_ROOT = '/design/';

export interface DesignPage {
  slug: string;
  path: string;
  built: boolean;
}

export interface DesignGroup {
  key: 'foundations' | 'components' | 'content' | 'accessibility';
  pages: DesignPage[];
}

export const DESIGN_GROUPS: DesignGroup[] = [
  {
    key: 'foundations',
    pages: [
      { slug: 'colour', path: '/design/colour/', built: true },
      { slug: 'typography', path: '/design/typography/', built: true },
      { slug: 'layout', path: '/design/layout/', built: true },
      { slug: 'shape-elevation', path: '/design/shape-elevation/', built: true },
      { slug: 'iconography', path: '/design/iconography/', built: true },
      { slug: 'motion', path: '/design/motion/', built: true },
    ],
  },
  {
    key: 'components',
    pages: [
      { slug: 'buttons', path: '/design/components/buttons/', built: true },
      { slug: 'tags-chips', path: '/design/components/tags-chips/', built: true },
      { slug: 'cards', path: '/design/components/cards/', built: true },
      { slug: 'navigation', path: '/design/components/navigation/', built: true },
      { slug: 'sheets-overlays', path: '/design/components/sheets-overlays/', built: true },
      { slug: 'article-patterns', path: '/design/components/article-patterns/', built: true },
      { slug: 'timeline', path: '/design/components/timeline/', built: true },
    ],
  },
  {
    key: 'content',
    pages: [
      { slug: 'writing', path: '/design/content/writing/', built: false },
      { slug: 'translation', path: '/design/content/translation/', built: false },
    ],
  },
  {
    key: 'accessibility',
    pages: [{ slug: 'accessibility', path: '/design/accessibility/', built: false }],
  },
];

/** Flat list of every built page, for the landing hub. */
export function builtPages(): { key: DesignGroup['key']; slug: string; path: string }[] {
  return DESIGN_GROUPS.flatMap((g) =>
    g.pages.filter((p) => p.built).map((p) => ({ key: g.key, slug: p.slug, path: p.path })),
  );
}
