// The builders band's app.json on /apps: a real first-party manifest, the pinned core's rules
// for it, and the sync check that holds both to the pins.
//
// The snippet this replaced ("name", "provider.type", "permissions.network") was presented as
// what an app looks like, and core's own AppManifest.validate() refused it. So the rules are
// tested one negative case each, the old snippet must fail on its missing fields (not on a
// parse error), and the sync check is tested against fake pinned trees with the file present,
// changed and missing.

import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDERS_SNIPPET,
  CORE_MANIFEST_PATH,
  MANIFEST_RULES,
  appManifestProblems,
  manifestRulesDrift,
  snippetDrift
} from "../src/data/apps-snippet.mjs";
import { checkBuildersSnippet } from "../scripts/sync-sources.mjs";

/** An authored manifest that uses every field the check reads, each one valid. */
function valid() {
  return {
    name: "example-tool",
    version: "1.0.0",
    displayName: "Example Tool",
    description: "A tool provider used only by this test.",
    icon: "Globe",
    author: "PersonalClaw",
    license: "MIT",
    tags: ["tool", "web"],
    prompts: ["prompts/example.yaml"],
    permissions: { network: true },
    provider: {
      type: "tool",
      implementation: "provider:create_provider",
      capabilities: ["web"]
    }
  };
}

/** `valid()` with one change applied, so each case below differs from a passing one by one rule. */
function changed(edit) {
  const manifest = valid();
  edit(manifest);
  return manifest;
}

// ── the snippet the page shows ────────────────────────────────────────────────────────────

test("the builders-band snippet parses and passes the pinned core's rules", () => {
  assert.deepEqual(appManifestProblems(JSON.parse(BUILDERS_SNIPPET.text)), []);
});

test("the snippet is the manifest of the first-party app it names", () => {
  const manifest = JSON.parse(BUILDERS_SNIPPET.text);
  assert.equal(manifest.name, BUILDERS_SNIPPET.app);
  assert.equal(BUILDERS_SNIPPET.path, `${BUILDERS_SNIPPET.app}/app.json`);
});

test("the snippet shows what the band's copy says about it: a provider and its network declaration", () => {
  const manifest = JSON.parse(BUILDERS_SNIPPET.text);
  assert.equal(typeof manifest.provider?.implementation, "string");
  assert.equal(typeof manifest.permissions?.network, "boolean");
});

test("the snippet it replaced fails on its missing fields, not on a parse error", () => {
  const replaced = `{
  "name": "your-app",
  "provider": { "type": "tool" },
  "permissions": { "network": false }
}`;
  assert.deepEqual(appManifestProblems(JSON.parse(replaced)), [
    "missing required field: version",
    "missing required field: displayName",
    "missing required field: description",
    "provider.implementation is required"
  ]);
});

// ── the rules, one negative case each ─────────────────────────────────────────────────────

test("an authored manifest using every field the check reads passes", () => {
  assert.deepEqual(appManifestProblems(valid()), []);
});

test("app.json must be a JSON object", () => {
  for (const value of [null, [], "web-tools", 1]) {
    assert.deepEqual(appManifestProblems(value), ["app.json must be a JSON object"]);
  }
});

test("name is required and kebab-case", () => {
  assert.deepEqual(appManifestProblems(changed((m) => delete m.name)), [
    "missing required field: name"
  ]);
  for (const name of ["Example_Tool", "example-", "example tool"]) {
    const [problem, ...rest] = appManifestProblems(changed((m) => (m.name = name)));
    assert.match(problem, /^name must be kebab-case/);
    assert.deepEqual(rest, []);
  }
});

test("version is required and MAJOR.MINOR.PATCH", () => {
  assert.deepEqual(appManifestProblems(changed((m) => delete m.version)), [
    "missing required field: version"
  ]);
  for (const version of ["1.0", "1.0.0.0", "v1.0.0", " 1.0.0", "1.0.0-foo", "latest", 1]) {
    const [problem, ...rest] = appManifestProblems(changed((m) => (m.version = version)));
    assert.match(problem, /^version must be MAJOR\.MINOR\.PATCH/, `${JSON.stringify(version)}`);
    assert.deepEqual(rest, []);
  }
});

