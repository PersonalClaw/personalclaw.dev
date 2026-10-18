// The dependency audit of the lock the website ships (scripts/audit-lock.mjs). Every run
// goes through main() over a planted tree, with a fake standing in for npm audit; each
// test plants one violation and asserts the exit status and the one kind of error it
// reports. The committed-tree tests read the waiver file and the lock as they are, and
// the last section holds the two workflows that run the audit to their shape.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AUDIT_ARGV, BASELINE, LOCK, MAX_DAYS, WAIVER_FIELDS, main } from "../scripts/audit-lock.mjs";
import { checkAuditWorkflows } from "./support/audit-workflows.mjs";
import { readWorkflowFiles } from "./support/workflows.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = "2026-10-18";

const TOOL = "the dependency audit did not run";
const UNWAIVED = "unwaived finding";
const WAIVER = "waiver";

// A lock with `count` installed packages besides the root entry.
function lockText(count = 3) {
  const packages = { "": { name: "example", version: "1.0.0" } };
  for (let index = 0; index < count; index += 1) packages[`node_modules/pkg-${index}`] = { version: "1.0.0" };
  return JSON.stringify({ name: "example", lockfileVersion: 3, packages });
}

// An npm audit --json report. Each finding is an advisory on a package; `parent` adds the
// package npm also lists because it depends on the vulnerable one (a string via), which
// is not a finding of its own.
function report({ findings = [], total = 3, parent = false } = {}) {
  const vulnerabilities = {};
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const { name, severity, ghsa } of findings) {
    counts[severity] = (counts[severity] ?? 0) + 1;
    vulnerabilities[name] = {
      name,
      severity,
      isDirect: false,
      via: [{ source: 1, name, dependency: name, title: "planted", url: `https://github.com/advisories/${ghsa}`, severity, range: "<=1.0.0" }],
      effects: parent ? ["pkg-parent"] : [],
      range: "<=1.0.0",
      nodes: [`node_modules/${name}`],
      fixAvailable: true,
    };
  }
  if (parent && findings.length > 0) {
    vulnerabilities["pkg-parent"] = { name: "pkg-parent", severity: findings[0].severity, isDirect: true, via: [findings[0].name], effects: [], range: "*", nodes: ["node_modules/pkg-parent"], fixAvailable: true };
  }
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { ...counts, total: sum }, dependencies: { prod: total, dev: 0, optional: 0, peer: 0, peerOptional: 0, total } },
  });
}

const HIGH = { name: "pkg-0", severity: "high", ghsa: "GHSA-aaaa-bbbb-cccc" };
const CRITICAL = { name: "pkg-1", severity: "critical", ghsa: "GHSA-dddd-eeee-ffff" };
const MODERATE = { name: "pkg-2", severity: "moderate", ghsa: "GHSA-gggg-hhhh-jjjj" };

const LIVE = {
  file: "package-lock.json",
  scope: "npm-audit",
  reference: "pkg-0 GHSA-aaaa-bbbb-cccc",
  owner: "maintainers",
  reason: "No in-range release fixes it yet; the next astro release ends it.",
  expires: "2026-11-01",
};

// A waiver as TOML. An `expires` that reads as a date or a datetime is written bare, so
// it stays a TOML date or datetime; any other value is written as a quoted string.
function waiverToml(entry) {
  const lines = ["[[waiver]]"];
  for (const [key, value] of Object.entries(entry)) {
    if (key === "expires" && /^\d{4}-\d{2}-\d{2}(?:T[\d:]+Z)?$/.test(value)) lines.push(`expires = ${value}`);
    else lines.push(`${key} = ${JSON.stringify(value)}`);
  }
  return lines.join("\n") + "\n";
}

const without = (entry, field) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== field));

