// GitHub's light theme puts four token colours under AA on our light code ground
// (--code-bg #f5f5f5, global.css), where normal text needs 4.5:1. The set was enumerated across
// every fenced block on the site rather than the ones one post happens to use: #D73A49 keyword
// 4.20:1, #6A737D comment 4.42:1, #22863A string 4.24:1 and #E36209 constant 3.20:1. Each maps to
// GitHub's own darker shade of the same hue, so the syntax distinctions survive the repair.
// github-dark clears the bar on --code-bg #1a1a1a everywhere except its comment grey.
//
// This lives in its own module because the site highlights code down two paths: the markdown
// pipeline configured in astro.config.mjs, and Astro's <Code> component used directly by the
// design pages. The first repair patched only the pipeline, and the design pages kept shipping
// the failing tokens — which is what scripts/verify-code-contrast.mjs caught, because it reads
// built HTML rather than the config. Both paths import the transformer from here.
const LIGHT_READABLE = {
  '#D73A49': '#B31D28', // 4.20:1 -> 6.17:1
  '#E36209': '#953800', // 3.20:1 -> 6.77:1
  '#22863A': '#116329', // 4.24:1 -> 6.78:1
  '#6A737D': '#5F6873', // 4.42:1 -> 5.19:1
};
const DARK_READABLE = {
  '#6A737D': '#8B949E', // 3.61:1 -> 5.66:1
};

const remap = (table) => (hex) => table[hex.toUpperCase()] ?? hex;

/** @type {import('shiki').ShikiTransformer} */
const readableTokens = {
  name: 'readable-tokens',
  span(node) {
    const style = node.properties?.style;
    if (typeof style !== 'string') return;
    node.properties.style = style
      .replace(/(^|;)color:(#[0-9A-Fa-f]{6})/, (_m, lead, hex) => `${lead}color:${remap(LIGHT_READABLE)(hex)}`)
      .replace(/--shiki-dark:(#[0-9A-Fa-f]{6})/, (_m, hex) => `--shiki-dark:${remap(DARK_READABLE)(hex)}`);
  },
};

export default readableTokens;
