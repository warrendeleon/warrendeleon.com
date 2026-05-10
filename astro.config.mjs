// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://warrendeleon.com',
  integrations: [
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
