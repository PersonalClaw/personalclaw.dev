import assert from "node:assert/strict";
import test from "node:test";

import { RECORD_PATH, createRecord, verifyRecord, writeRecord } from "../scripts/build-record.mjs";
import { rangeFloor, satisfies } from "./support/node-range.mjs";
import { FIXTURE_NODE, FIXTURE_NPM, createBuildFixture } from "./support/build-fixture.mjs";

const BUILD_RUN = { GITHUB_RUN_ID: "1001", GITHUB_RUN_ATTEMPT: "1", GITHUB_WORKFLOW: "Website CI" };

// Builds a fixture, records it as run 1001, applies `plant`, and verifies it as a
// consumer would. `plant` may return overrides for the consumer's env, Node and npm.
function verifyPlanted(plant = () => ({})) {
  const fixture = createBuildFixture();
  try {
    writeRecord(fixture.root, createRecord({ root: fixture.root, env: BUILD_RUN, node: FIXTURE_NODE, npm: FIXTURE_NPM }));
    const record = () => JSON.parse(fixture.read(RECORD_PATH));
    const rewrite = (change) => {
      const next = record();
      change(next);
      fixture.write(RECORD_PATH, `${JSON.stringify(next, null, 2)}\n`);
    };
    const consumer = { env: BUILD_RUN, node: FIXTURE_NODE, npm: FIXTURE_NPM, ...(plant({ fixture, rewrite, record }) ?? {}) };
    return verifyRecord({ root: fixture.root, ...consumer });
  } finally {
    fixture.dispose();
  }
}

test("a shared build verifies in the run and on the tree it was built from", () => {
  assert.deepEqual(verifyPlanted(), []);
});

