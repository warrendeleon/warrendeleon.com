// Wrap every block-level <table> in a horizontally scrollable container.
// The .prose grid column is min-width:0, so an unwrapped wide table would
// overflow the viewport and stretch the page on narrow screens. The wrapper
// keeps the table at its natural width and scrolls it within the column.
export default function rehypeTableWrapper() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'element' && child.tagName === 'table') {
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
              'aria-label': 'Table, scrollable',
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
