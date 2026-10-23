// One install-safety sheet per app, for both kinds (src/data/registry.mjs: buildSheets), from
// planted artifacts: the first-party fixtures in tests/fixtures/first-party, read the way the sync
// reads a manifest, and tests/fixtures/registry-listed.json.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { coreCompatibility, firstPartySheetFacts } from "../scripts/app-sheet.mjs";
import { fixtureAppNames, fixtureLeaks } from "../scripts/fixture-leaks.mjs";
import { sharedProbeBuild } from "../scripts/registry-probe.mjs";
import { removeSheetProbes, sheetProbeDir } from "./support/sheet-probe.mjs";
import { buildSheets, listingFrom, registryArtifactsDir } from "../src/data/registry.mjs";

const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const release = { version: "0.2.4", tag: "v0.2.4", commit: "2ba0fb86a138f77d9284f89f86e58882d104e823" };
const features = ["chat-trust", "guarded-clients"];

function sheetsArtifact(names) {
  return {
    release,
    apps: {
      repository: "PersonalClaw/PersonalClawApps",
      repositoryUrl: "https://github.com/PersonalClaw/PersonalClawApps",
      commit: "467cda1ae36d00a45e49418a493401fd7e3905d4"
    },
    coreFeatures: features,
    sheets: names.map((name) => {
      const text = read(`first-party/${name}.json`);
      const facts = { ...firstPartySheetFacts(JSON.parse(text), text), path: `${name}/app.json` };
      return { ...facts, compatibility: coreCompatibility(facts, { features, version: release.version }) };
    })
  };
}

const listed = listingFrom(JSON.parse(read("registry-listed.json")));

test("every first-party app and every readable listing gets a sheet, and a listing with a first-party name is dropped with its reason", () => {
  // The look-alike row in the fixture is named for a first-party app; plant one with its name.
  const { sheets, dropped } = buildSheets(sheetsArtifact(["fixture-reaches-hosts"]), {
    ...listed,
    apps: listed.apps.map((app) => (app.name === "skills-sh" ? { ...app, name: "fixture-reaches-hosts", path: "/registry/fixture-reaches-hosts" } : app))
  });
  assert.deepEqual(dropped.map((entry) => entry.name), ["fixture-reaches-hosts"]);
  assert.match(dropped[0].reason, /is a first-party app.s, so its route is that app.s sheet/);
  assert.equal(sheets.filter((sheet) => sheet.name === "fixture-reaches-hosts").length, 1);
  assert.equal(sheets.find((sheet) => sheet.name === "fixture-reaches-hosts").kind, "first-party");
});

test("an unsafe or incompatible sheet is blocked, and its control, one property apart, is not", () => {
  const { sheets } = buildSheets(sheetsArtifact(["fixture-needs-a-feature", "fixture-has-its-features"]), listed);
  const state = (name) => sheets.find((sheet) => sheet.name === name).state;
  assert.equal(state("fixture-needs-a-feature"), "incompatible");
  assert.equal(state("fixture-has-its-features"), "available");
  assert.equal(state("registry-fixture-dangerous"), "unsafe");
  assert.equal(state("registry-fixture-unrecognised"), "unsafe");
  assert.equal(state("registry-fixture-clean"), "available");
  assert.match(sheets.find((sheet) => sheet.name === "fixture-needs-a-feature").blockedBecause, /a-feature-no-core-has/);
});

test("a community sheet names exactly the fields its row lacks", () => {
  const { sheets } = buildSheets(sheetsArtifact([]), listed);
  const gaps = (name) => sheets.find((sheet) => sheet.name === name).missingFields;
  assert.deepEqual(gaps("registry-fixture-clean"), ["Hosts it names", "Blocking findings", "Pinned commit", "Compatibility", "Settings marked secret"]);
  assert.deepEqual(gaps("registry-fixture-unscanned"), [
    "Hosts it names",
    "Scan verdict",
    "Scan time",
    "Blocking findings",
    "Pinned commit",
    "Compatibility",
    "Signer",
    "Settings marked secret"
  ]);
});

