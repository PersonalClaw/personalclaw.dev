// The CI contract: the properties every workflow job and the Node toolchain pin must
// hold, checked over the files as committed. `checkContract` returns one violation per
// broken property and never throws on bad input, so a malformed file reads as a
// failure rather than as a crash or a pass. tests/ci-contract.test.mjs runs it on the
// repository and plants one violation per row.
import fs from "node:fs";
import path from "node:path";

export const IDENTITY_STEP = "Record runner identity";
export const IDENTITY_VARIABLES = ["ImageOS", "ImageVersion", "RUNNER_ARCH"];

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const IMAGE_DIGEST = /@sha256:[0-9a-f]{64}$/;
const ARCHITECTURE = /\b(?:linux\/)?(?:amd64|arm64|x64|x86_64|aarch64)\b/;

export function loadRepository(root) {
  const workflowDir = path.join(root, ".github", "workflows");
  const workflows = {};
  for (const name of fs.readdirSync(workflowDir).sort()) {
    if (/\.ya?ml$/.test(name)) {
      workflows[name] = fs.readFileSync(path.join(workflowDir, name), "utf8");
    }
  }
  return {
    workflows,
    nodeVersion: fs.readFileSync(path.join(root, ".node-version"), "utf8"),
    packageJson: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
    lock: JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")),
  };
}

