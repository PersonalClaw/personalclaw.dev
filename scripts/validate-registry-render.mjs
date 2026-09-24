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
// WHAT IT CANNOT CLOSE. The criterion's last clause is "a merged registry PR appears on
// the site after rebuild and card data matches the Store consent surface", and the two
// halves fail for the same reason, which is a RELEASE, not a gap in the work:
//
//   * "a merged registry PR appears on the site" — four listings ARE merged in core, but
//     the site is generated from the newest core RELEASE, and `scratch/registry/` does not
//     exist at v0.1.3 at all. The clause becomes measurable when the pin moves.
//   * "card data matches the Store consent surface" — the Store's registry-listing consent
//     surface ALSO postdates v0.1.3: `web/src/lib/provenance.ts` (which owns that copy) is
//     not in the pinned tree, and `RegistryPointer` at v0.1.3 carries none of `types`,
//     `permissions_declared`, `license`, `maintainer`, `last_validated` or
//     `last_scan_verdict`. So at the pin there is no Store surface to compare against.
//
// WHAT IS CLOSED HERE INSTEAD, and it is the half that matters. Core states the Store's
// three non-negotiable jobs for presenting a registry listing in one module, and this site
// now does all three and is checked on it (src/data/registry.mjs: STORE_CONSENT):
// lead with the non-endorsement, attribute the verdict to the REGISTRY, and name the
// install-time rescan. Before this, the public page did none of them — a bare green
// "Clean" in PersonalClaw's own voice — which made the public surface the MORE reassuring
// of the two. That polarity was the defect, and it was fixable without any release.
// scripts/sync-registry.mjs checks this site's three phrases against core's own module at
// the pinned release, so the agreement is measured rather than asserted the moment a
// release carries it; the assertions below check that the page RENDERS them, in order.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import { INSTALL_GATE_SENTENCE, STORE_CONSENT } from "../src/data/registry.mjs";

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

/**
 * Where an element sits in the built page's document order, or -1 when it is absent.
 *
 * 🔴 Done on the parsed TREE, not by searching the serialised HTML, and that is not a
 * stylistic preference — an earlier version of the order checks below compared
 * `html.indexOf("registry-verdict")` against a text position and failed on a correct page,
 * because Astro hoists the component's `<style>` into `<head>`, so the first occurrence of
 * any class NAME is its CSS rule. The mirror-image mistake is worse: a marker string that
 * Astro decorates (it appends a scoped `astro-*` class to every `class` attribute) simply
 * never matches, the guard reads "absent" and the order assertion skips in silence.
 *
 * @param {ReturnType<typeof load>} $
 * @param {string} selector
 */
