// The supply-chain check: CI inputs are pinned, and every job holds only the GitHub
// token permissions it needs. It reads the workflows through tests/support/workflows.mjs
// (the reader the CI contract shares), every package.json CI installs from, the
// Dockerfiles, and .github/supply-chain.toml, which holds the Node end-of-life table,
// the audited write steps and the exceptions. `checkSupplyChain` returns one violation
// per broken rule and never throws, so a malformed input reads as a failure.
// tests/supply-chain.test.mjs runs it on the repository and plants one violation per rule.
import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";

import { rangeFloor, satisfies } from "./node-range.mjs";
import { parseWorkflows, readWorkflowFiles, stepLabel, stepName } from "./workflows.mjs";

export const POLICY_FILE = ".github/supply-chain.toml";
export const EXCEPTION_MAX_DAYS = 30;

// The rules an exception may waive. The policy file's own rules, and a workflow the
// reader cannot judge, are never waived.
export const WAIVABLE_RULES = [
  "action-sha",
  "image-digest",
  "run-install",
  "setup-floating",
  "package-manager",
  "node-version-exact",
  "node-version-lock",
  "node-version-engines",
  "engines-floor",
  "node-eol",
  "permissions-declared",
  "write-all",
  "unlisted-write",
  "unused-top-level-write",
  "persist-credentials",
  "token-env",
];

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const IMAGE_DIGEST = /@sha256:[0-9a-f]{64}$/;
const ARCHITECTURE = /\b(?:linux\/)?(?:amd64|arm64|x64|x86_64|aarch64)\b/;
const TOKEN_EXPRESSION = /\$\{\{[^}]*\b(?:github\.token|secrets\.[A-Za-z0-9_]+)/;
const SKIPPED_DIRECTORIES = new Set([
  ".git", ".local", ".worktrees", ".astro", ".generated", ".source-cache", ".lighthouse",
  ".preview-dist", ".registry-probe-dist", "dist", "node_modules", "playwright-report", "test-results",
]);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function findDockerfiles(root, directory = root, found = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) findDockerfiles(root, path.join(directory, entry.name), found);
    } else if (/^(?:Dockerfile|Containerfile)(?:\..+)?$|\.(?:Dockerfile|Containerfile)$/.test(entry.name)) {
      const file = path.join(directory, entry.name);
      found[path.relative(root, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
    }
  }
  return found;
}

// The directories CI runs an npm install in: the repository root, and every
// working-directory a step that runs npm uses.
export function installDirectories(parsed) {
  const directories = new Set(["."]);
  for (const workflow of parsed) {
    for (const job of workflow.jobs) {
      for (const step of job.steps) {
        if (step.run && /\bnpm\s+(?:ci|install|i)\b/.test(step.run)) {
          directories.add(path.posix.normalize(step.workingDirectory ?? "."));
        }
      }
    }
  }
  return [...directories].sort();
}

export function loadSupplyChain(root) {
  const workflows = readWorkflowFiles(root);
  const packages = {};
  for (const directory of installDirectories(parseWorkflows(workflows))) {
    packages[directory] = {
      packageJson: readJson(path.join(root, directory, "package.json")),
      lock: readJson(path.join(root, directory, "package-lock.json")),
    };
  }
  const policyPath = path.join(root, POLICY_FILE);
  return {
    workflows,
    packages,
    nodeVersion: fs.readFileSync(path.join(root, ".node-version"), "utf8"),
    dockerfiles: findDockerfiles(root),
    policy: fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : null,
  };
}

