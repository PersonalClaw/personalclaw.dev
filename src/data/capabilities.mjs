// This module is the ONE normalizer for the capability matrix at /compare. The page
// renders it and scripts/validate-compare-render.mjs checks what the page produced.
//
// .mjs and not .ts on purpose: `node scripts/validate-compare-render.mjs` imports this
// file directly, and a bare node process cannot load TypeScript. Same reason
// src/data/registry.mjs is .mjs — see the note at the top of that file.
//
// THE RULE THIS MODULE ENFORCES IN CODE. The page's whole value is that each row is
// checked against the RELEASED version this site publishes, so a row without a
// `source_url` and an ISO `retrieved` date is REFUSED here rather than rendered. Unlike a
// claim about somebody else's software, a claim about our own has no excuse for being
// unsourced: the file is one `git show` away.
//
// `partial` is a FIRST-CLASS verdict, not a soft yes. It exists because the ten claim
// families the launch post had to cut were not false inventions — they were true readings
// of something real, stated wider than the release supports. A two-state matrix would have
// forced each of those into a `yes` that overclaims or a `no` that undersells, and the
// overclaim is the one that would have been chosen. The narrower truth goes in `statement`.

import capabilities from "./capabilities.json" with { type: "json" };

/**
 * @typedef {"yes" | "partial" | "no"} Verdict
 *
 * @typedef {object} Row
 * @property {string} id
 * @property {string} group
 * @property {string} claim
 * @property {Verdict} verdict
 * @property {string} statement
 * @property {string} sourceLabel
 * @property {string} sourceUrl
 * @property {string} retrieved
 *
 * @typedef {object} Group
 * @property {string} id
 * @property {string} label
 * @property {string} blurb
 * @property {Row[]} rows
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICTS = ["yes", "partial", "no"];

/** @type {{ groups: Group[], rows: Row[], problems: string[], release: any, checkedOn: string, verdicts: any, counts: Record<Verdict, number> } | null} */
let cached = null;

/**
 * Read one row, or refuse it with the reason. A refused row is COUNTED and surfaced by the
 * caller, never dropped: a row that quietly stops rendering is a claim that quietly stops
 * being checked while the page still looks complete.
 *
 * @param {any} raw
 * @returns {{ row: Row | null, problem: string | null }}
 */
function readRow(raw) {
  const label = typeof raw?.id === "string" && raw.id !== "" ? raw.id : "(unnamed row)";
  const refuse = (reason) => ({ row: null, problem: `${label}: ${reason}` });

  if (!raw || typeof raw !== "object") return refuse("is not an object");
  if (typeof raw.id !== "string" || raw.id.trim() === "") return refuse("has no id");
  if (!VERDICTS.includes(raw.verdict)) {
    return refuse(`verdict ${JSON.stringify(raw.verdict)} is not yes, partial or no`);
  }
  if (typeof raw.claim !== "string" || raw.claim.trim() === "") {
    return refuse("states no claim to check");
  }
  // The statement is where a `partial` earns its keep. A verdict with no statement is a
  // score without a finding.
  if (typeof raw.statement !== "string" || raw.statement.trim() === "") {
    return refuse("has a verdict but says nothing about what is actually true");
  }
  if (typeof raw.source_url !== "string" || !raw.source_url.startsWith("https://")) {
    return refuse("has no https source_url — an unsourced claim about our own release");
  }
  if (typeof raw.source_label !== "string" || raw.source_label.trim() === "") {
    return refuse("has a source_url with nothing to label the link");
  }
  if (typeof raw.retrieved !== "string" || !ISO_DATE.test(raw.retrieved)) {
    return refuse("has no ISO retrieved date");
  }
  if (typeof raw.group !== "string" || raw.group.trim() === "") {
    return refuse("belongs to no group");
  }

  return {
    row: {
      id: raw.id.trim(),
      group: raw.group.trim(),
      claim: raw.claim.trim(),
      verdict: raw.verdict,
      statement: raw.statement.trim(),
      sourceLabel: raw.source_label.trim(),
      sourceUrl: raw.source_url.trim(),
      retrieved: raw.retrieved
    },
    problem: null
  };
}

/**
 * The whole matrix, normalized once and grouped.
 *
 * Throws only when the file is structurally unreadable — no groups, no release pin. An
 * EMPTY row set is reported through `problems` and refused by
 * scripts/validate-compare-render.mjs instead, deliberately: see the note at that branch.
 *
 * @returns {{ groups: Group[], rows: Row[], problems: string[], release: any, checkedOn: string, verdicts: any, counts: Record<Verdict, number> }}
 */
export function capabilityMatrix() {
  if (cached) return cached;

  const declaredGroups = (capabilities.groups ?? []).filter(
    (group) => group?.id && group?.label && group?.blurb
  );
  if (declaredGroups.length === 0) {
    throw new Error(
      "src/data/capabilities.json declares no readable groups. A matrix with no groups " +
        "renders as an empty page, which is indistinguishable from a broken one."
    );
  }

  const release = capabilities.release;
  for (const field of ["version", "commit", "repo", "blob_base"]) {
    if (typeof release?.[field] !== "string" || release[field].trim() === "") {
      throw new Error(
        `src/data/capabilities.json: release.${field} is required. Without the pin there ` +
          `is no way to tell whether these rows describe a release or a branch.`
      );
    }
  }
  if (!ISO_DATE.test(capabilities.checked_on ?? "")) {
    throw new Error("src/data/capabilities.json: checked_on must be an ISO date");
  }

  const problems = [];
  const rows = [];
  for (const raw of capabilities.rows ?? []) {
    const { row, problem } = readRow(raw);
    if (row) rows.push(row);
    else problems.push(problem);
  }

  const groupIds = new Set(declaredGroups.map((group) => group.id));
  for (const row of rows) {
    if (!groupIds.has(row.group)) {
      problems.push(`${row.id}: names group "${row.group}", which is not declared`);
    }
  }

  // DELIBERATELY NOT A THROW when `rows` is empty. See scripts/validate-compare-render.mjs:
  // an empty matrix passes the route inventory, the sitemap, the metadata contract, the
  // axe scan and the Lighthouse budgets, because nothing is left to be wrong. Throwing
  // here would red every gate at once and hide which one was meant to catch it.

  const groups = declaredGroups
    .map((group) => ({
      id: group.id,
      label: group.label,
      blurb: group.blurb,
      rows: rows.filter((row) => row.group === group.id)
    }))
    .filter((group) => group.rows.length > 0);

  /** @type {Record<Verdict, number>} */
  const counts = { yes: 0, partial: 0, no: 0 };
  for (const row of rows) counts[row.verdict] += 1;

  cached = {
    groups,
    rows,
    problems,
    counts,
    release,
    verdicts: capabilities.verdicts ?? {},
    checkedOn: capabilities.checked_on
  };
  return cached;
}

/**
 * How a verdict should read.
 *
 * `partial` is given its own tone rather than falling through to either neighbour. A
 * default branch that swallowed it would render every narrowed claim as a clean pass,
 * which is the exact failure this page exists to correct.
 *
 * @param {Verdict} verdict
 * @returns {{ tone: string, label: string }}
 */
export function verdictPresentation(verdict) {
  if (verdict === "yes") return { tone: "verdict-yes", label: "Holds" };
  if (verdict === "partial") return { tone: "verdict-partial", label: "Narrower than it sounds" };
  return { tone: "verdict-no", label: "Not in this release" };
}
