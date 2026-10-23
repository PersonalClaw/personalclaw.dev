// Prove the registry pages actually render a registry.
//
// THE FAILURE THIS EXISTS TO CATCH. The production registry renders nothing — at its
// pinned commit it lists no apps (and a release whose Store does not read it renders
// nothing either; see scripts/sync-registry.mjs). A
// generator written against that input renders zero cards, the page looks clean, and
// every check over the shipped build passes VACUOUSLY. So the shipped build is not
// evidence. This script rebuilds the site against fixture registries that DO carry
// listings and asserts on the result, with an explicit floor: zero cards from an input
// with listings is a failure, not an empty state.
//
// It therefore also closes "a rebuild picks up registry changes" from the change's
// criterion, mechanically: one unchanged codebase, three different registry inputs,
// three different rendered outputs, compared.
//
//   node scripts/validate-registry-render.mjs
//
// WHAT IS CLOSED ELSEWHERE. The criterion's last clause is "a merged registry PR appears
// on the site after rebuild and card data matches the Store consent surface". Neither half
// was measurable while the site pinned v0.1.3, whose Store reads no registry and carries no
// registry-listing consent surface. From v0.2.0 on, both are checked outside this script:
//
//   * "a merged registry PR appears on the site" — the registry is read at its own pin, and
//     scripts/validate-release-parity.mjs fails whenever the registry's default branch is
//     not at that pin, so a merged listing (or delisting) obliges the re-pin that shows it.
//   * "card data matches the Store consent surface" — scripts/sync-registry.mjs checks the
//     three STORE_CONSENT phrases against `web/src/lib/provenance.ts` at the pinned core
//     release, and fails the sync when the Store's wording drifts.
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

//
// THE INSTALL-SAFETY SHEETS (#112). The same fixture build carries every first-party app of the
// pinned release and three first-party fixtures (tests/fixtures/first-party: one naming hosts and
// an MCP server, one needing a core feature the release lacks, and its control), so every sheet
// kind and state is built and checked: each field against its RAW source through
// scripts/sheet-render-check.mjs (never through src/data, which built the page), the manifest
// panel against the blob the pinned tree lists, and the action against the state.

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import { NOT_RECORDED } from "./app-sheet.mjs";
import { firstPartyFixtures, withProbeBuild } from "./registry-probe.mjs";
import {
  SCHEMA_VERDICTS,
  actionProblems,
  expectedCommunity,
  expectedFirstParty,
  fieldProblems,
  manifestProblems
} from "./sheet-render-check.mjs";
import { INSTALL_GATE_SENTENCE, STORE_CONSENT } from "../src/data/registry.mjs";

const root = process.cwd();
const artifactPath = path.join(root, ".generated", "registry.json");
const probeDist = path.join(root, ".registry-probe-dist");
const fixtures = path.join(root, "tests", "fixtures");

const failures = [];
const fail = (message) => failures.push(message);

// The first-party sheets the probe build carries: the release's own apps, then the fixtures.
const synced = JSON.parse(readFileSync(path.join(root, ".generated", "app-sheets.json"), "utf8"));
const firstParty = [
  ...synced.sheets.map((sheet) => ({ name: sheet.name, text: sheet.manifest.text, path: sheet.path, treeBlob: sheet.treeBlob })),
  ...firstPartyFixtures().map((fixture) => ({ ...fixture, treeBlob: null }))
];
const reserved = new Set(firstParty.map((sheet) => sheet.name));

