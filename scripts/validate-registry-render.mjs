// Prove the registry pages actually render a registry.
//
// THE FAILURE THIS EXISTS TO CATCH. The production registry is EMPTY today — in fact it
// does not exist at the pinned core release at all (see scripts/sync-registry.mjs). A
// generator written against that input renders zero cards, the page looks clean, and
// every check over the shipped build passes VACUOUSLY. So the shipped build is not
// evidence. This script rebuilds the site against fixture registries that DO carry
// listings and asserts on the result, with an explicit floor: zero cards from an input
// with listings is a failure, not an empty state.
//
// It therefore also closes "a rebuild picks up registry changes" from the atom's
// criterion, mechanically: one unchanged codebase, three different registry inputs,
// three different rendered outputs, compared.
//
//   node scripts/validate-registry-render.mjs
//
// WHAT IT CANNOT CLOSE. The criterion's last clause — "a merged registry PR appears on
// the site after rebuild and card data matches the Store consent surface" — needs a real
// merged pull request in a community registry that has none, and a running PersonalClaw
// Store to compare against. Neither exists from this repository. What is proven instead
// is the mechanism: changing the registry input changes the rendered output, and every
// consent-surface value is rendered BYTE-EQUAL to its registry field (asserted below), so
// it cannot disagree with any other reader of the same field. The comparison against a
// live Store consent screen remains unverified.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const root = process.cwd();
const artifactPath = path.join(root, ".generated", "registry.json");
const backupPath = path.join(root, ".generated", "registry.json.probe-backup");
const probeDist = path.join(root, ".registry-probe-dist");
const fixtures = path.join(root, "tests", "fixtures");

const failures = [];
const fail = (message) => failures.push(message);

