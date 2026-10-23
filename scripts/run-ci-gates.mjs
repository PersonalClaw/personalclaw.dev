import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyRecord } from "./build-record.mjs";
import { GITHUB_API_CACHE_DIR, cacheEnabled } from "./github-api.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";

// The unit tier: `node --test` over the checks that need neither a build nor a network
// source. It runs FIRST and unconditionally, because everything downstream depends on it —
// the aggregate report's own contract, and the docs publication floor that decides which
// documents are allowed to become routes at all. A floor observed only at the end of a
// full build is a floor that gets weakened rather than fixed. The file list must be
// package.json's `test:unit` list, in the same order: tests/run-ci-gates.test.mjs fails
// when the two differ, so a test added to one is never left out of the other.
export const unitTests = {
  name: "unit-tests",
  command: process.execPath,
  args: [
    "--test",
    "tests/ci-contract.test.mjs",
    "tests/supply-chain.test.mjs",
    "tests/audit-lock.test.mjs",
    "tests/visual-environment.test.mjs",
    "tests/run-ci-gates.test.mjs",
    "tests/build-record.test.mjs",
    "tests/docs-publication.test.mjs",
    "tests/llms-lead.test.mjs",
    "tests/sync-registry.test.mjs",
    "tests/served-installer.test.mjs",
    "tests/apps-snippet.test.mjs",
    "tests/sync-sources-releases.test.mjs",
    "tests/compare-row-ids.test.mjs",
    "tests/product-claims.test.mjs",
    "tests/site-audit-captures.test.mjs",
    "tests/github-api.test.mjs",
    "tests/install-commands.test.mjs",
    "tests/tour-chapters.test.mjs",
    "tests/tour-tracks.test.mjs",
    "tests/release-clip.test.mjs",
    "tests/security-page.test.mjs",
    "tests/marketing-manifest.test.mjs",
    "tests/release-assets.test.mjs",
    "tests/ledger.test.mjs",
    "tests/blog-feed.test.mjs",
    "tests/ledger-claims.test.mjs",
    "tests/social-card.test.mjs",
    "tests/render-videos.test.mjs",
    "tests/app-sheet.test.mjs",
    "tests/sheet-render-check.test.mjs",
    "tests/registry-sheets.test.mjs",
    "tests/capture-guard.test.mjs",
    "tests/social-frames.test.mjs",
    "tests/social-image-check.test.mjs",
    "tests/release-slot.test.mjs",
  ],
};

const independentGates = [
  {
    name: "validate:visual-baselines",
    command: "npm",
    args: ["run", "validate:visual-baselines"],
  },
  {
    name: "validate:marketing-manifest",
    command: "npm",
    args: ["run", "validate:marketing-manifest"],
  },
  {
    name: "validate:design-tokens",
    command: "npm",
    args: ["run", "validate:design-tokens"],
  },
  // Independent on purpose: it reads source text, so it needs neither a build nor the
  // generated release facts, and a branch-pinned link should be reported even when the
  // build is broken for an unrelated reason.
  {
    name: "validate:source-pins",
    command: "npm",
    args: ["run", "validate:source-pins"],
  },
  {
    name: "validate:release-parity",
    command: "npm",
    args: ["run", "validate:release-parity"],
  },
];

const registryGate = {
  name: "validate:registry",
  command: "npm",
  args: ["run", "validate:registry"],
  prepare() {
    mkdirSync(".generated", { recursive: true });
    if (!existsSync(".generated/release-facts.json")) {
      runPreparation("npm", ["run", "sync:sources"]);
    }
    if (!existsSync("src/content/docs")) {
      runPreparation("npm", ["run", "sync:docs"]);
    }
  },
};

const buildGate = {
  name: "build",
  command: "npm",
  args: ["run", "build"],
};

// With --prebuilt, the static run tests a build it is handed (CI's `build` job, see
// scripts/build-record.mjs) instead of making one. Its gate is the record's verify: a
// missing, stale, other-tree or changed build reads FAIL with the reason, never SKIP,
// and what reads the build is skipped behind it. The handed build already holds the
// preview build, made from the same sync, so build:preview does not run either: a
// re-sync here would move .generated/ past the dist/ the consumers compare it with.
function prebuiltGate(options) {
  return {
    name: "prebuilt",
    check: () => verifyRecord(options === true ? {} : options),
  };
}

const buildConsumers = [
  {
    name: "validate:build",
    command: "npm",
    args: ["run", "validate:build"],
  },
  {
    name: "validate:blog",
    command: "npm",
    args: ["run", "validate:blog"],
  },
  {
    name: "validate:compare",
    command: "npm",
    args: ["run", "validate:compare"],
  },
  {
    name: "validate:security",
    command: "npm",
    args: ["run", "validate:security"],
  },
];

const previewBuildGate = {
  name: "build:preview",
  command: "npm",
  args: ["run", "build:preview"],
};

const previewConsumer = {
  name: "validate:preview",
  command: "npm",
  args: ["run", "validate:preview"],
};

// The visual specs are not in this run: playwright.config.ts leaves them out unless
// scripts/run-visual.mjs starts them inside the pinned Playwright image, which runs only on
// a linux/amd64 host with a container runtime. The row says so, so a green local gate is
// never read as a pixel comparison. Website CI's browser job compares them.
export const VISUAL_NOTE =
  "visual specs not run here: they compare only inside the pinned image, in CI's browser job (npm run test:visual)";

