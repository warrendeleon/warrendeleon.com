// Minimal inline markup for the design docs' content strings: **bold** and
// `code`, nothing else. The JSON is escaped first, so a string can never
// smuggle HTML; the two patterns are the only way to produce markup.
export function md(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="ds-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
