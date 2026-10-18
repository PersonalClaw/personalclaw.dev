// The shared build's record. CI builds the site once, in the `build` job of
// .github/workflows/ci.yml, and the three required checks test that one build. This
// script writes the record that build carries, and verifies it in each check before
// anything reads the build.
//
//   node scripts/build-record.mjs write    # in the build job, after both builds
//   node scripts/build-record.mjs verify   # in each check, after the download
//
// The record names what made the build: the exact Node and npm, the lock, the source
// pins, the commit and tree it was built from, and the run that built it. It lists
// every file the build hands on, with its size and sha256, and a digest over that list.
// The generated data the validators compare the pages with (.generated/*.json) is
// listed again with its own digests and `generatedAt`, because a re-sync after the
// build is the one way those files can disagree with dist/ while every page is intact.
//
// `verify` refuses a build that is missing, from another run, from another tree, made
// with another toolchain or pins, or changed after it was recorded, and names which of
// these it is. It never throws: every problem comes back as one line, so a refusal is a
// message and a failed check, never a crash.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rangeFloor, satisfies } from "../tests/support/node-range.mjs";

/** The variables that tell git which repository to work on. A git hook exports them to what it
 *  runs, so a git started from the pre-push gate's tests would otherwise act on the repository
 *  being pushed rather than the one in its own folder. */
export const GIT_LOCATION = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
  "GIT_NAMESPACE",
];

/** The environment for a git that must work on the repository in its own folder. */
export function gitEnvironment(extra = {}, env = process.env) {
  const clean = { ...env };
  for (const name of GIT_LOCATION) delete clean[name];
  return { ...clean, ...extra };
}

export const RECORD_PATH = ".generated/build-record.json";
export const RECORD_SCHEMA = 1;

// What the build hands on: both builds, the generated data, and the synced sources the
// registry probe rebuilds from (scripts/validate-registry-render.mjs). Every check reads
// from here, and nothing outside it is rebuilt.
export const ARTIFACT_PATHS = [
  "dist",
  ".preview-dist",
  ".generated",
  "src/content/docs",
  "public/llms.txt",
  "public/llms-full.txt",
];
const REQUIRED_DIRECTORIES = ["dist", ".preview-dist", ".generated"];
export const GENERATED_FILES = [
  ".generated/docs-index.json",
  ".generated/registry.json",
  ".generated/release-facts.json",
];
const SOURCES_FILE = "sources/personalclaw.sources.json";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const short = (sha) => String(sha ?? "none").slice(0, 12);
const toPosix = (file) => file.split(path.sep).join("/");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: gitEnvironment(), stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function attempt(read) {
  try {
    return read();
  } catch {
    return null;
  }
}

function listFiles(root, relative, found) {
  const absolute = path.join(root, relative);
  const stat = attempt(() => fs.lstatSync(absolute));
  if (stat === null) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute).sort()) listFiles(root, path.join(relative, entry), found);
  } else if (toPosix(relative) !== RECORD_PATH) {
    found.push(toPosix(relative));
  }
}

function artifactFiles(root) {
  const found = [];
  for (const entry of ARTIFACT_PATHS) listFiles(root, entry, found);
  return found.sort().map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: file, size: bytes.length, sha256: sha256(bytes) };
  });
}

export const filesDigest = (files) => sha256(JSON.stringify(files));

function sourcePins(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, SOURCES_FILE), "utf8"));
  const { core, apps } = manifest.sources;
  return {
    core: { tag: core.tag ?? null, commit: core.commit, installCommit: core.installCommit ?? null, installSha256: core.installSha256 ?? null },
    apps: { tag: apps.tag ?? null, commit: apps.commit },
    registry: { commit: manifest.data?.registry?.commit ?? null },
  };
}

function readPackage(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const nodeVersion = fs.readFileSync(path.join(root, ".node-version"), "utf8").trim();
  return { packageJson, nodeVersion: `v${nodeVersion.replace(/^v/, "")}` };
}

