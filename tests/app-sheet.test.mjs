// The install-safety sheet's facts, read from the pinned sources by scripts/app-sheet.mjs.
//
// Each rule is driven on planted input: the first-party fixtures in tests/fixtures/first-party
// (one reaching hosts and keeping a secret, one needing a feature no core has, and its control,
// which differs from it in requiresCoreFeatures only) and a fixture core_features.py with two
// names, the shape the real file has at v0.2.4.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  COMPOSED_KEYS,
  DESCRIBE_KEYS,
  NOT_DECLARED,
  NOT_RECORDED,
  coreCompatibility,
  describeKeysFromSource,
  firstPartySheetFacts,
  gitBlobSha,
  inheritsSentence,
  launchedPrograms,
  parseCoreFeatures,
  scannerPin
} from "../scripts/app-sheet.mjs";

const fixture = (name) => new URL(`./fixtures/first-party/${name}`, import.meta.url);
const manifestText = (name) => readFileSync(fixture(`${name}.json`), "utf8");
const facts = (name) => firstPartySheetFacts(JSON.parse(manifestText(name)), manifestText(name));
const release = { features: parseCoreFeatures(readFileSync(fixture("core_features.py"), "utf8")), version: "0.2.4" };

test("a first-party sheet keeps the manifest's permissions, launches with their hosts, license, compatibility fields and secrets verbatim", () => {
  const sheet = facts("fixture-reaches-hosts");
  const manifest = JSON.parse(manifestText("fixture-reaches-hosts"));
  assert.deepEqual(sheet.declarations.permissions, manifest.permissions);
  assert.deepEqual(sheet.declarations.launches, manifest.launches);
  assert.deepEqual(sheet.declarations.mcpServers, manifest.mcpServers);
  assert.equal(sheet.license, "MIT");
  assert.equal(sheet.author, "PersonalClaw");
  assert.deepEqual(sheet.requiresCoreFeatures, ["guarded-clients"]);
  assert.equal(sheet.minPersonalClawVersion, "");
  assert.deepEqual(sheet.secrets, [{ key: "api_key", label: "API Key" }]);
  assert.equal(sheet.network, "off");
  // Every host or URL it names, under what reaches it: the launched program's hosts, and the
  // MCP server's URL. Never presented as the app's whole reach (the sheet says so beside it).
  assert.deepEqual(sheet.reach, [
    { by: "the program fixture-cli", why: "It runs the fixture's own command line.", hosts: ["api.example.com", "cdn.example.com"] },
    { by: "the MCP server fixture-search", why: "", hosts: ["https://mcp.example.com/sse"] }
  ]);
});

test("a declaration the manifest does not make is absent, so the sheet says it is not declared", () => {
  const sheet = facts("fixture-reaches-hosts");
  for (const key of ["crons", "pythonDependencies", "writes", "hasBackend", "onInstall", "skills", "sources"]) {
    assert.equal(sheet.declarations[key], undefined, key);
  }
  assert.equal(NOT_DECLARED, "Not declared in this release's manifest");
  assert.equal(NOT_RECORDED, "Not recorded for this listing");
});

