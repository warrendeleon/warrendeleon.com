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
            properties: { className: ['table-wrapper'] },
            children: [child],
          };
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