// A line reader for the workflow shape this repository uses: top-level keys at
// column 0, job ids at two spaces, job keys at four, and steps as `      - ` items.
export function parseWorkflow(text) {
  const jobs = [];
  const images = [];
  let inJobs = false;
  let job = null;
  let step = null;

  for (const line of text.split("\n")) {
    const image = /^\s*(?:- )?image:\s*(\S+)(?:\s+#\s*(.*?))?\s*$/.exec(line);
    if (image) images.push({ reference: image[1], comment: image[2] ?? "" });
    const inlineContainer = /^\s*container:\s*([^\s#][^#]*?)(?:\s+#\s*(.*?))?\s*$/.exec(line);
    if (inlineContainer) {
      images.push({ reference: inlineContainer[1], comment: inlineContainer[2] ?? "" });
    }

    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*$/.test(line);
      job = null;
      step = null;
      continue;
    }
    if (!inJobs) continue;

    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobId) {
      job = { id: jobId[1], runsOn: null, steps: [] };
      jobs.push(job);
      step = null;
      continue;
    }
    if (!job) continue;

    const runsOn = /^ {4}runs-on:\s*(.*?)\s*$/.exec(line);
    if (runsOn) job.runsOn = runsOn[1];
    if (/^ {4}\S/.test(line)) {
      step = null;
      continue;
    }
    if (/^ {6}- /.test(line)) {
      step = { lines: [line] };
      job.steps.push(step);
      continue;
    }
    if (step) step.lines.push(line);
  }

  for (const each of jobs) {
    for (const item of each.steps) {
      item.text = item.lines.join("\n");
      item.name = matchLine(item.lines, /^\s*(?:- )?name:\s*(.*?)\s*$/)?.[1] ?? null;
      const uses = matchLine(item.lines, /^\s*(?:- )?uses:\s*(\S+)(?:\s+#\s*(.*?))?\s*$/);
      item.uses = uses ? { reference: uses[1], comment: uses[2] ?? "" } : null;
    }
  }
  return { jobs, images };
}

function matchLine(lines, pattern) {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) return match;
  }
  return null;
}

export function checkContract({ workflows, nodeVersion, packageJson, lock }) {
  const violations = [];
  const fail = (rule, where, message) => violations.push({ rule, where, message });

  for (const [file, text] of Object.entries(workflows)) {
    const { jobs, images } = parseWorkflow(text);
    if (jobs.length === 0) fail("workflow-jobs", file, "no jobs found");

    for (const job of jobs) {
      const where = `${file} ${job.id}`;

      if (!job.runsOn) {
        fail("runner-label", where, "job has no runs-on");
      } else if (/-latest\b/.test(job.runsOn) || job.runsOn.includes("${{")) {
        fail("runner-label", where, `runs-on must name a fixed image, found ${job.runsOn}`);
      }

      const first = job.steps[0];
      const identity = first?.name === IDENTITY_STEP ? first.text : null;
      if (identity === null) {
        fail("identity-step", where, `the first step must be "${IDENTITY_STEP}"`);
      } else {
        const missing = IDENTITY_VARIABLES.filter(
          (name) => !identity.includes(`-z "\${${name}`),
        );
        if (missing.length > 0 || !/\bexit 1\b/.test(identity)) {
          fail(
            "identity-step",
            where,
            `"${IDENTITY_STEP}" must fail when ${IDENTITY_VARIABLES.join(", ")} is empty`,
          );
        }
      }

      for (const step of job.steps) {
        const label = `${where} "${step.name ?? "unnamed step"}"`;
        if (step.uses) {
          const { reference, comment } = step.uses;
          if (reference.startsWith("docker://")) {
            images.push({ reference: reference.slice("docker://".length), comment });
          } else if (!reference.startsWith("./")) {
            const [, ref = ""] = reference.split("@");
            if (!COMMIT_SHA.test(ref) || !RELEASE_TAG.test(comment)) {
              fail(
                "action-sha",
                label,
                `uses must be a full commit SHA with its release tag as a comment, found ${reference}${comment ? ` # ${comment}` : ""}`,
              );
            }
          }
          if (/^actions\/setup-node@/.test(reference)) {
            const file = /^\s*node-version-file:\s*(\S+)\s*$/m.exec(step.text)?.[1];
            if (file !== ".node-version" || /^\s*node-version:/m.test(step.text)) {
              fail("setup-node-file", label, "setup-node must read node-version-file: .node-version");
            }
          }
        }
      }
    }

    for (const image of images) {
      if (!IMAGE_DIGEST.test(image.reference) || !ARCHITECTURE.test(image.comment)) {
        fail(
          "image-digest",
          file,
          `image must be pinned by digest with its architecture in a comment, found ${image.reference}`,
        );
      }
    }
  }

  const packageManager = packageJson?.packageManager;
  if (typeof packageManager !== "string" || !/^npm@\d+\.\d+\.\d+$/.test(packageManager)) {
    fail("package-manager", "package.json", `packageManager must be npm@<exact>, found ${packageManager}`);
  }

  const engines = packageJson?.engines?.node;
  const version = String(nodeVersion ?? "").trim();
  const lockEngines = lockedNodeEngines(lock);

  if (!EXACT_VERSION.test(version)) {
    fail("node-version-exact", ".node-version", `must be an exact x.y.z release, found ${version}`);
  } else {
    const below = unmet(lockEngines, version);
    if (below.length > 0) {
      fail("node-version-lock", ".node-version", `${version} is below the lock's minimum: ${below.join("; ")}`);
    }
    if (!safeSatisfies(version, engines)) {
      fail("node-version-engines", ".node-version", `${version} is outside package.json engines ${engines}`);
    }
  }

  const floor = safeFloor(engines);
  if (floor === null) {
    fail("engines-floor", "package.json", `engines.node must be a readable range, found ${engines}`);
  } else {
    const below = unmet(lockEngines, floor);
    if (below.length > 0) {
      fail("engines-floor", "package.json", `engines floor ${floor} is below the lock's minimum: ${below.join("; ")}`);
    }
  }

  return violations;
}

// Every locked package's engines.node. Optional packages are platform binaries npm
// skips when they do not fit, so they do not set the minimum.
function lockedNodeEngines(lock) {
  const result = [];
  for (const [key, entry] of Object.entries(lock?.packages ?? {})) {
    if (key === "" || entry.optional) continue;
    const range = entry.engines?.node;
    if (typeof range === "string") {
      result.push({ name: `${key.replace(/^.*node_modules\//, "")}@${entry.version}`, range });
    }
  }
  return result;
}

function unmet(lockEngines, version) {
  return lockEngines
    .filter(({ range }) => !safeSatisfies(version, range))
    .map(({ name, range }) => `${name} requires ${range}`);
}

function safeSatisfies(version, range) {
  try {
    return satisfies(version, range);
  } catch {
    return false;
  }
}

function safeFloor(range) {
  try {
    return rangeFloor(range);
  } catch {
    return null;
  }
}

// A small reader for the npm range forms the lock uses: `||`, space-joined
// comparators, ^, ~, >=, >, <=, <, =, partial versions and *. Anything else throws,
// and the callers read a throw as unmet.
function parseVersion(text) {
  const match = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(text);
  if (!match) throw new Error(`unsupported version ${text}`);
  const part = (value) => (value === undefined || value === "x" || value === "*" ? null : Number(value));
  return [Number(match[1]), part(match[2]), part(match[3])];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function comparatorSets(range) {
  if (typeof range !== "string" || range.trim() === "") throw new Error("empty range");
  return range.split("||").map((set) => {
    const text = set.trim();
    if (text === "" || text === "*" || text === "x") return [];
    const comparators = [];
    const pattern = /(\^|~|>=|<=|>|<|=)?\s*(v?\d+(?:\.(?:\d+|x|\*)){0,2})(?=\s|$)/y;
    let index = 0;
    while (index < text.length) {
      if (text[index] === " ") {
        index += 1;
        continue;
      }
      pattern.lastIndex = index;
      const match = pattern.exec(text);
      if (!match) throw new Error(`unsupported range ${range}`);
      comparators.push(...expand(match[1] ?? "=", parseVersion(match[2])));
      index = pattern.lastIndex;
    }
    return comparators;
  });
}

function expand(operator, [major, minor, patch]) {
  const low = [major, minor ?? 0, patch ?? 0];
  if (operator === "^") {
    if (major === 0) throw new Error("unsupported ^0 range");
    return [[">=", low], ["<", [major + 1, 0, 0]]];
  }
  if (operator === "~") {
    return [[">=", low], ["<", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  if (operator === "=") {
    if (minor === null) return [[">=", low], ["<", [major + 1, 0, 0]]];
    if (patch === null) return [[">=", low], ["<", [major, minor + 1, 0]]];
    return [[">=", low], ["<=", low]];
  }
  if (operator === "<=" && (minor === null || patch === null)) {
    return [["<", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  if (operator === ">" && (minor === null || patch === null)) {
    return [[">=", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  return [[operator, low]];
}

export function satisfies(version, range) {
  const target = parseVersion(version);
  if (target.includes(null)) throw new Error(`not an exact version ${version}`);
  return comparatorSets(range).some((set) =>
    set.every(([operator, bound]) => {
      const order = compare(target, bound);
      if (operator === ">=") return order >= 0;
      if (operator === ">") return order > 0;
      if (operator === "<=") return order <= 0;
      if (operator === "<") return order < 0;
      throw new Error(`unsupported operator ${operator}`);
    }),
  );
}

// The lowest version a range admits: the smallest lower bound over its sets.
export function rangeFloor(range) {
  const lows = comparatorSets(range).map((set) => {
    if (set.some(([operator]) => operator === ">")) throw new Error("unsupported > floor");
    const bounds = set.filter(([operator]) => operator === ">=").map(([, bound]) => bound);
    return bounds.reduce((high, bound) => (compare(bound, high) > 0 ? bound : high), [0, 0, 0]);
  });
  const floor = lows.reduce((low, bound) => (compare(bound, low) < 0 ? bound : low));
  return floor.join(".");
}
