import { getCollection, type CollectionEntry } from 'astro:content';
import { locales, type Locale } from '../i18n/index';

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

  // English is also the source of truth for `series`. Translations omit it and inherit
  // the master's, so the series nav appears on every locale without repeating the field.
  const masterSeries = new Map<string, string>();
  for (const post of all) {
    if ((post.data.locale || 'en') === 'en' && post.data.series) {
      masterSeries.set(getPostSlug(post.id), post.data.series);
    }
  }
  for (const post of all) {
    if (post.data.series) continue;
    const inherited = masterSeries.get(getPostSlug(post.id));
    if (inherited) post.data.series = inherited;
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
 * URL-safe slug for a series name, e.g. "React Native Module Federation" ->
 * "react-native-module-federation".
 */
export function getSeriesSlug(series: string): string {
  return series
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * All series for a locale with their post counts, ordered by size then name.
 * Counts reflect published posts only (getPostsForLocale gates future posts in prod).
 */
export async function getAllSeries(locale: Locale): Promise<{ name: string; slug: string; count: number }[]> {
  const posts = await getPostsForLocale(locale);
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (post.data.series) counts.set(post.data.series, (counts.get(post.data.series) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: getSeriesSlug(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Published posts in a series, in reading order (oldest first).
 */
export async function getSeriesPosts(locale: Locale, seriesSlug: string): Promise<ScheduledPost[]> {
  const posts = await getPostsForLocale(locale);
  return posts
    .filter(post => post.data.series && getSeriesSlug(post.data.series) === seriesSlug)
    .sort((a, b) => a.data.publishDate.valueOf() - b.data.publishDate.valueOf());
}

/**
 * The locales a given post is actually available in (English master plus any
 * translation that exists). Used to emit hreflang only for pages that exist,
 * so an untranslated post does not advertise alternates that 404.
 */
export async function getAvailableLocales(slug: string): Promise<Locale[]> {
  const all = await getCollection('blog');
  const present = new Set<Locale>(['en']);
  for (const post of all) {
    const parts = post.id.split('/');
    if (parts.length === 2 && getPostSlug(post.id) === slug) {
      const loc = parts[0] as Locale;
      if (locales.includes(loc)) present.add(loc);
    }
  }
  return locales.filter(l => present.has(l));
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
