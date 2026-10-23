// What no frame of a recorded clip may show, and how a recorder checks the screen for it
// (scripts/capture-tour.mjs, scripts/capture-clip.mjs).
//
// The check reads only the text on screen: inside the viewport and inside every ancestor that
// clips it, so text a pane has scrolled away (a report's last lines) does not fail a take that
// never showed it, and text it does show always does.

/** What no frame may show. */
export const DENY = Object.freeze([
  { what: "a host path", pattern: /\/Users\/|\/home\/[a-z]|PersonalClawWork|capture-026/ },
  { what: "the account name", pattern: /golani/i },
  { what: "the model provider", pattern: /bedrock|us\.anthropic\.|aws[_ -]?(profile|region|access)/i },
  { what: "a key", pattern: /AKIA[0-9A-Z]{12,}|sk-[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY/ }
]);

/** The text on screen, run in the page: inside the viewport, and inside every ancestor that clips it. */
export function textOnScreen() {
  const seen = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const clips = (element) => {
    const boxes = [];
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return null;
      if (/(hidden|auto|scroll|clip)/.test(style.overflowX + style.overflowY)) boxes.push(node.getBoundingClientRect());
    }
    return boxes;
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement) continue;
    const boxes = clips(node.parentElement);
    if (boxes === null) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const shown = [...range.getClientRects()].some(
      (r) =>
        r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth &&
        boxes.every((b) => r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right)
    );
    if (shown) seen.push(node.textContent);
  }
  return seen.join(" ");
}

/**
 * What a screen's text shows that DENY names, as "what (excerpt)"; empty when nothing.
 *
 * @param {string} text
 */
export function denied(text) {
  return DENY.flatMap(({ what, pattern }) => {
    const found = pattern.exec(text);
    return found ? [`${what} ("${found[0].slice(0, 12)}…")`] : [];
  });
}
