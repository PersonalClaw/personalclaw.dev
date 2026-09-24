// What the docs site publishes out of the pinned source trees, and what it refuses to.
//
// ── Why this is a DENY list ────────────────────────────────────────────────────
//
// It used to be an ALLOW list: `scripts/known-docs.mjs` named every core file the site
// published, per tree, and the remote sync read that list because GitHub gave it no
// directory listing. The stated reason was that publishing should be a decision rather
// than a side effect — "a doc added to core would silently start appearing on the
// website without anyone deciding it should."
//
// That reason was right and the mechanism was wrong, because the ALLOW list did not
// gate what it claimed to gate. The pin does. Nothing core commits can reach this site
// until someone advances `sources/personalclaw.sources.json` to a tagged release that
// contains it, and that advance is a reviewed commit whose whole content is "we now
// publish this release." Publishing was already a decision; the allow list only made it
// a decision that had to be re-typed as a filename, in two files, in the same commit.
//
// The cost of that was measured on 2026-09-23, and it is the reason this file changed
// shape. At the pinned release (v0.1.3) the five published trees hold 33 markdown files
// and the site published 32 pages of them, three of which were guides. Core's default
// branch by then held 53 — twelve guides, and core's README links all twelve by
// relative path, so every one of those links worked on GitHub and nine had no page
// here. The gap was not the guides: it was TWENTY documents across guides, reference,
// architecture and security that the allow list did not name. Advancing the pin would
// have published none of them. It would have published exactly the same 32 pages,
// silently, because the allow list — not the pin — decided the set.
//
// So the decision moves to where it is already being made. A pin advance publishes
// whatever that release's documentation trees contain, and the only thing recorded here
// is what the site deliberately WITHHOLDS from a tree it otherwise publishes. A new
// core doc needs no edit in this repository; a withheld one needs a named reason.
//
// This inverts one claim in the deleted file's header, and the inversion is the point:
// a doc added to core no longer requires an edit here to appear. What it requires is a
// release. The rails that make that safe are below and in scripts/sync-docs.mjs.
//
// ── The rails that replace the allow list ─────────────────────────────────────
//
//  1. DIRECTORY LISTING, both modes. `source.listMarkdown()` is implemented for the
//     local checkout and for the pinned remote (scripts/sync-sources.mjs), so the two
//     answer identically. Under the allow list they could not: local mode listed the
//     directory and remote mode read the list, so the same commit published a different
//     page count on different machines. Nothing reported that.
//
//  2. A SOURCE FLOOR, asserted before a route exists — `assertPublishable()` below.
//     A stub or empty document fails the sync, naming the core path. This is the check
//     the allow list made necessary and never had: adding a filename registered a route
//     whose page could render blank, and the only thing that caught it was a floor on
//     the RENDERED html at the end of a full build (DOCS_BODY_TEXT_FLOOR). Both floors
//     stay. This one fails in seconds and names the source; that one proves the page a
//     reader actually receives is not empty. Neither subsumes the other.
//
//  3. A DERIVED ROUTE CONTRACT. The sync writes `.generated/docs-index.json` and
//     tests/support/site-contract.mjs reads it, so `scripts/validate-build.mjs` still
//     asserts set equality in both directions between the contracted routes and the
//     pages the build generated. What changed is which two things are compared: it was
//     hand-list vs build, and it is now sync-manifest vs build. That still catches the
//     failure the equality exists for — a document the sync wrote that Starlight did
//     not publish, or a page Starlight published that the sync did not write — and it
//     no longer reds on the one event that is supposed to change the set.
//
// ── What is withheld, and why each one ────────────────────────────────────────
//
// Whole trees are withheld by simply not being listed in `TREES` (scripts/sync-docs.mjs):
// core's docs/roadmap/ (intent, not released behaviour), docs/maintainers/ (internal
// process), docs/design/ and docs/screenshots/ (assets). Those are absences, not
// exclusions — there is no reader-visible surface to contradict.
//
// This map is for the narrower case: a file inside a tree the site DOES publish.
export const WITHHELD = {
  // The corpus INDEX, not a topic. The site publishes its own section index over this
  // tree (src/prose/research-preface.md), so republishing core's would ship two indexes
  // that disagree the moment either changes. It is still READ — its topic table is
  // where the per-topic descriptions come from — and it is still linked, at the pinned
  // commit, from the preface. Withholding the page and using its prose are not in
  // tension. See the `descriptionsFrom` and `preface` fields in scripts/sync-docs.mjs.
  "research/learnings": ["README.md"]
};

/**
 * The minimum SOURCE text, in characters, a document must carry to be published.
 *
 * Distinct from `DOCS_BODY_TEXT_FLOOR` in tests/support/site-contract.mjs, which
 * measures the RENDERED page at the end of a build. This one measures the markdown the
 * sync just read, so it fails immediately and names the core path rather than a URL.
 *
 * Measured, not guessed. Prose lengths across the five published trees, by this
 * function's own definition of prose: at the pinned commit the shortest of 33 documents
 * is docs/security/limitations.md at 3,953 characters; across core's default branch on
 * 2026-09-23 the shortest of 53 is docs/architecture/tool-name-wire.md at 2,335. The
 * floor is set an order of magnitude below the smaller of those, so core can shorten,
 * split or merge a document freely while a placeholder still fails loudly.
 *
 * Deliberately not zero. A zero-length check only catches a file that is literally
 * empty, and the shape this is written against is not an empty file — it is a
 * plausible-looking stub: a title, a sentence, and a promise to write the rest. That
 * renders a confident HTTP 200 over nothing, and nothing else in the pipeline reports
 * it.
 */
export const DOCS_SOURCE_TEXT_FLOOR = 240;

/** True when `fileName` is deliberately withheld from the tree at `sourceDir`. */
export function isWithheld(sourceDir, fileName) {
  return (WITHHELD[sourceDir] ?? []).includes(fileName);
}

/**
 * Refuse a document that cannot honestly be published as a page.
 *
 * Measures PROSE, not bytes: frontmatter, the H1, html comments and fenced code are
 * stripped first. A file whose only content is a code block is a snippet somebody
 * dropped in a docs directory, and counting the fence's contents would let it clear the
 * floor and publish as a page with nothing to read.
 *
 * @param {string} relativePath source path, for the error message
 * @param {string} markdown the document as read from the pinned tree
 */
export function assertPublishable(relativePath, markdown) {
  const prose = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^#\s+.+$/m, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (prose.length < DOCS_SOURCE_TEXT_FLOOR) {
    throw new Error(
      `${relativePath} carries only ${prose.length} characters of prose (floor ` +
        `${DOCS_SOURCE_TEXT_FLOOR}) — publishing it would serve a 200 over a blank or ` +
        `stub page. Either the document is a placeholder at the pinned commit, or the ` +
        `pin points at a tree where it had not been written yet. Withhold it in ` +
        `scripts/docs-publication.mjs with a reason, or advance the pin; do not lower ` +
        `this floor to make the build pass.`
    );
  }
}
