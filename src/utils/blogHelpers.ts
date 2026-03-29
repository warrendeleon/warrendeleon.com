import { getCollection } from 'astro:content';
import type { Locale } from '../i18n/index';

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
export async function getPostsForLocale(locale: Locale) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return (await getCollection('blog'))
    .filter(post => !post.data.draft && (post.data.locale || 'en') === locale && post.data.publishDate <= now)
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
