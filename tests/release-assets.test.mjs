// /release's evidence (#93): the pinned release's assets as GitHub records them, the checks that
// hold the manifest's record to the live release, and the page to the record.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { load } from "cheerio";
import {
  RELEASE_WORKFLOW,
  assetUrl,
  attestedFiles,
  recordAssets,
  releaseAssetProblems,
  releasePageProblems,
  releaseWorkflowProblems,
  verificationSteps
} from "../scripts/release-assets.mjs";
import { installerPackage, installerPython } from "../src/data/installer.mjs";

const manifest = JSON.parse(readFileSync(new URL("../sources/personalclaw.sources.json", import.meta.url), "utf8"));
const core = manifest.sources.core;
const version = core.tag.slice(1);
const installer = { python: installerPython(), package: installerPackage() };
const release = { repository: core.repository, tag: core.tag, version, assets: core.releaseAssets, installer };

test("the manifest records the pinned version's wheel, sdist and an SBOM", () => {
  const names = core.releaseAssets.map((asset) => asset.name);
  for (const file of attestedFiles(version)) assert.ok(names.includes(file), `no ${file}`);
  assert.ok(names.some((name) => name.endsWith(".spdx.json")));
});

test("a GitHub release record becomes name, size and SHA-256, and an asset with no digest is refused", () => {
  const record = {
    assets: [
      { name: "b.whl", size: 2, digest: `sha256:${"b".repeat(64)}` },
      { name: "a.spdx.json", size: 1, digest: `sha256:${"a".repeat(64)}` }
    ]
  };
  assert.deepEqual(recordAssets(record), [
    { name: "a.spdx.json", size: 1, sha256: "a".repeat(64) },
    { name: "b.whl", size: 2, sha256: "b".repeat(64) }
  ]);
  assert.throws(() => recordAssets({ assets: [{ name: "c", size: 1, digest: null }] }), /no SHA-256 digest/);
});

test("a record that drifts from the live release fails parity, asset by asset", () => {
  const recorded = core.releaseAssets;
  assert.deepEqual(releaseAssetProblems(recorded, recorded), []);

  const [first, ...rest] = recorded;
  const changed = [{ ...first, sha256: "0".repeat(64) }, ...rest];
  assert.match(releaseAssetProblems(recorded, changed).join("\n"), new RegExp(`${first.name}'s SHA-256`));
  assert.match(releaseAssetProblems(recorded, rest).join("\n"), /which the release does not carry/);
  assert.match(
    releaseAssetProblems(rest, recorded).join("\n"),
    new RegExp(`the release carries ${first.name.replace(/\./g, "\\.")}`)
  );
});

test("the verify steps are built from the pin", () => {
  const steps = verificationSteps(release);
  const wheel = `personalclaw-${version}-py3-none-any.whl`;
  assert.equal(steps.file, wheel);
  assert.equal(steps.download, `curl -fsSLO ${assetUrl(core.repository, core.tag, wheel)}`);
  assert.equal(steps.sha256, core.releaseAssets.find((asset) => asset.name === wheel).sha256);
});

test("the attestation is bound to core's release workflow, the pinned tag and a GitHub-hosted runner", () => {
  const wheel = `personalclaw-${version}-py3-none-any.whl`;
  assert.equal(
    verificationSteps(release).attestation,
    `gh attestation verify ${wheel} --repo ${core.repository}` +
      ` --signer-workflow ${core.repository}/${RELEASE_WORKFLOW}` +
      ` --source-ref refs/tags/${core.tag} --deny-self-hosted-runners`
  );
  assert.equal(RELEASE_WORKFLOW, ".github/workflows/release.yml");
});

test("the install step installs the checked file, on the installer's Python and with its extras", () => {
  const wheel = `personalclaw-${version}-py3-none-any.whl`;
  assert.equal(verificationSteps(release).install, `uv tool install --python ${installer.python} ./${wheel}`);
  assert.equal(
    verificationSteps({ ...release, installer: { python: "3.12", package: "personalclaw" } }).install,
    `uv tool install --python 3.12 ./${wheel}`
  );
  // An installer that adds extras installs them from the checked file too.
  assert.equal(
    verificationSteps({ ...release, installer: { python: "3.13", package: "personalclaw[bedrock,models]" } }).install,
    `uv tool install --python 3.13 'personalclaw[bedrock,models] @ ./${wheel}'`
  );
  // An installer for some other package is not one this step can mirror.
  assert.throws(
    () => verificationSteps({ ...release, installer: { python: "3.13", package: "other-tool" } }),
    /installs other-tool/
  );
});

test("the pinned release workflow must be the one that attests build provenance", () => {
  const attests = [
    "on:",
    "  push:",
    '    tags: ["v*"]',
    "jobs:",
    "  attest:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - uses: actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4.2.2",
    "        with:",
    '          subject-path: "dist/*"'
  ].join("\n");
  assert.deepEqual(releaseWorkflowProblems(attests), []);
  assert.match(releaseWorkflowProblems(null).join("\n"), /has no \.github\/workflows\/release\.yml/);
  assert.match(
    releaseWorkflowProblems(attests.replace(/attest-build-provenance/, "upload-artifact")).join("\n"),
    /does not attest build provenance/
  );
  assert.match(
    releaseWorkflowProblems(attests.replace('tags: ["v*"]', "branches: [main]")).join("\n"),
    /does not run on v\* tags/
  );
});

