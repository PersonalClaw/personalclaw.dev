import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";

// The unit tier: `node --test` over the checks that need neither a build nor a network
// source. It runs FIRST and unconditionally, because everything downstream depends on it —
// the aggregate report's own contract, and the docs publication floor that decides which
// documents are allowed to become routes at all. A floor observed only at the end of a
// full build is a floor that gets weakened rather than fixed.
const unitTests = {
  name: "unit-tests",
  command: process.execPath,
  args: [
    "--test",
    "tests/run-ci-gates.test.mjs",
    "tests/docs-publication.test.mjs",
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

const browserConsumers = [
  {
    name: "playwright",
    command: "playwright",
    args: ["test", "--workers=2"],
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

function defaultExecutor(gate) {
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
  rows.push({
    name: gate.name,
    status: result.status === PASS ? PASS : FAIL,
    detail: result.detail ?? "",
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
  execute = defaultExecutor,
  write = (text) => process.stdout.write(text),
} = {}) {
  const rows = [];
  const run = (gate) => runGate(gate, rows, execute, write);

  run(unitTests);
  for (const gate of independentGates) {
    run(gate);
  }

  run(buildGate);
  const buildPassed = rows.at(-1).status === PASS;
  run(registryGate);

  if (buildPassed) {
    for (const gate of buildConsumers) {
      run(gate);
    }

    run(previewBuildGate);
    const previewBuildPassed = rows.at(-1).status === PASS;
    if (previewBuildPassed) {
      run(previewConsumer);
    } else {
      skipGate(previewConsumer, previewBuildGate.name, rows);
    }

    if (!staticOnly) {
      for (const gate of browserConsumers) {
        run(gate);
      }
    }
  } else {
    for (const gate of buildConsumers) {
      skipGate(gate, buildGate.name, rows);
    }
    skipGate(previewBuildGate, buildGate.name, rows);
    skipGate(previewConsumer, previewBuildGate.name, rows);

    if (!staticOnly) {
      for (const gate of browserConsumers) {
        skipGate(gate, buildGate.name, rows);
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
  const unknownArguments = process.argv.slice(2).filter((arg) => arg !== "--static");
  if (unknownArguments.length > 0) {
    console.error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
    process.exitCode = 2;
  } else {
    const result = runCiGates({
      staticOnly: process.argv.includes("--static"),
    });
    process.exitCode = result.exitCode;
  }
}
