// The verification ledger's rules (SITE-REDESIGN.md section 5, contract 4), over the data file
// itself. src/data/capabilities.json is the ledger: each row is a claim, its wording (the row's
// `statement`, the exact text a page shows), its evidence (source_type, source_label,
// source_url), the core or apps commit the evidence was read at, the release it was last
// verified against, and the pages that show it (`surfaces`).
//
// scripts/validate-compare-render.mjs runs these after a build, and tests/ledger.test.mjs runs
// them on planted data. They read the JSON directly rather than through
// src/data/capabilities.mjs, so they can disagree with the normalizer the pages render.

export const SOURCE_TYPES = ["file", "release-asset", "attestation", "workflow-run", "test"];
export const SURFACES = ["compare", "home", "security"];
const COMMIT = /^[0-9a-f]{40}$/;
const RELEASE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
const REPOSITORIES = {
  core: "https://github.com/PersonalClaw/PersonalClaw/",
  apps: "https://github.com/PersonalClaw/PersonalClawApps/"
};

/**
 * Every way the ledger falls short of the contract, for the release `pin`.
 *
 * @param {any} data  src/data/capabilities.json
 * @param {{ tag: string, commit: string }} pin  the core release the site pins
 * @returns {string[]}
 */
export function ledgerProblems(data, pin) {
  const problems = [];
  const release = data?.release ?? {};
  if (release.version !== pin.tag || release.commit !== pin.commit) {
    problems.push(
      `the ledger's release block is ${release.version} at ${release.commit}, but the site pins ` +
        `core ${pin.tag} at ${pin.commit}`
    );
  }

  for (const row of data?.rows ?? []) {
    const id = row?.id ?? "(unnamed row)";
    if (!SOURCE_TYPES.includes(row?.source_type)) {
      problems.push(`${id}: source_type ${JSON.stringify(row?.source_type)} is not one of ${SOURCE_TYPES.join(", ")}`);
    }
    if (typeof row?.source_url !== "string" || !row.source_url.startsWith("https://")) {
      problems.push(`${id}: has no https evidence link`);
    }
    if (typeof row?.statement !== "string" || row.statement.trim() === "") {
      problems.push(`${id}: has no wording`);
    }
    if (typeof row?.verified_release !== "string" || !RELEASE.test(row.verified_release)) {
      problems.push(`${id}: names no release it was last verified against`);
    }
    for (const [field, repository] of Object.entries(REPOSITORIES)) {
      if (row?.[field] != null && !COMMIT.test(row[field])) {
        problems.push(`${id}: ${field} is not a 40-character commit`);
      }
      if (String(row?.source_url ?? "").startsWith(repository) && row?.[field] == null) {
        problems.push(`${id}: cites the ${field} repository but names no ${field} commit`);
      }
    }
    // A row verified at the pinned release was read at the pinned commit, and links into the tag.
    if (row?.verified_release === pin.tag) {
      if (String(row?.source_url ?? "").startsWith(REPOSITORIES.core) && row.core !== pin.commit) {
        problems.push(`${id}: verified at ${pin.tag} but read at core ${row.core}, not ${pin.commit}`);
      }
    }
    const linkRelease = row?.verified_release;
    if (linkRelease && String(row?.source_url ?? "").startsWith(REPOSITORIES.core)) {
      if (!row.source_url.includes(`/blob/${linkRelease}/`)) {
        problems.push(`${id}: verified at ${linkRelease} but its evidence link is not under /blob/${linkRelease}/`);
      }
    }
    if (
      !Array.isArray(row?.surfaces) ||
      !row.surfaces.includes("compare") ||
      row.surfaces.some((surface) => !SURFACES.includes(surface))
    ) {
      problems.push(`${id}: surfaces must include "compare" and name only ${SURFACES.join(", ")}`);
    }
  }
  return problems;
}

/**
 * The rows a page may show as current claims: verified at the pinned release.
 *
 * @param {any[]} rows
 * @param {{ tag: string }} pin
 */
export function currentRows(rows, pin) {
  return rows.filter((row) => row.verified_release === pin.tag);
}