test("a pre-release, dev build or local version the comparison can order is allowed", () => {
  for (const version of ["1.0.0-rc.1", "1.0.0rc1", "1.0.0b2", "1.0.0.dev3", "1.0.0.post1", "1.0.0+local.7"]) {
    assert.deepEqual(appManifestProblems(changed((m) => (m.version = version))), [], version);
  }
});

test("displayName and description are required and non-empty", () => {
  assert.deepEqual(appManifestProblems(changed((m) => (m.displayName = ""))), [
    "missing required field: displayName"
  ]);
  assert.deepEqual(appManifestProblems(changed((m) => delete m.description)), [
    "missing required field: description"
  ]);
});

test("a provider needs a type core accepts", () => {
  assert.deepEqual(appManifestProblems(changed((m) => delete m.provider.type)), [
    "provider.type is required"
  ]);
  const [problem, ...rest] = appManifestProblems(changed((m) => (m.provider.type = "plugin")));
  assert.match(problem, /^provider\.type must be one of/);
  assert.deepEqual(rest, []);
});

test("every provider type the pinned core accepts is accepted", () => {
  for (const type of MANIFEST_RULES.providerTypes) {
    assert.deepEqual(appManifestProblems(changed((m) => (m.provider.type = type))), [], type);
  }
});

test("a provider needs an implementation of the form module.path:factory_fn", () => {
  assert.deepEqual(appManifestProblems(changed((m) => delete m.provider.implementation)), [
    "provider.implementation is required"
  ]);
  for (const implementation of ["provider.create_provider", "provider:create-provider", "pkg/provider:make"]) {
    const [problem, ...rest] = appManifestProblems(
      changed((m) => (m.provider.implementation = implementation))
    );
    assert.match(problem, /^provider\.implementation must be 'module\.path:factory_fn'/);
    assert.deepEqual(rest, []);
  }
  assert.deepEqual(
    appManifestProblems(changed((m) => (m.provider.implementation = "pkg.sub.provider:create"))),
    []
  );
});

test("a declared permission boolean is the JSON true or false", () => {
  assert.deepEqual(appManifestProblems(changed((m) => (m.permissions.network = "yes"))), [
    'permissions.network must be true or false, got "yes"'
  ]);
  assert.deepEqual(appManifestProblems(changed((m) => (m.permissions.network = false))), []);
});

test("an icon names a lucide component", () => {
  const [problem, ...rest] = appManifestProblems(changed((m) => (m.icon = "web icon")));
  assert.match(problem, /^icon must be a lucide icon name/);
  assert.deepEqual(rest, []);
});

test("a prompt path cannot traverse out of the app", () => {
  assert.deepEqual(appManifestProblems(changed((m) => (m.prompts = ["../escape.yaml"]))), [
    'prompts path contains path traversal: "../escape.yaml"'
  ]);
});

test("a field the check does not read is refused, never passed unchecked", () => {
  assert.deepEqual(appManifestProblems(changed((m) => (m.backend = { routes: [] }))), [
    "backend is a field this check does not read, so it cannot say core accepts it"
  ]);
  assert.deepEqual(appManifestProblems(changed((m) => (m.permissions.storage = true))), [
    "permissions.storage is a field this check does not read, so it cannot say core accepts it"
  ]);
  assert.deepEqual(appManifestProblems(changed((m) => (m.provider.execution = "sidecar"))), [
    "provider.execution is a field this check does not read, so it cannot say core accepts it"
  ]);
});

// ── the snippet held to the pinned apps commit ───────────────────────────────────────────

test("the snippet matches the pinned file byte for byte", () => {
  assert.deepEqual(snippetDrift(BUILDERS_SNIPPET.text), []);
  const bumped = BUILDERS_SNIPPET.text.replace(/"version": "[^"]+"/, '"version": "9.9.9"');
  const [problem, ...rest] = snippetDrift(bumped);
  assert.match(problem, new RegExp(`${BUILDERS_SNIPPET.path} at the pinned apps commit`));
  assert.match(problem, /BUILDERS_SNIPPET/);
  assert.deepEqual(rest, []);
  assert.equal(snippetDrift(`${BUILDERS_SNIPPET.text}\n`).length, 1);
});

// ── the rules held to the pinned core ────────────────────────────────────────────────────

