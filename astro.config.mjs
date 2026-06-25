// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mermaid from 'astro-mermaid';
import rehypeUnpublishedLinks from './src/lib/rehype-unpublished-links.mjs';
import rehypeTableWrapper from './src/lib/rehype-table-wrapper.mjs';
import pagefind from './src/lib/astro-pagefind.mjs';

export default defineConfig({
  site: 'https://warrendeleon.com',
  integrations: [
    // Renders ```mermaid code blocks client-side. Loads mermaid only on pages with a diagram.
    // Must run before other markdown integrations. Rendered once with the 'base' theme + Inter;
    // colours come from the site's own CSS tokens (see .prose pre.mermaid in global.css), so the
    // diagrams match the brand and track light/dark instantly without a re-render.
    mermaid({
      autoTheme: false,
      // Silence the plugin's [astro-mermaid] console.log noise in the browser.
      // Errors are still logged.
      enableLog: false,
      mermaidConfig: {
        theme: 'base',
        themeVariables: {
          fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
          fontSize: '15px',
          primaryColor: '#ffffff',
          primaryBorderColor: '#6dc402',
          primaryTextColor: '#0e0c19',
          lineColor: '#8a8f98',
          secondaryColor: '#f5f5f7',
          tertiaryColor: '#f5f5f7',
          clusterBkg: '#f5f5f7',
          clusterBorder: '#e0e0e0',
          titleColor: '#0e0c19',
          edgeLabelBackground: '#ffffff',
        },
      },
    }),
    sitemap({
      // Keep the /blog/tags/ index (a real browse hub) but drop the thin
      // individual tag pages and the old /blog/tag/ redirect stubs, to protect
      // crawl budget. Locale pages stay out; they're discoverable via hreflang.
      filter: (page) =>
        !/\/blog\/tags?\/[^/]+\//.test(page) &&
        !page.includes('/ca/') &&
        !page.includes('/es/') &&
        !page.includes('/tl/'),
    }),
    // Indexes only pages carrying `data-pagefind-body` (the blog posts), so
    // search is scoped to the blog and nothing else. Must run last so the
    // index is built over the finished output.
    pagefind(),
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
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
    rehypePlugins: [rehypeUnpublishedLinks, rehypeTableWrapper],
  },
});
