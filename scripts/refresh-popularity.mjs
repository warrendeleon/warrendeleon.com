// Refresh src/data/popularity.json from Umami pageview data.
//
// Run on the build host (where the `postgres` container holding the Umami DB is
// reachable) before `astro build`:
//
//   UMAMI_DB_PASSWORD=... node scripts/refresh-popularity.mjs
//
// The "More from the blog" section reads this file to surface lower-traffic posts.
// If the password is unset or the query fails, the existing file is left untouched,
// so a build never breaks on a transient analytics outage.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'popularity.json');

const password = process.env.UMAMI_DB_PASSWORD;
if (!password) {
  console.error('[popularity] UMAMI_DB_PASSWORD not set; leaving popularity.json unchanged');
  process.exit(0);
}

const container = process.env.UMAMI_DB_CONTAINER || 'postgres';
const dbUser = process.env.UMAMI_DB_USER || 'umami';
const dbName = process.env.UMAMI_DB_NAME || 'umami';

// event_type = 1 is a pageview in Umami v2. Match blog post paths in any locale,
// excluding the listing index and tag pages.
const sql = `SELECT url_path, count(*) FROM website_event
  WHERE event_type = 1
    AND url_path ~ '^/(es/|ca/|tl/)?blog/[^/]+/?$'
    AND url_path NOT LIKE '%/blog/tag/%'
  GROUP BY url_path;`;

let raw;
try {
  raw = execFileSync(
    'docker',
    ['exec', '-e', `PGPASSWORD=${password}`, container, 'psql', '-U', dbUser, '-d', dbName, '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  );
} catch (err) {
  console.error('[popularity] Umami query failed; leaving popularity.json unchanged:', err.message);
  process.exit(0);
}

const views = {};
for (const line of raw.trim().split('\n')) {
  const [urlPath, count] = line.split('|');
  if (!urlPath) continue;
  const slug = urlPath
    .replace(/^\/(es|ca|tl)\//, '/')
    .replace(/^\/blog\//, '')
    .replace(/\/$/, '');
  if (!slug || slug.includes('/')) continue; // skip the bare index and nested paths
  views[slug] = (views[slug] || 0) + Number(count || 0);
}

const sorted = Object.fromEntries(Object.entries(views).sort((a, b) => b[1] - a[1]));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`[popularity] updated ${Object.keys(sorted).length} slugs`);
