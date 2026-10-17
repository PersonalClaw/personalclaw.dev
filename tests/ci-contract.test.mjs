import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkContract,
  loadRepository,
  rangeFloor,
  satisfies,
} from "./support/ci-contract.mjs";

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
  checkout = CHECKOUT,
  nodeSource = "node-version-file: .node-version",
  extraJobKeys = "",
  extraSteps = "",
} = {}) {
  return [
    "name: Example",
    "on:",
    "  push:",
    "jobs:",
    "  example:",
    "    name: Example job",
    `    runs-on: ${runsOn}`,
    "    timeout-minutes: 5",
    extraJobKeys,
    "    steps:",
    identity,
    "      - name: Check out repository",
    `        uses: ${checkout}`,
    "      - name: Set up Node.js",
    `        uses: ${SETUP_NODE}`,
    "        with:",
    `          ${nodeSource}`,
    extraSteps,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function lock(engines = {}) {
  const packages = { "": { name: "example", engines: { node: ">=22.19.0 <23" } } };
  for (const [name, range] of Object.entries(engines)) {
    packages[`node_modules/${name}`] = { version: "1.0.0", engines: { node: range } };
  }
  return { lockfileVersion: 3, packages };
}

function repository(overrides = {}) {
  return {
    workflows: { "example.yml": workflow() },
    nodeVersion: "22.23.3\n",
    packageJson: { packageManager: "npm@10.9.9", engines: { node: ">=22.19.0 <23" } },
    lock: lock({ "needs-recent-node": ">=22.19", "older-floor": "^20.19.0 || >=22.12.0" }),
    ...overrides,
  };
}

const rules = (violations) => [...new Set(violations.map((violation) => violation.rule))].sort();

test("the committed workflows and Node pins satisfy the CI contract", () => {
  const violations = checkContract(loadRepository(root));
  assert.deepEqual(violations, []);
});

test("the planted baseline satisfies the contract, so each row below fails on its own plant", () => {
  assert.deepEqual(checkContract(repository()), []);
});

const plants = [
  {
    rule: "action-sha",
    why: "an action by tag",
    repo: { workflows: { "example.yml": workflow({ checkout: "actions/checkout@v7" }) } },
  },
  {
    rule: "action-sha",
    why: "an action by SHA without its release tag",
    repo: {
      workflows: {
        "example.yml": workflow({ checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" }),
      },
    },
  },
  {
    rule: "runner-label",
    why: "a job on ubuntu-latest",
    repo: { workflows: { "example.yml": workflow({ runsOn: "ubuntu-latest" }) } },
  },
  {
    rule: "setup-node-file",
    why: "a setup-node step with a literal version",
    repo: { workflows: { "example.yml": workflow({ nodeSource: 'node-version: "22"' }) } },
  },
  {
    rule: "identity-step",
    why: "a job without the runner identity step",
    repo: { workflows: { "example.yml": workflow({ identity: "" }) } },
  },
  {
    rule: "identity-step",
    why: "an identity step that only echoes",
    repo: {
      workflows: {
        "example.yml": workflow({
          identity: [
            "      - name: Record runner identity",
            '        run: echo "image=$ImageOS version=$ImageVersion arch=$RUNNER_ARCH"',
          ].join("\n"),
        }),
      },
    },
  },
  {
    rule: "image-digest",
    why: "a container image by tag alone",
    repo: {
      workflows: {
        "example.yml": workflow({ extraJobKeys: "    container:\n      image: node:22-bookworm" }),
      },
    },
  },
  {
    rule: "image-digest",
    why: "an image digest without its architecture",
    repo: {
      workflows: {
        "example.yml": workflow({
          extraJobKeys: `    container:\n      image: node@sha256:${"a".repeat(64)}`,
        }),
      },
    },
  },
  {
    rule: "package-manager",
    why: "a missing packageManager",
    repo: { packageJson: { engines: { node: ">=22.19.0 <23" } } },
  },
  {
    rule: "package-manager",
    why: "a packageManager that is not an exact npm",
    repo: { packageJson: { packageManager: "npm@10", engines: { node: ">=22.19.0 <23" } } },
  },
  {
    rule: "node-version-exact",
    why: "a floating .node-version",
    repo: { nodeVersion: "22\n" },
  },
  {
    rule: "node-version-lock",
    why: "a .node-version below the lock's 22.19 minimum",
    repo: { nodeVersion: "22.12.0\n", packageJson: { packageManager: "npm@10.9.9", engines: { node: ">=22.12.0 <23" } } },
    alsoRules: ["engines-floor"],
  },
  {
    rule: "node-version-engines",
    why: "a .node-version outside package.json engines",
    repo: { nodeVersion: "24.18.0\n", lock: lock() },
  },
  {
    rule: "engines-floor",
    why: "an engines floor below the lock's minimum",
    repo: { packageJson: { packageManager: "npm@10.9.9", engines: { node: ">=22.12.0 <23" } } },
  },
];

for (const plant of plants) {
  test(`the contract fails on ${plant.why}`, () => {
    const violations = checkContract(repository(plant.repo));
    assert.deepEqual(rules(violations), [plant.rule, ...(plant.alsoRules ?? [])].sort());
  });
}

test("an optional platform binary does not set the Node minimum", () => {
  const withOptional = lock({ "needs-recent-node": ">=22.19" });
  withOptional.packages["node_modules/platform-binary"] = {
    version: "1.0.0",
    optional: true,
    engines: { node: ">=24" },
  };
  assert.deepEqual(checkContract(repository({ lock: withOptional })), []);
});

test("the range reader agrees with npm on the forms the lock uses", () => {
  const cases = [
    ["22.23.3", ">=22.19", true],
    ["22.12.0", ">=22.19.0", false],
    ["22.23.3", "^20.19.0 || >=22.12.0", true],
    ["22.12.0", "^20.19.0 || ^22.13.0 || >=23.5.0", false],
    ["22.23.3", "18.20.8 || ^20.3.0 || >=22.0.0", true],
    ["22.23.3", "^20.9.0", false],
    ["22.23.3", ">=22.19.0 <23", true],
    ["23.0.0", ">=22.19.0 <23", false],
    ["22.23.3", "~22.23.0", true],
    ["22.23.3", "*", true],
  ];
  for (const [version, range, expected] of cases) {
    assert.equal(satisfies(version, range), expected, `${version} against ${range}`);
  }
  assert.equal(rangeFloor(">=22.19.0 <23"), "22.19.0");
  assert.equal(rangeFloor("^20.19.0 || >=22.12.0"), "20.19.0");
  assert.throws(() => satisfies("22.23.3", "latest"));
});