test("the manifest's exact text keeps the blob hash git lists for it", () => {
  const text = manifestText("fixture-reaches-hosts");
  const listed = execFileSync("git", ["hash-object", "--stdin"], { input: text }).toString().trim();
  assert.equal(facts("fixture-reaches-hosts").manifest.blob, listed);
  assert.equal(facts("fixture-reaches-hosts").manifest.text, text);
  assert.equal(gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
});

test("a manifest that needs a feature the release lacks is incompatible and names it; its control is not", () => {
  assert.deepEqual(release.features, ["chat-trust", "guarded-clients"]);
  const needs = coreCompatibility(facts("fixture-needs-a-feature"), release);
  assert.equal(needs.compatible, false);
  assert.deepEqual(needs.missing, ["a-feature-no-core-has"]);
  const control = coreCompatibility(facts("fixture-has-its-features"), release);
  assert.equal(control.compatible, true);
  assert.deepEqual(control.missing, []);
});

test("a version floor follows core's rule: above the release refuses, an unreadable floor refuses, none is no floor", () => {
  assert.equal(coreCompatibility({ minPersonalClawVersion: "0.3.0" }, release).compatible, false);
  assert.equal(coreCompatibility({ minPersonalClawVersion: "0.3.0" }, release).reason, "floor-above");
  assert.equal(coreCompatibility({ minPersonalClawVersion: "0.2.4" }, release).compatible, true);
  assert.equal(coreCompatibility({ minPersonalClawVersion: "soon" }, release).reason, "unreadable-floor");
  assert.equal(coreCompatibility({ minPersonalClawVersion: "soon" }, release).compatible, false);
  assert.equal(coreCompatibility({}, release).reason, "no-floor");
  // A missing feature refuses whatever the floor says.
  assert.equal(
    coreCompatibility({ minPersonalClawVersion: "0.1.0", requiresCoreFeatures: ["nope"] }, release).compatible,
    false
  );
});

test("the registry's scanner is recorded only from one exact pin", () => {
  assert.deepEqual(scannerPin("pyyaml==6.0\npersonalclaw==0.1.3\n"), { name: "personalclaw", version: "0.1.3" });
  assert.equal(scannerPin("personalclaw>=0.1.3\n"), null);
  assert.equal(scannerPin("personalclaw\n"), null);
  assert.equal(scannerPin("pyyaml==6.0\n"), null);
  assert.equal(scannerPin(null), null);
});

test("describe()'s keys are read in order, so a key core adds or moves differs from the sheet's", () => {
  const source = [
    "def describe(m: AppManifest) -> dict[str, Any]:",
    '    """Docs."""',
    "    d: dict[str, Any] = {",
    '        "permissions": perms,',
    '        "crons": _crons(m),',
    '        "launches": _launches(m),',
    "    }",
    '    d["runsAsYou"] = _runs_as_you(d)',
    "    return d",
    "",
    "def _crons(m):",
    '    d["notThisOne"] = 1'
  ].join("\n");
  assert.deepEqual(describeKeysFromSource(source), ["permissions", "crons", "launches", "runsAsYou"]);
  assert.ok(COMPOSED_KEYS.has("runsAsYou"));
  assert.equal(DESCRIBE_KEYS.at(-1), "runsAsYou");
  assert.throws(() => describeKeysFromSource("def other(): pass"), /no describe\(\)/);
});

test("CORE_FEATURES is read as the values its frozenset names, and a name with no value fails", () => {
  assert.throws(
    () => parseCoreFeatures('A = "a"\nCORE_FEATURES = frozenset({A, B})\n'),
    /names B, which has no value/
  );
  assert.throws(() => parseCoreFeatures('A = "a"\n'), /no longer declares CORE_FEATURES/);
});

test("each program it starts says what it runs with, in install consent's own words", () => {
  // The shape of an agent app at v0.2.2: its CLI runs with the owner's own sign-in, settings and
  // rules, and the folder's, while a setting that starts out on is off.
  const agent = {
    launches: [
      {
        program: "example-cli",
        why: "It does the work of each chat.",
        inherits: ["sign-in", "settings", "auto-approve-rules", "folder-settings"],
        inheritsWhile: { setting: "isolated_config", value: false }
      },
      { program: "npx", why: "It installs skills.", npmPackage: "skills", hosts: ["registry.npmjs.org"], inherits: ["sign-in", "settings"] },
      { program: "*", why: "The actions you write.", inherits: ["sign-in"] },
      { program: "git", why: "It clones a skill's repository." }
    ],
    provider: {
      settingsSchema: { properties: { isolated_config: { type: "boolean", default: true, "x-meta": { label: "Isolated settings" } } } }
    }
  };
  const [cli, npx, yours, git] = launchedPrograms(agent);
  assert.deepEqual(cli.inheritsWhile, { label: "Isolated settings", value: false, default: true });
  assert.equal(
    inheritsSentence(cli),
    "While Isolated settings is off, it runs with your own example-cli sign-in, settings and auto-approve rules, and with the " +
      "example-cli settings of the folder it works in, which can add rules of their own and commands for it to run. What those " +
      "rules allow, it does without asking you here first. Isolated settings is on until you turn it off."
  );
  assert.equal(npx.npmPackage, "skills");
  assert.deepEqual(npx.hosts, ["registry.npmjs.org"]);
  assert.equal(inheritsSentence(npx), "It runs with your own npx sign-in and settings.");
  assert.equal(inheritsSentence(yours), "Each program it starts runs with your own sign-in for that program.");
  assert.equal(inheritsSentence(git), "", "a program that runs with nothing of yours says nothing");
  // A setting no provider schema describes is named by its key, as describe() names it.
  const [bare] = launchedPrograms({ launches: [{ ...agent.launches[0] }] });
  assert.deepEqual(bare.inheritsWhile, { label: "isolated_config", value: false, default: null });
});
