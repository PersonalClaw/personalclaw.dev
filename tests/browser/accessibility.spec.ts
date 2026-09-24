import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { docsIndex } from "../../src/data/docs-index.mjs";
import { docsRoutes, qualityRoutes } from "../support/site-contract.mjs";
import { openPage } from "./support";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

for (const route of qualityRoutes) {
  test(`${route.name} has no automated WCAG A or AA violations`, async ({ page }) => {
    await openPage(page, route.path);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });
}

// The docs pages are held to the same bar. They were shipping unchecked: this file
// only iterated the five marketing routes, so /docs — a third of the site's pages,
// with its own theme overrides and its own generated content — had no axe coverage.
// One page per tree is the coverage/runtime trade-off: they share one Starlight
// layout, so a theming or contrast regression shows up on any of them, while the
// per-page content differences (tables, code blocks, headings) are spread across the
// four chosen samples.
const DOCS_SAMPLE = [
  "/docs", // the docs landing: where the header's "Docs" link goes
  "/docs/guides", // a generated section index over a synced tree
  "/docs/guides/getting-started", // prose + tables + code fences
  "/docs/reference/cli", // the largest table-heavy page
  "/docs/architecture/overview", // diagrams and nested lists
  "/docs/security/threat-model", // long-form with many headings
  "/docs/research", // the section index whose prose disclaims its corpus
  "/docs/research/verification-and-judging" // the most cross-linked topic (23 inbound)
];

for (const routePath of DOCS_SAMPLE) {
  test(`${routePath} has no automated WCAG A or AA violations`, async ({ page }) => {
    await openPage(page, routePath);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });
}

test("the docs sample covers every published tree", () => {
  // A new tree in sync-docs.mjs must gain a sample here, or it ships unchecked —
  // exactly the gap this block was added to close.
  //
  // Read off the generated index's tree list rather than parsed out of route strings:
  // `/docs` is itself a published route and has no third path segment, so splitting
  // paths counted it as a tree named `undefined` and the equality could only be
  // satisfied by sampling a page that does not exist.
  const trees = new Set(docsIndex().trees.map((tree) => tree.dir));
  const sampled = new Set(
    DOCS_SAMPLE.filter((p) => p !== "/docs").map((p) => p.split("/")[2])
  );
  expect([...trees].sort()).toEqual([...sampled].sort());
  // The landing is a published page this repository authors, so it is never optional.
  expect(DOCS_SAMPLE).toContain("/docs");
  expect(docsRoutes()).toContain("/docs");
});
