// The pinned core release's assets, as GitHub records them, and what /release builds from them.
//
// GitHub keeps a SHA-256 `digest` for every uploaded release asset. Until core's staged release
// (PersonalClaw/PersonalClaw#3911) publishes checksum files, that digest is the checksum /release
// shows, labelled as GitHub's record of the uploaded bytes (#93, settled 2026-10-14).
//
// `npm run record:release` (scripts/record-release.mjs) writes the pinned release's assets into
// sources/personalclaw.sources.json at a re-pin, so the build reads them offline.
// scripts/validate-release-parity.mjs compares that record with the live release, so a stale or
// hand-edited record fails.

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The assets of a GitHub release record, as the manifest records them: name, size and SHA-256,
 * sorted by name. An asset with no SHA-256 digest is refused, since its checksum can't be shown.
 *
 * @param {{ assets?: Array<{ name: string, size: number, digest?: string | null }> }} record
 * @returns {Array<{ name: string, size: number, sha256: string }>}
 */
export function recordAssets(record) {
  return (record?.assets ?? [])
    .map((asset) => {
      const sha256 = String(asset.digest ?? "").replace(/^sha256:/, "");
      if (!SHA256.test(sha256)) {
        throw new Error(`release asset ${asset.name} has no SHA-256 digest (${asset.digest ?? "none"})`);
      }
      return { name: asset.name, size: asset.size, sha256 };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

/**
 * Where the recorded assets and the live release disagree: an asset on one side only, or one
 * whose size or SHA-256 differs.
 *
 * @param {Array<{ name: string, size: number, sha256: string }>} recorded
 * @param {Array<{ name: string, size: number, sha256: string }>} live
 * @returns {string[]}
 */
export function releaseAssetProblems(recorded, live) {
  const problems = [];
  const liveByName = new Map(live.map((asset) => [asset.name, asset]));
  const recordedNames = new Set(recorded.map((asset) => asset.name));
  for (const asset of recorded) {
    const found = liveByName.get(asset.name);
    if (!found) {
      problems.push(`the manifest records ${asset.name}, which the release does not carry`);
      continue;
    }
    if (found.size !== asset.size) {
      problems.push(`${asset.name} is ${found.size} bytes in the release, ${asset.size} in the manifest`);
    }
    if (found.sha256 !== asset.sha256) {
      problems.push(`${asset.name}'s SHA-256 is ${found.sha256} in the release, ${asset.sha256} in the manifest`);
    }
  }
  for (const asset of live) {
    if (!recordedNames.has(asset.name)) {
      problems.push(`the release carries ${asset.name}, which the manifest does not record`);
    }
  }
  return problems;
}

/** An SBOM asset: core attaches each one as SPDX JSON. */
export const isSbom = (name) => name.endsWith(".spdx.json");

/**
 * The package files core's release workflow attests build provenance for (`attest-build-provenance`
 * over `dist/*`): the wheel and the sdist.
 *
 * @param {string} version  the core version, without the leading "v"
 */
export function attestedFiles(version) {
  return [`personalclaw-${version}-py3-none-any.whl`, `personalclaw-${version}.tar.gz`];
}

/**
 * Core's release workflow, the one that signs the wheel's and the sdist's build provenance. The
 * attestation command names it, so a provenance any other workflow in the repository signed (CI,
 * a fork's run, a hand-dispatched job) does not pass.
 */
export const RELEASE_WORKFLOW = ".github/workflows/release.yml";

/**
 * What is wrong with the pinned core's release workflow as the signer the attestation command
 * names: it has to exist at the pin, run on `v*` tags and attest build provenance. The sync reads
 * it from the pinned commit, so a core that renames or reworks it fails the build instead of
 * shipping a command that can't pass.
 *
 * @param {string | null} text  the workflow at the pinned commit, or null when the pin has none
 * @returns {string[]}
 */
export function releaseWorkflowProblems(text) {
  if (text === null) return [`the pinned core has no ${RELEASE_WORKFLOW}, which /release names as the signer`];
  const problems = [];
  if (!/^\s*-?\s*uses:\s*actions\/attest-build-provenance@/m.test(text)) {
    problems.push(`the pinned core's ${RELEASE_WORKFLOW} does not attest build provenance`);
  }
  if (!/^\s*tags:\s*\[\s*["']v\*["']\s*\]/m.test(text)) {
    problems.push(`the pinned core's ${RELEASE_WORKFLOW} does not run on v* tags, so --source-ref refs/tags/<tag> can't hold`);
  }
  return problems;
}

/**
 * How `uv tool install` installs the checked wheel: on the installer's Python, with the installer's
 * extras, from the file on disk instead of PyPI.
 *
 * @param {string} wheel  the wheel's file name
 * @param {{ python: string, package: string }} installer  what public/install hands `uv tool install`
 */
function installCommand(wheel, { python, package: requirement }) {
  const match = /^personalclaw(\[[a-z0-9,_-]+\])?$/.exec(requirement);
  if (!match) {
    throw new Error(`the installer installs ${requirement}, not personalclaw, so /release can't mirror it`);
  }
  const target = match[1] ? `'personalclaw${match[1]} @ ./${wheel}'` : `./${wheel}`;
  return `uv tool install --python ${python} ${target}`;
}

/**
 * The verification steps /release shows, built from the pin: download the wheel, compare its
 * SHA-256 with GitHub's record, verify its build provenance against core's release workflow and
 * the pinned tag, then install that file.
 *
 * @param {{ repository: string, tag: string, version: string, assets: Array<{ name: string, sha256: string }>,
 *   installer: { python: string, package: string } }} release
 */
export function verificationSteps({ repository, tag, version, assets, installer }) {
  const [wheel] = attestedFiles(version);
  const recorded = assets.find((asset) => asset.name === wheel);
  if (!recorded) throw new Error(`the pinned release records no ${wheel}`);
  return {
    file: wheel,
    sha256: recorded.sha256,
    download: `curl -fsSLO ${assetUrl(repository, tag, wheel)}`,
    checksumMac: `shasum -a 256 ${wheel}`,
    checksumLinux: `sha256sum ${wheel}`,
    attestation:
      `gh attestation verify ${wheel} --repo ${repository}` +
      ` --signer-workflow ${repository}/${RELEASE_WORKFLOW}` +
      ` --source-ref refs/tags/${tag} --deny-self-hosted-runners`,
    install: installCommand(wheel, installer)
  };
}

/** What the line under the steps must say: what the check covers, and what it leaves to PyPI. */
export const DEPENDENCY_LIMIT = /PersonalClaw's own wheel\b.*\bdependencies\b.*\bPyPI\b/s;

/** A release asset's download URL. */
export function assetUrl(repository, tag, name) {
  return `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`;
}

/**
 * What is wrong with the /release page the build wrote, against the assets the manifest records:
 * each verify step offers exactly the commands built from the pin (the pinned wheel, its recorded
 * SHA-256, the attestation bound to the release workflow and the tag, the install of that file),
 * the line on what the check leaves to PyPI is there, and the asset table lists every recorded
 * asset once, with its recorded SHA-256 and its download link. `$` is the page, loaded.
 *
 * @param {import("cheerio").CheerioAPI} $
 * @param {{ repository: string, tag: string, version: string, assets: Array<{ name: string, size: number, sha256: string }>,
 *   installer: { python: string, package: string } }} release
 * @returns {string[]}
 */
export function releasePageProblems($, release) {
  const problems = [];
  if ($("[data-release-verify]").length !== 1) {
    return ["/release: expected one verify section for the pinned release"];
  }
  const steps = verificationSteps(release);
  // The copy blocks of a step, as a reader copies them: the prompt off, whitespace as one space.
  // Equal, not "includes": a command with a flag appended or swapped is a different check.
  const offered = (step) =>
    $(`[data-verify-step="${step}"] .command-block code`)
      .map((_, code) => $(code).text().replace(/\s+/g, " ").trim().replace(/^\$ /, ""))
      .get();
  for (const [step, commands] of [
    ["download", [steps.download]],
    ["checksum", [steps.checksumMac, steps.checksumLinux]],
    ["attestation", [steps.attestation]],
    ["install", [steps.install]]
  ]) {
    const shown = offered(step);
    if (shown.length === 0) {
      problems.push(`/release: the ${step} step offers nothing, expected \`${commands.join("`, `")}\``);
    } else if (shown.join("\n") !== commands.join("\n")) {
      problems.push(`/release: the ${step} step offers \`${shown.join("`, `")}\`, expected \`${commands.join("`, `")}\``);
    }
  }
  if (!DEPENDENCY_LIMIT.test($('[data-verify-limit="dependencies"]').text())) {
    problems.push("/release: no line saying the check covers PersonalClaw's own wheel and not the dependencies PyPI resolves");
  }
  const shown = $("[data-verify-sha256]").text().trim();
  if (shown !== steps.sha256) {
    problems.push(`/release: the checksum step expects ${shown || "nothing"}, the release records ${steps.sha256}`);
  }

  const rows = $("[data-release-asset]").toArray();
  const listed = rows.map((row) => $(row).attr("data-release-asset"));
  for (const asset of release.assets) {
    const matches = listed.filter((name) => name === asset.name).length;
    if (matches !== 1) {
      problems.push(`/release lists ${asset.name} ${matches} times, expected once`);
      continue;
    }
    const row = $(`[data-release-asset="${asset.name}"]`);
    const sha = row.find("[data-asset-sha256]").text().trim();
    if (sha !== asset.sha256) {
      problems.push(`/release shows ${asset.name}'s SHA-256 as ${sha || "nothing"}, the release records ${asset.sha256}`);
    }
    const href = row.find("a").first().attr("href");
    if (href !== assetUrl(release.repository, release.tag, asset.name)) {
      problems.push(`/release links ${asset.name} to ${href ?? "nothing"}, not the pinned release's asset`);
    }
  }
  for (const name of listed) {
    if (!release.assets.some((asset) => asset.name === name)) {
      problems.push(`/release lists ${name}, which the pinned release does not record`);
    }
  }
  if (!release.assets.some((asset) => isSbom(asset.name))) {
    problems.push("/release: the pinned release records no SBOM");
  }
  return problems;
}
