import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Builds the Pagefind search index from the static output after every build.
// Runs as an Astro build hook (not an npm `postbuild` script) on purpose: the
// deploy pipeline invokes `npx astro build` directly, which would never fire an
// npm lifecycle hook. Hooking `astro:build:done` indexes regardless of how the
// build is started. `pagefind` is imported dynamically so a fresh `npm install`
// (config evaluated before deps finish) can't crash on a missing module.
export default function pagefind() {
  return {
    name: 'pagefind',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const site = fileURLToPath(dir);
        logger.info('Building search index…');
        const pagefind = await import('pagefind');
        const { index } = await pagefind.createIndex();
        await index.addDirectory({ path: site });
        await index.writeFiles({ outputPath: join(site, 'pagefind') });
        await pagefind.close();
        logger.info('Search index written to /pagefind');
      },
    },
  };
}