function orderOf($, selector) {
  const target = $(selector).first().get(0);
  return target ? $("body *").toArray().indexOf(target) : -1;
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

    // JOB 1 OF THE STORE'S CONSENT CONTRACT, as ORDER and not merely as presence. A
    // non-endorsement rendered below the cards has not done its job: core's rule is that a
    // reader who stops after four words must have read "community-listed", not "clean".
    const consentAt = orderOf($index, ".registry-consent .registry-not-endorsed");
    const firstCardAt = orderOf($index, "a.registry-card");
    if ($index(".registry-consent .registry-not-endorsed").text().trim() !==
      STORE_CONSENT.notEndorsed) {
      fail(
        `/registry renders listings without the Store's non-endorsement ` +
          `("${STORE_CONSENT.notEndorsed}")`
      );
    } else if (firstCardAt === -1) {
      fail("/registry render check found no card to order the non-endorsement against");
    } else if (consentAt > firstCardAt) {
      fail(
        "/registry renders the non-endorsement AFTER the first card — job 1 of the " +
          "Store's consent contract is that it is read first"
      );
    }
    // Job 3. Unconditional, because it is what makes a stale or absent verdict safe to show.
    if (!$index(".registry-consent").text().includes(INSTALL_GATE_SENTENCE)) {
      fail(
        `/registry never says the listings are "${STORE_CONSENT.installGate}" — the ` +
          `sentence that keeps a recorded verdict from reading as a guarantee`
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

      // THE REST OF THE ENUMERATED CARD FIELDS. `done_when` names five — name, types,
      // permissions, verdict, maintainer — and until now only permissions and the verdict
      // were asserted. The page rendered the other three, but nothing would have caught a
      // refactor that dropped or swapped them, and `maintainer`/`license` are adjacent
      // monospace strings a reader cannot tell apart when transposed.
      const field = (name) => $index(card).find(`[data-field="${name}"]`).text().trim();
      for (const [name, expected] of [
        ["name", row.name],
        ["types", row.types.join(" · ")],
        ["maintainer", row.maintainer],
        ["license", row.license]
      ]) {
        if (field(name) !== expected) {
          fail(
            `/registry card ${row.name} renders ${name} "${field(name)}" but the ` +
              `registry declares "${expected}"`
          );
        }
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

    // THIS PAGE IS REACHABLE BY URL WITHOUT PASSING /registry, so it carries all three of
    // the Store's consent jobs itself. Checked in the Store's order, by position.
    const notEndorsedAt = orderOf($app, ".registry-not-endorsed");
    const badgeAt = orderOf($app, ".registry-verdict");
    if ($app(".registry-not-endorsed").text().trim() !== STORE_CONSENT.notEndorsed) {
      fail(
        `/registry/${row.name} does not carry the non-endorsement ` +
          `("${STORE_CONSENT.notEndorsed}")`
      );
    } else if (badgeAt === -1) {
      fail(`/registry/${row.name} renders no verdict badge to order it against`);
    } else if (notEndorsedAt > badgeAt) {
      fail(
        `/registry/${row.name} renders the non-endorsement AFTER the verdict badge — ` +
          `the reassurance must not be read first`
      );
    }
    if ($app(".install-gate").text().trim() !== INSTALL_GATE_SENTENCE) {
      fail(
        `/registry/${row.name} does not name the install-time rescan, so a recorded ` +
          `verdict reads as the gate rather than as a record`
      );
    }

    // JOB 2: A VERDICT IS THE REGISTRY'S, AND ONLY A RECORDED ONE IS A CHECK. Both
    // directions, because each failure is a different lie: an unattributed verdict speaks
    // in PersonalClaw's voice about a check it did not run, and an attributed ABSENCE
    // claims a check that never happened.
    const verdictDetail = $app(".verdict-detail").text().trim();
    const attributed = verdictDetail.includes(STORE_CONSENT.verdictAttribution);
    if (row.last_scan_verdict !== undefined && !attributed) {
      fail(
        `/registry/${row.name} states verdict "${row.last_scan_verdict}" without ` +
          `attributing it ("${STORE_CONSENT.verdictAttribution}") — it reads as ` +
          `PersonalClaw's own finding`
      );
    }
    if (row.last_scan_verdict === undefined && attributed) {
      fail(
        `/registry/${row.name} has no recorded verdict but its detail says ` +
          `"${STORE_CONSENT.verdictAttribution}", claiming a check that did not happen`
      );
    }

    // The listing facts, addressed by name. `added` and `lastValidated` were rendered and
    // unasserted too; an absent `last_validated` must read as "Never", not as a date.
    const appField = (name) => $app(`[data-field="${name}"]`).text().trim();
    for (const [name, expected] of [
      ["types", row.types.join(", ")],
      ["maintainer", row.maintainer],
      ["license", row.license],
      ["added", row.added],
      ["lastValidated", row.last_validated ?? "Never"]
    ]) {
      if (appField(name) !== expected) {
        fail(
          `/registry/${row.name} renders ${name} "${appField(name)}" but the registry ` +
            `declares "${expected}"`
        );
      }
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
      `an absent scan verdict rendered distinctly from a passing one, every enumerated ` +
      `card field (name, types, permissions, verdict, maintainer, license) byte-equal to ` +
      `the registry, the Store's three consent jobs rendered in the Store's order — ` +
      `non-endorsement first, verdict attributed to the registry only when one was ` +
      `recorded, install-time rescan named — and an empty registry rendered as an empty ` +
      `state rather than as an absent one.`
  );
}
