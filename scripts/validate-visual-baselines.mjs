import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routes } from "../tests/support/site-contract.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshotDirectory = join(
  repositoryRoot,
  "tests/browser/__screenshots__/visual.spec.ts"
);
const platforms = ["darwin", "linux"];
const responsiveProjects = ["desktop", "mobile"];

const expected = new Set();

for (const platform of platforms) {
  for (const project of responsiveProjects) {
    for (const route of routes) {
      expected.add(`${route.name}-page-${project}-${platform}.png`);
    }
    expected.add(`home-loops-state-${project}-${platform}.png`);
    expected.add(`apps-filtered-state-${project}-${platform}.png`);
  }
  expected.add(`mobile-navigation-open-mobile-${platform}.png`);
}

const actual = readdirSync(snapshotDirectory)
  .filter((entry) => entry.endsWith(".png"))
  .sort();
const missing = [...expected].filter((entry) => !actual.includes(entry)).sort();
const unexpected = actual.filter((entry) => !expected.has(entry));

// ── The refresh entry point has to actually refresh ────────────────────────────────────
//
// 🔴 `test:visual:update` passed a BARE `--update-snapshots`, and Playwright's own help says that
// flag's `preset` is **"changed"** (`-u, --update-snapshots [mode]  … preset: "changed"`, 1.62.1).
// `changed` only rewrites a snapshot whose comparison FAILED — so an intentional visual change that
// lands inside the 0.005 budget is silently skipped, and the refresh returns the old baseline
// byte-identical. That is exactly the case that hit a real change here: four `/apps` snapshots
// measured 0.00045–0.00297, all in tolerance, and the documented refresh flow could not update them.
//
// Five places call this script a DELIBERATE refresh — README's script table ("Deliberately refreshes
// committed visual baselines"), README's rule 7, marketing/README, docs/release-runbook, and
// .github/workflows/visual-baselines.yml. `=all` is what makes it mean that. The human review the
// workflow asks for is unaffected: `all` rewrites every file, and `git diff` still shows only the ones
// that actually differ, so "commit only the intentional updates" reads the same.
//
// Checked HERE because this script already owns the baseline contract, and a one-word regression in a
// package.json script is invisible otherwise.
const refreshScript = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8")
).scripts["test:visual:update"];

const refreshProblems = [];
if (!refreshScript) {
  refreshProblems.push("package.json has no test:visual:update script to check");
} else if (!/--update-snapshots=all\b/.test(refreshScript)) {
  refreshProblems.push(
    `test:visual:update must pass --update-snapshots=all, not "${refreshScript}". A bare ` +
      `--update-snapshots means Playwright's "changed" preset, which skips any snapshot already ` +
      `inside the comparison budget — so an intentional in-tolerance change cannot be refreshed.`
  );
}

if (missing.length || unexpected.length || refreshProblems.length) {
  if (missing.length) {
    console.error(`Missing visual baselines:\n- ${missing.join("\n- ")}`);
  }
  if (unexpected.length) {
    console.error(`Unexpected visual baselines:\n- ${unexpected.join("\n- ")}`);
  }
  for (const problem of refreshProblems) console.error(problem);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${actual.length} visual baselines across ${platforms.join(" and ")}, and ` +
      "test:visual:update refreshes all of them."
  );
}
