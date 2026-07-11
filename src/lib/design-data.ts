// Locale → design-section content. English is the source of truth for the
// shape; the other locales are cast to it so a translation with a missing or
// extra key surfaces in review rather than as a type error across every page.

import en from '../data/design-en.json';
import es from '../data/design-es.json';
import ca from '../data/design-ca.json';
import tl from '../data/design-tl.json';
import type { Locale } from '../i18n/index';

export type DesignContent = typeof en;

const byLocale: Record<Locale, DesignContent> = {
  en,
  es: es as DesignContent,
  ca: ca as DesignContent,
  tl: tl as DesignContent,
};

export function getDesignData(locale: Locale): DesignContent {
  return byLocale[locale] ?? en;
}