// Plants a tree, runs main() over it with a fake npm, and returns the exit status, the
// titles of the errors it printed, the whole output, and the argv npm was given.
function audit({ lock = lockText(), baseline = "# no waivers\n", npm = { status: 1, stdout: report() }, argv = [] } = {}) {
  const scratch = path.join(root, ".generated");
  fs.mkdirSync(scratch, { recursive: true });
  const tree = fs.mkdtempSync(path.join(scratch, "audit-lock-test-"));
  const calls = [];
  const lines = [];
  try {
    if (lock !== null) fs.writeFileSync(path.join(tree, LOCK), lock);
    if (baseline !== null) {
      fs.mkdirSync(path.join(tree, ".github"));
      fs.writeFileSync(path.join(tree, BASELINE), baseline);
    }
    const run = (command, args) => {
      calls.push([command, ...args]);
      return typeof npm === "function" ? npm() : npm;
    };
    const status = main(argv, { root: tree, today: TODAY, run, log: (line) => lines.push(line), summaryFile: null });
    const output = lines.join("\n");
    const titles = [...new Set([...output.matchAll(/^::error title=([^:]+)::/gm)].map((match) => match[1].replace(/^unwaived \S+ finding$/, UNWAIVED)))].sort();
    return { status, titles, output, calls };
  } finally {
    fs.rmSync(tree, { recursive: true, force: true });
  }
}

// ── the planted baseline ─────────────────────────────────────────────────────────

test("a clean lock passes, and the audit reads the lock alone, as JSON", () => {
  const result = audit({ npm: { status: 0, stdout: report() } });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.titles, []);
  assert.deepEqual(result.calls, [["npm", ...AUDIT_ARGV]]);
  assert.deepEqual(AUDIT_ARGV, ["audit", "--package-lock-only", "--json"]);
  assert.match(result.output, /3 locked packages audited\. 0 finding\(s\)/);
});

test("a moderate or low finding is listed and gates nothing", () => {
  const result = audit({ npm: { status: 1, stdout: report({ findings: [MODERATE, { name: "pkg-1", severity: "low", ghsa: "GHSA-kkkk-mmmm-nnnn" }] }) } });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.titles, []);
  assert.match(result.output, /\| package-lock\.json \| pkg-2 \| GHSA-gggg-hhhh-jjjj \| moderate \| reported \|/);
});

test("a package npm lists only because it depends on a vulnerable one is not a second finding", () => {
  const result = audit({ npm: { status: 1, stdout: report({ findings: [MODERATE], parent: true }) } });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1 finding\(s\)/);
});

test("a live waiver covers its finding, including one exactly 30 days out", () => {
  for (const expires of ["2026-10-18", "2026-11-17"]) {
    const result = audit({ baseline: waiverToml({ ...LIVE, expires }), npm: { status: 1, stdout: report({ findings: [HIGH] }) } });
    assert.equal(result.status, 0, `${expires}\n${result.output}`);
    assert.match(result.output, /\| pkg-0 \| GHSA-aaaa-bbbb-cccc \| high \| waived \|/);
  }
  assert.equal(MAX_DAYS, 30);
});

// ── rule 1: a tool that did not run fails, exit 2 ────────────────────────────────

const toolFailures = [
  ["npm that cannot be started", { npm: { error: new Error("spawn npm ENOENT"), status: null, stdout: "" } }, /could not be started: spawn npm ENOENT/],
  ["npm exiting with a status other than 0 or 1", { npm: { status: 254, stdout: "", stderr: "npm ERR! something broke" } }, /exited 254: npm ERR! something broke/],
  ["npm killed by a signal", { npm: { status: null, signal: "SIGKILL", stdout: "" } }, /was killed by SIGKILL/],
  ["an empty report", { npm: { status: 0, stdout: "" } }, /printed no report/],
  ["a report that is not JSON", { npm: { status: 1, stdout: "found 0 vulnerabilities" } }, /the report is not JSON/],
  ["an error report (the registry could not be reached)", { npm: { status: 1, stdout: JSON.stringify({ error: { code: "ENOAUDIT", summary: "audit endpoint returned an error" } }) } }, /reported an error, not an audit.*ENOAUDIT/],
  ["a report with no vulnerabilities or metadata", { npm: { status: 0, stdout: JSON.stringify({ auditReportVersion: 2 }) } }, /no vulnerabilities or metadata/],
  ["a report that audited fewer packages than the lock holds (omit=dev in a config)", { npm: { status: 0, stdout: report({ total: 2 }) } }, /audited 2 packages, but package-lock\.json installs 3/],
  ["a report that counts a high finding but names no advisory", {
    npm: { status: 1, stdout: JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 }, dependencies: { total: 3 } } }) },
  }, /counts 1 high or critical but names 0/],
  ["a missing lock", { lock: null }, /package-lock\.json cannot be read/],
  ["a lock that is not JSON", { lock: "{" }, /package-lock\.json is not JSON/],
  ["a lock with no packages (lockfileVersion 1)", { lock: JSON.stringify({ lockfileVersion: 1, dependencies: {} }) }, /package-lock\.json has no packages/],
  ["a missing waiver file", { baseline: null }, /\.github\/audit-baseline\.toml cannot be read/],
  ["a waiver file that is not TOML", { baseline: "[[waiver]\n" }, /\.github\/audit-baseline\.toml is not TOML/],
  ["a waiver file whose waiver is not a list of tables", { baseline: 'waiver = "none"\n' }, /`waiver` must be a list of \[\[waiver\]\] tables/],
];

