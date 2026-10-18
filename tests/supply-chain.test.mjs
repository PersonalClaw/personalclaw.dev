import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkSupplyChain, dockerfileImages, loadSupplyChain } from "./support/supply-chain.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = "2026-10-17";
const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const DIGEST = `sha256:${"a".repeat(64)}`;
const CHECKOUT = `actions/checkout@${SHA} # v7.0.1`;
const SETUP_NODE = `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`;

const EOL = '[node_end_of_life]\n"20" = 2026-04-30\n"22" = 2027-04-30\n"24" = 2028-04-30\n';
const ISSUES_ENTRY = [
  "[[audited_write]]",
  'workflow = "example.yml"',
  'job = "example"',
  'permission = "issues: write"',
  'steps = ["File the issue"]',
  'reason = "Files the tracking issue."',
].join("\n");

// One job. `top` and `jobKeys` are YAML lines; `checkoutWith` replaces the checkout's
// with: block; `steps` are extra step lines appended at the end.
function workflow({
  top = "permissions:\n  contents: read",
  jobKeys = "",
  checkout = CHECKOUT,
  checkoutWith = "        with:\n          persist-credentials: false",
  nodeWith = "          node-version-file: .node-version",
  steps = "",
} = {}) {
  return [
    "name: Example",
    "on:",
    "  push:",
    top,
    "jobs:",
    "  example:",
    "    runs-on: ubuntu-24.04",
    jobKeys,
    "    steps:",
    "      - name: Check out repository",
    `        uses: ${checkout}`,
    checkoutWith,
    "      - name: Set up Node.js",
    `        uses: ${SETUP_NODE}`,
    "        with:",
    nodeWith,
    "      - name: Install locked dependencies",
    "        run: npm ci",
    "      - name: Install Chromium",
    "        run: npx playwright install --with-deps chromium",
    steps,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const ISSUE_STEP = [
  "      - name: File the issue",
  "        env:",
  "          GH_TOKEN: ${{ github.token }}",
  "        run: gh issue create --title example",
].join("\n");

function lock(engines = { "needs-recent-node": ">=22.19" }) {
  const packages = {
    "": { name: "example", engines: { node: ">=22.19.0 <23" } },
    "node_modules/@playwright/test": { version: "1.64.0", bin: { playwright: "cli.js" } },
  };
  for (const [name, range] of Object.entries(engines)) {
    packages[`node_modules/${name}`] = { version: "1.0.0", engines: { node: range } };
  }
  return { lockfileVersion: 3, packages };
}

const PACKAGE_JSON = {
  packageManager: "npm@10.9.9",
  engines: { node: ">=22.19.0 <23" },
  devDependencies: { "@playwright/test": "1.64.0" },
};

function repository({ text = workflow(), policy = EOL, packages, ...rest } = {}) {
  return {
    workflows: { "example.yml": text },
    packages: packages ?? { ".": { packageJson: PACKAGE_JSON, lock: lock() } },
    nodeVersion: "22.23.3\n",
    dockerfiles: {},
    policy,
    ...rest,
  };
}

const exception = (fields) =>
  "[[exception]]\n" +
  Object.entries(fields)
    .map(([key, value]) => `${key} = ${/^\d{4}-\d\d-\d\d$/.test(value) ? value : JSON.stringify(value)}`)
    .join("\n");

const LIVE_EXCEPTION = {
  file: ".github/workflows/example.yml",
  reference: "example Install the CLI",
  scope: "run-install",
  owner: "maintainers",
  reason: "The tool publishes no versioned build yet.",
  expires: "2026-11-10",
};
const UNPINNED_INSTALL = "      - name: Install the CLI\n        run: pip install pyinstaller";

const check = (repo) => checkSupplyChain(repo, { today: TODAY });
const rules = (violations) => [...new Set(violations.map((violation) => violation.rule))].sort();

test("the committed workflows, packages and policy satisfy the supply-chain check", () => {
  assert.deepEqual(checkSupplyChain(loadSupplyChain(root)), []);
});

test("the planted baseline passes, so each row below fails on its own plant", () => {
  assert.deepEqual(check(repository()), []);
  assert.deepEqual(check(repository({ text: workflow({ top: "permissions:\n  contents: read\n  issues: none", steps: ISSUE_STEP }) })), []);
});

const docker = (text) => ({ dockerfiles: { "deploy/Dockerfile": text } });

// Step 2: every pin rule, one plant per violation the issue names.
const pinPlants = [
  ["action-sha", "an action by tag", { text: workflow({ checkout: "actions/checkout@v7" }) }],
  ["action-sha", "an action by SHA without its release tag", { text: workflow({ checkout: `actions/checkout@${SHA}` }) }],
  ["image-digest", "a docker:// reference by tag", { text: workflow({ steps: "      - name: Lint\n        uses: docker://alpine:3.20 # linux/amd64" }) }],
  ["image-digest", "a workflow container without a digest", { text: workflow({ jobKeys: "    container:\n      image: node:22-bookworm # linux/amd64" }) }],
  ["image-digest", "a Dockerfile image without a digest", docker("FROM node:22-alpine\n")],
  ["image-digest", "an image named through an ARG whose default is a bare tag", docker("ARG BASE=python:3.13-slim\nFROM ${BASE}\n")],
  ["image-digest", "an index digest with no platform", docker(`FROM node@${DIGEST}\n`)],
  ["run-install", "a run: step installing a tool with no version", { text: workflow({ steps: "      - name: Install the CLI\n        run: pip install pyinstaller" }) }],
  ["run-install", "a global npm install with no version", { text: workflow({ steps: "      - name: Install the CLI\n        run: npm install -g serve" }) }],
  ["run-install", "npx of a package outside the lock", { text: workflow({ steps: "      - name: Serve\n        run: npx serve dist" }) }],
  ["setup-floating", "a floating setup-node", { text: workflow({ nodeWith: "          node-version: 22" }) }],
  ["setup-floating", "setup-node with check-latest", { text: workflow({ nodeWith: "          node-version-file: .node-version\n          check-latest: true" }) }],
  ["setup-floating", "a floating setup-uv", { text: workflow({ steps: `      - name: Set up uv\n        uses: astral-sh/setup-uv@${SHA} # v6.0.0` }) }],
  ["package-manager", "a missing packageManager", { packages: { ".": { packageJson: { ...PACKAGE_JSON, packageManager: undefined }, lock: lock() } } }],
  ["package-manager", "a packageManager that is not an exact npm", { packages: { ".": { packageJson: { ...PACKAGE_JSON, packageManager: "npm@10" }, lock: lock() } } }],
  ["node-version-exact", "a floating .node-version", { nodeVersion: "22\n" }],
  ["node-eol", "a Node line past its end of life", { nodeVersion: "20.19.5\n", packages: { ".": { packageJson: { ...PACKAGE_JSON, engines: { node: ">=20.19.0" } }, lock: lock({}) } } }],
  ["node-eol", "a Node line the end-of-life table does not list", { nodeVersion: "26.1.0\n", packages: { ".": { packageJson: { ...PACKAGE_JSON, engines: { node: ">=22.19.0" } }, lock: lock() } } }],
  ["node-version-lock", "the website's Node below its lock's minimum", { nodeVersion: "22.18.0\n", packages: { ".": { packageJson: { ...PACKAGE_JSON, engines: { node: ">=22.18.0 <23" } }, lock: lock() } } }, ["engines-floor"]],
  ["node-version-engines", "a .node-version outside package.json engines", { nodeVersion: "24.18.0\n", packages: { ".": { packageJson: PACKAGE_JSON, lock: lock({}) } } }],
  ["engines-floor", "an engines floor below the lock's minimum", { packages: { ".": { packageJson: { ...PACKAGE_JSON, engines: { node: ">=22.12.0 <23" } }, lock: lock() } } }],
];

const ISSUES_JOB = "    permissions:\n      contents: read\n      issues: write";
const listedIssues = (jobKeys = ISSUES_JOB) => ({
  text: workflow({ jobKeys, steps: ISSUE_STEP }),
  policy: `${EOL}\n${ISSUES_ENTRY}\n`,
});
const CREDENTIALS_ENTRY = [
  "[[audited_write]]",
  'workflow = "example.yml"',
  'job = "example"',
  'permission = "persist-credentials"',
  'steps = ["Check out repository"]',
  'reason = "Pushes a generated commit."',
].join("\n");
const withoutField = (field) =>
  ISSUES_ENTRY.split("\n").filter((line) => !line.startsWith(`${field} =`)).join("\n");

// Step 3: least privilege.
const privilegePlants = [
  ["write-all", "a write-all job", { text: workflow({ jobKeys: "    permissions: write-all" }) }],
  ["write-all", "a write-all workflow", { text: workflow({ top: "permissions: write-all" }) }],
  ["unlisted-write", "a contents: write the list does not name", { text: workflow({ jobKeys: "    permissions:\n      contents: write" }) }],
  ["unlisted-write", "a contents: write inherited from the top of a workflow", { text: workflow({ top: "permissions:\n  contents: write" }) }],
  ["unlisted-write", "an extra permission added to a listed job", listedIssues(`${ISSUES_JOB}\n      pull-requests: write`)],
  ["unused-top-level-write", "a top-level write that no job inherits", { text: workflow({ top: "permissions:\n  contents: read\n  issues: write", jobKeys: "    permissions:\n      contents: read" }) }],
  ["permissions-declared", "a job without permissions in a workflow with no top-level block", { text: workflow({ top: "" }) }],
  ["persist-credentials", "a checkout without persist-credentials: false", { text: workflow({ checkoutWith: "" }) }],
  ["token-env", "a workflow-level env that passes github.token", { text: workflow({ top: "permissions:\n  contents: read\nenv:\n  GITHUB_TOKEN: ${{ github.token }}" }) }],
  ["token-env", "a job-level env that passes a secret", { text: workflow({ jobKeys: "    env:\n      API_KEY: ${{ secrets.EXAMPLE_KEY }}" }) }],
  ["workflow-shape", "a scalar permissions value the rules cannot judge", { text: workflow({ top: "permissions: read" }) }],
  ["audited-write-entry", "a list entry that matches no grant", { policy: `${EOL}\n${ISSUES_ENTRY}\n` }],
  ["audited-write-entry", "a list entry naming a step the job does not have", { ...listedIssues(), policy: `${EOL}\n${ISSUES_ENTRY.replace("File the issue", "Close the issue")}\n` }, ["unlisted-write"]],
  ...["workflow", "job", "permission", "steps", "reason"].map((field) => [
    "audited-write-entry",
    `a list entry missing ${field}`,
    { ...listedIssues(), policy: `${EOL}\n${withoutField(field)}\n` },
    ["unlisted-write"],
  ]),
  ["policy-file", "a missing policy file", { policy: null }, ["node-eol"]],
  ["policy-file", "a policy file that is not TOML", { policy: `${EOL}\n[[audited_write]\n` }, ["node-eol"]],
];

const withException = (fields, extra = UNPINNED_INSTALL) => ({
  text: workflow({ steps: extra }),
  policy: `${EOL}\n${exception(fields)}\n`,
});
const without = (field) => Object.fromEntries(Object.entries(LIVE_EXCEPTION).filter(([key]) => key !== field));

// Step 4: exceptions. A broken exception waives nothing, so the violation it was meant
// to cover is reported too.
const exceptionPlants = [
  ["exception", "an exception past its expiry", withException({ ...LIVE_EXCEPTION, expires: "2026-10-16" }), ["run-install"]],
  ["exception", "an exception more than 30 days out", withException({ ...LIVE_EXCEPTION, expires: "2026-11-17" }), ["run-install"]],
  ["exception", "an exception that matches nothing", withException(LIVE_EXCEPTION, "")],
  ["exception", "an exception whose expiry is not a date", withException({ ...LIVE_EXCEPTION, expires: "soon" }), ["run-install"]],
  ["exception", "an exception for a rule that cannot be waived", withException({ ...LIVE_EXCEPTION, scope: "exception" }), ["run-install"]],
  ...["file", "reference", "scope", "owner", "reason", "expires"].map((field) => [
    "exception",
    `an exception missing ${field}`,
    withException(without(field)),
    ["run-install"],
  ]),
];

for (const [rule, why, overrides, alsoRules = []] of [...pinPlants, ...privilegePlants, ...exceptionPlants]) {
  test(`the supply-chain check fails on ${why}`, () => {
    assert.deepEqual(rules(check(repository(overrides))), [rule, ...alsoRules].sort());
  });
}

const passes = [
  ["a step-level env that passes github.token", { text: workflow({ steps: ISSUE_STEP }) }],
  ["a listed write permission", listedIssues()],
  ["a checkout that keeps its credentials when it is listed as an audited write step", { text: workflow({ checkoutWith: "" }), policy: `${EOL}\n${CREDENTIALS_ENTRY}\n` }],
  ["a live exception, which waives the reference it names", withException(LIVE_EXCEPTION)],
  ["an exception exactly 30 days out", withException({ ...LIVE_EXCEPTION, expires: "2026-11-16" })],
  ["an image pinned by digest for one platform", { text: workflow({ jobKeys: `    container:\n      image: node@${DIGEST} # linux/amd64` }), ...docker(`ARG BASE=node@${DIGEST}\nFROM --platform=linux/amd64 \${BASE} AS build\nFROM build\n`) }],
  ["installs from the lock: npm ci and the locked Playwright's browser", { text: workflow() }],
  ["installs from the lock without its scripts: npm ci --ignore-scripts (the audit jobs)", { text: workflow({ steps: "      - name: Install locked dependencies without their scripts\n        run: npm ci --ignore-scripts" }) }],
  ["an install that names an exact version", { text: workflow({ steps: "      - name: Install the CLI\n        run: |\n          pip install pyinstaller==6.11.1\n          npx --yes serve@14.2.4 --version" }) }],
];

for (const [why, overrides] of passes) {
  test(`the supply-chain check passes ${why}`, () => {
    assert.deepEqual(check(repository(overrides)), []);
  });
}

test("a second package.json CI installs from is held to the same pins", () => {
  const text = workflow({ steps: "      - name: Install the tool's dependencies\n        working-directory: tools/example\n        run: npm ci" });
  const repo = repository({
    text,
    packages: {
      ".": { packageJson: PACKAGE_JSON, lock: lock() },
      "tools/example": { packageJson: { engines: { node: ">=22.19.0 <23" } }, lock: lock() },
    },
  });
  const violations = check(repo);
  assert.deepEqual(rules(violations), ["package-manager"]);
  assert.equal(violations[0].file, "tools/example/package.json");
});

test("a Dockerfile image is judged through its ARG default and its platform", () => {
  assert.deepEqual(
    dockerfileImages(`ARG BASE=python:3.13-slim\nFROM \${BASE} AS build\nFROM build\nFROM scratch\n`).map((image) => image.reference),
    ["python:3.13-slim"],
  );
  assert.equal(dockerfileImages(`FROM --platform=linux/arm64 node@${DIGEST}\n`)[0].comment, "linux/arm64");
});
