// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mermaid from 'astro-mermaid';
import rehypeUnpublishedLinks from './src/lib/rehype-unpublished-links.mjs';

export default defineConfig({
  site: 'https://warrendeleon.com',
  integrations: [
    // Renders ```mermaid code blocks client-side. Loads mermaid only on pages with a diagram.
    // Must run before other markdown integrations. Rendered once with the 'base' theme + Inter;
    // colours come from the site's own CSS tokens (see .prose pre.mermaid in global.css), so the
    // diagrams match the brand and track light/dark instantly without a re-render.
    mermaid({
      autoTheme: false,
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
      filter: (page) =>
        !page.includes('/blog/tag/') &&
        !page.includes('/hiring/') &&
        !page.includes('/ca/') &&
        !page.includes('/es/') &&
        !page.includes('/tl/'),
    }),
  ],
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
    rehypePlugins: [rehypeUnpublishedLinks],
  },
});