// A TOML local date (`2026-11-10`, no time, no offset) as YYYY-MM-DD, or null.
function localDate(value) {
  if (value instanceof Date && typeof value.isDate === "function" && value.isDate() && value.isLocal()) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function readPolicy(text, fail) {
  const policy = { endOfLife: {}, auditedWrites: [], exceptions: [] };
  if (typeof text !== "string") {
    fail("policy-file", POLICY_FILE, `${POLICY_FILE} is missing`);
    return policy;
  }
  let data;
  try {
    data = parseToml(text);
  } catch (error) {
    fail("policy-file", POLICY_FILE, `${POLICY_FILE} is not valid TOML: ${String(error.message).split("\n")[0]}`);
    return policy;
  }
  const known = new Set(["node_end_of_life", "audited_write", "exception"]);
  for (const key of Object.keys(data)) {
    if (!known.has(key)) fail("policy-file", POLICY_FILE, `unknown key ${key}`);
  }
  const table = data.node_end_of_life;
  if (!table || typeof table !== "object" || Object.keys(table).length === 0) {
    fail("policy-file", POLICY_FILE, "node_end_of_life must list each supported Node line and its end-of-life date");
  } else {
    for (const [line, value] of Object.entries(table)) {
      const date = localDate(value);
      if (!/^\d+$/.test(line) || date === null) {
        fail("policy-file", POLICY_FILE, `node_end_of_life "${line}" must be a major line with a date, found ${String(value)}`);
      } else {
        policy.endOfLife[line] = date;
      }
    }
  }
  for (const key of ["audited_write", "exception"]) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      fail("policy-file", POLICY_FILE, `${key} must be an array of tables ([[${key}]])`);
    }
  }
  policy.auditedWrites = Array.isArray(data.audited_write) ? data.audited_write : [];
  policy.exceptions = Array.isArray(data.exception) ? data.exception : [];
  return policy;
}

// ---- Step 2: pins -------------------------------------------------------------------

function checkImage({ reference, comment }, file, where, fail) {
  if (!IMAGE_DIGEST.test(reference) || !ARCHITECTURE.test(comment)) {
    fail("image-digest", where, `image must be pinned by digest with its architecture in a comment, found ${reference}`, file, reference);
  }
}

function checkActionReference(uses, file, where, fail) {
  const { reference, comment } = uses;
  if (reference.startsWith("./")) return;
  if (reference.startsWith("docker://")) {
    checkImage({ reference: reference.slice("docker://".length), comment }, file, where, fail);
    return;
  }
  const [, ref = ""] = reference.split("@");
  if (!COMMIT_SHA.test(ref) || !RELEASE_TAG.test(comment)) {
    fail("action-sha", where, `uses must be a full commit SHA with its release tag as a comment, found ${reference}${comment ? ` # ${comment}` : ""}`, file, reference);
  }
}

// A Dockerfile's FROM lines. An image named through an ARG is judged by the ARG's
// default; the platform comes from --platform or from a `# linux/<arch>` comment on the
// line above. A digest with neither names an index, which is not one platform's image.
export function dockerfileImages(text) {
  const lines = text.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  const args = {};
  const stages = new Set();
  const images = [];
  lines.forEach((line, index) => {
    const arg = /^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=(\S*))?/i.exec(line);
    if (arg) args[arg[1]] = (arg[2] ?? "").replace(/^["']|["']$/g, "");
    const from = /^\s*FROM\s+(?:--platform=(\S+)\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!from) return;
    const raw = from[2];
    const reference = raw.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name) => args[name] ?? "");
    // `FROM scratch` and `FROM <earlier stage>` pull no image.
    const pulls = reference !== "scratch" && !stages.has(reference.toLowerCase());
    if (from[3]) stages.add(from[3].toLowerCase());
    if (!pulls) return;
    const above = /^\s*#\s*(.*?)\s*$/.exec(lines[index - 1] ?? "")?.[1] ?? "";
    const platform = from[1] && !from[1].includes("$") ? from[1] : "";
    images.push({ reference, written: raw, comment: `${platform} ${above}`.trim() });
  });
  return images;
}

