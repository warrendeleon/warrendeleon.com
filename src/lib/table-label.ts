import { t, type Locale } from '../i18n/index';

/**
 * The accessible name for a scrollable table wrapper, in the reader's language.
 *
 * A wrapper with `overflow-x: auto` and a tab stop is a landmark, and landmarks of the same role
 * need distinguishable names — one page carried eight regions all called "Table, scrollable". The
 * name comes from the table's own first header, and it does not assert scrolling: whether a table
 * overflows depends on the viewport, and most of these do not at desktop widths.
 */
export function tableLabel(locale: Locale, name?: string): string {
  const i18n = t(locale);
  const named = i18n.a11y?.tableNamed;
  const plain = i18n.a11y?.table ?? 'Table';
  if (!name) return plain;
  return named ? named.replace('{name}', name) : `${plain}: ${name}`;
}
