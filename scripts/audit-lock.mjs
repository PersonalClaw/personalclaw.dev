// The dependency audit of the lock the website ships: `npm audit --package-lock-only` over
// the committed package-lock.json, judged against the dated waivers in
// .github/audit-baseline.toml. It reads the lock, never a fresh resolution and never
// node_modules, so what it audits is what `npm ci` installs: the build tools included,
// since they run in CI and make every page the site serves.
//
// The verdict, as core's and the apps' audits give it:
//
// - exit 2 when the audit did not run: npm could not be started, was killed or exited
//   with anything but 0 or 1, printed no report or one that is not JSON, reported an
//   error instead of an audit, or audited another number of packages than the lock
//   installs (an `omit` setting in an npm config would do that). The lock and the waiver
//   file must both be readable. A missing audit is never a clean one;
// - exit 1 on a high or critical finding that no live waiver covers. A severity npm does
//   not name as info, low or moderate gates as high would;
// - exit 1 on a waiver that is expired, more than MAX_DAYS out, missing a field, of
//   another scope, carrying a field this does not read, or matching no finding;
// - every other finding is listed in the job summary and gates nothing.
//
//     node scripts/audit-lock.mjs [--baseline FILE]      (npm run audit:lock)
//
// It needs the network (npm asks the registry for advisories), so no gate of
// run-ci-gates runs it: CI's `audit` job runs it on every pull request and main run, and
// .github/workflows/audit.yml every night on main. tests/audit-lock.test.mjs plants each
// rule's violations through main() with a fake npm.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseToml, TomlDate } from "smol-toml";

export const LOCK = "package-lock.json";
export const BASELINE = ".github/audit-baseline.toml";
export const AUDIT_ARGV = ["audit", "--package-lock-only", "--json"];
export const MAX_DAYS = 30;
export const SCOPE = "npm-audit";
export const WAIVER_FIELDS = ["file", "scope", "reference", "owner", "reason", "expires"];

// The severities that are reported and gate nothing. Anything else, high, critical or a
// level npm adds later, fails the run when no live waiver covers it.
const REPORTED_ONLY = new Set(["info", "low", "moderate"]);
const GATING_COUNTED = ["high", "critical"];

const DAY = 24 * 60 * 60 * 1000;

class ToolFailure extends Error {}

const tail = (text) => String(text ?? "").trim().slice(-600);

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new ToolFailure(`${label} cannot be read: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ToolFailure(`${label} is not JSON (${error.message})`);
  }
}

// How many packages the lock installs: every entry under `packages` but the root one.
export function lockedPackageCount(root) {
  const lock = readJson(path.join(root, LOCK), LOCK);
  const packages = lock && typeof lock === "object" ? lock.packages : undefined;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new ToolFailure(`${LOCK} has no packages (lockfileVersion 2 or newer is needed)`);
  }
  return Object.keys(packages).filter((key) => key !== "").length;
}

export function loadWaivers(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new ToolFailure(`${label} cannot be read: ${error.code ?? error.message}`);
  }
  let data;
  try {
    data = parseToml(text);
  } catch (error) {
    throw new ToolFailure(`${label} is not TOML (${String(error.message).split("\n")[0]})`);
  }
  const waivers = data.waiver ?? [];
  if (!Array.isArray(waivers) || !waivers.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
    throw new ToolFailure(`${label}: \`waiver\` must be a list of [[waiver]] tables`);
  }
  return waivers;
}

// The advisories in an `npm audit --json` report, once each. npm also lists, as
// vulnerable, every package that depends on a vulnerable one (its `via` names the
// package, as a string); only a `via` that is an advisory is a finding.
export function npmFindings(text, lockedCount) {
  if (!String(text ?? "").trim()) throw new ToolFailure("npm audit printed no report");
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    throw new ToolFailure(`npm audit: the report is not JSON (${error.message})`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || "error" in doc) {
    const detail = doc && typeof doc === "object" ? JSON.stringify(doc.error) : JSON.stringify(doc);
    throw new ToolFailure(`npm audit reported an error, not an audit: ${detail}`);
  }
  const { vulnerabilities, metadata } = doc;
  if (!vulnerabilities || typeof vulnerabilities !== "object" || !metadata || typeof metadata.vulnerabilities !== "object" || typeof metadata.dependencies !== "object") {
    throw new ToolFailure("npm audit: the report has no vulnerabilities or metadata");
  }
  const audited = metadata.dependencies.total;
  if (audited !== lockedCount) {
    throw new ToolFailure(`npm audit audited ${audited} packages, but ${LOCK} installs ${lockedCount}: an npm setting left part of the lock out`);
  }
  const counted = GATING_COUNTED.reduce((sum, level) => sum + (Number(metadata.vulnerabilities[level]) || 0), 0);
  const named = Object.values(vulnerabilities).filter((entry) => entry && GATING_COUNTED.includes(entry.severity)).length;
  if (counted !== named) {
    throw new ToolFailure(`npm audit: the report counts ${counted} high or critical but names ${named}`);
  }

  const found = new Map();
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    for (const via of Array.isArray(entry?.via) ? entry.via : []) {
      if (!via || typeof via !== "object") continue;
      const url = String(via.url ?? "");
      const advisory = url ? url.split("/").pop() : String(via.source ?? "?");
      const pkg = String(via.name ?? name);
      found.set(`${pkg} ${advisory}`, {
        file: LOCK,
        scope: SCOPE,
        package: pkg,
        advisory,
        range: String(via.range ?? "?"),
        severity: String(via.severity ?? "unrated"),
        reference: `${pkg} ${advisory}`,
      });
    }
  }
  return [...found.values()].sort((a, b) => a.reference.localeCompare(b.reference));
}