test("the listing itself refuses a row with a first-party name, so the index gives it no card and counts it", () => {
  const reserved = new Set(["skills-sh"]);
  const listing = listingFrom(JSON.parse(read("registry-listed.json")), reserved);
  assert.equal(listing.apps.some((app) => app.name === "skills-sh"), false);
  assert.ok(listing.problems.some((problem) => /^skills-sh: the name is a first-party app's/.test(problem.reason)));
  const { dropped } = buildSheets(sheetsArtifact([]), listing);
  assert.deepEqual(dropped.map((entry) => entry.name), ["skills-sh"]);
});

test("the fixture artifacts are the probe's alone: refused on a deploy and for a build into dist", () => {
  const cwd = "/site";
  const env = { PERSONALCLAW_REGISTRY_ARTIFACTS: "/tmp/probe-artifacts" };
  const probe = ["node", "astro", "build", "--outDir", ".registry-probe-dist"];
  assert.equal(registryArtifactsDir({ env: {}, argv: probe, cwd }), "/site/.generated", "no override reads .generated");
  assert.equal(registryArtifactsDir({ env, argv: probe, cwd }), "/tmp/probe-artifacts", "the probe's own build reads its folder");
  assert.equal(registryArtifactsDir({ env, argv: ["node", "astro", "build", "--outDir=.probe"], cwd }), "/tmp/probe-artifacts");
  assert.throws(() => registryArtifactsDir({ env: { ...env, VERCEL: "1" }, argv: probe, cwd }), /on a deploy/);
  assert.throws(() => registryArtifactsDir({ env: { ...env, VERCEL_ENV: "production" }, argv: probe, cwd }), /on a deploy/);
  assert.throws(() => registryArtifactsDir({ env, argv: ["node", "astro", "build"], cwd }), /writes the real dist/);
  assert.throws(() => registryArtifactsDir({ env, argv: ["node", "astro", "build", "--outDir", "dist"], cwd }), /writes the real dist/);
  assert.throws(() => registryArtifactsDir({ env, argv: ["node", "astro", "build", "--outDir=./dist/"], cwd }), /writes the real dist/);
});

test("a real build that names a fixture app, in a page or a path, fails", () => {
  const names = fixtureAppNames(new URL("./fixtures", import.meta.url).pathname);
  assert.ok(names.includes("fixture-reaches-hosts") && names.includes("registry-fixture-clean"), "both kinds of fixture are named");
  const clean = [
    { path: "registry/skills-sh/index.html", text: "<h1>skills-sh</h1> a test fixture-free page" },
    { path: "brand/mark.png" }
  ];
  assert.deepEqual(fixtureLeaks(clean, names), []);
  assert.deepEqual(fixtureLeaks([{ path: "registry/fixture-reaches-hosts/index.html", text: "" }], names), [
    "registry/fixture-reaches-hosts/index.html: a fixture app (fixture-reaches-hosts) is in the build"
  ]);
  assert.deepEqual(fixtureLeaks([{ path: "apps/index.html", text: '<a href="/registry/registry-fixture-clean">' }], names), [
    "apps/index.html: names the fixture app registry-fixture-clean"
  ]);
});

test("callers that share a probe folder build it once, and the rest wait for it rather than rebuild", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sheet-probe-"));
  try {
    const outDir = sheetProbeDir(4242, root);
    let builds = 0;
    const build = (scenario, dir) => {
      builds += 1;
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "index.html"), scenario);
    };
    const slow = (scenario, dir) => {
      // Hold the build long enough that the second caller arrives while it runs.
      const until = Date.now() + 150;
      while (Date.now() < until);
      build(scenario, dir);
    };
    const results = await Promise.all([
      sharedProbeBuild("listed", outDir, { build: slow, pollMs: 10 }),
      new Promise((resolve) => setTimeout(resolve, 20)).then(() => sharedProbeBuild("listed", outDir, { build, pollMs: 10 }))
    ]);
    assert.deepEqual(results.sort(), ["built", "reused"]);
    assert.equal(builds, 1, "one build for both");
    assert.equal(readFileSync(path.join(outDir, "index.html"), "utf8"), "listed");

    // A failed build fails its waiters with its reason instead of leaving them to time out.
    const broken = sheetProbeDir(4343, root);
    await assert.rejects(sharedProbeBuild("listed", broken, { build: () => { throw new Error("astro build failed"); } }), /astro build failed/);
    await assert.rejects(sharedProbeBuild("listed", broken, { build, pollMs: 10, timeoutMs: 2000 }), /failed: astro build failed/);

    // The run's teardown removes every probe folder and its markers.
    removeSheetProbes(root);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
