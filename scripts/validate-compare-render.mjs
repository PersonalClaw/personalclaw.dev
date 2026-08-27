// Prove the capability matrix at /compare actually states something, that it still states
// the unflattering half, and that every row is sourced to the RELEASED version.
//
// THE FAILURE THIS EXISTS TO CATCH. A matrix has the same property a listing has: its
// broken state is indistinguishable from its empty state. Point the page at data it cannot
// read — a renamed key, a schema the rows fail, a normalizer that filters everything — and
// it renders zero rows, looks clean, and every other gate in this repository passes
// VACUOUSLY. The route inventory still matches: /compare is one page either way. The
// sitemap still matches. The metadata contract still passes, because the page has a title.
// The axe scan still passes — nothing is left to be inaccessible. Lighthouse still passes;
// it got faster. /registry hit exactly this shape and carries
// scripts/validate-registry-render.mjs for it, and /compare carries no pixel baseline, so
// no screenshot would catch it either.
//
// THE SECOND FAILURE, specific to this page. Its credibility rests entirely on publishing
// the rows that do NOT hold. A well-meaning edit that drops the `no` rows, or promotes the
// `partial` rows to `yes`, leaves a page that renders perfectly, passes everything above,
// and is a brochure. So this script fails if the matrix stops carrying both.
//
// THE THIRD FAILURE, and the reason this atom exists. A row is only true relative to a
// version. The sibling launch-post work found TEN claim families that hold on core's
// default branch and are false at the released tag — including a field declared with zero
// consumers, which would have shipped an inert control as a security feature. So every
// source link here must point INTO the pinned release. A row silently re-sourced to a
// branch is the exact defect, and it is mechanically detectable: the tag is in the URL.
//
//   npm run validate:compare      # after a build; reads DIST_DIR (default: dist)
//
// It reads src/data/capabilities.json DIRECTLY rather than through
// src/data/capabilities.mjs, because it has to be able to disagree with the normalizer the
// page renders. Sharing that reader would make a normalizer that drops every row look like
// a data file that has no rows.
//
// WHAT IT CANNOT CLOSE. It cannot tell whether a sourced row is TRUE — whether the file it
// cites says what the row says it says. That is a human check with `git show`, and it is
// why every row carries a link and a date rather than only a verdict. What is mechanical
// here is that the matrix is populated, rendered from its own data, still honest about its
// failures, and pinned to a release.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = join(repositoryRoot, "src", "data", "capabilities.json");
const distDirectory = join(repositoryRoot, process.env.DIST_DIR ?? "dist");

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(distDirectory)) {
  console.error(`No build at ${distDirectory} — run \`npm run build\` first.`);
  process.exit(1);
}
if (!existsSync(dataPath)) {
  console.error(`No capability data at ${dataPath}.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const rows = Array.isArray(data.rows) ? data.rows : [];
const groups = Array.isArray(data.groups) ? data.groups : [];
const version = data.release?.version;

const declaredCounts = { yes: 0, partial: 0, no: 0 };
for (const row of rows) {
  if (row?.verdict in declaredCounts) declaredCounts[row.verdict] += 1;
}

// ---------------------------------------------------------------------------
// The vacuity floor for this script itself. Every assertion below is trivially satisfiable
// against an empty matrix, so an empty matrix fails HERE rather than passing quietly
// everywhere else.
//
// Eight rows across three groups, not one and one: a "matrix" of a single row would satisfy
// a naive non-empty check while being useless, and the point of a floor is to sit above the
// degenerate case rather than level with it.
// ---------------------------------------------------------------------------
if (rows.length < 8 || groups.length < 3) {
  console.error(
    `src/data/capabilities.json holds ${rows.length} row(s) in ${groups.length} group(s). ` +
      `/compare needs at least 8 rows across 3 groups to be a capability matrix at all. ` +
      `A page with nothing in it renders clean and passes every other gate in this ` +
      `repository, which is why this check exists.`
  );
  process.exit(1);
}

if (typeof version !== "string" || version === "") {
  console.error("src/data/capabilities.json declares no release.version to pin rows to.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// THE ANTI-FLATTERY FLOOR. The page is only worth publishing while it still says what does
// not work. Losing either state is a silent slide into marketing.
// ---------------------------------------------------------------------------
if (declaredCounts.no === 0) {
  fail(
    `ANTI-FLATTERY: the matrix declares ZERO "no" rows. This page's credibility is that ` +
      `it publishes what does not hold at the release; a matrix where everything passes ` +
      `is a brochure, and would render perfectly.`
  );
}
if (declaredCounts.partial === 0) {
  fail(
    `ANTI-FLATTERY: the matrix declares ZERO "partial" rows. "Narrower than it sounds" is ` +
      `the verdict that exists because a true-but-overstated claim is this project's ` +
      `observed failure mode; losing it means every narrowed claim was rounded up to a yes.`
  );
}

