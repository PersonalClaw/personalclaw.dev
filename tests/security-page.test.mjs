// /security as the build renders it, held to src/data/security.json and the pinned release.
//
// The rules are scripts/security-page.mjs; validate-security-render runs them on every build.
// Here each failure is planted on the real data, or on a page carrying what the check reads,
// built from the data the way src/pages/security.astro renders it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BOUNDARY_COLUMNS,
  declaredSecurityProblems,
  limitationAnchors,
  renderedSecurityProblems
} from "../scripts/security-page.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const data = readJson("src/data/security.json");
const compareRows = readJson("src/data/capabilities.json").rows;
const { repository, tag } = readJson("sources/personalclaw.sources.json").sources.core;
const pins = { repository, tag, compareRows };

const copy = (value) => JSON.parse(JSON.stringify(value));

/** The page the check reads, as src/pages/security.astro renders the data: limits, table, controls. */
function page(from = data, { controlsFirst = false, columns = BOUNDARY_COLUMNS, release = tag } = {}) {
  const limits = `<section id="limits"><p>Verified against ${release}.</p><ul>${from.limits
    .map((limit) => `<li data-limit="${limit.id}">${limit.statement}</li>`)
    .join("")}</ul></section>`;
  const table = `<table data-boundaries><thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${from.boundaries
    .map(
      (boundary) =>
        `<tr data-boundary="${boundary.id}"><th>${boundary.name}</th><td>${boundary.responsibility}</td><td>${boundary.status}</td>` +
        `<td><a href="${boundary.evidence_url}">${boundary.evidence_label}</a></td><td><a href="${boundary.limit_href}">${boundary.limit}</a></td></tr>`,
    )
    .join("")}</tbody></table>`;
  const controls = `<section id="controls"><ul>${from.controls
    .map((control) => `<li data-control="${control.id}"><h3>${control.name}</h3><a href="${control.source_url}">${control.source_label}</a></li>`)
    .join("")}</ul></section>`;
  return `<main>${table}${controlsFirst ? controls + limits : limits + controls}</main>`;
}

const limitationIds = new Set(limitationAnchors(data));
const rendered = (html, from = data) => renderedSecurityProblems(html, from, { repository, tag, limitationIds });

// ── what the data declares ────────────────────────────────────────────────────────────────

test("the data cites every control and boundary at the pinned tag, and every limit still holds as one", () => {
  assert.deepEqual(declaredSecurityProblems(data, pins), []);
  assert.ok(data.controls.length >= 7, "the controls are populated");
  assert.ok(data.limits.length >= 5, "the limits are populated");
});

test("a control with no source, or one cited on a branch, is refused", () => {
  const unsourced = copy(data);
  delete unsourced.controls[0].source_url;
  assert.match(declaredSecurityProblems(unsourced, pins).join("\n"), /has no source link/);
  const branch = copy(data);
  branch.controls[1].source_url = branch.controls[1].source_url.replace(`/blob/${tag}/`, "/blob/main/");
  assert.match(declaredSecurityProblems(branch, pins).join("\n"), /is not under/);
});

test("data read at another release than the pin is refused", () => {
  assert.match(declaredSecurityProblems({ ...copy(data), release: "v0.1.0" }, pins).join("\n"), /re-read every row/);
});

test("a limit whose /compare row now holds, or is gone, is no longer a limit", () => {
  const holds = copy(data);
  holds.limits[2].compare = "auth_default";
  assert.match(declaredSecurityProblems(holds, pins).join("\n"), /whose verdict is yes/);
  const gone = copy(data);
  gone.boundaries[0].limit_href = "/compare#renamed_row";
  assert.match(declaredSecurityProblems(gone, pins).join("\n"), /which is no row/);
  const elsewhere = copy(data);
  elsewhere.limits[0].href = "https://example.com/limits";
  assert.match(declaredSecurityProblems(elsewhere, pins).join("\n"), /a limit's source is/);
});

test("the Network view is drawn as a hub on the gateway, so no crossing reads as passing through another", () => {
  // Drawn as a line, the Network view put the egress guard between an app and the internet: an
  // app's backend traffic, which never passes the guard, read as if it did.
  const line = copy(data);
  delete line.views.find((view) => view.id === "network").layout;
  assert.match(declaredSecurityProblems(line, pins).join("\n"), /network view is drawn as a line/);
  const nowhere = copy(data);
  nowhere.views.find((view) => view.id === "network").hub = "gateway";
  assert.match(declaredSecurityProblems(nowhere, pins).join("\n"), /hub gateway is none of its zones/);
});

// ── what the page renders ─────────────────────────────────────────────────────────────────

test("a page rendered from the data passes", () => {
  assert.deepEqual(rendered(page()), []);
});

test("a control that links no file is refused, as the numbered grid's cards were", () => {
  const html = page().replace(/<li data-control="task-modes">.*?<\/li>/, '<li data-control="task-modes"><h3>Task modes</h3></li>');
  assert.match(rendered(html).join("\n"), /the control task-modes on \/security links no file/);
});

test("limits after the controls, or not naming the release, are refused", () => {
  assert.match(rendered(page(data, { controlsFirst: true })).join("\n"), /puts its controls before its known limits/);
  assert.match(rendered(page(data, { release: "the latest release" })).join("\n"), /do not name the release/);
});

test("a boundary table short of a column, or of a row, is refused", () => {
  assert.match(rendered(page(data, { columns: BOUNDARY_COLUMNS.slice(0, 4) })).join("\n"), /columns are/);
  const fewer = copy(data);
  fewer.boundaries.pop();
  assert.match(rendered(page(fewer), data).join("\n"), /the boundary table's rows are/);
});

test("a limit pointing at a section the limitations page does not have is refused", () => {
  const problems = renderedSecurityProblems(page(), data, { repository, tag, limitationIds: new Set() });
  assert.match(problems.join("\n"), /is no section of the limitations page/);
});
