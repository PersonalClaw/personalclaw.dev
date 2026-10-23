// Build the site against fixture inputs, for the checks that need sheets the pinned data does not
// yield: a community registry with listings (the registry lists none at its pin) and first-party
// apps in states no app of the release is in (one needing a core feature the release lacks, its
// control, and one naming hosts and an MCP server).
//
// The fixtures go into a folder of the probe's own, which the build reads through
// PERSONALCLAW_REGISTRY_ARTIFACTS (src/data/registry.mjs): the fixture registry, and the synced
// first-party sheets with the fixtures added. The live .generated artifacts are never rewritten,
// so a probe cannot leave a fixture behind for a later gate, nor race another process reading
// them. scripts/validate-registry-render.mjs and tests/browser/registry-sheet.spec.ts both build
// through here.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { coreCompatibility, firstPartySheetFacts, gitBlobSha } from "./app-sheet.mjs";

const root = process.cwd();
const generated = path.join(root, ".generated");
const fixtures = path.join(root, "tests", "fixtures");

/** The first-party fixture manifests, by name, as their exact bytes. */
export function firstPartyFixtures() {
  const folder = path.join(fixtures, "first-party");
  return readdirSync(folder)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const text = readFileSync(path.join(folder, file), "utf8");
      return { name: JSON.parse(text).name, text, path: `${JSON.parse(text).name}/app.json` };
    });
}

/** The synced sheet artifact with the first-party fixtures added, read as the sync reads a manifest. */
function sheetsWithFixtures(synced) {
  const release = { features: synced.coreFeatures, version: synced.release.version };
  const added = firstPartyFixtures().map(({ text, path: manifestPath }) => {
    const facts = { ...firstPartySheetFacts(JSON.parse(text), text), path: manifestPath, treeBlob: gitBlobSha(text) };
    return { ...facts, compatibility: coreCompatibility(facts, release) };
  });
  return { ...synced, sheets: [...synced.sheets, ...added] };
}

/**
 * Build the site into *outDir* against the registry fixture `registry-<scenario>.json` and the
 * synced first-party sheets plus the fixtures, then run *check* on the result.
 *
 * @template T
 * @param {string} scenario
 * @param {string} outDir
 * @param {() => T} check
 * @returns {T}
 */
export function withProbeBuild(scenario, outDir, check) {
  const artifacts = mkdtempSync(path.join(tmpdir(), "personalclaw-registry-probe-"));
  try {
    copyFileSync(path.join(fixtures, `registry-${scenario}.json`), path.join(artifacts, "registry.json"));
    const synced = JSON.parse(readFileSync(path.join(generated, "app-sheets.json"), "utf8"));
    writeFileSync(path.join(artifacts, "app-sheets.json"), `${JSON.stringify(sheetsWithFixtures(synced), null, 2)}\n`);
    rmSync(outDir, { recursive: true, force: true });
    execFileSync(
      path.join(root, "node_modules", ".bin", "astro"),
      ["build", "--outDir", path.relative(root, outDir)],
      {
        cwd: root,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", PERSONALCLAW_REGISTRY_ARTIFACTS: artifacts },
        stdio: "pipe"
      }
    );
    return check();
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
}

/**
 * One probe build shared by every caller that names the same *outDir*: the first to claim it
 * builds (`build`, `withProbeBuild` by default), and the rest wait for it rather than build or
 * delete the same folder under each other. tests/browser/registry-sheet.spec.ts runs in a worker
 * per project, each of which used to rebuild and then remove one shared folder while another was
 * serving it. A failed build is recorded, so a waiter fails with it instead of timing out.
 *
 * @param {string} scenario
 * @param {string} outDir
 * @param {{ build?: (scenario: string, outDir: string) => void, timeoutMs?: number, pollMs?: number }} [options]
 * @returns {Promise<"built" | "reused">}
 */
export async function sharedProbeBuild(scenario, outDir, { build, timeoutMs = 300_000, pollMs = 500 } = {}) {
  const claim = `${outDir}.claim`;
  const done = `${outDir}.built`;
  const failed = `${outDir}.failed`;
  try {
    mkdirSync(claim);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") throw error;
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(done)) {
      if (existsSync(failed)) throw new Error(`the shared probe build into ${outDir} failed: ${readFileSync(failed, "utf8")}`);
      if (Date.now() > deadline) throw new Error(`the shared probe build into ${outDir} did not finish within ${timeoutMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return "reused";
  }
  try {
    (build ?? ((name, dir) => withProbeBuild(name, dir, () => undefined)))(scenario, outDir);
    writeFileSync(done, "");
    return "built";
  } catch (error) {
    writeFileSync(failed, String(/** @type {Error} */ (error)?.message ?? error));
    throw error;
  }
}

/** Remove a shared probe build and its markers. */
export function removeSharedProbeBuild(outDir) {
  for (const target of [outDir, `${outDir}.claim`, `${outDir}.built`, `${outDir}.failed`]) {
    rmSync(target, { recursive: true, force: true });
  }
}