export function currentNpm(env = process.env) {
  const agent = /\bnpm\/(\d+\.\d+\.\d+)/.exec(env.npm_config_user_agent ?? "")?.[1];
  return agent ?? attempt(() => execFileSync("npm", ["--version"], { encoding: "utf8" }).trim());
}

export function createRecord({ root = process.cwd(), env = process.env, node = process.version, npm = currentNpm(env) } = {}) {
  const files = artifactFiles(root);
  const generated = {};
  for (const file of GENERATED_FILES) {
    const entry = files.find((each) => each.path === file);
    if (!entry) throw new Error(`${file} is missing: run the build before writing its record`);
    const data = attempt(() => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")));
    generated[file] = { sha256: entry.sha256, generatedAt: data?.generatedAt ?? null };
  }
  return {
    schemaVersion: RECORD_SCHEMA,
    commit: git(root, ["rev-parse", "HEAD"]),
    tree: git(root, ["rev-parse", "HEAD^{tree}"]),
    run: {
      id: env.GITHUB_RUN_ID ?? null,
      attempt: env.GITHUB_RUN_ATTEMPT ?? null,
      workflow: env.GITHUB_WORKFLOW ?? null,
    },
    node,
    npm,
    lockSha256: sha256(fs.readFileSync(path.join(root, "package-lock.json"))),
    sources: sourcePins(root),
    generated,
    files,
    digest: filesDigest(files),
  };
}

export function writeRecord(root, record) {
  const target = path.join(root, RECORD_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
}

function differingKeys(expected, actual, prefix = "") {
  const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]);
  const found = [];
  for (const key of [...keys].sort()) {
    const a = expected?.[key];
    const b = actual?.[key];
    if (a && b && typeof a === "object" && typeof b === "object") found.push(...differingKeys(a, b, `${prefix}${key}.`));
    else if (a !== b) found.push(`${prefix}${key}`);
  }
  return found;
}

