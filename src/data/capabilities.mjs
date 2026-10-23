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
import sources from "../../sources/personalclaw.sources.json" with { type: "json" };

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
 * @property {SourceType} sourceType
 * @property {string} retrieved
 * @property {string | null} core  the core commit the evidence was read at
 * @property {string | null} apps  the apps commit, where the evidence is in the apps repository
 * @property {string} verifiedRelease  the release this row was last verified against
 * @property {Surface[]} surfaces  every page that shows the row's wording
 * @property {boolean} current  verified against the release this site pins
 *
 * @typedef {object} Matrix
 * @property {Group[]} groups  the groups with their current rows
 * @property {Row[]} rows  every readable row
 * @property {Row[]} current  the rows verified at the pinned release
 * @property {Row[]} knownLimits  the rows verified at an earlier one
 * @property {string[]} problems
 * @property {Record<Verdict, number>} counts  over the current rows
 * @property {any} release
 * @property {{ tag: string, commit: string }} pin
 * @property {any} verdicts
 * @property {string} checkedOn
 *
 * @typedef {"file" | "release-asset" | "attestation" | "workflow-run" | "test"} SourceType
 * @typedef {"compare" | "home" | "security" | "blog"} Surface
 *
 * @typedef {object} Group
 * @property {string} id
 * @property {string} label
 * @property {string} short  the group's name on the filter
 * @property {string} blurb
 * @property {Row[]} rows
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICTS = ["yes", "partial", "no"];
const COMMIT = /^[0-9a-f]{40}$/;
const RELEASE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
export const SOURCE_TYPES = ["file", "release-asset", "attestation", "workflow-run", "test"];
export const SURFACES = ["compare", "home", "security", "blog"];
const CORE_REPOSITORY = "https://github.com/PersonalClaw/PersonalClaw/";
const APPS_REPOSITORY = "https://github.com/PersonalClaw/PersonalClawApps/";

/** The core release this site pins: a row must have been verified against it to be current. */
export const PINNED = Object.freeze({
  tag: sources.sources.core.tag,
  commit: sources.sources.core.commit
});

/** @type {Matrix | null} */
let cached = null;

/**
 * Read one row, or refuse it with the reason. A refused row is COUNTED and surfaced by the
 * caller, never dropped: a row that quietly stops rendering is a claim that quietly stops
 * being checked while the page still looks complete.
 *
 * @param {any} raw
 * @param {{ tag: string }} pin
 * @returns {{ row: Row | null, problem: string | null }}
 */
function readRow(raw, pin) {
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
  // The ledger's fields (SITE-REDESIGN.md section 5, contract 4): what kind of evidence the
  // link is, the exact revision it was read at, and the release the row was last verified
  // against.
  if (!SOURCE_TYPES.includes(raw.source_type)) {
    return refuse(`source_type ${JSON.stringify(raw.source_type)} is not one of ${SOURCE_TYPES.join(", ")}`);
  }
  if (typeof raw.verified_release !== "string" || !RELEASE.test(raw.verified_release)) {
    return refuse("names no release it was last verified against");
  }
  for (const [field, repository] of [["core", CORE_REPOSITORY], ["apps", APPS_REPOSITORY]]) {
    if (raw[field] != null && !COMMIT.test(raw[field])) {
      return refuse(`${field} is not a 40-character commit`);
    }
    if (raw.source_url.startsWith(repository) && raw[field] == null) {
      return refuse(`cites the ${field} repository but names no ${field} commit it was read at`);
    }
  }
  if (
    !Array.isArray(raw.surfaces) ||
    !raw.surfaces.includes("compare") ||
    raw.surfaces.some((surface) => !SURFACES.includes(surface))
  ) {
    return refuse(`surfaces must include "compare" and name only ${SURFACES.join(", ")}`);
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
      sourceType: raw.source_type,
      retrieved: raw.retrieved,
      core: raw.core ?? null,
      apps: raw.apps ?? null,
      verifiedRelease: raw.verified_release,
      surfaces: [...raw.surfaces],
      current: raw.verified_release === pin.tag
    },
    problem: null
  };
}

/**
 * The whole matrix, normalized once and grouped.
 *
 * Throws only when the file is structurally unreadable (no groups, no release pin) or its
 * release block is not the site's pin. An EMPTY row set is reported through `problems` and
 * refused by scripts/validate-compare-render.mjs instead, deliberately: see the note at that
 * branch. `groups` and `counts` hold the current rows only; `knownLimits` holds the rest.
 *
 * @returns {Matrix}
 */
export function capabilityMatrix() {
  if (!cached) cached = buildMatrix(capabilities, PINNED);
  return cached;
}

/**
 * The matrix built from `data` for the release `pin`. capabilityMatrix() is this over the
 * shipped file and the site's pin; tests/ledger.test.mjs hands it planted data.
 *
 * @param {any} capabilities
 * @param {{ tag: string, commit: string }} pin
 * @returns {Matrix}
 */
export function buildMatrix(capabilities, pin) {
  const declaredGroups = (capabilities.groups ?? []).filter(
    (group) => group?.id && group?.label && group?.short && group?.blurb
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
  // The block every current row's link is built under is the site's pin. A re-pin moves it,
  // and each row stays a known limit until it is read again at the new release.
  if (release.version !== pin.tag || release.commit !== pin.commit) {
    throw new Error(
      `src/data/capabilities.json: release is ${release.version} at ${release.commit}, but the ` +
        `site pins core ${pin.tag} at ${pin.commit} (sources/personalclaw.sources.json). Move ` +
        "the release block with the pin."
    );
  }

  const problems = [];
  const rows = [];
  for (const raw of capabilities.rows ?? []) {
    const { row, problem } = readRow(raw, pin);
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

  // A row verified against an older release is not a current claim. It is shown only as a
  // known limit: its claim, and the release it was last checked at, without its wording.
  const current = rows.filter((row) => row.current);
  const knownLimits = rows.filter((row) => !row.current);

  const groups = declaredGroups
    .map((group) => ({
      id: group.id,
      label: group.label,
      short: group.short,
      blurb: group.blurb,
      rows: current.filter((row) => row.group === group.id)
    }))
    .filter((group) => group.rows.length > 0);

  /** @type {Record<Verdict, number>} */
  const counts = { yes: 0, partial: 0, no: 0 };
  for (const row of current) counts[row.verdict] += 1;

  return {
    groups,
    rows,
    current,
    knownLimits,
    problems,
    counts,
    release,
    pin,
    verdicts: capabilities.verdicts ?? {},
    checkedOn: capabilities.checked_on
  };
}

/**
 * One row, for a page other than /compare that shows its wording. It refuses a row that does
 * not name the page in `surfaces`, so the ledger always says where a claim is shown, and a row
 * not verified at the pinned release, so no page states a claim nobody checked there.
 *
 * @param {string} id
 * @param {Surface} surface
 * @param {Matrix} [matrix]
 * @returns {Row}
 */
export function ledgerRow(id, surface, matrix = capabilityMatrix()) {
  const row = matrix.rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`The verification ledger has no row "${id}" (src/data/capabilities.json)`);
  if (!row.surfaces.includes(surface)) {
    throw new Error(
      `Ledger row "${id}" does not name ${surface} in its surfaces, so ${surface} may not show ` +
        "it. Add the surface to the row, or show a row that lists it."
    );
  }
  if (!row.current) {
    throw new Error(
      `Ledger row "${id}" was last verified at ${row.verifiedRelease}, but the site pins ` +
        `${matrix.pin.tag}. Read it again at ${matrix.pin.tag} and move its verified_release ` +
        `before ${surface} shows it.`
    );
  }
  return row;
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
