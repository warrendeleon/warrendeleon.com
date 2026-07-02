// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeUnpublishedLinks from './src/lib/rehype-unpublished-links.mjs';
import rehypeTableWrapper from './src/lib/rehype-table-wrapper.mjs';
import rehypeMermaidPrerendered from './src/lib/rehype-mermaid-prerendered.mjs';
import pagefind from './src/lib/astro-pagefind.mjs';

// Old work-experience URLs (`/work/:slug`) that Google still has indexed and 404ing,
// mapped to the current `/work-experience/:slug`. A fixed historical slug set; literal
// redirects per locale (Astro can't resolve a dynamic destination into the [...locale]
// route). Keep in sync with the company slugs under /work-experience/.
const WORK_SLUGS = [
  'all-now-europe-sl', 'altran', 'bp', 'candide', 'concentrix-tigerspike',
  'desigual', 'edenic-games', 'everis-ntt-data', 'fanduel', 'hargreaves-lansdown',
  'lexel-software-ltd', 'nucleus-central', 'openhealth-group', 'shell', 'sky',
  'stadion', 'teknon-uroclnica-barcelona', 'wonderbill', 'xdesign', 'zonal',
];
const workRedirects = Object.fromEntries(
  ['', '/es', '/ca', '/tl'].flatMap((prefix) =>
    WORK_SLUGS.map((slug) => [`${prefix}/work/${slug}`, `${prefix}/work-experience/${slug}`]),
  ),
);

// ```ts title="src/file.ts" — surfaces the file path as a bar above the code
// block (styled from global.css via pre[data-filename]).
const codeFilename = {
  name: 'code-filename',
  pre(node) {
    const raw = this.options.meta?.__raw || '';
    const m = /title="([^"]+)"/.exec(raw);
    if (m) node.properties['data-filename'] = m[1];
  },
};

export default defineConfig({
  site: 'https://warrendeleon.com',
  integrations: [
    sitemap({
      // Keep the /blog/tags/ index (a real browse hub) but drop the thin
      // individual tag pages and the old /blog/tag/ redirect stubs, to protect
      // crawl budget. Locale pages stay out; they're discoverable via hreflang.
      filter: (page) =>
        !/\/blog\/tags?\/[^/]+\//.test(page) &&
        !/\/(cv|education)\/$/.test(page) &&
        !page.includes('/ca/') &&
        !page.includes('/es/') &&
        !page.includes('/tl/'),
    }),
    // Indexes only pages carrying `data-pagefind-body` (the blog posts), so
    // search is scoped to the blog and nothing else. Must run last so the
    // index is built over the finished output.
    pagefind(),
    // Cloudflare Pages resolves not-found paths against the nearest 404.html,
    // walking up directories — so /es/* misses need dist/es/404.html, but
    // Astro only special-cases the root 404. Reshape the locale 404 output.
    {
      name: 'locale-404s',
      hooks: {
        'astro:build:done': async ({ dir }) => {
          const { rename, rm } = await import('node:fs/promises');
          const { fileURLToPath } = await import('node:url');
          const { join } = await import('node:path');
          const dist = fileURLToPath(dir);
          for (const loc of ['es', 'ca', 'tl']) {
            const from = join(dist, loc, '404', 'index.html');
            const to = join(dist, loc, '404.html');
            try {
              await rename(from, to);
              await rm(join(dist, loc, '404'), { recursive: true, force: true });
            } catch { /* locale 404 not built; nothing to reshape */ }
          }
        },
      },
    },
  ],
  output: 'static',
  trailingSlash: 'always',
  // Tag pages moved from /blog/tag/:tag to /blog/tags/:tag. Keep the old paths
  // working for any external or bookmarked links.
  redirects: {
    '/blog/tag/[tag]': '/blog/tags/[tag]',
    '/es/blog/tag/[tag]': '/es/blog/tags/[tag]',
    '/ca/blog/tag/[tag]': '/ca/blog/tags/[tag]',
    '/tl/blog/tag/[tag]': '/tl/blog/tags/[tag]',
    // /cv/ and /education/ folded into /work-experience/ (2026-07). The PDF
    // download and the qualifications section live there now.
    '/cv': '/work-experience',
    '/es/cv': '/es/work-experience',
    '/ca/cv': '/ca/work-experience',
    '/tl/cv': '/tl/work-experience',
    '/education': '/work-experience',
    '/es/education': '/es/work-experience',
    '/ca/education': '/ca/work-experience',
    '/tl/education': '/tl/work-experience',
    ...workRedirects,
  },
  markdown: {
    // Leave ```mermaid blocks unhighlighted so rehype-mermaid-prerendered
    // still sees the raw source to swap for the pre-rendered SVG.
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      transformers: [codeFilename],
    },
    // Mermaid diagrams are pre-rendered to SVG at authoring time
    // (scripts/render-mermaid.mjs); the rehype plugin inlines them at build,
    // matching astro-mermaid's old markup so CSS theming and zoom still work.
    rehypePlugins: [rehypeMermaidPrerendered, rehypeUnpublishedLinks, rehypeTableWrapper],
  },
});
