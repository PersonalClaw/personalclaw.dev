import assert from "node:assert/strict";
import test from "node:test";

import { createRecord, writeRecord } from "../scripts/build-record.mjs";
import { defaultExecutor, renderReport, runCiGates } from "../scripts/run-ci-gates.mjs";
import { FIXTURE_NODE, FIXTURE_NPM, createBuildFixture } from "./support/build-fixture.mjs";

function runWithFailures(...failures) {
  return runWith({}, ...failures);
}

function runWith(options, ...failures) {
  const failedGates = new Set(failures);
  const executed = [];
  let output = "";
  const result = runCiGates({
    ...options,
    execute(gate) {
      executed.push(gate.name);
      return {
        status: failedGates.has(gate.name) ? "FAIL" : "PASS",
        detail: failedGates.has(gate.name) ? "exit 1" : "",
      };
    },
    write(text) {
      output += text;
    },
  });

  return {
    ...result,
    executed,
    output,
  };
}

function statusesByGate(rows) {
  return Object.fromEntries(rows.map((row) => [row.name, row.status]));
}

test("test:ci reports multiple independent failures in one result table", () => {
  const result = runWithFailures(
    "validate:visual-baselines",
    "validate:design-tokens",
  );
  const statuses = statusesByGate(result.rows);

  assert.equal(result.exitCode, 1);
  assert.equal(new Set(result.rows.map((row) => row.name)).size, result.rows.length);
  assert.equal(statuses["validate:visual-baselines"], "FAIL");
  assert.equal(statuses["validate:design-tokens"], "FAIL");
  assert.equal(
    result.output.match(/=== test:ci result table ===/g)?.length,
    1,
  );
  assert.match(
    result.output,
    /validate:visual-baselines\s+FAIL\s+exit 1/,
  );
  assert.match(result.output, /validate:design-tokens\s+FAIL\s+exit 1/);
  assert.match(result.output, /OVERALL\s+FAIL/);
});

test("test:ci marks build-dependent gates skipped when build fails", () => {
  const result = runWithFailures("build");
  const statuses = statusesByGate(result.rows);
  const skippedGates = [
    "validate:build",
    "validate:blog",
    "validate:compare",
    "build:preview",
    "validate:preview",
    "playwright",
    "lighthouse",
  ];

  assert.equal(result.exitCode, 1);
  assert.equal(statuses.build, "FAIL");
  assert.equal(statuses["validate:registry"], "PASS");
  assert.equal(result.executed.includes("validate:registry"), true);
  for (const gate of skippedGates) {
    assert.equal(statuses[gate], "SKIP");
    assert.equal(result.executed.includes(gate), false);
  }

  const report = renderReport(result.rows).text;
  for (const gate of skippedGates) {
    const escapedGate = gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(report, new RegExp(`^${escapedGate}\\s+SKIP\\b`, "m"));
    assert.doesNotMatch(report, new RegExp(`^${escapedGate}\\s+PASS\\b`, "m"));
  }
  assert.match(report, /OVERALL\s+FAIL/);
});

test("the full gate's playwright row says the visual specs did not run there, pass or fail", async () => {
  const { VISUAL_NOTE } = await import("../scripts/run-ci-gates.mjs");
  for (const failures of [[], ["playwright"]]) {
    const result = runWithFailures(...failures);
    const row = result.rows.find((each) => each.name === "playwright");
    assert.ok(row.detail.endsWith(VISUAL_NOTE), row.detail);
    assert.match(result.output, /^playwright\s+(?:PASS|FAIL)\s+.*visual specs not run here/m);
  }
  assert.equal(runWith({ staticOnly: true }).rows.some((row) => row.detail.includes("visual specs")), false);
});

test("the unit tier runs exactly the files package.json's test:unit runs, in order", async () => {
  const { readFile } = await import("node:fs/promises");
  const { unitTests } = await import("../scripts/run-ci-gates.mjs");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const script = packageJson.scripts["test:unit"].trim().split(/\s+/);
  assert.deepEqual(script.slice(0, 2), ["node", "--test"]);
  assert.deepEqual(unitTests.args, script.slice(1));
});

// ── --prebuilt: the static run tests the build job's output ─────────────────────

const STATIC_ORDER = [
  "unit-tests",
  "validate:visual-baselines",
  "validate:marketing-manifest",
  "validate:design-tokens",
  "validate:source-pins",
  "validate:release-parity",
];

test("without --prebuilt, test:static builds and runs every gate in today's order", () => {
  const result = runWith({ staticOnly: true });
  assert.deepEqual(result.executed, [
    ...STATIC_ORDER,
    "build",
    "validate:registry",
    "validate:build",
    "validate:blog",
    "validate:compare",
    "build:preview",
    "validate:preview",
  ]);
  assert.equal(result.exitCode, 0);
});

test("a prebuilt static run builds nothing, and still runs the registry, build and preview consumers", () => {
  const result = runWith({ staticOnly: true, prebuilt: true });
  // build:preview does not run either: the build job makes the preview build from the
  // same sync as the production build, so no re-sync here can move .generated/ past dist/.
  assert.deepEqual(result.executed, [
    ...STATIC_ORDER,
    "prebuilt",
    "validate:registry",
    "validate:build",
    "validate:blog",
    "validate:compare",
    "validate:preview",
  ]);
  assert.equal(result.rows.some((row) => row.name === "build" || row.name === "build:preview"), false);
  assert.equal(result.exitCode, 0);
});

test("a prebuilt run whose build does not verify fails, and skips what reads it", () => {
  const result = runWith({ staticOnly: true, prebuilt: true }, "prebuilt");
  const statuses = statusesByGate(result.rows);
  assert.equal(result.exitCode, 1);
  assert.equal(statuses.prebuilt, "FAIL");
  assert.equal(statuses["validate:registry"], "PASS");
  for (const gate of ["validate:build", "validate:blog", "validate:compare", "validate:preview"]) {
    assert.equal(statuses[gate], "SKIP");
    assert.equal(result.executed.includes(gate), false);
  }
  assert.match(result.output, /OVERALL\s+FAIL/);
});

test("a prebuilt run with no dist/ reads FAIL naming dist/, not SKIP", () => {
  const fixture = createBuildFixture();
  const env = { GITHUB_RUN_ID: "1001", GITHUB_RUN_ATTEMPT: "1", GITHUB_WORKFLOW: "Website CI" };
  try {
    writeRecord(fixture.root, createRecord({ root: fixture.root, env, node: FIXTURE_NODE, npm: FIXTURE_NPM }));
    fixture.remove("dist");
    let output = "";
    const result = runCiGates({
      staticOnly: true,
      prebuilt: { root: fixture.root, env, node: FIXTURE_NODE, npm: FIXTURE_NPM },
      execute: (gate) => (gate.name === "prebuilt" ? defaultExecutor(gate) : { status: "PASS", detail: "" }),
      write(text) {
        output += text;
      },
    });
    const prebuilt = result.rows.find((row) => row.name === "prebuilt");
    assert.equal(prebuilt.status, "FAIL");
    assert.match(prebuilt.detail, /^dist\/ is missing/);
    assert.match(output, /^prebuilt\s+FAIL\s+dist\/ is missing/m);
    assert.equal(result.exitCode, 1);
  } finally {
    fixture.dispose();
  }
});