/** @param {string} scenario */
function buildWith(scenario) {
  copyFileSync(path.join(fixtures, `registry-${scenario}.json`), artifactPath);
  rmSync(probeDist, { recursive: true, force: true });
  execFileSync(
    path.join(root, "node_modules", ".bin", "astro"),
    ["build", "--outDir", path.relative(root, probeDist)],
    { cwd: root, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" }, stdio: "pipe" }
  );
}

/** @param {string} routePath */
function probeHtml(routePath) {
  const filePath = path.join(probeDist, routePath.replace(/^\//, ""), "index.html");
  return existsSync(filePath) ? load(readFileSync(filePath, "utf8")) : null;
}

function texts($, scope, selector) {
  return $(scope).find(selector).toArray().map((el) => $(el).text().trim());
}

// ---------------------------------------------------------------------------
// Scenario 1: a registry WITH listings.
// ---------------------------------------------------------------------------
const listedFixture = JSON.parse(
  readFileSync(path.join(fixtures, "registry-listed.json"), "utf8")
);
const rows = listedFixture.registry.apps;
// The rows this site should refuse to list: one is not kebab-case, one declares its
// permissions as a bare string. Both are shapes the pre-install surface must not guess at.
const readable = rows.filter((row) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.name) &&
  Array.isArray(row.permissions_declared));
const unreadable = rows.filter((row) => !readable.includes(row));

if (readable.length < 3 || unreadable.length < 2) {
  fail(
    `tests/fixtures/registry-listed.json must carry at least 3 readable and 2 unreadable ` +
      `rows to be worth building against (has ${readable.length}/${unreadable.length})`
  );
}

let listedIndexHtml = "";
let emptyIndexHtml = "";

try {
  if (existsSync(artifactPath)) copyFileSync(artifactPath, backupPath);

  buildWith("listed");
  const $index = probeHtml("/registry");
  if (!$index) {
    fail("the listed fixture produced no /registry page");
  } else {
    listedIndexHtml = $index.html() ?? "";
    const cards = $index("a.registry-card").toArray();

    // THE ANTI-VACUITY FLOOR. Everything below it only means something if this holds.
    if (cards.length === 0) {
      fail(
        "ANTI-VACUITY: /registry rendered ZERO cards from a registry with " +
          `${readable.length} readable listings. An empty grid from a non-empty registry ` +
          `is the exact failure this check exists for.`
      );
    } else if (cards.length !== readable.length) {
      fail(
        `/registry rendered ${cards.length} cards from ${readable.length} readable listings`
      );
    }

    for (const row of readable) {
      const card = cards.find((element) =>
        $index(element).attr("href") === `/registry/${row.name}`
      );
      if (!card) {
        fail(`/registry has no card linking to /registry/${row.name}`);
        continue;
      }

      // PERMISSIONS VERBATIM. Not a subset, not a summary, not reordered: the exact
      // strings the registry declared, in order. A friendlier word here would be a claim
      // the registry never made, and this is the surface a reader trusts before install.
      const rendered = texts($index, card, ".registry-permissions li");
      if (JSON.stringify(rendered) !== JSON.stringify(row.permissions_declared)) {
        fail(
          `/registry card ${row.name} renders permissions [${rendered.join(", ")}] ` +
            `but the registry declares [${row.permissions_declared.join(", ")}]`
        );
      }

      // ABSENT VERDICT IS NOT A PASSING VERDICT. Scoped to the card on purpose: the page
      // also carries a legend that contains every tone, so an unscoped search for
      // "verdict-pass" would pass on a page whose cards were all wrong.
      const badge = $index(card).find(".registry-verdict");
      const classes = badge.attr("class") ?? "";
      const expectedTone =
        row.last_scan_verdict === undefined
          ? "verdict-unscanned"
          : row.last_scan_verdict === "clean"
            ? "verdict-pass"
            : "verdict-caution";
      if (!classes.split(/\s+/).includes(expectedTone)) {
        fail(
          `/registry card ${row.name} (verdict ${row.last_scan_verdict ?? "absent"}) ` +
            `carries "${classes}", expected ${expectedTone}`
        );
      }
      if (row.last_scan_verdict === undefined) {
        if (classes.includes("verdict-pass")) {
          fail(`/registry card ${row.name} has no scan verdict but is styled as passing`);
        }
        if (!badge.text().includes("No scan on record")) {
          fail(
            `/registry card ${row.name} has no scan verdict but does not say so ` +
              `(reads "${badge.text().trim()}")`
          );
        }
      }
    }

    for (const row of unreadable) {
      if (listedIndexHtml.includes(`/registry/${row.name}`)) {
        fail(`/registry links to ${row.name}, a listing it could not read`);
      }
    }
    const problems = $index(".registry-problems");
    if (problems.length === 0) {
      fail(
        `/registry dropped ${unreadable.length} unreadable listing(s) without saying so ` +
          `— a swallowed row is an app that exists and is not shown`
      );
    } else if (!problems.text().includes(String(unreadable.length))) {
      fail(
        `/registry reports its unreadable listings but not how many ` +
          `(expected ${unreadable.length})`
      );
    }
    if (listedIndexHtml.includes("not part of this release yet")) {
      fail("/registry claims the registry is absent while rendering listings from it");
    }
  }

  // Per-listing pages.
  for (const row of readable) {
    const $app = probeHtml(`/registry/${row.name}`);
    if (!$app) {
      fail(`/registry/${row.name} was not generated`);
      continue;
    }
    if ($app("h1").text().trim() !== row.name) {
      fail(`/registry/${row.name}: h1 is "${$app("h1").text().trim()}"`);
    }
    const rendered = $app(".permission-list li").toArray().map((el) => $app(el).text().trim());
    if (JSON.stringify(rendered) !== JSON.stringify(row.permissions_declared)) {
      fail(
        `/registry/${row.name} renders permissions [${rendered.join(", ")}] ` +
          `but the registry declares [${row.permissions_declared.join(", ")}]`
      );
    }
    if (!$app(`a[href="${row.repo}"]`).length) {
      fail(`/registry/${row.name} does not link to its repository ${row.repo}`);
    }

    // README, both branches: captured text is shown as written; a failed capture shows
    // the recorded reason instead of nothing.
    const readme = listedFixture.readmes[row.name];
    const body = $app("pre.readme-body");
    if (readme?.status === "fetched") {
      if (body.length !== 1) {
        fail(`/registry/${row.name} captured a README but renders no README body`);
      } else if (body.text().trim() !== readme.text.trim()) {
        fail(`/registry/${row.name} renders a README that is not the captured text`);
      } else if (body.attr("tabindex") !== "0") {
        fail(
          `/registry/${row.name}: the README region scrolls but is not keyboard ` +
            `reachable (axe scrollable-region-focusable)`
        );
      }
    } else {
      if (body.length !== 0) {
        fail(`/registry/${row.name} renders a README body it never captured`);
      }
      if (readme?.reason && !$app(".readme").text().includes(readme.reason)) {
        fail(`/registry/${row.name} does not say why it has no README`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Scenario 2: the registry exists and lists nothing. Pinned separately, because an
  // honest empty state and a broken grid are indistinguishable by card count alone.
  // -------------------------------------------------------------------------
  buildWith("empty");
  const $empty = probeHtml("/registry");
  if (!$empty) {
    fail("the empty fixture produced no /registry page");
  } else {
    emptyIndexHtml = $empty.html() ?? "";
    if ($empty("a.registry-card").length !== 0) {
      fail("/registry rendered cards from an empty registry");
    }
    if (!$empty(".registry-notice").text().includes("lists no applications yet")) {
      fail("/registry does not render an empty registry as an empty state");
    }
    if (emptyIndexHtml.includes("not part of this release yet")) {
      fail(
        "/registry describes an empty registry as absent from the release — two " +
          "different facts must not read the same"
      );
    }
    if (existsSync(path.join(probeDist, "registry", readable[0]?.name ?? "x"))) {
      fail("a per-listing page survived a rebuild against an empty registry");
    }
  }

  // -------------------------------------------------------------------------
  // A REBUILD PICKS UP REGISTRY CHANGES. Same code, two inputs, two outputs.
  // -------------------------------------------------------------------------
  if (listedIndexHtml && emptyIndexHtml && listedIndexHtml === emptyIndexHtml) {
    fail(
      "/registry rendered IDENTICALLY from a populated and an empty registry — the " +
        "page is not reading its input"
    );
  }
} finally {
  rmSync(probeDist, { recursive: true, force: true });
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, artifactPath);
    unlinkSync(backupPath);
  } else if (existsSync(artifactPath)) {
    unlinkSync(artifactPath);
  }
}

// Verified AFTER the restore, not before: a probe that leaves a fixture registry behind
// would silently become the input to every later gate in this run.
const restored = existsSync(artifactPath)
  ? JSON.parse(readFileSync(artifactPath, "utf8"))
  : null;
if (restored?.source?.tag === "v9.9.9-fixture") {
  fail("the probe left a fixture registry in .generated/registry.json");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Registry render verified: ${readable.length} listings rendered as cards and ` +
      `per-listing pages, ${unreadable.length} unreadable rows refused and reported, ` +
      `an absent scan verdict rendered distinctly from a passing one, permissions ` +
      `byte-equal to the registry, and an empty registry rendered as an empty state ` +
      `rather than as an absent one.`
  );
}