/** A copy block as CopyCommand renders it: the prompt, then the command. */
const block = (command) =>
  `<div class="command-block"><code><span class="command-line"><span class="prompt">$</span> ${command}</span></code></div>`;

const DEPENDENCY_LIMIT =
  "This check covers PersonalClaw's own wheel. Its dependencies are resolved from PyPI when you install it, and nothing on this page checks them.";

/** A /release page with what validate-build reads, from `assets`; `plant` swaps in a defect. */
function releasePage(assets, { sha256 = verificationSteps(release).sha256, ...plant } = {}) {
  const steps = { ...verificationSteps(release), ...plant };
  const rows = assets
    .map(
      (asset) =>
        `<tr data-release-asset="${asset.name}"><th><a href="${assetUrl(core.repository, core.tag, asset.name)}">${asset.name}</a></th>` +
        `<td><code data-asset-sha256>${asset.sha256}</code></td></tr>`
    )
    .join("");
  const limit = plant.limit ?? DEPENDENCY_LIMIT;
  return load(
    `<section data-release-verify>` +
      `<li data-verify-step="download"><p>It saves <code>${steps.file}</code>.</p>${block(steps.download)}</li>` +
      `<li data-verify-step="checksum">${block(steps.checksumMac)}${block(steps.checksumLinux)}` +
      `<code data-verify-sha256>${sha256}</code></li>` +
      `<li data-verify-step="attestation">${block(steps.attestation)}</li>` +
      (steps.install === null ? "" : `<li data-verify-step="install">${block(steps.install)}</li>`) +
      `<table><tbody>${rows}</tbody></table>` +
      `<ul><li data-verify-limit="dependencies">${limit}</li></ul></section>`
  );
}

test("the built page passes when it shows every recorded asset and the pinned steps", () => {
  assert.deepEqual(releasePageProblems(releasePage(core.releaseAssets), release), []);
});

test("the built page fails on a wrong checksum, a missing asset or an unrecorded one", () => {
  const [first, ...rest] = core.releaseAssets;
  const wrong = [{ ...first, sha256: "0".repeat(64) }, ...rest];
  assert.match(releasePageProblems(releasePage(wrong), release).join("\n"), /SHA-256 as 0{64}/);
  assert.match(releasePageProblems(releasePage(rest), release).join("\n"), new RegExp(`lists ${first.name.replace(/\./g, "\\.")} 0 times`));
  const extra = [...core.releaseAssets, { name: "extra.bin", size: 1, sha256: "e".repeat(64) }];
  assert.match(releasePageProblems(releasePage(extra), release).join("\n"), /lists extra\.bin, which the pinned release does not record/);
  assert.match(
    releasePageProblems(releasePage(core.releaseAssets, { sha256: "1".repeat(64) }), release).join("\n"),
    /checksum step expects 1{64}/
  );
});

test("the built page fails on an attestation command that is not bound to the release workflow and the tag", () => {
  const wheel = `personalclaw-${version}-py3-none-any.whl`;
  const problems = (attestation) => releasePageProblems(releasePage(core.releaseAssets, { attestation }), release).join("\n");
  // Today's bare command, which any workflow in the repository could satisfy.
  assert.match(problems(`gh attestation verify ${wheel} --repo ${core.repository}`), /the attestation step offers/);
  // A planted branch ref, a planted other workflow, and self-hosted runners allowed again.
  const bound = verificationSteps(release).attestation;
  assert.match(problems(bound.replace(`refs/tags/${core.tag}`, "refs/heads/main")), /refs\/heads\/main/);
  assert.match(problems(bound.replace("release.yml", "ci.yml")), /ci\.yml/);
  assert.match(problems(bound.replace(" --deny-self-hosted-runners", "")), /the attestation step offers/);
  // The right command with a flag appended that loosens it is still a different command.
  assert.match(problems(`${bound} --signer-workflow ${core.repository}/.github/workflows/ci.yml`), /the attestation step offers/);
});

test("the built page fails without the install step, or with one that installs anything but the checked file", () => {
  const wheel = `personalclaw-${version}-py3-none-any.whl`;
  const problems = (install) => releasePageProblems(releasePage(core.releaseAssets, { install }), release).join("\n");
  assert.match(problems(null), /the install step offers nothing, expected `uv tool install/);
  // From PyPI instead of the file just checked.
  assert.match(problems(`uv tool install --python ${installer.python} personalclaw`), /the install step offers `uv tool install --python [\d.]+ personalclaw`/);
  // Without the installer's Python, and the wheel of another version.
  assert.match(problems(`uv tool install ./${wheel}`), /the install step offers/);
  assert.match(problems(`uv tool install --python ${installer.python} ./personalclaw-0.0.1-py3-none-any.whl`), /0\.0\.1/);
});

test("the built page fails without the line that says the dependencies are not checked", () => {
  assert.match(
    releasePageProblems(releasePage(core.releaseAssets, { limit: "" }), release).join("\n"),
    /no line saying the check covers PersonalClaw's own wheel and not the dependencies PyPI resolves/
  );
  assert.match(
    releasePageProblems(releasePage(core.releaseAssets, { limit: "Every package is checked." }), release).join("\n"),
    /no line saying/
  );
});

test("a page with no verify section fails", () => {
  assert.deepEqual(releasePageProblems(load("<main></main>"), release), [
    "/release: expected one verify section for the pinned release"
  ]);
});