for (const [why, plant, message] of toolFailures) {
  test(`the audit did not run, exit 2: ${why}`, () => {
    const result = audit(plant);
    assert.equal(result.status, 2, result.output);
    assert.deepEqual(result.titles, [TOOL], result.output);
    assert.match(result.output, message);
    assert.match(result.output, /\*\*The audit did not run:\*\*/);
  });
}

// ── rule 2: an unwaived high or critical finding fails, exit 1 ───────────────────

for (const finding of [HIGH, CRITICAL, { name: "pkg-2", severity: "unknown-level", ghsa: "GHSA-pppp-qqqq-rrrr" }]) {
  test(`an unwaived ${finding.severity} finding fails the run`, () => {
    const result = audit({ npm: { status: 1, stdout: report({ findings: [finding, MODERATE].filter((each, index, all) => all.findIndex((other) => other.name === each.name) === index) }) } });
    assert.equal(result.status, 1, result.output);
    assert.deepEqual(result.titles, [UNWAIVED], result.output);
    assert.match(result.output, new RegExp(`package-lock\\.json: ${finding.name} ${finding.ghsa}`));
    assert.match(result.output, /\*\*fails the run\*\*/);
  });
}

// ── rule 3: a broken waiver fails, exit 1 ────────────────────────────────────────

const highReport = { status: 1, stdout: report({ findings: [HIGH] }) };
const waiverPlants = [
  ["a waiver past its expiry", { ...LIVE, expires: "2026-10-17" }, /expired on 2026-10-17/, true],
  ["a waiver more than 30 days out", { ...LIVE, expires: "2026-11-18" }, /expires 2026-11-18, more than 30 days out/, true],
  ["a waiver whose expiry is a string, not a date", { ...LIVE, expires: "next month" }, /expires must be a date, such as 2026-10-18/, true],
  ["a waiver whose expiry is a datetime, not a date", { ...LIVE, expires: "2026-11-01T00:00:00Z" }, /expires must be a date/, true],
  ["a waiver of an unknown scope", { ...LIVE, scope: "pip-audit" }, /scope must be npm-audit/, true],
  ["a waiver with a field the audit does not read", { ...LIVE, severity: "high" }, /unknown field severity/, true],
  ["a waiver that matches no finding (stale)", { ...LIVE, reference: "pkg-9 GHSA-zzzz-zzzz-zzzz" }, /matches no finding, so it is stale/, true],
  ["a waiver for another lock", { ...LIVE, file: "other/package-lock.json" }, /matches no finding, so it is stale/, true],
  ...WAIVER_FIELDS.map((field) => [`a waiver missing ${field}`, without(LIVE, field), new RegExp(`missing ${field}`), true]),
  ["a waiver with an empty reason", { ...LIVE, reason: " " }, /missing reason/, true],
];

for (const [why, entry, message, alsoUnwaived] of waiverPlants) {
  test(`the waiver check fails on ${why}`, () => {
    const result = audit({ baseline: waiverToml(entry), npm: highReport });
    assert.equal(result.status, 1, result.output);
    // A broken waiver waives nothing, so the high it was written for fails too.
    assert.deepEqual(result.titles, alsoUnwaived ? [UNWAIVED, WAIVER].sort() : [WAIVER], result.output);
    assert.match(result.output, message);
  });
}

