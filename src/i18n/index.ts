import en from './en.json';
import es from './es.json';
import ca from './ca.json';
import tl from './tl.json';

export type Locale = 'en' | 'es' | 'ca' | 'tl';

const translations: Record<Locale, typeof en> = { en, es, ca, tl };

export function t(locale: Locale) {
  return translations[locale] ?? translations.en;
}

export function getWorkExperience(locale: Locale) {
  const files: Record<Locale, () => Promise<unknown>> = {
    en: () => import('../data/workxp-en.json'),
    es: () => import('../data/workxp-es.json'),
    ca: () => import('../data/workxp-ca.json'),
    tl: () => import('../data/workxp-tl.json'),
  };
  return files[locale]();
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getLocalePath(locale: Locale, path: string): string {
  if (locale === 'en') return path;
  return `/${locale}${path}`;
}

export const locales: Locale[] = ['en', 'es', 'ca', 'tl'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Espanol',
  ca: 'Catala',
  tl: 'Tagalog',
};

export function formatDateRange(startDate: string, endDate: string | null, locale: Locale): string {
  const i18n = t(locale);
  const formatMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    const monthName = date.toLocaleDateString('en-GB', { month: 'short' });
    return `${monthName} ${year}`;
  };
  const start = formatMonth(startDate);
  const end = endDate ? formatMonth(endDate) : i18n.workExperience.present;
  return `${start} - ${end}`;
}
