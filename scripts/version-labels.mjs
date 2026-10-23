// The version labels in a stretch of page text: a release pin this build names, or anything shaped
// like one (`v0.2.2`, `0.2.2`). scripts/validate-build.mjs holds the /apps hero to none, since a
// hero carries no version label (DESIGN.md's hard rules); tests/version-labels.test.mjs plants each.

const SHAPED = /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/g;

/**
 * @param {string} text
 * @param {(string | null | undefined)[]} pins the release labels this build names, such as the
 *   apps tag and the core version label
 * @returns {string[]} each label found, quoted
 */
export function versionLabels(text, pins = []) {
  const found = new Set(text.match(SHAPED) ?? []);
  for (const pin of pins) if (pin && text.includes(pin)) found.add(pin);
  return [...found].map((label) => `"${label}"`);
}
