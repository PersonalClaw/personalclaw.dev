// The docs publication policy: what reaches /docs, and what is refused before it can.
//
// These are the assertions that make "publish whatever the pinned release documents"
// safe. The published set is no longer a hand-written list — it is the pinned tree's own
// contents (scripts/docs-publication.mjs explains why) — so the only thing standing
// between a placeholder in core and a confident HTTP 200 over nothing is the floor
// exercised here. It is worth a unit test rather than only an end-to-end one: the
// end-to-end path needs a build and a network-or-checkout source, and a floor that is
// only ever observed at the end of a ten-minute gate is a floor people stop trusting.

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublishable,
  DOCS_SOURCE_TEXT_FLOOR,
  isWithheld,
  WITHHELD
} from "../scripts/docs-publication.mjs";

/** Prose long enough to clear the floor, with nothing else going on. */
const realDocument = `# Remote access\n\n${"Reach the dashboard from another machine. ".repeat(20)}`;

test("a document with real prose publishes", () => {
  assertPublishable("docs/guides/remote-access.md", realDocument);
});

test("a stub is refused, and the failure names the source path", () => {
  // The shape this exists for. Not an empty file — a plausible-looking placeholder that
  // satisfies every frontmatter assertion downstream and renders a blank page.
  assert.throws(
    () => assertPublishable("docs/guides/workflow-templates.md", "# Workflow templates\n\nComing soon.\n"),
    (error) => {
      assert.match(error.message, /docs\/guides\/workflow-templates\.md/);
      assert.match(error.message, /12 characters of prose/);
      assert.match(error.message, new RegExp(`floor ${DOCS_SOURCE_TEXT_FLOOR}`));
      return true;
    }
  );
});

test("an empty document is refused", () => {
  assert.throws(() => assertPublishable("docs/guides/empty.md", ""), /0 characters of prose/);
  assert.throws(() => assertPublishable("docs/guides/title-only.md", "# Title\n"), /characters of prose/);
});

test("a code fence does not count as prose", () => {
  // A snippet dropped into a docs directory is not a document. Counting the fence's
  // contents would let it clear the floor and publish a page with nothing to read.
  const fenceOnly = `# Example\n\n\`\`\`bash\n${"personalclaw gateway --port 10000\n".repeat(30)}\`\`\`\n`;
  assert.ok(fenceOnly.length > DOCS_SOURCE_TEXT_FLOOR * 4, "the fixture must be long enough to clear the floor on raw length");
  assert.throws(() => assertPublishable("docs/reference/snippet.md", fenceOnly), /characters of prose/);
});

test("frontmatter and html comments do not count as prose", () => {
  const commentPadded = `---\ntitle: ${"x".repeat(400)}\n---\n\n# Stub\n\n<!-- ${"y".repeat(400)} -->\n\nSoon.\n`;
  assert.throws(() => assertPublishable("docs/guides/padded.md", commentPadded), /characters of prose/);
});

test("the floor is far below the shortest real document at the pinned commit", () => {
  // Measured 2026-09-23: the shortest of the 33 published documents at v0.1.3 is
  // docs/security/limitations.md at 3,953 characters of prose; the shortest of the 53 on
  // core's default branch is docs/architecture/tool-name-wire.md at 2,335. A floor that
  // crept up towards either would start reddening the build on honest core edits, which
  // is how a floor gets deleted instead of fixed.
  assert.ok(
    DOCS_SOURCE_TEXT_FLOOR < 2335 / 4,
    `the source floor (${DOCS_SOURCE_TEXT_FLOOR}) must stay an order of magnitude below the shortest real document`
  );
});

test("withholding is per source directory and reason-bearing", () => {
  // The research corpus index is the one withheld file: the site publishes its own
  // section index over that tree, so republishing core's would ship two indexes that
  // disagree. See src/prose/research-preface.md.
  assert.equal(isWithheld("research/learnings", "README.md"), true);
  assert.equal(isWithheld("research/learnings", "memory-architectures.md"), false);
  // Keyed by the tree's location in CORE, not on the site. Those differ for this tree,
  // and using the site path would silently withhold nothing.
  assert.equal(isWithheld("research", "README.md"), false);
  assert.equal(isWithheld("guides", "README.md"), false);
});

test("every withheld entry names a directory the site actually publishes", () => {
  // A typo'd key withholds nothing and reads exactly like a working exclusion.
  const trees = new Set(["guides", "reference", "architecture", "security", "research/learnings"]);
  for (const sourceDir of Object.keys(WITHHELD)) {
    assert.ok(
      trees.has(sourceDir),
      `WITHHELD names "${sourceDir}", which is not a published source directory — the ` +
        `exclusion applies to nothing. Check it against TREES in scripts/sync-docs.mjs.`
    );
  }
});