const gates = (finding) => !REPORTED_ONLY.has(finding.severity);
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;

// Which findings the live waivers cover, and every waiver that fails the run.
export function judge(findings, waivers, today) {
  const problems = [];
  const waived = new Set();
  waivers.forEach((entry, index) => {
    const where = `waiver ${index + 1} (${nonEmpty(entry.reference) ? entry.reference : "?"})`;
    const missing = WAIVER_FIELDS.filter((field) => (field === "expires" ? !(field in entry) : !nonEmpty(entry[field])));
    if (missing.length > 0) return problems.push(`${where}: missing ${missing.join(", ")}`);
    const unknown = Object.keys(entry).filter((key) => !WAIVER_FIELDS.includes(key));
    if (unknown.length > 0) return problems.push(`${where}: unknown field ${unknown.join(", ")}`);
    const expires = entry.expires;
    if (!(expires instanceof TomlDate) || !expires.isDate()) return problems.push(`${where}: expires must be a date, such as ${today}`);
    if (entry.scope !== SCOPE) return problems.push(`${where}: scope must be ${SCOPE}`);
    const date = expires.toISOString();
    const days = dayNumber(date) - dayNumber(today);
    if (days < 0) return problems.push(`${where}: expired on ${date}: fix it, or renew it`);
    if (days > MAX_DAYS) return problems.push(`${where}: expires ${date}, more than ${MAX_DAYS} days out`);
    const key = `${entry.scope}\n${entry.file}\n${entry.reference}`;
    if (!findings.some((finding) => `${finding.scope}\n${finding.file}\n${finding.reference}` === key)) {
      return problems.push(`${where}: matches no finding, so it is stale: delete it`);
    }
    waived.add(key);
    return undefined;
  });
  const isWaived = (finding) => waived.has(`${finding.scope}\n${finding.file}\n${finding.reference}`);
  return {
    findings,
    waived: findings.filter(isWaived),
    gating: findings.filter((finding) => gates(finding) && !isWaived(finding)),
    problems,
  };
}

export function summary(verdict, audited) {
  const lines = ["### Dependency audit", ""];
  lines.push(
    `${audited} locked packages audited. ${verdict.findings.length} finding(s): ${verdict.gating.length} that fail the run, ${verdict.waived.length} under a live waiver.`,
  );
  if (verdict.findings.length > 0) {
    lines.push("", "| Lock | Package | Advisory | Severity | Status |", "|---|---|---|---|---|");
    for (const finding of verdict.findings) {
      const status = verdict.gating.includes(finding) ? "**fails the run**" : verdict.waived.includes(finding) ? "waived" : "reported";
      lines.push(`| ${finding.file} | ${finding.package} | ${finding.advisory} | ${finding.severity} | ${status} |`);
    }
  }
  if (verdict.problems.length > 0) lines.push("", "**Waivers that fail the run:**", ...verdict.problems.map((problem) => `- ${problem}`));
  return `${lines.join("\n")}\n`;
}

function defaultRun(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function parseArgs(argv, root) {
  let baseline = BASELINE;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--baseline" && index + 1 < argv.length) baseline = argv[(index += 1)];
    else throw new ToolFailure(`unknown argument ${argv[index]} (usage: node scripts/audit-lock.mjs [--baseline FILE])`);
  }
  return { label: baseline, file: path.resolve(root, baseline) };
}

export function main(argv = [], options = {}) {
  const root = options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const run = options.run ?? ((command, args) => defaultRun(command, args, root));
  const log = options.log ?? ((line) => console.log(line));
  const summaryFile = "summaryFile" in options ? options.summaryFile : process.env.GITHUB_STEP_SUMMARY;
  const publish = (text) => {
    log(text.trimEnd());
    if (summaryFile) fs.appendFileSync(summaryFile, text);
  };

  let verdict;
  let audited;
  try {
    const baseline = parseArgs(argv, root);
    const waivers = loadWaivers(baseline.file, baseline.label);
    audited = lockedPackageCount(root);
    const result = run("npm", AUDIT_ARGV);
    if (result.error) throw new ToolFailure(`npm audit could not be started: ${result.error.message}`);
    if (result.signal) throw new ToolFailure(`npm audit was killed by ${result.signal}`);
    // 1 means "found something"; the report says what. Anything else is npm failing.
    if (result.status !== 0 && result.status !== 1) {
      throw new ToolFailure(`npm audit exited ${result.status}: ${tail(result.stderr || result.stdout)}`);
    }
    verdict = judge(npmFindings(result.stdout, audited), waivers, today);
  } catch (error) {
    if (!(error instanceof ToolFailure)) throw error;
    log(`::error title=the dependency audit did not run::${error.message}`);
    publish(`### Dependency audit\n\n**The audit did not run:** ${error.message}\n`);
    return 2;
  }

  publish(summary(verdict, audited));
  for (const finding of verdict.gating) {
    log(`::error title=unwaived ${finding.severity} finding::${finding.file}: ${finding.reference} (${finding.range})`);
  }
  for (const problem of verdict.problems) log(`::error title=waiver::${problem}`);
  return verdict.gating.length > 0 || verdict.problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