// The packages a lock installs as direct dependencies, and the binaries they provide.
function lockedBinaries(packages) {
  const binaries = new Set();
  for (const { packageJson, lock } of Object.values(packages)) {
    const direct = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
    for (const name of Object.keys(direct)) {
      const entry = lock?.packages?.[`node_modules/${name}`];
      if (!entry) continue;
      binaries.add(name);
      const bin = entry.bin;
      if (typeof bin === "string") binaries.add(name.replace(/^@[^/]+\//, ""));
      else if (bin && typeof bin === "object") for (const key of Object.keys(bin)) binaries.add(key);
    }
  }
  return binaries;
}

const words = (command) => command.trim().split(/\s+/);
const operands = (list) => list.filter((word) => !word.startsWith("-"));

// One reason a shell command installs a tool with no exact version, or null.
export function floatingInstall(command, binaries) {
  const text = command.trim();
  if (/\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/.test(text)) return "pipes a download into a shell";
  let match = /(?:^|[;&|]\s*|\s)npm\s+(install|i|add)\b(.*)$/.exec(text);
  if (match) {
    const targets = operands(words(match[2]));
    if (targets.length === 0) return "npm install rewrites the lock; use npm ci";
    const loose = targets.filter((name) => !/^(?:@[^/@\s]+\/)?[^@\s]+@\d+\.\d+\.\d+$/.test(name));
    if (loose.length > 0) return `npm install of ${loose.join(", ")} names no exact version`;
  }
  match = /(?:^|[;&|]\s*)npx\s+(.*)$/.exec(text);
  if (match) {
    const list = words(match[1]);
    const packageFlag = list.findIndex((word) => word === "--package" || word === "-p");
    const name = packageFlag >= 0 ? list[packageFlag + 1] : operands(list)[0];
    if (name && !/@\d+\.\d+\.\d+$/.test(name) && !binaries.has(name)) {
      return `npx ${name} runs a package that is neither in the lock nor pinned`;
    }
  }
  match = /(?:^|[;&|]\s*)(?:uv\s+pip|pip3?|python3?\s+-m\s+pip|pipx|uv\s+tool)\s+install\b(.*)$/.exec(text);
  if (match) {
    const list = words(match[1]);
    if (list.includes("-r") || list.includes("--requirement")) {
      if (!list.includes("--require-hashes")) return "pip install -r without --require-hashes";
    } else {
      const loose = operands(list).filter((name) => !/^[A-Za-z0-9._\[\],-]+==\d+(?:\.\d+)*$/.test(name));
      if (loose.length > 0) return `install of ${loose.join(", ")} names no exact version`;
    }
  }
  match = /(?:^|[;&|]\s*)(?:sudo\s+)?apt(?:-get)?\s+install\b(.*)$/.exec(text);
  if (match) {
    const loose = operands(words(match[1])).filter((name) => !/=\S+$/.test(name));
    if (loose.length > 0) return `apt install of ${loose.join(", ")} names no exact version`;
  }
  match = /(?:^|[;&|]\s*)(?:go\s+install|cargo\s+install|gem\s+install)\b(.*)$/.exec(text);
  if (match && !/@v?\d+\.\d+\.\d+\b|--version\s+=?\d|-v\s+\d/.test(match[1])) return "install names no exact version";
  return null;
}

// Each setup action's version inputs. A setup step must pin one of them, a literal
// version must be exact, and check-latest must stay off.
const SETUP_INPUTS = {
  "actions/setup-node": ["node-version", "node-version-file"],
  "actions/setup-python": ["python-version", "python-version-file"],
  "actions/setup-go": ["go-version", "go-version-file"],
  "actions/setup-java": ["java-version", "java-version-file"],
  "astral-sh/setup-uv": ["version", "version-file"],
  "pnpm/action-setup": ["version"],
  "oven-sh/setup-bun": ["bun-version", "bun-version-file"],
  "denoland/setup-deno": ["deno-version", "deno-version-file"],
};

function checkSetup(workflow, job, step, fail) {
  const action = step.uses?.reference.split("@")[0];
  const inputs = SETUP_INPUTS[action] ?? (/\/setup-[a-z0-9-]+$/.test(action ?? "") ? [] : null);
  if (inputs === null) return;
  const where = stepLabel(workflow, job, step);
  const reference = `${job.id} ${stepName(step)}`;
  const floating = (message) => fail("setup-floating", where, message, workflow.file, reference);
  if (step.with["check-latest"] === true || step.with["check-latest"] === "true") floating(`${action} must not set check-latest`);
  const set = inputs.filter((input) => step.with[input] !== undefined);
  if (set.length === 0) {
    floating(`${action} must pin ${inputs.length > 0 ? inputs.join(" or ") : "an exact version"}`);
    return;
  }
  for (const input of set) {
    if (input.endsWith("-file")) continue;
    const value = String(step.with[input]);
    if (!EXACT_VERSION.test(value)) floating(`${action} ${input} must be an exact x.y.z, found ${value}`);
  }
}

function nodeEndOfLife(version, where, file, policy, today, fail) {
  const major = /^v?(\d+)/.exec(String(version))?.[1];
  const end = major ? policy.endOfLife[major] : undefined;
  if (!end) {
    fail("node-eol", where, `Node ${version} is not a line in ${POLICY_FILE}'s node_end_of_life table`, file, String(version));
  } else if (end <= today) {
    fail("node-eol", where, `Node ${version} reached its end of life on ${end}`, file, String(version));
  }
}

// Every locked package's engines.node. Optional packages are platform binaries npm
// skips when they do not fit, so they do not set the minimum.
function lockedNodeEngines(lock) {
  const result = [];
  for (const [key, entry] of Object.entries(lock?.packages ?? {})) {
    if (key === "" || entry.optional) continue;
    const range = entry.engines?.node;
    if (typeof range === "string") result.push({ name: `${key.replace(/^.*node_modules\//, "")}@${entry.version}`, range });
  }
  return result;
}

const safely = (read) => {
  try {
    return read();
  } catch {
    return null;
  }
};
const unmet = (engines, version) =>
  engines.filter(({ range }) => safely(() => satisfies(version, range)) !== true).map(({ name, range }) => `${name} requires ${range}`);

function checkPackages({ packages, nodeVersion }, fail) {
  const version = String(nodeVersion ?? "").trim();
  const exact = EXACT_VERSION.test(version);
  if (!exact) fail("node-version-exact", ".node-version", `must be an exact x.y.z release, found ${version}`, ".node-version", version);
  for (const [directory, { packageJson, lock }] of Object.entries(packages)) {
    const file = path.posix.join(directory, "package.json");
    const packageManager = packageJson?.packageManager;
    if (typeof packageManager !== "string" || !/^npm@\d+\.\d+\.\d+$/.test(packageManager)) {
      fail("package-manager", file, `packageManager must be npm@<exact>, found ${packageManager}`, file, String(packageManager));
    }
    const engines = packageJson?.engines?.node;
    const locked = lockedNodeEngines(lock);
    if (exact) {
      const below = unmet(locked, version);
      if (below.length > 0) fail("node-version-lock", ".node-version", `${version} is below ${directory}'s lock minimum: ${below.join("; ")}`, ".node-version", version);
      if (safely(() => satisfies(version, engines)) !== true) {
        fail("node-version-engines", ".node-version", `${version} is outside ${file} engines ${engines}`, ".node-version", version);
      }
    }
    const floor = safely(() => rangeFloor(engines));
    if (floor === null) {
      fail("engines-floor", file, `engines.node must be a readable range, found ${engines}`, file, String(engines));
    } else {
      const below = unmet(locked, floor);
      if (below.length > 0) fail("engines-floor", file, `engines floor ${floor} is below the lock's minimum: ${below.join("; ")}`, file, String(engines));
    }
  }
  return exact ? version : null;
}

// ---- Step 3: least privilege --------------------------------------------------------

const writeScopes = (permissions) =>
  permissions?.kind === "map" ? Object.keys(permissions.scopes).filter((scope) => permissions.scopes[scope] === "write").sort() : [];
const isCheckout = (step) => /^actions\/checkout@/.test(step.uses?.reference ?? "");
const keepsCredentials = (step) => isCheckout(step) && !(step.with["persist-credentials"] === false || step.with["persist-credentials"] === "false");
export const CREDENTIALS = "persist-credentials";

function tokenEnv(env, where, file, reference, fail) {
  for (const [name, value] of Object.entries(env)) {
    if (TOKEN_EXPRESSION.test(String(value))) {
      fail("token-env", where, `${name} passes a token to every step; set it on the steps that call the API`, file, `${reference} env ${name}`);
    }
  }
}

// `entries` are the audited write steps that passed checkAuditedWrites: a malformed
// entry lists nothing, so the grant it was meant to cover fails too.
function checkPrivilege(parsed, entries, fail) {
  const listed = (workflow, job, permission) =>
    entries.some((entry) => entry.workflow === workflow.name && entry.job === job.id && entry.permission === permission);

  for (const workflow of parsed) {
    const top = workflow.permissions;
    if (top?.kind === "write-all") fail("write-all", `${workflow.name} permissions`, "write-all grants every scope", workflow.file, "permissions");
    tokenEnv(workflow.env, workflow.name, workflow.file, "workflow", fail);
    const inherited = new Set();

    for (const job of workflow.jobs) {
      const where = `${workflow.name} ${job.id}`;
      tokenEnv(job.env, where, workflow.file, job.id, fail);
      if (job.permissions === null && top === null) {
        fail("permissions-declared", where, "job declares no permissions, and the workflow has none at the top", workflow.file, job.id);
      }
      if (job.permissions?.kind === "write-all") fail("write-all", where, "write-all grants every scope", workflow.file, job.id);
      const effective = job.permissions ?? top;
      if (job.permissions === null) for (const scope of writeScopes(top)) inherited.add(scope);
      for (const scope of writeScopes(effective)) {
        const permission = `${scope}: write`;
        if (!listed(workflow, job, permission)) {
          const from = job.permissions === null ? " (inherited from the top of the workflow)" : "";
          fail("unlisted-write", where, `${permission}${from} is not an audited write step in ${POLICY_FILE}`, workflow.file, `${job.id} ${permission}`);
        }
      }
      for (const step of job.steps) {
        if (keepsCredentials(step) && !listed(workflow, job, CREDENTIALS)) {
          fail("persist-credentials", stepLabel(workflow, job, step), "checkout keeps its credentials; set persist-credentials: false or list it as an audited write step", workflow.file, `${job.id} ${stepName(step)}`);
        }
      }
    }
    for (const scope of writeScopes(top)) {
      if (!inherited.has(scope)) {
        fail("unused-top-level-write", `${workflow.name} permissions`, `${scope}: write at the top reaches no job today, and would reach every job added later; grant it on the job`, workflow.file, `permissions ${scope}`);
      }
    }
  }
}

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

export const AUDITED_WRITE_FIELDS = ["workflow", "job", "permission", "steps", "reason"];

// Returns the entries that hold; every other one is a violation.
function checkAuditedWrites(parsed, policy, fail) {
  const fields = AUDITED_WRITE_FIELDS;
  return policy.auditedWrites.filter((entry, index) => {
    const where = `${POLICY_FILE} audited_write ${index + 1}`;
    let valid = true;
    const broken = (message) => {
      valid = false;
      fail("audited-write-entry", where, message, POLICY_FILE, `audited_write ${index + 1}`);
    };
    const missing = fields.filter((field) =>
      field === "steps" ? !Array.isArray(entry?.steps) || entry.steps.length === 0 || !entry.steps.every(nonEmpty) : !nonEmpty(entry?.[field]),
    );
    if (missing.length > 0) return broken(`missing ${missing.join(", ")}`);
    const unknown = Object.keys(entry).filter((key) => !fields.includes(key));
    if (unknown.length > 0) return broken(`unknown field ${unknown.join(", ")}`);
    const workflow = parsed.find((each) => each.name === entry.workflow);
    const job = workflow?.jobs.find((each) => each.id === entry.job);
    if (!job) return broken(`${entry.workflow} ${entry.job} matches no job`);
    const effective = job.permissions ?? workflow.permissions;
    const holds = entry.permission === CREDENTIALS
      ? job.steps.some(keepsCredentials)
      : /^[a-z-]+: write$/.test(entry.permission) && writeScopes(effective).includes(entry.permission.split(":")[0]);
    if (!holds) return broken(`${entry.workflow} ${entry.job} does not hold ${entry.permission}`);
    const names = new Set(job.steps.map(stepName));
    const absent = entry.steps.filter((name) => !names.has(name));
    if (absent.length > 0) return broken(`no step named ${absent.map((name) => `"${name}"`).join(", ")} in ${entry.workflow} ${entry.job}`);
    if (entry.permission === CREDENTIALS) {
      const stray = job.steps.filter((step) => keepsCredentials(step) && !entry.steps.includes(stepName(step)));
      if (stray.length > 0) broken(`checkout "${stepName(stray[0])}" keeps its credentials but is not one of the listed steps`);
    }
    return valid;
  });
}

// ---- Step 4: exceptions -------------------------------------------------------------

export const EXCEPTION_FIELDS = ["file", "reference", "scope", "owner", "reason", "expires"];

export function applyExceptions(violations, exceptions, today) {
  const kept = [...violations];
  const own = [];
  const waived = new Set();
  exceptions.forEach((entry, index) => {
    const where = `${POLICY_FILE} exception ${index + 1}`;
    const broken = (message) => own.push({ rule: "exception", where, message, file: POLICY_FILE, reference: `exception ${index + 1}` });
    const expires = localDate(entry?.expires);
    const missing = EXCEPTION_FIELDS.filter((field) => (field === "expires" ? entry?.expires === undefined : !nonEmpty(entry?.[field])));
    if (missing.length > 0) return broken(`missing ${missing.join(", ")}`);
    const unknown = Object.keys(entry).filter((key) => !EXCEPTION_FIELDS.includes(key));
    if (unknown.length > 0) return broken(`unknown field ${unknown.join(", ")}`);
    if (expires === null) return broken("expires must be a date, such as 2026-11-01");
    if (!WAIVABLE_RULES.includes(entry.scope)) return broken(`scope ${entry.scope} is not a rule an exception may waive`);
    if (expires < today) return broken(`expired on ${expires}; renew it with a new expiry and a reason, or fix the reference`);
    if (daysBetween(today, expires) > EXCEPTION_MAX_DAYS) return broken(`expires ${expires}, more than ${EXCEPTION_MAX_DAYS} days out`);
    const matches = kept.filter((violation) => violation.rule === entry.scope && violation.file === entry.file && violation.reference === entry.reference);
    if (matches.length === 0) return broken(`${entry.scope} on ${entry.file} "${entry.reference}" matches no violation; remove it`);
    for (const match of matches) waived.add(match);
    return undefined;
  });
  return [...kept.filter((violation) => !waived.has(violation)), ...own];
}

// ---- The check ----------------------------------------------------------------------

export function checkSupplyChain(repository, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const violations = [];
  const fail = (rule, where, message, file = where, reference = where) => violations.push({ rule, where, message, file, reference });
  const policy = readPolicy(repository.policy, fail);
  const parsed = parseWorkflows(repository.workflows ?? {});
  const binaries = lockedBinaries(repository.packages ?? {});

  for (const workflow of parsed) {
    for (const problem of workflow.problems) fail("workflow-shape", problem.where, problem.message, workflow.file, problem.where);
    for (const image of workflow.images) checkImage(image, workflow.file, image.where, fail);
    for (const job of workflow.jobs) {
      if (job.uses) checkActionReference(job.uses, workflow.file, `${workflow.name} ${job.id}`, fail);
      for (const step of job.steps) {
        const where = stepLabel(workflow, job, step);
        if (step.uses) {
          checkActionReference(step.uses, workflow.file, where, fail);
          checkSetup(workflow, job, step, fail);
          const node = step.with["node-version"];
          if (/^actions\/setup-node@/.test(step.uses.reference) && node !== undefined) {
            nodeEndOfLife(node, where, workflow.file, policy, today, fail);
          }
        }
        for (const command of (step.run ?? "").split(/\r?\n/)) {
          const reason = floatingInstall(command, binaries);
          if (reason) fail("run-install", where, `${reason}: ${command.trim()}`, workflow.file, `${job.id} ${stepName(step)}`);
        }
      }
    }
  }
  for (const [file, text] of Object.entries(repository.dockerfiles ?? {})) {
    for (const image of dockerfileImages(text)) {
      checkImage(image, file, `${file} FROM ${image.written}`, fail);
    }
  }
  const version = checkPackages(repository, fail);
  if (version) nodeEndOfLife(version, ".node-version", ".node-version", policy, today, fail);
  checkPrivilege(parsed, checkAuditedWrites(parsed, policy, fail), fail);
  return applyExceptions(violations, policy.exceptions, today);
}
