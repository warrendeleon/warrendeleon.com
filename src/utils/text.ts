const BOLD_RE = /\*\*(.+?)\*\*/g;

/** Flatten the simple markdown used in workxp descriptions to plain text. */
export function stripSimpleMarkdown(text: string): string {
  return text
    .replace(BOLD_RE, '$1')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

/** Truncate at a word boundary; adds an ellipsis only when text was cut. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return `${text.slice(0, cut > 0 ? cut : max).replace(/[,;:.]$/, '')}…`;
}

/**
 * Render the small markdown subset in workxp descriptions (paragraphs,
 * "- " lists, **bold**) to HTML. Input is our own data files, not user input.
 */
export function renderSimpleMarkdown(text: string): string {
  const bold = (s: string) => s.replace(BOLD_RE, '<strong>$1</strong>');
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return '';
      const listStart = lines.findIndex((l) => l.startsWith('- '));
      const items = (ls: string[]) =>
        `<ul>${ls.map((l) => `<li>${bold(l.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`;
      if (listStart === -1) return `<p>${bold(lines.join(' '))}</p>`;
      // A block may end with prose after the list; keep those lines out of the <ul>.
      const listLines = lines.slice(listStart).filter((l) => l.startsWith('- '));
      const trailing = lines.slice(listStart).filter((l) => !l.startsWith('- '));
      const intro = listStart > 0 ? `<p>${bold(lines.slice(0, listStart).join(' '))}</p>` : '';
      const outro = trailing.length > 0 ? `<p>${bold(trailing.join(' '))}</p>` : '';
      return `${intro}${items(listLines)}${outro}`;
    })
    .join('');
}
