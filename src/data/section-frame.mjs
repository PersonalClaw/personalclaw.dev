// Which frame a page shares (#97): its own, else its section's, else none, in which case the page
// shares the site's card. One rule for the pages (src/data/social-frames.ts) and the build check
// (scripts/validate-build.mjs), which reads this file because node cannot load the TypeScript.
//
// Home's frame is Home's alone: `/` is no page's section, so `/404` shares the card.

/**
 * @template T
 * @param {Record<string, T>} frames the committed map, src/data/social-frames.json
 * @param {string} pathname
 * @returns {T | undefined}
 */
export function frameFor(frames, pathname) {
  const route = pathname.replace(/\/+$/, "") || "/";
  const section = `/${route.split("/")[1]}`;
  return frames[route] ?? frames[section];
}
