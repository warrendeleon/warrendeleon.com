// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mermaid from 'astro-mermaid';

export default defineConfig({
  site: 'https://warrendeleon.com',
  integrations: [
    // Renders ```mermaid code blocks client-side, theme-aware (light/dark). Loads mermaid only on
    // pages that contain a diagram. Must run before other markdown integrations.
    mermaid({ autoTheme: true }),
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
  },
});
