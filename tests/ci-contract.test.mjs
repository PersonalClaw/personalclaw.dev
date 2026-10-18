import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkContract, loadRepository } from "./support/ci-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";
const SETUP_NODE = "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0";
const IDENTITY = [
  "      - name: Record runner identity",
  "        run: |",
  '          echo "image=${ImageOS:-} version=${ImageVersion:-} arch=${RUNNER_ARCH:-}"',
  '          if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ] || [ -z "${RUNNER_ARCH:-}" ]; then',
  "            exit 1",
  "          fi",
].join("\n");

function workflow({
  runsOn = "ubuntu-24.04",
  identity = IDENTITY,
  nodeSource = "node-version-file: .node-version",
  top = "",
} = {}) {
  return [
    "name: Example",
    "on:",
    "  push:",
    top,
    "jobs:",
    "  example:",
    "    name: Example job",
    `    runs-on: ${runsOn}`,
    "    timeout-minutes: 5",
    "    steps:",
    identity,
    "      - name: Check out repository",
    `        uses: ${CHECKOUT}`,
    "      - name: Set up Node.js",
    `        uses: ${SETUP_NODE}`,
    "        with:",
    `          ${nodeSource}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const repository = (text = workflow()) => ({ workflows: { "example.yml": text } });
const rules = (violations) => [...new Set(violations.map((violation) => violation.rule))].sort();

test("the committed workflows satisfy the CI contract", () => {
  assert.deepEqual(checkContract(loadRepository(root)), []);
});

test("the planted baseline satisfies the contract, so each row below fails on its own plant", () => {
  assert.deepEqual(checkContract(repository()), []);
});

// The pin rows (action-sha, image-digest, package-manager and the Node pins) moved to
// tests/supply-chain.test.mjs, under the same rule ids.
const plants = [
  { rule: "runner-label", why: "a job on ubuntu-latest", text: workflow({ runsOn: "ubuntu-latest" }) },
  {
    rule: "setup-node-file",
    why: "a setup-node step with a literal version",
    text: workflow({ nodeSource: 'node-version: "22.23.3"' }),
  },
  { rule: "identity-step", why: "a job without the runner identity step", text: workflow({ identity: "" }) },
  {
    rule: "identity-step",
    why: "an identity step that only echoes",
    text: workflow({
      identity: [
        "      - name: Record runner identity",
        '        run: echo "image=$ImageOS version=$ImageVersion arch=$RUNNER_ARCH"',
      ].join("\n"),
    }),
  },
  { rule: "workflow-shape", why: "a workflow the YAML parser rejects", text: "jobs:\n  example: [\n" },
  {
    rule: "workflow-shape",
    why: "a workflow that shares values through an anchor",
    text: workflow({ top: "env: &shared\n  LEVEL: one" }),
  },
];

for (const plant of plants) {
  test(`the contract fails on ${plant.why}`, () => {
    assert.deepEqual(rules(checkContract(repository(plant.text))), [plant.rule]);
  });
}

// ── shared-build: the one-build shape of Website CI ─────────────────────────────
// Each plant is one edit to the committed ci.yml, so the rule is proved against the
// file it guards rather than against a sketch of it.

const committed = loadRepository(root).workflows;
const CI = committed["ci.yml"];

function plantCi(edit) {
  const text = edit(CI);
  assert.notEqual(text, CI, "the plant must change ci.yml");
  return { workflows: { ...committed, "ci.yml": text } };
}

// Replaces the nth (0-based) occurrence of `from`.
function nth(text, from, to, index = 0) {
  let at = -1;
  for (let count = 0; count <= index; count += 1) {
    at = text.indexOf(from, at + 1);
    assert.notEqual(at, -1, `ci.yml has no occurrence ${index} of ${JSON.stringify(from)}`);
  }
  return text.slice(0, at) + to + text.slice(at + from.length);
}

// One job's text, from its key to the next job's, so a plant names the job it edits
// and does not move when a job is added before it.
const inJob = (text, id, from, to) => {
  const start = text.indexOf(`\n  ${id}:\n`);
  assert.notEqual(start, -1, `ci.yml has no ${id} job`);
  const next = text.slice(start + 1).search(/\n  [a-z][a-z0-9-]*:\n/);
  const end = next === -1 ? text.length : start + 1 + next;
  const job = text.slice(start, end);
  assert.ok(job.includes(from), `the ${id} job has no ${JSON.stringify(from)}`);
  return text.slice(0, start) + job.replace(from, to) + text.slice(end);
};

// The browser job's text, so a plant can name one required job.
const inBrowser = (text, from, to) => inJob(text, "browser", from, to);

const sharedBuildPlants = [
  {
    why: "a required job without needs: build",
    match: /required job "browser" must declare needs: build/,
    edit: (text) => inBrowser(text, "    needs: build\n", ""),
  },
  {
    why: "a required job without if: always() (a failed build would skip it, and skipped passes)",
    match: /required job "browser" must run with if: \$\{\{ always\(\) \}\}/,
    edit: (text) => inBrowser(text, "    if: ${{ always() }}\n", ""),
  },
  {
    why: "a required job with if: success() instead of always()",
    match: /required job "performance" must run with if: \$\{\{ always\(\) \}\}/,
    edit: (text) => nth(text, "    if: ${{ always() }}\n", "    if: ${{ success() }}\n", 2),
  },
  {
    why: "a required job without the build gate step",
    match: /^the step after "Record runner identity" must be "Require the shared build"$/,
    edit: (text) => nth(text, "      - name: Require the shared build\n", "      - name: Note the build\n", 0),
  },
  {
    why: "a build gate that does not read needs.build.result",
    match: /"Require the shared build" must read needs\.build\.result/,
    edit: (text) => inBrowser(text, "BUILD_RESULT: ${{ needs.build.result }}", 'BUILD_RESULT: "success"'),
  },
  {
    why: "a build gate that does not say build failed, nothing checked",
    match: /must read needs\.build\.result and fail with "build failed, nothing checked"/,
    edit: (text) => inBrowser(text, "build failed, nothing checked", "the build did not finish"),
  },
  {
    why: "a build gate that drops the cancelled branch (a cancelled build would read as failed)",
    match: /^"Require the shared build" must fail a cancelled build with "the build was cancelled, nothing checked"$/,
    edit: (text) =>
      inBrowser(
        text,
        [
          '          if [ "$BUILD_RESULT" = "cancelled" ]; then',
          '            echo "::error::the build was cancelled, nothing checked" >&2',
          "            exit 1",
          "          fi\n",
        ].join("\n"),
        "",
      ),
  },
  {
    why: "a required job that rebuilds the site",
    match: /required job "browser" must test the shared build, not make its own: npm run test:browser$/,
    edit: (text) => inBrowser(text, "run: npm run test:browser:prebuilt", "run: npm run test:browser"),
  },
  {
    why: "a required job that runs npm run build",
    match: /required job "performance" must test the shared build, not make its own: npm run build && node scripts\/lighthouse-audit\.mjs/,
    edit: (text) => text.replace("run: npm run test:lighthouse:prebuilt", "run: npm run build && node scripts/lighthouse-audit.mjs"),
  },
  {
    why: "a required job that does not download the shared build",
    match: /required job "browser" must download the "site-build" artifact/,
    edit: (text) => inBrowser(text, "          name: site-build\n          digest-mismatch: error", "          name: other-build\n          digest-mismatch: error"),
  },
  {
    why: "a required job that does not verify the build record",
    match: /required job "browser" must verify the build record/,
    edit: (text) => inBrowser(text, "          node scripts/build-record.mjs verify\n", "          ls dist\n"),
  },
  {
    why: "a renamed required job (branch protection would wait on a check that never reports)",
    match: /required job "browser" must be named "Browser, accessibility, privacy, and visual regression"/,
    edit: (text) => text.replace("name: Browser, accessibility, privacy, and visual regression", "name: Browser checks"),
  },
  {
    why: "a build job with no timeout-minutes",
    match: /the build job must set timeout-minutes/,
    edit: (text) => inJob(text, "build", "    timeout-minutes: 10\n", ""),
  },
  {
    why: "a build upload that drops hidden files (.generated/, .preview-dist/)",
    match: /the build upload must set include-hidden-files: true/,
    edit: (text) => text.replace("          include-hidden-files: true\n", ""),
  },
  {
    why: "a build job that writes no build record",
    match: /the build job must write the build record/,
    edit: (text) => text.replace("        run: npm run build:record\n", "        run: echo no record\n"),
  },
  {
    why: "no build job",
    match: /ci\.yml must have a "build" job/,
    edit: (text) => text.replace("\n  build:\n", "\n  site:\n"),
  },
];

for (const { why, match, edit } of sharedBuildPlants) {
  test(`the shared-build rule fails on ${why}`, () => {
    const violations = checkContract(plantCi(edit));
    assert.deepEqual(rules(violations), ["shared-build"], violations.map((v) => `${v.rule} ${v.where}: ${v.message}`).join("\n"));
    assert.ok(violations.some((violation) => match.test(violation.message)), violations.map((v) => v.message).join("\n"));
  });
}

test("the shared-build rule judges ci.yml only", () => {
  assert.deepEqual(checkContract(repository()), []);
});
