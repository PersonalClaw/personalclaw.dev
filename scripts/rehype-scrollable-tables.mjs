// Make markdown tables keyboard-reachable.
//
// Core's docs are table-heavy (CLI flags, config keys, capability matrices) and
// Starlight styles every table as its own scroll container —
// `.sl-markdown-content table { display: block; overflow: auto }`
// (@astrojs/starlight/style/markdown.css:135). axe rates the result
// `scrollable-region-focusable` / serious: a pointer can scroll it, a keyboard cannot
// reach it. 52 violations across four sampled docs pages, every one a `<table>`.
//
// The fix has to land on the TABLE, not on a wrapper: an outer div does not help when
// the inner element is the thing that scrolls (a first attempt wrapped it and mobile
// still failed). It cannot be CSS either — a tab stop needs `tabindex` — and it should
// not be in the source markdown, which is generated from core and must stay free of
// website-specific markup. A rehype plugin on this site's own pipeline is the layer
// where the constraint actually lives.

/** @returns {(tree: import("hast").Root) => void} */
export function rehypeScrollableTables() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.tagName !== "table") return;
      node.properties = node.properties ?? {};
      // `group` + a name is what makes the tab stop meaningful: a screen reader
      // announces "Table, group" instead of landing the user on an unlabelled
      // scrollable box. `tabIndex` is hast's spelling of the `tabindex` attribute.
      node.properties.tabIndex = 0;
      node.properties.role = "group";
      node.properties["aria-label"] = "Table (scrollable)";
    });
  };
}

/** Minimal depth-first walk — avoids adding `unist-util-visit` for one traversal. */
function visit(node, callback, index = null, parent = null) {
  callback(node, index, parent);
  if (!Array.isArray(node.children)) return;
  // Iterate a copy: the callback may replace the child at `i`.
  for (const [i, child] of [...node.children].entries()) {
    visit(child, callback, i, node);
  }
}