/** The parts of core's manifest.py the check reads, written the way core writes them. */
function manifestPy({ kebab = MANIFEST_RULES.kebabPattern, types = MANIFEST_RULES.providerTypes } = {}) {
  return [
    `KEBAB_RE = re.compile(r"${kebab}")`,
    `ICON_NAME_RE = re.compile(r"${MANIFEST_RULES.iconPattern}")`,
    "",
    "PROVIDER_TYPES = frozenset(",
    "    {",
    ...types.flatMap((type, index) =>
      index === 0
        ? ['        # An app-contributed "duty" predicate, quoted in a comment.', `        "${type}",`]
        : [`        "${type}",`]
    ),
    "    }",
    ")",
    "",
    "_HOOK_OR_ENTRYPOINT_RE = re.compile(",
    `    r"${MANIFEST_RULES.implementationPattern}"`,
    ")",
    ""
  ].join("\n");
}

test("core's manifest rules at the pin match the check's", () => {
  assert.deepEqual(manifestRulesDrift(manifestPy()), []);
});

test("a provider type core adds or drops is drift, named", () => {
  const added = manifestRulesDrift(manifestPy({ types: [...MANIFEST_RULES.providerTypes, "hologram"] }));
  assert.equal(added.length, 1);
  assert.match(added[0], /PROVIDER_TYPES/);
  assert.match(added[0], /hologram/);
  const dropped = manifestRulesDrift(manifestPy({ types: MANIFEST_RULES.providerTypes.slice(1) }));
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], new RegExp(MANIFEST_RULES.providerTypes[0]));
});

test("a changed pattern is drift, named", () => {
  const [problem, ...rest] = manifestRulesDrift(manifestPy({ kebab: "^[a-z]+$" }));
  assert.match(problem, /KEBAB_RE/);
  assert.deepEqual(rest, []);
});

test("a rule the check cannot find is drift, never a pass", () => {
  const problems = manifestRulesDrift("");
  assert.equal(problems.length, 4);
  for (const name of ["KEBAB_RE", "ICON_NAME_RE", "PROVIDER_TYPES", "_HOOK_OR_ENTRYPOINT_RE"]) {
    assert.ok(problems.some((problem) => problem.includes(name)), name);
  }
});

// ── the sync check over fake pinned trees ────────────────────────────────────────────────

/** A missing path, shaped the way both source kinds report one (HTTP 404 and ENOENT). */
function missing(path) {
  return Object.assign(new Error(`not found: ${path}`), { status: 404, code: "ENOENT" });
}

/** A pinned tree holding exactly *files*: every other path is missing. */
function tree(files) {
  return {
    async readText(path) {
      if (Object.hasOwn(files, path)) return files[path];
      throw missing(path);
    }
  };
}

const core = tree({ [CORE_MANIFEST_PATH]: manifestPy() });
const apps = tree({ [BUILDERS_SNIPPET.path]: BUILDERS_SNIPPET.text });

test("the sync passes when the pinned file and rules are the ones the check holds", async () => {
  await checkBuildersSnippet(core, apps);
});

test("the sync fails when the pinned file changed", async () => {
  const bumped = tree({ [BUILDERS_SNIPPET.path]: BUILDERS_SNIPPET.text.replace("{", "{ ") });
  await assert.rejects(checkBuildersSnippet(core, bumped), /BUILDERS_SNIPPET/);
});

test("the sync fails, naming the app, when the pinned apps commit no longer has it", async () => {
  await assert.rejects(checkBuildersSnippet(core, tree({})), (error) => {
    assert.match(error.message, new RegExp(`no ${BUILDERS_SNIPPET.path}`));
    assert.doesNotMatch(error.message, /not found:/);
    return true;
  });
});

test("the sync fails when core's rules moved or its manifest module is gone", async () => {
  const moved = tree({ [CORE_MANIFEST_PATH]: manifestPy({ kebab: "^[a-z]+$" }) });
  await assert.rejects(checkBuildersSnippet(moved, apps), /KEBAB_RE/);
  await assert.rejects(checkBuildersSnippet(tree({}), apps), new RegExp(`no ${CORE_MANIFEST_PATH}`));
});

test("a read that fails for another reason fails the sync with that reason", async () => {
  const unreachable = {
    async readText() {
      throw Object.assign(new Error("GitHub request failed (503)"), { status: 503 });
    }
  };
  await assert.rejects(checkBuildersSnippet(core, unreachable), /503/);
});
