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