// Every reason this checkout must not test the build in front of it, one line each.
// An empty list is the only pass.
export function verifyRecord({ root = process.cwd(), env = process.env, node = process.version, npm = currentNpm(env) } = {}) {
  const problems = [];
  const fail = (message) => problems.push(message);

  for (const directory of REQUIRED_DIRECTORIES) {
    if (!fs.existsSync(path.join(root, directory))) fail(`${directory}/ is missing: the shared build did not arrive`);
  }
  const recordPath = path.join(root, RECORD_PATH);
  if (!fs.existsSync(recordPath)) {
    fail(`build record ${RECORD_PATH} is missing: the shared build did not arrive`);
    return problems;
  }
  const record = attempt(() => JSON.parse(fs.readFileSync(recordPath, "utf8")));
  if (record === null || typeof record !== "object" || !Array.isArray(record.files)) {
    fail(`build record ${RECORD_PATH} is not readable JSON with a file list`);
    return problems;
  }
  if (record.schemaVersion !== RECORD_SCHEMA) fail(`build record schemaVersion is ${record.schemaVersion}, this check reads ${RECORD_SCHEMA}`);

  // The record's own integrity first: a list edited to match a changed file is caught
  // here, before the files are compared with it.
  if (filesDigest(record.files) !== record.digest) fail("the build record's file list does not match the record's digest");

  // Where and when it was built.
  const tree = attempt(() => git(root, ["rev-parse", "HEAD^{tree}"]));
  if (tree === null) fail("this checkout has no commit to compare the build with");
  else if (record.tree !== tree) fail(`built from tree ${short(record.tree)}, this checkout is ${short(tree)}`);
  const status = attempt(() => git(root, ["status", "--porcelain"]));
  if (status) fail(`this checkout differs from its commit: ${status.split("\n").slice(0, 5).join(", ")}`);
  const runId = env.GITHUB_RUN_ID;
  if (runId && record.run?.id !== runId) {
    fail(`built in run ${record.run?.id ?? "none (a local build)"}, this is run ${runId}`);
  }

  // The toolchain and the pins it was built with.
  const local = attempt(() => readPackage(root));
  if (local === null) {
    fail("this checkout has no readable package.json and .node-version");
  } else {
    const engines = local.packageJson.engines?.node;
    if (record.node !== local.nodeVersion) fail(`the build ran Node ${record.node}, .node-version pins ${local.nodeVersion}`);
    if (attempt(() => satisfies(String(record.node), engines)) !== true) {
      fail(`the build ran Node ${record.node}, outside package.json engines ${engines} (floor ${attempt(() => rangeFloor(engines)) ?? "unreadable"})`);
    }
    const packageManager = local.packageJson.packageManager;
    if (`npm@${record.npm}` !== packageManager) fail(`the build ran npm ${record.npm}, package.json packageManager pins ${packageManager}`);
  }
  if (node !== record.node) fail(`this job runs Node ${node}, the build ran ${record.node}`);
  if (npm && npm !== record.npm) fail(`this job runs npm ${npm}, the build ran ${record.npm}`);
  const lock = attempt(() => sha256(fs.readFileSync(path.join(root, "package-lock.json"))));
  if (lock !== record.lockSha256) fail("package-lock.json differs from the lock the build installed from");
  const pins = attempt(() => sourcePins(root));
  const moved = pins === null ? ["(unreadable)"] : differingKeys(pins, record.sources);
  if (moved.length > 0) fail(`the build record's source pins differ from ${SOURCES_FILE}: ${moved.join(", ")}`);

  // The bytes: every recorded file present and unchanged, and nothing added.
  const recorded = new Map(record.files.map((file) => [file.path, file]));
  const present = new Map(attempt(() => artifactFiles(root).map((file) => [file.path, file])) ?? []);
  for (const [file, entry] of recorded) {
    const actual = present.get(file);
    if (!actual) fail(`${file} is in the build record but missing`);
    else if (actual.sha256 !== entry.sha256 || actual.size !== entry.size) {
      fail(GENERATED_FILES.includes(file)
        ? `${file} differs from the build record: it was re-synced after the build, so it no longer describes dist/`
        : `${file} differs from the build record`);
    }
  }
  for (const file of present.keys()) {
    if (!recorded.has(file)) fail(`${file} is not in the build record`);
  }
  for (const file of GENERATED_FILES) {
    if (record.generated?.[file]?.sha256 !== recorded.get(file)?.sha256) fail(`${file}'s generated-data digest does not match its file entry`);
  }
  return problems;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file:"));

if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const annotate = process.env.GITHUB_ACTIONS === "true";
  if (rest.length > 0 || !["write", "verify"].includes(command ?? "")) {
    console.error("Usage: node scripts/build-record.mjs write|verify");
    process.exitCode = 2;
  } else if (command === "write") {
    const record = createRecord();
    writeRecord(process.cwd(), record);
    console.log(
      `Wrote ${RECORD_PATH}: ${record.files.length} files, digest ${record.digest}, tree ${short(record.tree)}, ` +
        `run ${record.run.id ?? "none (a local build)"}, Node ${record.node}, npm ${record.npm}.`,
    );
  } else {
    const problems = verifyRecord();
    if (problems.length === 0) {
      const record = JSON.parse(fs.readFileSync(RECORD_PATH, "utf8"));
      console.log(
        `The shared build checks out: ${record.files.length} files, digest ${record.digest}, tree ${short(record.tree)}, ` +
          `run ${record.run.id ?? "none (a local build)"}, Node ${record.node}, npm ${record.npm}.`,
      );
    } else {
      console.error("The shared build cannot be tested here, nothing checked:");
      for (const problem of problems) console.error(annotate ? `::error::${problem}` : `  - ${problem}`);
      process.exitCode = 1;
    }
  }
}
