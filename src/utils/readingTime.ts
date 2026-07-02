/**
 * Reading time from the PROSE of a markdown body. Fenced code blocks, tables
 * and image/frontmatter noise are stripped before counting: code is skimmed,
 * not read at 200wpm, and counting it doubled the displayed time on
 * code-heavy tutorials ("19 min read" for ~8 minutes of prose), which reads
 * as a reason not to start the article.
 */
export function getReadingTime(content: string): number {
  const prose = content
    // fenced blocks (```lang ... ``` including mermaid) and indented code
    .replace(/^```[\s\S]*?^```\s*$/gm, '')
    // markdown tables (any line that is a table row or separator)
    .replace(/^\|.*\|\s*$/gm, '')
    .replace(/^[-| :]+$/gm, '')
    // image lines carry no reading time
    .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, '');
  const words = prose.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
