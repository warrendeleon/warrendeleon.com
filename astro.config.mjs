// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeUnpublishedLinks from './src/lib/rehype-unpublished-links.mjs';
import rehypeTableWrapper from './src/lib/rehype-table-wrapper.mjs';
import rehypeMermaidPrerendered from './src/lib/rehype-mermaid-prerendered.mjs';
import pagefind from './src/lib/astro-pagefind.mjs';

// ```ts title="src/file.ts" — surfaces the file path as a bar above the code
// block (styled from global.css via pre[data-filename]).
/** @type {import('shiki').ShikiTransformer} */
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
      // individual tag pages, to protect crawl budget. Locale pages stay out;
      // they're discoverable via hreflang. /design/ is the internal design
      // system reference — 19 pages nobody searches for, which took 19 of the
      // 67 sitemap URLs. Still reachable, just not submitted.
      //
      // Matched against the pathname, not the whole URL, so a post ever slugged
      // `design`, `es` or `tags` is judged on its real path rather than on a
      // substring that happens to look like a section.
      filter: (page) => {
        const path = new URL(page).pathname;
        return (
          !/^\/(es|ca|tl)\//.test(path) &&
          !/^\/design\//.test(path) &&
          !/^\/blog\/tags?\/[^/]+\//.test(path)
        );
      },
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
  // Legacy paths (/work/, /hiring/, /cv/, /education/, /blog/tag/) redirect from
  // public/_redirects instead of here. Astro's static redirects emit a 200 stub
  // with a meta refresh and a noindex tag; Cloudflare Pages answers _redirects
  // with a real 301, which is what a crawler needs to follow the move.
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
