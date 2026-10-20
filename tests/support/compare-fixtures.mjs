// Planted pages for the checks validate-compare-render runs after a build: a /compare page
// rendered from the data the way src/pages/compare.astro renders it, a /product page made of
// the blocks a test hands it, and a run of the script itself on a copy, with both planted.
// tests/compare-row-ids.test.mjs and tests/product-claims.test.mjs share them, so the page a
// test plants is the page the script reads.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataPath = path.join(root, "src", "data", "capabilities.json");

/** src/data/capabilities.json, read fresh, so a test may change its copy. */
export const readData = () => JSON.parse(readFileSync(dataPath, "utf8"));

export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const TONE = { yes: "verdict-yes", partial: "verdict-partial", no: "verdict-no" };
const VERDICTS = ["yes", "partial", "no"];

/**
 * A /compare page with everything validate-compare-render reads, rendered from `data` in the
 * page's group order. `rowId(row, position)` is a row's id attribute, null for none; `extra`
 * is markup added after the groups.
 */
export function comparePage(data, { rowId = (row) => row.id, extra = "" } = {}) {
  const counts = { yes: 0, partial: 0, no: 0 };
  for (const row of data.rows) counts[row.verdict] += 1;
  let position = 0;
  const groups = data.groups.map((group) => {
    const rows = data.rows
      .filter((row) => row.group === group.id)
      .map((row) => {
        position += 1;
        const id = rowId(row, position);
        return [
          `<li class="row"${id == null ? "" : ` id="${escapeHtml(id)}"`}`,
          ` data-capability-row="${escapeHtml(row.id)}" data-capability-verdict="${row.verdict}">`,
          `<p class="verdict ${TONE[row.verdict]}">${row.verdict}</p>`,
          `<h3 data-capability-claim>${escapeHtml(row.claim)}</h3>`,
          `<p class="statement" data-capability-statement>${escapeHtml(row.statement)}</p>`,
          `<a class="source" data-capability-source href="${escapeHtml(row.source_url)}">`,
          `${escapeHtml(row.source_label)}</a></li>`
        ].join("");
      });
    return (
      `<section data-capability-group="${group.id}">` +
      `<h2 id="group-${group.id}">${escapeHtml(group.label)}</h2>` +
      `<ul>${rows.join("")}</ul></section>`
    );
  });
  return [
    '<!doctype html><html lang="en"><body><main id="main-content">',
    "<h1>What it does</h1>",
    `<ul>${VERDICTS.map((verdict) => `<li data-capability-count="${verdict}"><span class="count-n">${counts[verdict]}</span></li>`).join("")}</ul>`,
    `<section><h2 id="how-to-read">How to read a verdict</h2><dl>${VERDICTS.map((verdict) => `<div data-capability-legend-item="${verdict}"><dt>${verdict}</dt><dd></dd></div>`).join("")}</dl></section>`,
    ...groups,
    extra,
    "</main></body></html>"
  ].join("\n");
}

/** A /product page: a header and footer outside `main`, and `sections` inside it. */
export function productPage(sections, { header = "", footer = "" } = {}) {
  return [
    '<!doctype html><html lang="en"><body>',
    `<header>${header}</header>`,
    '<main id="main-content">',
    ...sections,
    "</main>",
    `<footer>${footer}</footer>`,
    "</body></html>"
  ].join("\n");
}

/** A /product page that cites a row for the one claim it makes, so it passes. */
export const citingProductPage = productPage([
  '<section class="product-cta"><p>No analytics, no crash reporting and no usage reporting.</p>' +
    '<p><a class="text-link" href="/compare#telemetry">What it sends</a></p></section>'
]);

/**
 * validate-compare-render run on a copy of itself, with `data`, the /compare `page` and the
 * /product page planted; `product: null` plants no /product page.
 */
export function compareRun({ data, page, product = citingProductPage }) {
  const scratch = path.join(root, ".generated");
  mkdirSync(scratch, { recursive: true });
  const copy = mkdtempSync(path.join(scratch, "compare-render-test-"));
  try {
    for (const directory of ["scripts", "src/data", "dist/compare", "dist/product"]) {
      mkdirSync(path.join(copy, directory), { recursive: true });
    }
    for (const file of [
      "scripts/validate-compare-render.mjs",
      "scripts/compare-row-ids.mjs",
      "scripts/product-claims.mjs",
      "scripts/llms-lead.mjs"
    ]) {
      copyFileSync(path.join(root, file), path.join(copy, file));
    }
    symlinkSync(path.join(root, "node_modules"), path.join(copy, "node_modules"), "dir");
    writeFileSync(path.join(copy, "src", "data", "capabilities.json"), `${JSON.stringify(data, null, 2)}\n`);
    writeFileSync(path.join(copy, "dist", "compare", "index.html"), page);
    if (product !== null) writeFileSync(path.join(copy, "dist", "product", "index.html"), product);

    return spawnSync(process.execPath, [path.join(copy, "scripts", "validate-compare-render.mjs")], {
      encoding: "utf8",
      env: { ...process.env, DIST_DIR: "dist" }
    });
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
