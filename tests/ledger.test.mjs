// The verification ledger (SITE-REDESIGN.md section 5, contract 4): every /compare row carries its
// claim, its wording, its evidence and the evidence's type, the commit it was read at and the
// release it was last verified against, and a row not verified at the pinned release is shown
// only as a known limit, never as a current claim: "Not re-checked for <pinned release>:", then
// the statement it was last verified with and that statement's evidence link (#98).

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatrix, ledgerRow, PINNED } from "../src/data/capabilities.mjs";
import { ledgerProblems } from "../scripts/ledger.mjs";
import { claimOnlyLimit, comparePage, compareRun, knownLimit, readData } from "./support/compare-fixtures.mjs";

const OLDER = "v0.0.1";

/** The shipped ledger with its `telemetry` row moved back to an older release. */
function withStaleTelemetry() {
  const data = readData();
  const row = data.rows.find((candidate) => candidate.id === "telemetry");
  row.verified_release = OLDER;
  row.source_url = row.source_url.replace(`/blob/${PINNED.tag}/`, `/blob/${OLDER}/`);
  return data;
}

test("the shipped ledger meets the contract at the pinned release", () => {
  assert.deepEqual(ledgerProblems(readData(), PINNED), []);
});

test("a row missing a ledger field fails the check", () => {
  for (const field of ["source_type", "verified_release", "core", "surfaces", "statement"]) {
    const data = readData();
    delete data.rows[0][field];
    const problems = ledgerProblems(data, PINNED);
    assert.ok(problems.length > 0, `a row with no ${field} passed`);
    assert.ok(problems.every((problem) => problem.startsWith(`${data.rows[0].id}:`)), problems.join("\n"));
  }
});

test("a row read at another commit than the pin, or linked outside its release, fails", () => {
  const data = readData();
  data.rows[0].core = "0".repeat(40);
  assert.match(ledgerProblems(data, PINNED).join("\n"), /read at core 0{40}/);

  const linked = readData();
  linked.rows[0].source_url = linked.rows[0].source_url.replace(`/blob/${PINNED.tag}/`, "/blob/main/");
  assert.match(ledgerProblems(linked, PINNED).join("\n"), /not under \/blob\//);
});

test("a ledger whose release block is not the pin fails", () => {
  const data = readData();
  data.release.version = OLDER;
  assert.match(ledgerProblems(data, PINNED).join("\n"), /release block is v0\.0\.1/);
});

test("a row verified at an older release is a known limit, not a current claim", () => {
  const matrix = buildMatrix(withStaleTelemetry(), PINNED);
  assert.ok(!matrix.current.some((row) => row.id === "telemetry"));
  assert.deepEqual(matrix.knownLimits.map((row) => row.id), ["telemetry"]);
  assert.ok(!matrix.groups.some((group) => group.rows.some((row) => row.id === "telemetry")));
  const counted = matrix.counts.yes + matrix.counts.partial + matrix.counts.no;
  assert.equal(counted, matrix.current.length);
});

test("Home and /security refuse a stale row, and a row that doesn't list them", () => {
  const stale = buildMatrix(withStaleTelemetry(), PINNED);
  assert.throws(() => ledgerRow("telemetry", "home", stale), /last verified at v0\.0\.1/);

  const shipped = buildMatrix(readData(), PINNED);
  assert.equal(ledgerRow("telemetry", "home", shipped).id, "telemetry");
  assert.throws(() => ledgerRow("telemetry", "security", shipped), /does not name security/);
  assert.throws(() => ledgerRow("no_such_row", "home", shipped), /has no row/);
});

test("a row with no evidence is refused, not rendered", () => {
  const data = readData();
  delete data.rows[0].source_url;
  const matrix = buildMatrix(data, PINNED);
  assert.ok(!matrix.rows.some((row) => row.id === data.rows[0].id));
  assert.match(matrix.problems.join("\n"), /no https source_url/);
});

test("/compare fails when it shows a stale row as a current claim, and passes when it lists it as a known limit", () => {
  const data = withStaleTelemetry();

  const shownAsCurrent = compareRun({ data, page: comparePage(data, { staleAsCurrent: true }) });
  assert.equal(shownAsCurrent.status, 1, shownAsCurrent.stdout);
  assert.match(shownAsCurrent.stderr, /shows telemetry as a current claim/);

  const listed = compareRun({ data, page: comparePage(data) });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /1 more listed as not checked again/);
});

test('a stale row reads "Not re-checked for <pinned release>:", then its last verified statement and its evidence link', () => {
  const data = withStaleTelemetry();
  const lead = new RegExp(`not as the known limit "Not re-checked for ${PINNED.tag.replaceAll(".", "\\.")}: `);

  const settled = compareRun({ data, page: comparePage(data) });
  assert.equal(settled.status, 0, settled.stderr);

  // The form /compare listed it in before #98's ruling: its claim and "last verified at", with
  // no statement.
  const claimOnly = compareRun({ data, page: comparePage(data, { limit: claimOnlyLimit }) });
  assert.equal(claimOnly.status, 1, claimOnly.stdout);
  assert.match(claimOnly.stderr, lead);

  // Each part of the form, missing or wrong on its own.
  const variants = {
    "no lead": (row, tag) => knownLimit(row, tag).replace(/<strong>.*?<\/strong> /, ""),
    "a lead naming the row's own release": (row) => knownLimit(row, row.verified_release),
    "the claim in place of the statement": (row, tag) => knownLimit({ ...row, statement: row.claim }, tag),
    "a link outside the release it was verified at": (row, tag) =>
      knownLimit({ ...row, source_url: row.source_url.replace(`/blob/${OLDER}/`, "/blob/main/") }, tag)
  };
  for (const [name, limit] of Object.entries(variants)) {
    const result = compareRun({ data, page: comparePage(data, { limit }) });
    assert.equal(result.status, 1, `${name} passed: ${result.stdout}`);
    assert.match(result.stderr, /known limit/, name);
  }
});