const browserConsumers = [
  {
    name: "playwright",
    command: "playwright",
    args: ["test", "--workers=2"],
    note: VISUAL_NOTE,
  },
  {
    name: "lighthouse",
    command: process.execPath,
    args: ["scripts/lighthouse-audit.mjs"],
  },
];

function spawnGateCommand(command, args) {
  return spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });
}

function runPreparation(command, args) {
  const result = spawnGateCommand(command, args);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail =
      result.status === null
        ? `signal ${result.signal ?? "unknown"}`
        : `exit ${result.status}`;
    throw new Error(`${command} ${args.join(" ")} failed (${detail})`);
  }
}

export function defaultExecutor(gate) {
  if (gate.check) {
    let problems;
    try {
      problems = gate.check();
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)];
    }
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    return problems.length === 0
      ? { status: PASS, detail: "" }
      : { status: FAIL, detail: problems.length === 1 ? problems[0] : `${problems[0]} (+${problems.length - 1} more)` };
  }
  try {
    gate.prepare?.();
  } catch (error) {
    return {
      status: FAIL,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const result = spawnGateCommand(gate.command, gate.args);

  if (result.error) {
    return {
      status: FAIL,
      detail: result.error.message,
    };
  }

  if (result.status === 0) {
    return {
      status: PASS,
      detail: "",
    };
  }

  const detail =
    result.status === null
      ? `signal ${result.signal ?? "unknown"}`
      : `exit ${result.status}`;
  return {
    status: FAIL,
    detail,
  };
}

function runGate(gate, rows, execute, write) {
  write(`\n>>> ${gate.name}\n`);
  const result = execute(gate);
  const detail = [result.detail, gate.note].filter(Boolean).join("; ");
  rows.push({
    name: gate.name,
    status: result.status === PASS ? PASS : FAIL,
    detail,
  });
}

function skipGate(gate, prerequisite, rows) {
  rows.push({
    name: gate.name,
    status: SKIP,
    detail: `requires ${prerequisite} PASS`,
  });
}

export function renderReport(rows) {
  const overall = rows.every((row) => row.status === PASS) ? PASS : FAIL;
  const renderedRows = [
    ...rows,
    {
      name: "OVERALL",
      status: overall,
      detail: "",
    },
  ];
  const nameWidth = Math.max(
    "GATE".length,
    ...renderedRows.map((row) => row.name.length),
  );
  const statusWidth = "RESULT".length;
  const lines = [
    "=== test:ci result table ===",
    `${"GATE".padEnd(nameWidth)}  ${"RESULT".padEnd(statusWidth)}  DETAIL`,
    `${"-".repeat(nameWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(6)}`,
    ...renderedRows.map(
      (row) =>
        `${row.name.padEnd(nameWidth)}  ${row.status.padEnd(statusWidth)}  ${row.detail}`,
    ),
  ];

  return {
    overall,
    text: lines.join("\n"),
  };
}

export function runCiGates({
  staticOnly = false,
  prebuilt = false,
  execute = defaultExecutor,
  write = (text) => process.stdout.write(text),
} = {}) {
  const rows = [];
  const run = (gate) => runGate(gate, rows, execute, write);
  const build = prebuilt ? prebuiltGate(prebuilt) : buildGate;

  run(unitTests);
  for (const gate of independentGates) {
    run(gate);
  }

  run(build);
  const buildPassed = rows.at(-1).status === PASS;
  run(registryGate);

  if (buildPassed) {
    for (const gate of buildConsumers) {
      run(gate);
    }

    if (prebuilt) {
      run(previewConsumer);
    } else {
      run(previewBuildGate);
      const previewBuildPassed = rows.at(-1).status === PASS;
      if (previewBuildPassed) {
        run(previewConsumer);
      } else {
        skipGate(previewConsumer, previewBuildGate.name, rows);
      }
    }

    if (!staticOnly) {
      for (const gate of browserConsumers) {
        run(gate);
      }
    }
  } else {
    for (const gate of buildConsumers) {
      skipGate(gate, build.name, rows);
    }
    if (prebuilt) {
      skipGate(previewConsumer, build.name, rows);
    } else {
      skipGate(previewBuildGate, buildGate.name, rows);
      skipGate(previewConsumer, previewBuildGate.name, rows);
    }

    if (!staticOnly) {
      for (const gate of browserConsumers) {
        skipGate(gate, build.name, rows);
      }
    }
  }

  const report = renderReport(rows);
  write(`\n${report.text}\n`);

  return {
    exitCode: report.overall === PASS ? 0 : 1,
    rows,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file:"));

if (isMain) {
  const unknownArguments = process.argv.slice(2).filter((arg) => arg !== "--static" && arg !== "--prebuilt");
  if (unknownArguments.length > 0) {
    console.error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
    process.exitCode = 2;
  } else {
    // A local run reads each live GitHub API URL once for all its steps (scripts/github-api.mjs),
    // from a folder that is the run's alone and is deleted when the run ends. CI keeps no cache.
    let runCache = null;
    if (cacheEnabled()) {
      mkdirSync(GITHUB_API_CACHE_DIR, { recursive: true });
      runCache = mkdtempSync(path.join(GITHUB_API_CACHE_DIR, "run-"));
      process.env.GITHUB_API_RUN_DIR = runCache;
    }
    try {
      const result = runCiGates({
        staticOnly: process.argv.includes("--static"),
        prebuilt: process.argv.includes("--prebuilt"),
      });
      process.exitCode = result.exitCode;
    } finally {
      if (runCache) rmSync(runCache, { recursive: true, force: true });
    }
  }
}