// ---------------------------------------------------------------------------
// The page renders every row, from its own data, sourced to the pin.
// ---------------------------------------------------------------------------
const pagePath = join(distDirectory, "compare", "index.html");
if (!existsSync(pagePath)) {
  fail("/compare was not published — the route is missing from the build");
} else {
  const page = load(readFileSync(pagePath, "utf8"));
  const rendered = page("[data-capability-row]").toArray();

  // THE ANTI-VACUITY FLOOR. Everything below only means something if this holds.
  if (rendered.length === 0) {
    fail(
      `ANTI-VACUITY: /compare rendered ZERO capability rows while ` +
        `src/data/capabilities.json holds ${rows.length} across ${groups.length} groups. ` +
        `An empty matrix from a populated data file is the exact failure this check ` +
        `exists for: the page is reading no data, or data it cannot parse.`
    );
  } else if (rendered.length !== rows.length) {
    fail(`/compare rendered ${rendered.length} rows, the data holds ${rows.length}`);
  }

  if (page("h1").length !== 1) {
    fail(`/compare renders ${page("h1").length} h1 elements, expected exactly 1`);
  }

  for (const group of groups) {
    if (page(`[data-capability-group="${group.id}"]`).length !== 1) {
      fail(`/compare does not render group ${group.id}`);
    }
  }

  for (const row of rows) {
    const node = page(`[data-capability-row="${row.id}"]`);
    if (node.length !== 1) {
      fail(`/compare does not render row ${row.id}`);
      continue;
    }

    if (node.attr("data-capability-verdict") !== row.verdict) {
      fail(
        `/compare renders ${row.id} as "${node.attr("data-capability-verdict")}", the ` +
          `data declares "${row.verdict}"`
      );
    }

    // A row of empty text is as vacuous as no row. Byte-equal against the data, not
    // "contains": a rendered copy that can drift from its source is not a citation.
    const claim = node.find("[data-capability-claim]").text().trim();
    if (claim !== String(row.claim ?? "").trim()) {
      fail(`/compare renders row ${row.id} with claim "${claim}", not the declared one`);
    }
    const statement = node.find("[data-capability-statement]").text().trim();
    if (statement === "") {
      fail(`/compare renders ${row.id} with no statement — a verdict with no finding`);
    } else if (statement !== String(row.statement ?? "").trim()) {
      fail(`/compare renders row ${row.id}'s statement altered from the data`);
    }

    // THE PIN. A row sourced to a branch instead of the release is the defect this whole
    // page is a response to.
    const href = node.find("[data-capability-source]").attr("href");
    if (!href) {
      fail(`/compare renders ${row.id} with NO source link`);
    } else {
      if (href !== row.source_url) {
        fail(`/compare sources ${row.id} to ${href}, the data records ${row.source_url}`);
      }
      if (!href.includes(`/blob/${version}/`)) {
        fail(
          `/compare sources ${row.id} to ${href}, which does not point into the pinned ` +
            `release ${version}. A row sourced to a branch can be true in development and ` +
            `false in the release a reader can actually install.`
        );
      }
    }

    // A narrowed claim must not be able to read as a clean pass.
    if (row.verdict === "partial") {
      const tone = node.find(".verdict").first().attr("class") ?? "";
      if (tone.split(/\s+/).includes("verdict-yes")) {
        fail(`/compare styles the partial row ${row.id} as a pass`);
      }
    }
  }

  // The headline counts are the first thing a reader believes, so they must come from the
  // same rows rather than being maintained beside them.
  for (const verdict of ["yes", "partial", "no"]) {
    const shown = page(`[data-capability-count="${verdict}"] .count-n`).text().trim();
    if (shown !== String(declaredCounts[verdict])) {
      fail(
        `/compare advertises ${shown || "nothing"} "${verdict}" rows but the data holds ` +
          `${declaredCounts[verdict]}`
      );
    }
    if (page(`[data-capability-legend-item="${verdict}"]`).length !== 1) {
      fail(`/compare does not explain what the "${verdict}" verdict means`);
    }
  }
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(data.checked_on ?? "")) {
  fail("src/data/capabilities.json has no ISO checked_on date");
}

if (failures.length > 0) {
  console.error(`Compare render check FAILED:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated the capability matrix: ${rows.length} rows across ${groups.length} groups ` +
      `rendered at /compare, every row sourced into ${version} and byte-equal to its ` +
      `declared claim and statement — ${declaredCounts.yes} holding, ` +
      `${declaredCounts.partial} narrower than stated, ${declaredCounts.no} not in this ` +
      `release. The page still publishes its own failures.`
  );
}
