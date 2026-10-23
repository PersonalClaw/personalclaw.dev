// Record the pinned core release's assets in sources/personalclaw.sources.json: each asset's
// name, size and SHA-256 as GitHub's release record holds them. Run it at a re-pin, after the
// tag and commit move:
//
//   npm run record:release
//
// The build reads the record offline. scripts/validate-release-parity.mjs compares it with the
// live release, so it can't go stale unnoticed.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubJson } from "./github-api.mjs";
import { recordAssets } from "./release-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "sources", "personalclaw.sources.json");

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "personalclaw.dev-record-release",
  "X-GitHub-Api-Version": "2022-11-28"
};

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const core = manifest.sources.core;
if (!core.tag) {
  throw new Error("The manifest pins core by commit alone; only a tagged release has assets to record.");
}

const record = await githubJson(
  `https://api.github.com/repos/${core.repository}/releases/tags/${encodeURIComponent(core.tag)}`,
  headers
);
core.releaseAssets = recordAssets(record);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Recorded ${core.releaseAssets.length} assets of ${core.repository} ${core.tag} in ` +
    `${path.relative(root, manifestPath)}.`
);
