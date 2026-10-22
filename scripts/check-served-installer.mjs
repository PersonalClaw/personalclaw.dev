// The served-installer check, run by the scheduled Release follow workflow.
//
// It gathers what scripts/served-installer.mjs judges: the bytes served at /install,
// this checkout's `public/install`, the newest core release (its commit's installer and
// `install.sh.sha256`, its attached files, its SHA256SUMS when it has one), and when
// the check last passed. Every read is caught and handed on as a reason, so a server
// or API that cannot be reached makes the result unproven, then stale, never a pass.
//
// The last success is the newest unexpired `served-installer-proof` artifact of this
// repository, which the workflow uploads only when the verdict is pass. Reading it
// needs `actions: read`.
//
//   node scripts/check-served-installer.mjs [--result <file>]
//
// Exit 0 for pass and unproven, 1 for fail and stale. `--result` writes the verdict and
// every leg as JSON, which the workflow keeps as the proof when it passed.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { githubJson } from "./github-api.mjs";
import {
  INSTALLER_CHECKSUM_PATH,
  INSTALLER_PATH,
  PROOF_ARTIFACT,
  PUBLISHED_INSTALLER,
  RELEASE_CHECKSUMS,
  SERVED_INSTALLER_URL,
  assessServedInstaller,
  newestRelease,
  pinnedFileUrl,
  renderAssessment,
} from "./served-installer.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  readFileSync(join(repositoryRoot, "sources", "personalclaw.sources.json"), "utf8"),
);
const coreRepository = manifest.sources.core.repository;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "personalclaw.dev-served-installer",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
const plainHeaders = { "User-Agent": apiHeaders["User-Agent"] };

async function outcome(read) {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchBytes(url, headers = plainHeaders) {
  const response = await fetch(url, { headers, redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`request failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// Through scripts/github-api.mjs, which spares the shared API quota on local runs.
function fetchJson(url) {
  return githubJson(url, apiHeaders);
}

async function resolveTagCommit(repository, tag) {
  let object = (
    await fetchJson(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`)
  ).object;
  for (let depth = 0; object?.type === "tag" && depth < 5; depth += 1) {
    object = (await fetchJson(`https://api.github.com/repos/${repository}/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== "commit") throw new Error(`${repository} tag ${tag} resolves to no commit`);
  return object.sha;
}

async function readNewestRelease() {
  const release = newestRelease(
    await fetchJson(`https://api.github.com/repos/${coreRepository}/releases?per_page=30`),
  );
  if (!release) throw new Error(`${coreRepository} has no published release`);
  const tag = release.tag_name;
  const commit = await resolveTagCommit(coreRepository, tag);
  const assets = release.assets ?? [];
  const sumsAsset = assets.find((asset) => asset.name === RELEASE_CHECKSUMS);
  const [installer, installerChecksum, sums] = await Promise.all([
    fetchBytes(pinnedFileUrl(coreRepository, commit, INSTALLER_PATH)),
    fetchBytes(pinnedFileUrl(coreRepository, commit, INSTALLER_CHECKSUM_PATH)),
    sumsAsset ? fetchBytes(sumsAsset.browser_download_url) : Promise.resolve(null),
  ]);
  return {
    tag,
    commit,
    installer,
    installerChecksum: installerChecksum.toString("utf8"),
    assetNames: assets.map((asset) => asset.name),
    sums: sums ? sums.toString("utf8") : null,
  };
}

async function readLastSuccess() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is not set, so no earlier proof can be read");
  const { artifacts = [] } = await fetchJson(
    `https://api.github.com/repos/${repository}/actions/artifacts?name=${PROOF_ARTIFACT}&per_page=20`,
  );
  const newest = artifacts
    .filter((artifact) => artifact.name === PROOF_ARTIFACT && !artifact.expired)
    .map((artifact) => artifact.created_at)
    .filter((createdAt) => Number.isFinite(Date.parse(createdAt)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  return newest ?? null;
}

const resultIndex = process.argv.indexOf("--result");
const resultPath = resultIndex === -1 ? null : process.argv[resultIndex + 1];
if (resultIndex !== -1 && !resultPath) {
  console.error("--result needs a file path");
  process.exit(2);
}

const [served, published, release, lastSuccess] = await Promise.all([
  outcome(() => fetchBytes(SERVED_INSTALLER_URL)),
  outcome(() => readFileSync(join(repositoryRoot, PUBLISHED_INSTALLER))),
  outcome(readNewestRelease),
  outcome(readLastSuccess),
]);

const result = assessServedInstaller({ served, published, release, lastSuccess, now: new Date() });
console.log(renderAssessment(result));

if (resultPath) {
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}
process.exitCode = result.verdict === "pass" || result.verdict === "unproven" ? 0 : 1;
