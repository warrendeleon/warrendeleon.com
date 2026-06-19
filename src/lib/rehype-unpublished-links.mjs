import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Internal blog link, optionally locale-prefixed, optionally with a fragment:
//   /blog/my-post/    /es/blog/my-post/    /ca/blog/my-post/#section
const BLOG_LINK = /^(?:\/(?:es|ca|tl))?\/blog\/([a-z0-9-]+)\/?(?:#.*)?$/;
const CONTENT_DIR = 'src/content/blog';

let publishedCache = null;

// The English master is the single source of truth for scheduling, so we only
// read the top-level posts (locale subdirectories inherit their master's date).
// Mirrors getPostsForLocale: a post is published when it is not a draft and its
// publishDate is at or before the end of today, UTC.
function publishedSlugs() {
  if (publishedCache) return publishedCache;
  const cutoff = new Date();
  cutoff.setUTCHours(23, 59, 59, 999);
  const set = new Set();
  for (const file of readdirSync(CONTENT_DIR)) {
    if (!file.endsWith('.md')) continue;
    const fm = readFileSync(join(CONTENT_DIR, file), 'utf-8').split('---')[1] || '';
    if (/^\s*draft:\s*true\s*$/m.test(fm)) continue;
    const date = fm.match(/^\s*publishDate:\s*(.+?)\s*$/m);
    if (date && new Date(date[1]) <= cutoff) set.add(file.replace(/\.md$/, ''));
  }
  publishedCache = set;
  return set;
}

// Replace each link to a not-yet-published post with its own text, so a
// scheduled post that other posts already reference does not render a 404 link.
// The link reappears automatically on the rebuild after the target publishes.
export default function rehypeUnpublishedLinks() {
  // In dev the whole catalogue is built (includeFuture), so leave links intact.
  if (process.env.NODE_ENV !== 'production') return () => {};

  const published = publishedSlugs();

  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      const next = [];
      for (const child of node.children) {
        const href = child.tagName === 'a' && child.properties && child.properties.href;
        const match = typeof href === 'string' && href.match(BLOG_LINK);
        if (match && !published.has(match[1])) {
          walk(child);
          next.push(...child.children);
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}
