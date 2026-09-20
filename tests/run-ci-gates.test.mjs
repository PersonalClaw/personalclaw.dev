import assert from "node:assert/strict";
import test from "node:test";

import { renderReport, runCiGates } from "../scripts/run-ci-gates.mjs";

function runWithFailures(...failures) {
  const failedGates = new Set(failures);
  const executed = [];
  let output = "";
  const result = runCiGates({
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
