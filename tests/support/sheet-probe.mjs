// Where tests/browser/registry-sheet.spec.ts builds its fixture sheets: one folder per Playwright
// run, shared by every worker and project of that run (scripts/registry-probe.mjs:
// sharedProbeBuild), and removed by the run's teardown (tests/global-teardown.mjs).
//
// A run is named by the runner's process id: every worker is a child of the runner, so a worker's
// parent id is the runner's own id, which is the teardown's.

import { readdirSync } from "node:fs";
import path from "node:path";
import { removeSharedProbeBuild } from "../../scripts/registry-probe.mjs";

export const SHEET_PROBE_PREFIX = ".registry-sheet-probe-";

/** This run's probe folder, from a worker (whose parent is the runner) or from the runner. */
export function sheetProbeDir(runId = process.ppid, root = process.cwd()) {
  return path.join(root, `${SHEET_PROBE_PREFIX}${runId}`);
}

/** Remove every probe folder and its markers: this run's, and any a stopped run left behind. */
export function removeSheetProbes(root = process.cwd()) {
  const runs = new Set(
    readdirSync(root)
      .filter((name) => name.startsWith(SHEET_PROBE_PREFIX))
      .map((name) => name.slice(SHEET_PROBE_PREFIX.length).split(".")[0])
  );
  for (const run of runs) removeSharedProbeBuild(sheetProbeDir(run, root));
}
