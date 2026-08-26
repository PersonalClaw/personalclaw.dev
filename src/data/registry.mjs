// The community app registry as this website renders it.
//
// This module is the ONE normalizer. The pages render it, tests/support/site-contract.mjs
// derives the per-app route set from it, and scripts/validate-registry-render.mjs checks
// it. A second parser would be a second place for a pre-install consent surface to
// disagree with itself.
//
// Its input is .generated/registry.json, written by scripts/sync-registry.mjs from the
// pinned core commit and gitignored (see that script for why nothing is committed).
//
// WHAT THIS SURFACE PROMISES A READER, and therefore what the rules below protect:
//
//   1. Permissions are the registry's `permissions_declared`, rendered VERBATIM. They
//      are never summarised, grouped, scored, or translated into a friendlier word.
//      The reader is deciding whether to trust an app; a paraphrase is a claim the
//      registry did not make.
//   2. An ABSENT scan verdict is not a passing one. `last_scan_verdict` is optional and
//      CI-owned, so most listings legitimately have none — and "no scan on record" must
//      be visibly distinct from "clean", never merely quieter. Only the exact value
//      "clean" is presented as passing; anything unrecognised is presented as blocking.
//   3. No trust signal is invented. Every field on the page is a registry field.
//   4. A row this file cannot read is NOT rendered, and the page says how many it
//      dropped. Fail-closed, but never silently: a swallowed row is an app that exists
//      and is not shown, which the reader would have no way to know.

import { readFileSync } from "node:fs";
import path from "node:path";

const artifactPath = path.join(process.cwd(), ".generated", "registry.json");

/** @type {ReturnType<typeof buildListing> | null} */
let cached = null;

/**
 * The verdict values the registry schema defines. Everything outside this set — a typo,
 * a value added by a newer registry than this build knows about, a hand-edited row — is
 * presented as blocking, because the alternative is presenting an unknown string as if
 * it were reassuring.
 */
const VERDICT_PRESENTATION = {
  clean: {
    key: "clean",
    label: "Clean",
    tone: "pass",
    detail: "The last recorded scan found nothing."
  },
  low: {
    key: "low",
    label: "Low",
    tone: "caution",
    detail: "The last recorded scan raised low-severity findings."
  },
  warning: {
    key: "warning",
    label: "Warning",
    tone: "caution",
    detail: "The last recorded scan raised findings worth reading before installing."
  },
  dangerous: {
    key: "dangerous",
    label: "Dangerous",
    tone: "blocked",
    detail: "The last recorded scan found dangerous behaviour. Do not install this."
  }
};

const UNSCANNED = {
  key: "unscanned",
  label: "No scan on record",
  tone: "unscanned",
  detail:
    "This listing carries no scan verdict. It has not been reviewed — treat it as unscanned, not as clean."
};

/**
 * How to present a listing's `last_scan_verdict`.
 *
 * @param {unknown} verdict the raw registry value, which is legitimately absent
 */
export function verdictPresentation(verdict) {
  if (verdict === undefined || verdict === null) return UNSCANNED;
  if (typeof verdict === "string" && verdict in VERDICT_PRESENTATION) {
    return VERDICT_PRESENTATION[/** @type {keyof VERDICT_PRESENTATION} */ (verdict)];
  }
  return {
    key: "unrecognised",
    label: "Unrecognised verdict",
    tone: "blocked",
    detail:
      "The registry recorded a scan verdict this site does not recognise. It is not a pass."
  };
}

