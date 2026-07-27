// Minimal inline markup for the design docs' content strings: **bold**,
// *italic* and `code`, nothing else. The JSON is escaped first, so a string
// can never smuggle HTML; these patterns are the only way to produce markup.
// Bold runs before italic so a ** span is never half-eaten as two * spans.
export function md(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="ds-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
}
