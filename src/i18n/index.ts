import en from './en.json';
import es from './es.json';
import ca from './ca.json';
import tl from './tl.json';

export type Locale = 'en' | 'es' | 'ca' | 'tl';

const translations: Record<Locale, typeof en> = { en, es, ca, tl };

export function t(locale: Locale) {
  return translations[locale] ?? translations.en;
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
  es: 'Español',
  ca: 'Català',
  tl: 'Tagalog',
};

const intlLocale: Record<Locale, string> = {
  en: 'en-GB',
  es: 'es-ES',
  ca: 'ca-ES',
  tl: 'tl-PH',
};

export function formatDateRange(startDate: string, endDate: string | null, locale: Locale): string {
  const i18n = t(locale);
  const formatMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    const monthName = date.toLocaleDateString(intlLocale[locale], { month: 'short' });
    return `${monthName} ${year}`;
  };
  const start = formatMonth(startDate);
  const end = endDate && endDate.trim() ? formatMonth(endDate) : i18n.workExperience.present;
  return `${start} - ${end}`;
}

// getStaticPaths for the [...locale] rest routes. English builds at the root
// (an undefined segment, so `/`, `/cv/`, …) and every other locale gets its
// prefix (`/es/`, `/es/cv/`, …). The resolved locale rides along in props so
// each page reads it straight from Astro.props instead of re-deriving it.
export function localeStaticPaths() {
  return locales.map((locale) => ({
    params: { locale: locale === 'en' ? undefined : locale },
    props: { locale },
  }));
}