/** The site path for one listing. */
export function registryAppPath(name) {
  return `/registry/${name}`;
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Read one registry row, or say why it cannot be read.
 *
 * The checks are structural — enough to know the row is renderable and that its
 * security-relevant fields are really the shapes the schema promises. The registry's
 * own CI (core's scratch/registry/validate_registry.py) owns semantic validation such
 * as the capability-type enum; re-deriving that list here would be a second copy of it.
 *
 * @param {unknown} row
 * @param {number} index
 */
function readRow(row, index) {
  const reject = (reason) => ({ app: null, problem: { index, reason } });

  if (typeof row !== "object" || row === null) return reject("the entry is not an object");
  const entry = /** @type {Record<string, unknown>} */ (row);

  // Kebab-case, per the schema, and load-bearing beyond validation: the name is the
  // per-app URL segment, so a row with a name outside this shape must not mint a route.
  if (typeof entry.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) {
    return reject("the app name is missing or is not kebab-case");
  }
  const name = entry.name;

  if (typeof entry.repo !== "string" || !entry.repo.startsWith("https://")) {
    return reject(`${name}: the repository URL is missing or is not https`);
  }
  if (!isStringArray(entry.types) || entry.types.length === 0) {
    return reject(`${name}: the declared capability types are missing`);
  }
  // Not "missing or empty": an app declaring NO permissions is a real, and the best
  // possible, listing. Only a wrong shape is a problem.
  if (!isStringArray(entry.permissions_declared)) {
    return reject(`${name}: the declared permissions are not a list of names`);
  }
  if (!nonEmptyString(entry.license)) return reject(`${name}: the license is missing`);
  if (!nonEmptyString(entry.maintainer)) return reject(`${name}: the maintainer is missing`);
  if (!nonEmptyString(entry.added)) return reject(`${name}: the added date is missing`);

  return {
    problem: null,
    app: {
      name,
      repo: entry.repo,
      types: entry.types,
      permissions: entry.permissions_declared,
      license: entry.license,
      maintainer: entry.maintainer,
      added: entry.added,
      lastValidated: nonEmptyString(entry.last_validated)
        ? /** @type {string} */ (entry.last_validated)
        : null,
      verdict: verdictPresentation(entry.last_scan_verdict),
      path: registryAppPath(name)
    }
  };
}

/**
 * Normalize a raw registry document into what the pages render.
 *
 * @param {unknown} registry the `{ apps: [...] }` document
 */
export function normalizeRegistry(registry) {
  const rows =
    typeof registry === "object" && registry !== null && Array.isArray(
      /** @type {Record<string, unknown>} */ (registry).apps
    )
      ? /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (registry).apps)
      : null;

  if (rows === null) {
    return {
      apps: [],
      problems: [{ index: -1, reason: "the registry document has no `apps` list" }]
    };
  }

  const apps = [];
  const problems = [];
  for (const [index, row] of rows.entries()) {
    const { app, problem } = readRow(row, index);
    if (app) apps.push(app);
    else if (problem) problems.push(problem);
  }
  // Alphabetical, so the order on the page is a property of the data rather than of
  // whatever order a registry pull request happened to append in.
  apps.sort((left, right) => left.name.localeCompare(right.name));
  return { apps, problems };
}

/**
 * THREE STATES, rendered differently on purpose. Collapsing any pair of them would make
 * the page lie by omission:
 *
 *   absent-at-pin  the released core this site is generated from has no registry file
 *                  at all (true today: the registry landed after v0.1.3). "There is no
 *                  registry here yet."
 *   empty          the registry exists and lists nothing. "The registry is open and
 *                  nothing has been accepted into it yet."
 *   listed         one or more listings. Cards.
 *
 * The first two look identical if you only count cards, which is exactly how a
 * generator written against today's registry ships broken and tests clean.
 */
function buildListing(artifact) {
  const available = (artifact.availability?.status ?? "present") === "present";
  const { apps, problems } = available
    ? normalizeRegistry(artifact.registry)
    : { apps: [], problems: [] };
  return {
    source: artifact.source,
    generatedAt: artifact.generatedAt,
    availability: artifact.availability ?? { status: "present" },
    state: !available ? "absent-at-pin" : apps.length === 0 ? "empty" : "listed",
    apps,
    problems,
    readmes: artifact.readmes ?? {}
  };
}

/**
 * The synced registry listing.
 *
 * Throws when the artifact is absent. That is deliberate: a missing artifact would
 * otherwise render an empty page that looks exactly like an empty registry, and every
 * check over it would pass while measuring nothing.
 */
export function registryListing() {
  if (cached) return cached;
  let raw;
  try {
    raw = readFileSync(artifactPath, "utf8");
  } catch {
    throw new Error(
      `Missing ${path.relative(process.cwd(), artifactPath)}. Run \`npm run sync\` ` +
        `(scripts/sync-registry.mjs) before building: an absent registry artifact ` +
        `renders identically to an empty registry, so it must fail instead.`
    );
  }
  cached = buildListing(JSON.parse(raw));
  return cached;
}

/** Whether the registry artifact has been synced yet. */
export function registryArtifactExists() {
  try {
    readFileSync(artifactPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * The README captured for one listing, in the shape scripts/sync-registry.mjs records:
 * either `{ status: "fetched", url, text }` or a status plus a reason to show instead.
 */
export function readmeFor(name) {
  const entry = registryListing().readmes[name];
  if (!entry) {
    return {
      status: "unavailable",
      reason: "No README was captured for this listing."
    };
  }
  return entry;
}