test("a stale waiver fails on its own, with no finding left for it to cover", () => {
  const result = audit({ baseline: waiverToml(LIVE), npm: { status: 0, stdout: report() } });
  assert.equal(result.status, 1, result.output);
  assert.deepEqual(result.titles, [WAIVER]);
  assert.match(result.output, /waiver 1 \(pkg-0 GHSA-aaaa-bbbb-cccc\): matches no finding, so it is stale: delete it/);
});

test("a waiver of a moderate finding is still checked, and a stale one still fails", () => {
  const live = audit({ baseline: waiverToml({ ...LIVE, reference: "pkg-2 GHSA-gggg-hhhh-jjjj" }), npm: { status: 1, stdout: report({ findings: [MODERATE] }) } });
  assert.equal(live.status, 0, live.output);
  const expired = audit({ baseline: waiverToml({ ...LIVE, reference: "pkg-2 GHSA-gggg-hhhh-jjjj", expires: "2026-10-01" }), npm: { status: 1, stdout: report({ findings: [MODERATE] }) } });
  assert.equal(expired.status, 1, expired.output);
  assert.deepEqual(expired.titles, [WAIVER]);
});

test("--baseline names another waiver file", () => {
  const result = audit({ argv: ["--baseline", "missing.toml"] });
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /missing\.toml cannot be read/);
});

test("an unknown argument is refused, not ignored", () => {
  const result = audit({ argv: ["--fix"] });
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /unknown argument --fix/);
});

// ── the committed tree ───────────────────────────────────────────────────────────

test("the committed waiver file parses and holds no broken waiver on a clean report", () => {
  const packages = Object.keys(JSON.parse(fs.readFileSync(path.join(root, LOCK), "utf8")).packages).filter((key) => key !== "").length;
  const lines = [];
  const status = main([], {
    root,
    today: new Date().toISOString().slice(0, 10),
    run: () => ({ status: 0, stdout: report({ total: packages }) }),
    log: (line) => lines.push(line),
    summaryFile: null,
  });
  assert.equal(status, 0, lines.join("\n"));
  assert.match(lines.join("\n"), new RegExp(`${packages} locked packages audited`));
});

// ── rule 4: the two workflows that run the audit ─────────────────────────────────
// Each plant is one edit to a committed workflow, so the rule is proved against the file
// it guards rather than against a sketch of it.

const workflows = readWorkflowFiles(root);

function plant(name, from, to) {
  const text = workflows[name];
  assert.ok(text.includes(from), `${name} has no ${JSON.stringify(from)}`);
  return { workflows: { ...workflows, [name]: text.replace(from, to) } };
}

// One job's text in a workflow, so a plant names the job it edits.
function plantInJob(name, id, from, to) {
  const text = workflows[name];
  const start = text.indexOf(`\n  ${id}:\n`);
  assert.notEqual(start, -1, `${name} has no ${id} job`);
  const next = text.slice(start + 1).search(/\n  [a-z][a-z0-9-]*:\n/);
  const end = next === -1 ? text.length : start + 1 + next;
  const job = text.slice(start, end);
  assert.ok(job.includes(from), `${name} ${id} has no ${JSON.stringify(from)}`);
  return { workflows: { ...workflows, [name]: text.slice(0, start) + job.replace(from, to) + text.slice(end) } };
}

const AUDIT_RUN = "        run: npm run audit:lock\n";

test("the committed workflows run the audit as the rule requires", () => {
  assert.deepEqual(checkAuditWorkflows({ workflows }), []);
});

