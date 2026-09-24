// The published documentation route set, as the sync produced it.
//
// This module is the ONE reader of `.generated/docs-index.json`, which
// scripts/sync-docs.mjs writes from the pinned core commit. tests/support/site-contract.mjs
// derives the contracted `/docs` routes from it, and scripts/validate-build.mjs then
// asserts set equality in both directions against the pages the build actually generated.
//
// It replaces a hand-transcribed list of 33 paths. The reason it is derived is the whole
// point of the docs pipeline: the published set is a function of which release the site
// pins, so when the pin advances to a release carrying documents the previous one did not,
// those documents publish with no code change in this repository. Under the old allow list
// the same pin advance published nothing new, because two hand-maintained lists — not the
// pin — decided the set. See scripts/docs-publication.mjs for the full argument.
//
// WHAT THIS DOES NOT DO, deliberately: it does not fall back to an empty set when the
// artifact is missing. An empty docs route set would make every downstream docs assertion
// pass vacuously — the sitemap check, the metadata sweep, the body floor, the cross-link
// sweep — and a docs site that published nothing would go green. Absence throws.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const artifactPath = path.join(process.cwd(), ".generated", "docs-index.json");

/**
 * @typedef {{ route: string, title: string, source: string }} DocsPage
 * @typedef {{ dir: string, label: string, sourceDir: string, route: string, crossLinked: boolean, pages: DocsPage[] }} DocsTree
 * @typedef {{ repository: string, commit: string, tag: string | null }} DocsSource
 * @typedef {{ schemaVersion: number, core: DocsSource, landing: { route: string, title: string }, trees: DocsTree[] }} DocsIndex
 */

/** @type {DocsIndex | null} */
let cached = null;

/**
 * True when `npm run sync` has produced the docs index.
 *
 * A function rather than a constant, and checked by callers that legitimately run before
 * any sync: `validate:visual-baselines` is the FIRST gate in scripts/run-ci-gates.mjs and
 * imports the route contract for the marketing routes only, so on a clean clone it reads
 * this module before the artifact exists. That is why the docs route set is exposed as a
 * function too — importing the contract must not require a build.
 */
export function docsIndexExists() {
  return existsSync(artifactPath);
}

/**
 * The docs index, read once. Throws when the sync has not run.
 *
 * The return type is declared rather than inferred: `cached` is nullable, so an inferred
 * signature made every caller's property access an `Object is possibly 'null'` error under
 * `astro check`.
 *
 * @returns {DocsIndex}
 */
export function docsIndex() {
  if (cached) return cached;
  if (!docsIndexExists()) {
    throw new Error(
      ".generated/docs-index.json is missing: the published documentation route set is " +
        "derived from the pinned core commit, so it cannot be known before " +
        "`npm run sync` has run. Run `npm run sync` (or `npm run build`, which includes it)."
    );
  }
  const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  if (parsed.schemaVersion !== 1) {
    throw new Error(
      `.generated/docs-index.json declares schemaVersion ${parsed.schemaVersion}; this ` +
        `build reads 1. Regenerate it with \`npm run sync\`.`
    );
  }
  if (!Array.isArray(parsed.trees) || parsed.trees.length === 0) {
    throw new Error(
      ".generated/docs-index.json contains no documentation trees — the sync produced an " +
        "empty corpus, which every docs check downstream would pass vacuously."
    );
  }
  cached = parsed;
  return cached;
}

/**
 * Every published `/docs` path: the docs landing, each section index, and every synced
 * page, in navigation order.
 */
export function docsRoutePaths() {
  const index = docsIndex();
  const paths = [index.landing.route];
  for (const tree of index.trees) {
    paths.push(tree.route);
    for (const page of tree.pages) paths.push(page.route);
  }
  return paths;
}

/**
 * The `/docs` pages whose in-site links are swept individually by
 * scripts/validate-build.mjs: the pages this repository AUTHORS (the landing and the five
 * section indexes, whose links are written here and are therefore this repo's bugs when
 * they break) plus any tree declared `crossLinked` in scripts/sync-docs.mjs, whose synced
 * documents reference each other through the link rewriter.
 *
 * The sweep has a floor on how many links it must find, because a rewriter that silently
 * matched nothing produces pages with no links to break and would otherwise pass clean.
 */
export function crossLinkedDocsRoutePaths() {
  const index = docsIndex();
  const paths = [index.landing.route];
  for (const tree of index.trees) {
    paths.push(tree.route);
    if (tree.crossLinked) for (const page of tree.pages) paths.push(page.route);
  }
  return paths;
}

/** The pinned core source the published corpus was generated from. */
export function docsSource() {
  return docsIndex().core;
}