test("the build record names the exact toolchain, the pins, the generated data, every file and a digest", () => {
  const fixture = createBuildFixture();
  try {
    const record = createRecord({ root: fixture.root, env: BUILD_RUN, node: FIXTURE_NODE, npm: FIXTURE_NPM });
    assert.equal(record.node, "v22.23.3");
    assert.ok(satisfies(record.node, ">=22.19.0"), "the record's Node is 22.19 or newer");
    assert.equal(rangeFloor(">=22.19.0 <23"), "22.19.0");
    assert.equal(record.npm, "10.9.9");
    assert.match(record.tree, /^[0-9a-f]{40}$/);
    assert.match(record.commit, /^[0-9a-f]{40}$/);
    assert.match(record.lockSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(record.run, { id: "1001", attempt: "1", workflow: "Website CI" });
    assert.deepEqual(Object.keys(record.sources).sort(), ["apps", "core", "registry"]);
    assert.match(record.sources.core.installSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(record.generated).sort(), [
      ".generated/docs-index.json",
      ".generated/registry.json",
      ".generated/release-facts.json",
    ]);
    assert.equal(record.generated[".generated/release-facts.json"].generatedAt, "2026-10-17T00:00:00.000Z");
    assert.ok(record.files.some((file) => file.path === "dist/index.html"));
    assert.ok(record.files.some((file) => file.path === ".preview-dist/index.html"));
    assert.ok(record.files.some((file) => file.path === "src/content/docs/docs/index.md"));
    assert.ok(!record.files.some((file) => file.path === RECORD_PATH), "the record does not list itself");
    assert.match(record.digest, /^[0-9a-f]{64}$/);
  } finally {
    fixture.dispose();
  }
});

const plants = [
  { why: "no build record (the artifact never arrived)", match: /build record \.generated\/build-record\.json is missing/, plant: ({ fixture }) => fixture.remove(RECORD_PATH) },
  { why: "an unreadable build record", match: /is not readable JSON/, plant: ({ fixture }) => fixture.write(RECORD_PATH, "{") },
  { why: "a missing dist/", match: /^dist\/ is missing/, plant: ({ fixture }) => fixture.remove("dist") },
  { why: "a missing file from the build", match: /dist\/docs\/index\.html is in the build record but missing/, plant: ({ fixture }) => fixture.remove("dist/docs/index.html") },
  {
    why: "a record from another tree",
    match: /built from tree 0{12}, this checkout is [0-9a-f]{12}/,
    plant: ({ rewrite }) => rewrite((record) => (record.tree = "0".repeat(40))),
  },
  {
    why: "a checkout with tracked changes",
    match: /this checkout differs from its commit: M package\.json/,
    plant: ({ fixture }) => fixture.write("package.json", `${fixture.read("package.json")} `),
  },
  {
    why: "a checkout that moved to another commit after the build",
    match: /built from tree [0-9a-f]{12}, this checkout is [0-9a-f]{12}/,
    plant: ({ fixture }) => {
      fixture.write("README.md", "a later commit\n");
      fixture.commitAll();
    },
  },
  { why: "another run's build", match: /built in run 1001, this is run 1002/, plant: () => ({ env: { ...BUILD_RUN, GITHUB_RUN_ID: "1002" } }) },
  {
    why: "a local build handed to a CI run",
    match: /built in run none \(a local build\), this is run 1001/,
    plant: ({ rewrite }) => rewrite((record) => (record.run = { id: null, attempt: null, workflow: null })),
  },
  {
    why: "one changed byte in a built page",
    match: /dist\/index\.html differs from the build record/,
    plant: ({ fixture }) => fixture.write("dist/index.html", `${fixture.read("dist/index.html")}x`),
  },
  { why: "a file the build did not make", match: /dist\/extra\.html is not in the build record/, plant: ({ fixture }) => fixture.write("dist/extra.html", "x") },
  {
    why: "an edited file list with its digest left alone",
    match: /file list does not match the record's digest/,
    plant: ({ rewrite }) => rewrite((record) => record.files.pop()),
  },
  {
    why: "generated data re-synced after the build",
    match: /\.generated\/release-facts\.json differs from the build record: it was re-synced after the build/,
    plant: ({ fixture }) => fixture.write(".generated/release-facts.json", '{"schemaVersion":1,"generatedAt":"2026-10-17T09:00:00.000Z"}\n'),
  },
  {
    why: "a build on Node below the lock's 22.19 floor",
    match: /the build ran Node v22\.18\.0, outside package\.json engines >=22\.19\.0 <23 \(floor 22\.19\.0\)/,
    plant: ({ rewrite }) => {
      rewrite((record) => (record.node = "v22.18.0"));
      return { node: "v22.18.0" };
    },
  },
  {
    why: "a build on a Node other than .node-version",
    match: /the build ran Node v22\.23\.2, \.node-version pins v22\.23\.3/,
    plant: ({ rewrite }) => {
      rewrite((record) => (record.node = "v22.23.2"));
      return { node: "v22.23.2" };
    },
  },
  { why: "a consumer on another Node than the build", match: /this job runs Node v22\.23\.2, the build ran v22\.23\.3/, plant: () => ({ node: "v22.23.2" }) },
  {
    why: "a build on an npm other than packageManager",
    match: /the build ran npm 10\.9\.8, package\.json packageManager pins npm@10\.9\.9/,
    plant: ({ rewrite }) => {
      rewrite((record) => (record.npm = "10.9.8"));
      return { npm: "10.9.8" };
    },
  },
  {
    why: "a record whose source pins are not this checkout's",
    match: /the build record's source pins differ from sources\/personalclaw\.sources\.json: core\.commit/,
    plant: ({ rewrite }) => rewrite((record) => (record.sources.core.commit = "f".repeat(40))),
  },
];

for (const { why, match, plant } of plants) {
  test(`the shared build is refused on ${why}`, () => {
    const problems = verifyPlanted(plant);
    assert.ok(problems.length > 0, "expected a refusal");
    assert.ok(problems.some((problem) => match.test(problem)), `expected ${match}, found:\n${problems.join("\n")}`);
  });
}
