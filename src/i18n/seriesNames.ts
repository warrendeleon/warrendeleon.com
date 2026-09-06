import type { Locale } from './index';

// The display name of each series, keyed by the exact series name used in post
// frontmatter. The frontmatter value stays English in every locale because it is
// the grouping key and the URL slug is derived from it; this map is what a reader
// actually sees on the blog index, the series shelf, the hub and the breadcrumbs.
//
// What translates and what does not follows the same rule as the articles: an
// established technical term stays in English because that is what engineers in
// each language say and search for, while ordinary words are translated. So
// "Module Federation", "State Management" in Tagalog and "Supabase Security" keep
// their English, and "Hiring" or "Foundations" do not.
const seriesNames: Record<string, Record<Locale, string>> = {
  'React Native Module Federation': {
    en: 'React Native Module Federation',
    es: 'React Native Module Federation',
    ca: 'React Native Module Federation',
    tl: 'React Native Module Federation',
  },
  'React Native Foundations': {
    en: 'React Native Foundations',
    es: 'Fundamentos de React Native',
    ca: 'Fonaments de React Native',
    tl: 'Mga Pundasyon ng React Native',
  },
  'Hiring': {
    en: 'Hiring',
    es: 'Contratación',
    ca: 'Contractació',
    tl: 'Pag-hire',
  },
  'State Management': {
    en: 'State Management',
    es: 'Gestión del estado',
    ca: 'Gestió de l\'estat',
    tl: 'State Management',
  },
  'Testing and Infrastructure': {
    en: 'Testing and Infrastructure',
    es: 'Testing e infraestructura',
    ca: 'Testing i infraestructura',
    tl: 'Testing at Infrastructure',
  },
  'Supabase Security': {
    en: 'Supabase Security',
    es: 'Seguridad en Supabase',
    ca: 'Seguretat a Supabase',
    tl: 'Supabase Security',
  },
  'Claude RAG + Tooling': {
    en: 'Claude RAG + Tooling',
    es: 'Claude RAG y herramientas',
    ca: 'Claude RAG i eines',
    tl: 'Claude RAG + Tooling',
  },
};

// Falls back to the frontmatter name, so a new series reads correctly in every
// locale from its first post and only needs an entry here to be translated.
export const getSeriesName = (series: string, locale: Locale): string =>
  seriesNames[series]?.[locale] ?? seriesNames[series]?.en ?? series;
