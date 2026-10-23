// .github/workflows/dependency-review.yml reviews a pull request's dependencies over the API
// (PersonalClaw/PersonalClaw#4585). It runs only on pull_request_target, so main's copy runs;
// it holds contents: read and nothing else, references no secret, has no checkout at all, and
// its one action is the pinned dependency-review action, which reads the base and head from the
// event. Each rule fails on a planted edit of the committed workflow.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".github", "workflows", "dependency-review.yml");
const ACTION = "actions/dependency-review-action@";

function problems(text) {
  const data = parse(text);
  const found = [];
  const on = data.on;
  const triggers = on && typeof on === "object" && !Array.isArray(on) ? Object.keys(on) : [];
  if (triggers.length !== 1 || triggers[0] !== "pull_request_target") {
    found.push(`runs on ${JSON.stringify(on)}, not only pull_request_target`);
  }
  if (JSON.stringify(data.permissions) !== JSON.stringify({ contents: "read" })) {
    found.push(`the workflow grants ${JSON.stringify(data.permissions)}`);
  }
  const jobs = Object.entries(data.jobs ?? {});
  if (jobs.length === 0) found.push("no job");
  for (const [name, job] of jobs) {
    if (JSON.stringify(job.permissions) !== JSON.stringify({ contents: "read" })) {
      found.push(`${name} holds ${JSON.stringify(job.permissions)}`);
    }
    if (JSON.stringify(job).includes("secrets.")) found.push(`${name} references a secret`);
    const uses = (job.steps ?? []).map((s) => String(s.uses ?? "")).filter(Boolean);
    if (uses.some((u) => u.startsWith("actions/checkout@"))) found.push(`${name} checks out code`);
    if (uses.some((u) => !u.startsWith(ACTION))) found.push(`${name} runs another action`);
    if (!uses.some((u) => u.startsWith(ACTION))) found.push(`${name} runs no dependency review`);
  }
  return found;
}

const committed = fs.readFileSync(file, "utf8");

test("the review runs from main, reads only, and checks nothing out", () => {
  assert.deepEqual(problems(committed), []);
});

const plants = [
  ["  pull_request_target:\n", "  pull_request:\n", "not only pull_request_target"],
  [
    "    types: [opened, synchronize, reopened]\n",
    "    types: [opened, synchronize, reopened]\n  push:\n",
    "not only pull_request_target",
  ],
  [
    "    permissions:\n      contents: read\n",
    "    permissions:\n      contents: read\n      pull-requests: write\n",
    "holds",
  ],
  [
    "      - name: Review the dependency changes\n",
    "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n" +
      "      - name: Review the dependency changes\n",
    "checks out code",
  ],
  [
    "          comment-summary-in-pr: never\n",
    "          comment-summary-in-pr: never\n          repo-token: ${{ secrets.SOME_TOKEN }}\n",
    "references a secret",
  ],
  ["actions/dependency-review-action@", "someone/dependency-review-action@", "no dependency"],
];

for (const [from, to, says] of plants) {
  test(`a planted edit fails: ${says} (${JSON.stringify(to.trim().slice(0, 40))})`, () => {
    assert.equal(committed.split(from).length, 2, `the plant's anchor is not once: ${from}`);
    const found = problems(committed.replace(from, to));
    assert.ok(found.some((p) => p.includes(says)), JSON.stringify(found));
  });
}