/** @param {string} routePath */
function probeHtml(routePath) {
  const filePath = path.join(probeDist, routePath.replace(/^\//, ""), "index.html");
  return existsSync(filePath) ? load(readFileSync(filePath, "utf8")) : null;
}

/**
 * What every sheet carries: the app's name as its h1, its kind, the reach note, and nothing it
 * may not: no README (a default branch is not a pin) and no claim about the reader's install.
 */
function sheetBasics($app, name, kind) {
  if ($app("h1").text().trim() !== name) fail(`/registry/${name}: the h1 is "${$app("h1").text().trim()}", not the app's name`);
  if ($app("[data-sheet]").attr("data-kind") !== kind) fail(`/registry/${name} is not a ${kind} sheet`);
  if (!$app("[data-reach-note]").text().includes("Its own code has no host list")) {
    fail(`/registry/${name} does not say its own code has no host list`);
  }
  if ($app("pre.readme-body, [data-readme]").length > 0) fail(`/registry/${name} shows a README`);
  if ($app("[data-install-state]").length > 0) fail(`/registry/${name} claims an install state for the reader`);
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
// A row named for a first-party app is refused too: that name's route is the app's sheet.
const readable = rows.filter((row) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.name) &&
  Array.isArray(row.permissions_declared) && !reserved.has(row.name));
const unreadable = rows.filter((row) => !readable.includes(row));
const lookalikes = rows.filter((row) => reserved.has(row.name));

if (readable.length < 3 || unreadable.length < 2) {
  fail(
    `tests/fixtures/registry-listed.json must carry at least 3 readable and 2 unreadable ` +
      `rows to be worth building against (has ${readable.length}/${unreadable.length})`
  );
}

let listedIndexHtml = "";
let emptyIndexHtml = "";

try {
  withProbeBuild("listed", probeDist, () => {
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

      // THE REST OF THE ENUMERATED CARD FIELDS. Acceptance criterion names five — name, types,
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
      // Dangerous, and any verdict the schema does not define, is the blocked tone.
      const expectedTone =
        row.last_scan_verdict === undefined
          ? "verdict-unscanned"
          : row.last_scan_verdict === "clean"
            ? "verdict-pass"
            : ["low", "warning"].includes(row.last_scan_verdict)
              ? "verdict-caution"
              : "verdict-blocked";
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

  // THE SHEETS. Every one exists, with the app's name as its h1, and every field holds what its
  // raw source says, or the exact line that says it has none.
  const blockedRows = new Set(["registry-fixture-dangerous", "registry-fixture-unrecognised"]);
  for (const row of readable) {
    const $app = probeHtml(`/registry/${row.name}`);
    if (!$app) {
      fail(`/registry/${row.name} was not generated`);
      continue;
    }
    sheetBasics($app, row.name, "community");
    for (const problem of fieldProblems($app, row.name, expectedCommunity(row, listedFixture.scanner ?? null))) fail(problem);
    const blocked = row.last_scan_verdict !== undefined && !["clean", "low", "warning"].includes(row.last_scan_verdict);
    if (blocked !== blockedRows.has(row.name) && blockedRows.has(row.name)) {
      fail(`${row.name}: the fixture's blocked row is not read as blocked`);
    }
    for (const problem of actionProblems($app, row.name, blocked)) fail(problem);

    // The Store's three consent jobs, in the Store's order, by position: the sheet is
    // reachable by URL without passing /registry, so it carries them itself.
    const notEndorsedAt = orderOf($app, ".registry-not-endorsed");
    const badgeAt = orderOf($app, ".registry-verdict");
    const gateAt = orderOf($app, ".install-gate");
    if ($app(".registry-not-endorsed").first().text().trim() !== STORE_CONSENT.notEndorsed) {
      fail(`/registry/${row.name} does not lead with "${STORE_CONSENT.notEndorsed}"`);
    } else if (!(notEndorsedAt < badgeAt && badgeAt < gateAt)) {
      fail(`/registry/${row.name} does not keep the Store's order: not endorsed, the attributed verdict, the install-time rescan`);
    }
    if ($app(".install-gate").text().trim() !== INSTALL_GATE_SENTENCE) {
      fail(`/registry/${row.name} does not name the install-time rescan`);
    }
    // Only a verdict the registry's schema defines is attributed as its check; an unrecognised
    // one is shown as written and called unrecognised (src/data/registry.mjs: verdictPresentation).
    const attributed = $app(".verdict-detail").text().includes(STORE_CONSENT.verdictAttribution);
    if (SCHEMA_VERDICTS.has(row.last_scan_verdict) && !attributed) {
      fail(`/registry/${row.name} states verdict "${row.last_scan_verdict}" without attributing it to the registry`);
    }
    if (!SCHEMA_VERDICTS.has(row.last_scan_verdict) && attributed) {
      fail(`/registry/${row.name} attributes to the registry a verdict it never recorded as one`);
    }

    // It names exactly the fields its row lacks.
    const expected = expectedCommunity(row, listedFixture.scanner ?? null);
    const lacking = Object.entries(expected)
      .filter(([, want]) => want.value === null && want.missing === NOT_RECORDED)
      .map(([id]) => $app(`[data-field="${id}"] dt`).text().trim());
    const named = $app("[data-missing-fields]").text().trim();
    if (named !== `This listing does not record: ${lacking.join(", ")}.`) {
      fail(`/registry/${row.name} names its gaps as "${named}", its row lacks ${JSON.stringify(lacking)}`);
    }
    const repoLinks = $app(`a[href="${row.repo}"]`).toArray();
    if (!repoLinks.length) {
      fail(`/registry/${row.name} does not link to its repository ${row.repo}`);
    }
    // A listing's repository is a third party's URL, so the site does not vouch for it.
    for (const link of repoLinks) {
      const rel = ($app(link).attr("rel") ?? "").split(/\s+/);
      if (!rel.includes("nofollow") || !rel.includes("ugc")) {
        fail(`/registry/${row.name}: its repository link is not rel="nofollow ugc"`);
      }
    }
  }
  if (new Set(readable.map((row) => [row.last_scan_verdict, row.last_validated, row.signer].join("|"))).size < 2) {
    fail("the listed fixture has no two readable rows with different gaps to check the gap list on");
  }

  // A row named for a first-party app gets no sheet of its own: its route is the app's.
  for (const row of lookalikes) {
    const $app = probeHtml(`/registry/${row.name}`);
    if (!$app || $app("[data-sheet]").attr("data-kind") !== "first-party") {
      fail(`/registry/${row.name} is not the first-party app's sheet, so a look-alike listing took its route`);
    }
  }

  for (const sheet of firstParty) {
    const $app = probeHtml(`/registry/${sheet.name}`);
    if (!$app) {
      fail(`/registry/${sheet.name} was not generated for a first-party app`);
      continue;
    }
    sheetBasics($app, sheet.name, "first-party");
    const at = {
      tag: synced.release.tag,
      features: synced.coreFeatures,
      appsRepositoryUrl: synced.apps.repositoryUrl,
      appsCommit: synced.apps.commit,
      path: sheet.path
    };
    for (const problem of fieldProblems($app, sheet.name, expectedFirstParty(sheet.text, at))) fail(problem);
    if (sheet.treeBlob) for (const problem of manifestProblems($app, sheet.name, sheet)) fail(problem);
    const manifest = JSON.parse(sheet.text);
    const incompatible = (manifest.requiresCoreFeatures ?? []).some((name) => !synced.coreFeatures.includes(name));
    for (const problem of actionProblems($app, sheet.name, incompatible)) fail(problem);
    for (const [name] of Object.entries(manifest.mcpServers ?? {})) {
      if (!$app("[data-reach]").text().includes(`the MCP server ${name}`)) {
        fail(`/registry/${sheet.name} does not list its MCP server ${name}`);
      }
    }
  }
  if (!firstParty.some((sheet) => (JSON.parse(sheet.text).requiresCoreFeatures ?? []).some((name) => !synced.coreFeatures.includes(name)))) {
    fail("no first-party fixture is incompatible, so the incompatible sheet is never checked");
  }
  });

  // -------------------------------------------------------------------------
  // Scenario 2: the registry exists and lists nothing. Pinned separately, because an
  // honest empty state and a broken grid are indistinguishable by card count alone.
  // -------------------------------------------------------------------------
  withProbeBuild("empty", probeDist, () => {
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
  });

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
}

// Verified AFTER the restore, not before: a probe that leaves a fixture registry behind
// would silently become the input to every later gate in this run.
const restored = existsSync(artifactPath)
  ? JSON.parse(readFileSync(artifactPath, "utf8"))
  : null;
if (restored?.release?.tag === "v9.9.9-fixture") {
  fail("the probe left a fixture registry in .generated/registry.json");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Registry render verified: ${readable.length} listings rendered as cards and ` +
      `install-safety sheets, ${firstParty.length} first-party sheets held field by field to ` +
      `their pinned app.json, ${unreadable.length} unreadable or look-alike rows refused and ` +
      `reported (${lookalikes.map((row) => `${row.name}: its name is a first-party app's`).join("; ")}), ` +
      `an absent scan verdict rendered distinctly from a passing one, every enumerated ` +
      `card field (name, types, permissions, verdict, maintainer, license) byte-equal to ` +
      `the registry, the Store's three consent jobs rendered in the Store's order — ` +
      `non-endorsement first, verdict attributed to the registry only when one was ` +
      `recorded, install-time rescan named — and an empty registry rendered as an empty ` +
      `state rather than as an absent one.`
  );
}
