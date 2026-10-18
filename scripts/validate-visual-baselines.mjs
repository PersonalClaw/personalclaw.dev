import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routes } from "../tests/support/site-contract.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshotDirectory = join(
  repositoryRoot,
  "tests/browser/__screenshots__/visual.spec.ts"
);

// One baseline set, made and compared inside the pinned Playwright image
// (tests/browser/visual-image.json, run by scripts/run-visual.mjs), so `{platform}` in
// playwright.config.ts's snapshotPathTemplate is always linux. A baseline for any other
// platform is unexpected: it would be compared nowhere.
export const PLATFORM = "linux";
const responsiveProjects = ["desktop", "mobile"];

export function expectedBaselines() {
  const expected = new Set();
  for (const project of responsiveProjects) {
    for (const route of routes) {
      expected.add(`${route.name}-page-${project}-${PLATFORM}.png`);
    }
    expected.add(`home-loops-state-${project}-${PLATFORM}.png`);
    expected.add(`apps-filtered-state-${project}-${PLATFORM}.png`);
  }
  expected.add(`mobile-navigation-open-mobile-${PLATFORM}.png`);
  return expected;
}

// ── The refresh entry point has to actually refresh, in the image ──────────────────────
//
// 🔴 `test:visual:update` passed a BARE `--update-snapshots`, and Playwright's own help says that
// flag's `preset` is **"changed"** (`-u, --update-snapshots [mode]  … preset: "changed"`, 1.62.1).
// `changed` only rewrites a snapshot whose comparison FAILED — so an intentional visual change that
// lands inside the 0.005 budget is silently skipped, and the refresh returns the old baseline
// byte-identical. That is exactly the case that hit a real change here: four `/apps` snapshots
// measured 0.00045–0.00297, all in tolerance, and the documented refresh flow could not update them.
// `=all` is what makes it a deliberate refresh. The human review the workflow asks for is
// unaffected: `all` rewrites every file, and `git diff` still shows only the ones that differ.
//
// It must also run through scripts/run-visual.mjs: a refresh outside the pinned image writes
// baselines from another browser, renderer and font set than the one CI compares in.
//
// Checked HERE because this script already owns the baseline contract, and a one-word regression in a
// package.json script is invisible otherwise.
export function checkBaselines(actualNames, refreshScript) {
  const expected = expectedBaselines();
  const actual = [...actualNames].filter((entry) => entry.endsWith(".png")).sort();
  const missing = [...expected].filter((entry) => !actual.includes(entry)).sort();
  const unexpected = actual.filter((entry) => !expected.has(entry));
  const problems = [];
  if (missing.length) problems.push(`Missing visual baselines:\n- ${missing.join("\n- ")}`);
  if (unexpected.length) {
    problems.push(
      `Unexpected visual baselines:\n- ${unexpected.join("\n- ")}\n` +
        `Only ${PLATFORM} baselines are compared (inside the pinned image); delete the others.`
    );
  }
  if (!refreshScript) {
    problems.push("package.json has no test:visual:update script to check");
  } else {
    if (!/--update-snapshots=all\b/.test(refreshScript)) {
      problems.push(
        `test:visual:update must pass --update-snapshots=all, not "${refreshScript}". A bare ` +
          `--update-snapshots means Playwright's "changed" preset, which skips any snapshot already ` +
          `inside the comparison budget — so an intentional in-tolerance change cannot be refreshed.`
      );
    }
    if (!/\bscripts\/run-visual\.mjs\b/.test(refreshScript)) {
      problems.push(
        `test:visual:update must run through scripts/run-visual.mjs, not "${refreshScript}": ` +
          `a refresh outside the pinned image writes baselines CI does not compare against.`
      );
    }
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const actual = readdirSync(snapshotDirectory);
  const refreshScript = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).scripts["test:visual:update"];
  const problems = checkBaselines(actual, refreshScript);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else {
    console.log(
      `Validated ${expectedBaselines().size} ${PLATFORM} visual baselines, and test:visual:update ` +
        "refreshes all of them inside the pinned image."
    );
  }
}
