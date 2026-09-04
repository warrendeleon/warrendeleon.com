// Minimal inline markup for content strings: **bold**, *italic*, `code` and
// [text](href), nothing else. The JSON is escaped first, so a string can never
// smuggle HTML; these patterns are the only way to produce markup. Links only
// accept site-relative or https targets, so a stray string cannot produce a
// javascript: URL. Bold runs before italic so a ** span is never half-eaten.
export function md(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="ds-code">$1</code>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
}