const workflowPlants = [
  ["ci.yml with no audit job", () => plant("ci.yml", "\n  audit:\n", "\n  lock-check:\n"), /ci\.yml must have an "audit" job/],
  ["a ci.yml that no longer runs on pull requests", () => plant("ci.yml", "  pull_request:\n", ""), /must run on pull_request/],
  ["the CI audit thrown away with || true", () => plantInJob("ci.yml", "audit", AUDIT_RUN, "        run: npm run audit:lock || true\n"), /throws its exit status away: npm run audit:lock \|\| true/],
  ["the CI audit step set to continue-on-error", () => plantInJob("ci.yml", "audit", AUDIT_RUN, `${AUDIT_RUN}        continue-on-error: true\n`), /the audit step must not set continue-on-error/],
  ["the CI audit job set to continue-on-error", () => plantInJob("ci.yml", "audit", "    timeout-minutes: 10\n", "    timeout-minutes: 10\n    continue-on-error: true\n"), /the audit job must not set continue-on-error/],
  ["the CI audit step skipped by a condition", () => plantInJob("ci.yml", "audit", AUDIT_RUN, `        if: github.event_name == 'schedule'\n${AUDIT_RUN}`), /the audit step must always run/],
  ["the CI audit job waiting on the build", () => plantInJob("ci.yml", "audit", "    timeout-minutes: 10\n", "    timeout-minutes: 10\n    needs: build\n"), /must not wait on another job/],
  ["a CI audit job that runs no audit", () => plantInJob("ci.yml", "audit", AUDIT_RUN, "        run: npm audit --package-lock-only\n"), /the audit job must run npm run audit:lock/],
  ["audit.yml with no schedule", () => plant("audit.yml", '  schedule:\n    # Nightly, 05:41 UTC: off the hour, and clear of Release follow (07:17).\n    - cron: "41 5 * * *"\n', ""), /audit\.yml must run on a schedule/],
  ["audit.yml running on pull requests", () => plant("audit.yml", "  workflow_dispatch:\n", "  workflow_dispatch:\n  pull_request:\n"), /runs on main only, found pull_request/],
  ["the nightly audit thrown away with || true", () => plantInJob("audit.yml", "audit", AUDIT_RUN, "        run: npm run audit:lock || true\n"), /throws its exit status away/],
  ["a write permission on the nightly audit job", () => plantInJob("audit.yml", "audit", "    permissions:\n      contents: read\n", "    permissions:\n      contents: read\n      issues: write\n"), /must hold no write permission, found issues/],
  ["issues: write at the top of audit.yml", () => plant("audit.yml", "permissions:\n  contents: read\n\nconcurrency:", "permissions:\n  contents: read\n  issues: write\n\nconcurrency:"), /the top of the workflow must grant no write permission/],
  ["a report job that also writes contents", () => plantInJob("audit.yml", "report", "      issues: write\n", "      issues: write\n      contents: write\n"), /must hold issues: write and nothing else, found issues, contents/],
  ["a report job that skips after a red audit", () => plantInJob("audit.yml", "report", "    if: ${{ !cancelled() }}\n", ""), /must run after a red audit/],
  ["a report job that does not wait on the audit", () => plantInJob("audit.yml", "report", "    needs: audit\n", ""), /must declare needs: audit/],
  ["a report job that never opens the issue", () => plantInJob("audit.yml", "report", "        if: ${{ needs.audit.result != 'success' }}\n", "        if: ${{ false }}\n"), /must open or comment on the issue when the audit is not a success/],
  ["a report job that never closes the issue", () => plantInJob("audit.yml", "report", "            gh issue close", "            gh issue view"), /must close the issue when the audit is a success/],
];

for (const [why, planted, message] of workflowPlants) {
  test(`the dependency-audit rule fails on ${why}`, () => {
    const violations = checkAuditWorkflows(planted());
    assert.deepEqual([...new Set(violations.map((v) => v.rule))], ["dependency-audit"], violations.map((v) => `${v.rule} ${v.where}: ${v.message}`).join("\n"));
    assert.ok(violations.some((v) => message.test(v.message)), violations.map((v) => v.message).join("\n"));
  });
}

test("a missing audit.yml fails, and one the YAML parser rejects reads as workflow-shape", () => {
  const { "audit.yml": _removed, ...rest } = workflows;
  assert.deepEqual(checkAuditWorkflows({ workflows: rest }).map((v) => v.message), ["audit.yml is missing"]);
  assert.deepEqual([...new Set(checkAuditWorkflows({ workflows: { ...workflows, "audit.yml": "jobs:\n  audit: [\n" } }).map((v) => v.rule))], ["workflow-shape"]);
});
