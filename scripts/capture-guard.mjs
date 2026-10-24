// What no frame of a recorded clip may show, and how a recorder checks the screen for it
// (scripts/capture-tour.mjs, scripts/capture-clip.mjs).
//
// The check reads only the text on screen: inside the viewport and inside every ancestor that
// clips it, so text a pane has scrolled away (a report's last lines) does not fail a take that
// never showed it, and text it does show always does.
//
// The same recorders, and scripts/capture-app-shots.mjs, refuse a view that is still loading
// (loadingOnScreen, settled): the Store shot once shipped its catalog's skeleton, three grey rows
// and no apps, because a fixed settle time ran out before a slow first fetch did.

/** What no frame may show. */
export const DENY = Object.freeze([
  { what: "a host path", pattern: /\/Users\/|\/home\/[a-z]|PersonalClawWork|capture-0\d\d/ },
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

/**
 * What on screen says the view is still loading, run in the page, as short descriptions; empty
 * when nothing does. Three marks, the ones the app's own loading states carry:
 * - an element marked `aria-busy="true"` (its skeletons are `role="status"` and busy);
 * - a skeleton: a class naming `skeleton` or `shimmer` as one of its parts (`store-skeleton-row`),
 *   or Tailwind's `animate-pulse` on its own (a `motion-safe:animate-pulse` running-state dot is
 *   not one);
 * - text saying it is loading: "Loading…", "Reconnecting…", and the status bar's "Connecting to
 *   gateway…" (a shot taken before the dashboard's socket is up).
 * Only what is inside the viewport and not hidden counts. A spinner alone is not a mark: the app
 * spins one beside a tool call waiting on its approval, which is a state a shot shows on purpose.
 */
export function loadingOnScreen() {
  const shown = (element) => {
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    }
    return [...element.getClientRects()].some(
      (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
    );
  };
  const name = (element) => {
    const role = element.getAttribute("role");
    return `${element.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}`;
  };
  const found = [];
  for (const element of document.querySelectorAll('[aria-busy="true"]')) {
    if (shown(element)) found.push(`busy ${name(element)}`);
  }
  for (const element of document.querySelectorAll("[class]")) {
    const classes = String(element.getAttribute("class")).split(/\s+/);
    const skeleton = classes.some((c) => /(^|[-_])(skeleton|shimmer)([-_]|$)/i.test(c) || c === "animate-pulse");
    if (skeleton && shown(element)) found.push(`skeleton ${name(element)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (/\b(Loading|Reconnecting|Connecting)\b[^\n]{0,60}?(…|\.\.\.)/.test(text) && node.parentElement && shown(node.parentElement)) {
      found.push(`"${text.trim().slice(0, 40)}"`);
    }
  }
  return found;
}

/**
 * Wait up to `ms` for the screen to show no loading state: it has to read clear twice in a row,
 * 250 ms apart, so a view between two fetches does not pass. Returns what still shows when the
 * wait runs out, and an empty list once the view has settled.
 *
 * @param {import("playwright").Page} page
 * @param {number} [ms]
 * @returns {Promise<string[]>}
 */
export async function settled(page, ms = 30000) {
  const deadline = Date.now() + ms;
  let clear = 0;
  for (;;) {
    const found = await page.evaluate(loadingOnScreen);
    clear = found.length ? 0 : clear + 1;
    if (clear >= 2) return [];
    if (Date.now() >= deadline) return found;
    await page.waitForTimeout(250);
  }
}
