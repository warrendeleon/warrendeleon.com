import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/index';

/**
 * A blog post whose publishDate is guaranteed present. Translations omit their own
 * date in frontmatter and inherit the English master's, so the schema types it as
 * optional; getPostsForLocale fills it and narrows the type at its boundary.
 */
export type ScheduledPost = CollectionEntry<'blog'> & {
  data: CollectionEntry<'blog'>['data'] & { publishDate: Date };
};

/**
 * Locale-to-Intl mapping for date formatting.
 */
const dateLocaleMap: Record<Locale, string> = {
  en: 'en-GB',
  es: 'es-ES',
  ca: 'ca-ES',
  tl: 'tl-PH',
};

/**
 * Returns all published (non-draft) blog posts for a given locale,
 * sorted by publish date descending (newest first).
 */
export async function getPostsForLocale(locale: Locale, includeFuture = import.meta.env.DEV): Promise<ScheduledPost[]> {
  const now = new Date();
  now.setUTCHours(23, 59, 59, 999);
  const all = await getCollection('blog');

  // English is the single source of truth for scheduling. Build a slug -> date map
  // from the English posts, then fill every translation's date from its master.
  const masterDate = new Map<string, Date>();
  for (const post of all) {
    if ((post.data.locale || 'en') === 'en' && post.data.publishDate) {
      masterDate.set(getPostSlug(post.id), post.data.publishDate);
    }
  }
  for (const post of all) {
    if (post.data.publishDate) continue;
    const inherited = masterDate.get(getPostSlug(post.id));
    if (!inherited) {
      // A translation with no English master, or an English post missing a date,
      // would otherwise vanish from the site silently. Fail loudly instead.
      throw new Error(`Blog post "${post.id}" has no publishDate and no English master to inherit one from.`);
    }
    post.data.publishDate = inherited;
  }

  return all
    .filter((post): post is ScheduledPost =>
      post.data.publishDate instanceof Date &&
      !post.data.draft &&
      (post.data.locale || 'en') === locale &&
      (includeFuture || post.data.publishDate <= now))
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());
}

/**
 * Formats a date in the locale-appropriate format.
 * e.g. en: "29 March 2026", es: "29 de marzo de 2026", ca: "29 de març de 2026"
 */
export function formatBlogDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(dateLocaleMap[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Converts a Date to a YYYY-MM-DD string for client-side date comparison.
 * Used by the scheduled-post filtering script.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts the URL slug from a blog post content collection ID.
 * Posts in locale subdirectories have IDs like "es/my-post-slug".
 * Root posts have IDs like "my-post-slug".
 */
export function getPostSlug(id: string): string {
  const parts = id.split('/');
  return parts[parts.length - 1];
}
