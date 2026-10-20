// The /compare rows as link targets: /compare#telemetry, from Home's trust rows and FAQ.
//
// Each row's id is its capability key, the `id` it has in src/data/capabilities.json, so a
// link keeps reaching its row when rows move. The rules are scripts/compare-row-ids.mjs;
// validate-compare-render runs them on every build. Here each failure is planted on a page
// carrying what that check reads, rendered from the data the way src/pages/compare.astro
// renders it, and the check is run end to end on a copy of the script with planted data and
// a planted page, so a repeated id is shown to fail the build's own step.

import assert from "node:assert/strict";
import test from "node:test";

import { capabilityMatrix } from "../src/data/capabilities.mjs";
import {
  ROW_ID,
  declaredRowIdProblems,
  renderedRowIdProblems
} from "../scripts/compare-row-ids.mjs";
import { comparePage, compareRun, readData } from "./support/compare-fixtures.mjs";

/** The data with a second copy of the row `id`, as a hand edit that duplicated a row would. */
function withRepeatedRow(data, id) {
  const row = data.rows.find((candidate) => candidate.id === id);
  assert.ok(row, `the data has a ${id} row to repeat`);
  return { ...data, rows: [...data.rows, { ...row }] };
}

// ── the ids the data declares ─────────────────────────────────────────────────────────────

test("every row in the data has an id, usable as a link target, and no two share one", () => {
  const { rows } = readData();
  assert.ok(rows.length >= 8, "the matrix is populated");
  for (const row of rows) assert.match(row.id, ROW_ID, JSON.stringify(row.id));
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.deepEqual(declaredRowIdProblems(rows), []);
});

test("the rows the page renders keep the data's ids, in the data's order", () => {
  const { rows, problems } = capabilityMatrix();
  assert.deepEqual(problems, []);
  assert.deepEqual(
    rows.map((row) => row.id),
    readData().rows.map((row) => row.id)
  );
});

test("a row with no id, an id that is not a link target, and a repeated id are named", () => {
  const { rows } = readData();
  const [first, second, ...rest] = rows;
  const planted = [{ ...first, id: undefined }, { ...second, id: "Telemetry row" }, ...rest, { ...rest[0] }];
  const problems = declaredRowIdProblems(planted);
  assert.equal(problems.length, 3, problems.join("\n"));
  assert.match(problems[0], /^row 1 in src\/data\/capabilities\.json has no id/);
  assert.match(problems[1], /^row id "Telemetry row" is not a usable link target/);
  assert.match(problems[2], new RegExp(`^2 rows in src/data/capabilities\\.json share the id "${rest[0].id}"`));
});

// ── the ids on the page ───────────────────────────────────────────────────────────────────

test("a page whose rows carry their keys as ids passes", () => {
  const data = readData();
  assert.deepEqual(renderedRowIdProblems(comparePage(data), data.rows), []);
});

test("a row rendered with no id is named", () => {
  const data = readData();
  const page = comparePage(data, { rowId: (row) => (row.id === "telemetry" ? null : row.id) });
  assert.deepEqual(renderedRowIdProblems(page, data.rows), [
    "/compare renders row telemetry with no id, so /compare#telemetry lands nowhere"
  ]);
});

test("ids taken from position rather than the key are named, row by row", () => {
  const data = readData();
  const page = comparePage(data, { rowId: (_row, position) => `row-${position}` });
  const problems = renderedRowIdProblems(page, data.rows);
  assert.equal(problems.length, data.rows.length, problems.join("\n"));
  assert.match(problems[0], /^\/compare renders row license with the id "row-1": a row's id is its capability key/);
});

test("two rows rendered with one id are named", () => {
  const data = withRepeatedRow(readData(), "telemetry");
  const problems = renderedRowIdProblems(comparePage(data), data.rows);
  assert.deepEqual(problems, [
    '2 elements on /compare have the id "telemetry", so /compare#telemetry lands on the first of them'
  ]);
});

test("a row id another element on the page also holds is named", () => {
  const data = readData();
  const page = comparePage(data, { extra: '<h2 id="telemetry">Telemetry</h2>' });
  assert.deepEqual(renderedRowIdProblems(page, data.rows), [
    '2 elements on /compare have the id "telemetry", so /compare#telemetry lands on the first of them'
  ]);
});

test("a row's key held by another element while the row has none is named twice", () => {
  const data = readData();
  const page = comparePage(data, {
    rowId: (row) => (row.id === "telemetry" ? null : row.id),
    extra: '<h2 id="telemetry">Telemetry</h2>'
  });
  assert.deepEqual(renderedRowIdProblems(page, data.rows), [
    "/compare renders row telemetry with no id, so /compare#telemetry lands nowhere",
    'the id "telemetry" on /compare is on a <h2>, not on the row telemetry'
  ]);
});

test("any other repeated id on the page is named too", () => {
  const data = readData();
  const page = comparePage(data, { extra: '<p id="how-to-read">again</p>' });
  assert.deepEqual(renderedRowIdProblems(page, data.rows), [
    '2 elements on /compare have the id "how-to-read", so /compare#how-to-read lands on the first of them'
  ]);
});

// ── end to end, through validate-compare-render ──────────────────────────────────────────

test("validate-compare-render passes the data and a page whose rows carry their keys", () => {
  const data = readData();
  const run = compareRun({ data, page: comparePage(data) });
  assert.equal(run.status, 0, run.stderr);
});

test("validate-compare-render fails a row repeated in the data and rendered twice under one id", () => {
  const data = withRepeatedRow(readData(), "telemetry");
  const run = compareRun({ data, page: comparePage(data) });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /2 rows in src\/data\/capabilities\.json share the id "telemetry"/);
  assert.match(run.stderr, /2 elements on \/compare have the id "telemetry"/);
});

test("validate-compare-render fails a page that repeats a row's id on another element", () => {
  const data = readData();
  const run = compareRun({ data, page: comparePage(data, { extra: '<h2 id="telemetry">Telemetry</h2>' }) });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /2 elements on \/compare have the id "telemetry"/);
});

test("validate-compare-render fails rows whose ids are their positions", () => {
  const data = readData();
  const run = compareRun({ data, page: comparePage(data, { rowId: (_row, position) => `row-${position}` }) });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /renders row license with the id "row-1"/);
});
