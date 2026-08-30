// Wrap every block-level <table> in a horizontally scrollable container.
// The .prose grid column is min-width:0, so an unwrapped wide table would
// overflow the viewport and stretch the page on narrow screens. The wrapper
// keeps the table at its natural width and scrolls it within the column.

/** The text of a node and everything under it, flattened and squeezed. */
function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** The first header cell, which is what distinguishes one table from the next on a page. */
function firstHeading(table) {
  let found = '';
  const walk = node => {
    if (found || !node?.children) return;
    for (const child of node.children) {
      if (child.type === 'element' && child.tagName === 'th') {
        found = textOf(child).replace(/\s+/g, ' ').trim();
        return;
      }
      walk(child);
      if (found) return;
    }
  };
  walk(table);
  return found;
}

// The accessible name is localised, because every other accessible name on a translated page is.
// The locale comes from the file's own path: src/content/blog/<locale>/… for a translation, and
// the top level for English.
const LABEL = {
  en: name => (name ? `Table: ${name}` : 'Table'),
  es: name => (name ? `Tabla: ${name}` : 'Tabla'),
  ca: name => (name ? `Taula: ${name}` : 'Taula'),
  tl: name => (name ? `Talahanayan: ${name}` : 'Talahanayan'),
};

function localeOf(file) {
  const path = file?.history?.[0] ?? file?.path ?? '';
  const found = /src\/content\/blog\/(es|ca|tl)\//.exec(path);
  return found ? found[1] : 'en';
}

export default function rehypeTableWrapper() {
  return (tree, file) => {
    const label = LABEL[localeOf(file)] ?? LABEL.en;
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'element' && child.tagName === 'table') {
          // The name comes from the table's own first header cell. A constant label gave every
          // wrapper on a page the same name — one article shipped eight regions all called
          // "Table, scrollable" — and landmarks of the same role need distinguishable names.
          // It also no longer asserts scrolling: whether the wrapper overflows depends on the
          // viewport, and most of them do not at desktop widths, so seven of those eight were
          // announcing a behaviour that was not there.
          const heading = firstHeading(child);
          node.children[i] = {
            type: 'element',
            tagName: 'div',
            // tabindex and a named region, because the wrapper scrolls. A scrollable container
            // that no keyboard can reach fails WCAG 2.1.1 Keyboard at Level A: a table wider
            // than the viewport has content only a mouse or a finger can get to. Every code
            // block on the site already carries tabindex="0" for the same reason; the table
            // wrapper was the one scroller that did not.
            properties: {
              className: ['table-wrapper'],
              tabindex: '0',
              role: 'region',
              'aria-label': label(heading),
            },
            children: [child],
          };
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
