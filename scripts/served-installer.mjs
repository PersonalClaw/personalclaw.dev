// The installer this site serves at /install, and the checks that bind it to core.
//
// Core owns the installer (`deploy/website/install.sh`); this site publishes it as
// `public/install`. Three things have to hold, and each is checked where it can be:
//
//   OFFLINE (validate-release-parity, every run)
//     `public/install` is the file `npm run sync:sources` wrote from the pinned core
//     commit: its sha256 equals `core.installSha256`, and `core.installCommit` equals
//     `core.commit`. A hand-edited byte fails the first; a pin bump without a sync
//     fails the second. Neither needs a network.
//
//   STRICT (validate-release-parity, remote layer)
//     `public/install` equals the pinned commit's `deploy/website/install.sh`, read
//     from the pinned tree itself rather than from the digest the sync recorded.
//
//   SERVED (check-served-installer, the scheduled Release follow run)
//     The bytes served at /install are the newest core release's installer, equal to
//     `public/install` on the default branch, and agree with the release's checksums.
//     A run that cannot look says so: the result is unproven while the last proven run
//     is inside the freshness window, and stale once it is not. A passing old installer
//     never satisfies a newer release, because the newest release is what the served
//     bytes are compared with.
//
// Everything here is pure apart from `sha256`, so tests/served-installer.test.mjs can
// plant each failure without a network.

import { createHash } from "node:crypto";

export const INSTALLER_PATH = "deploy/website/install.sh";
export const INSTALLER_CHECKSUM_PATH = "deploy/website/install.sh.sha256";
export const INSTALLER_NAME = "install.sh";
export const PUBLISHED_INSTALLER = "public/install";
export const PUBLISHED_INSTALLER_MODE = 0o755;
export const SERVED_INSTALLER_URL = "https://personalclaw.dev/install";
export const RELEASE_CHECKSUMS = "SHA256SUMS";
export const PROOF_ARTIFACT = "served-installer-proof";
// One daily run can be late, or fail to reach a server, without the result flipping.
export const FRESHNESS_WINDOW_HOURS = 36;

// A detached signature over the release's checksum file or over the installer itself.
const SIGNATURE_ASSET = /^(?:SHA256SUMS|install\.sh)\.(?:sig|minisig|asc)$/;
const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Verifies a release signature: ({ release, signatureName }) => { ok, detail }.
 * None is configured, because core has not yet settled the release signing key or its
 * format. Until one is, a signature in a release fails closed rather than passing
 * unread; the day the key lands, the verifier is set here and the leg becomes real.
 */
export const releaseSignatureVerifier = null;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function pinnedFileUrl(repository, commit, relativePath) {
  return `https://raw.githubusercontent.com/${repository}/${commit}/${relativePath}`;
}

/** Compare two release tags. Returns >0 when `left` is newer than `right`. */
export function compareReleaseTags(left, right) {
  const a = SEMVER_TAG.exec(left);
  const b = SEMVER_TAG.exec(right);
  if (!a || !b) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff;
  }
  const leftPre = left.includes("-");
  const rightPre = right.includes("-");
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return 0;
}

/** The newest published release: not a draft, not a prerelease, a release tag. */
export function newestRelease(releases) {
  return (
    releases
      .filter((release) => !release.draft && !release.prerelease)
      .filter((release) => SEMVER_TAG.test(release.tag_name ?? ""))
      .sort((left, right) => compareReleaseTags(right.tag_name, left.tag_name))[0] ?? null
  );
}

/**
 * The digests a `sha256sum`-format file gives for `name`. Both text (`<digest>  name`)
 * and binary (`<digest> *name`) lines count; a path prefix does not change the name.
 */
export function checksumsFor(text, name) {
  const digests = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+?)\s*$/.exec(line);
    if (match && match[2].split("/").at(-1) === name) digests.push(match[1].toLowerCase());
  }
  return [...new Set(digests)];
}

/** The manifest with the installer it was synced with recorded on `core`. */
export function recordInstaller(manifest, installerBytes) {
  const core = manifest.sources.core;
  return {
    ...manifest,
    sources: {
      ...manifest.sources,
      core: { ...core, installSha256: sha256(installerBytes), installCommit: core.commit },
    },
  };
}

/** OFFLINE: `public/install` is what the sync wrote from the pinned commit. */
export function checkPublishedInstaller({ core, installBytes }) {
  const problems = [];
  const sync = "run `npm run sync:sources`, which writes it from the pinned core commit";
  if (!core?.installSha256 || !core?.installCommit) {
    problems.push(`core.installSha256 and core.installCommit must be recorded: ${sync}`);
    return problems;
  }
  if (core.installCommit !== core.commit) {
    problems.push(
      `${PUBLISHED_INSTALLER} was synced from core ${core.installCommit.slice(0, 12)}, but ` +
        `the manifest pins ${core.commit.slice(0, 12)}: the pin moved without a sync; ${sync}`,
    );
  }
  const digest = sha256(installBytes);
  if (digest !== core.installSha256) {
    problems.push(
      `sha256(${PUBLISHED_INSTALLER}) is ${digest}, but core.installSha256 records ` +
        `${core.installSha256}: the file is generated, so change the installer in core ` +
        `and ${sync}`,
    );
  }
  return problems;
}

/** STRICT: `public/install` equals the pinned commit's installer, byte for byte. */
export function checkPinnedCopy({ core, installBytes, pinnedBytes }) {
  if (Buffer.compare(Buffer.from(installBytes), Buffer.from(pinnedBytes)) === 0) return [];
  return [
    `${PUBLISHED_INSTALLER} (sha256 ${sha256(installBytes)}) differs from ` +
      `${core.repository}@${core.commit.slice(0, 12)}:${INSTALLER_PATH} ` +
      `(sha256 ${sha256(pinnedBytes)}): run \`npm run sync:sources\``,
  ];
}

const unproven = (name, detail) => ({ name, status: "unproven", detail });
const passed = (name, detail) => ({ name, status: "pass", detail });
const failed = (name, detail) => ({ name, status: "fail", detail });

/**
 * SERVED: bind the bytes at /install to the newest release. Every input is an outcome,
 * `{ ok: true, value }` or `{ ok: false, error }`, so a failed fetch is a reason rather
 * than an exception.
 *
 *   served       the bytes /install returned
 *   published    `public/install` on the default branch
 *   release      { tag, commit, installer, installerChecksum, assetNames, sums }:
 *                the newest release, its commit's installer and `install.sh.sha256`,
 *                its attached file names, and its SHA256SUMS text (null when absent)
 *   lastSuccess  the ISO time of the newest proven run, or null when there is none
 *
 * The verdict is `fail` when any leg fails, `pass` when the bytes are proven against
 * the default branch, the release and its checksum, and otherwise `unproven` inside the
 * freshness window and `stale` outside it. A leg that is unproven by nature (no
 * signature published yet) is reported and does not stop a pass.
 */
export function assessServedInstaller({
  served,
  published,
  release,
  lastSuccess,
  now,
  windowHours = FRESHNESS_WINDOW_HOURS,
  verifySignature = releaseSignatureVerifier,
  url = SERVED_INSTALLER_URL,
}) {
  const legs = [];
  const servedDigest = served.ok ? sha256(served.value) : null;
  const releaseLabel = release.ok ? `core ${release.value.tag}` : "the newest core release";

  if (!served.ok) {
    legs.push(unproven("served", `could not fetch ${url}: ${served.error}`));
  } else {
    legs.push(passed("served", `${url} returned ${served.value.length} bytes, sha256 ${servedDigest}`));
  }

  // 1. The default branch: what this site would deploy.
  if (!served.ok || !published.ok) {
    legs.push(
      unproven(
        "default branch",
        published.ok ? "nothing served to compare" : `could not read ${PUBLISHED_INSTALLER}: ${published.error}`,
      ),
    );
  } else if (sha256(published.value) === servedDigest) {
    legs.push(passed("default branch", `served bytes equal ${PUBLISHED_INSTALLER}`));
  } else {
    legs.push(
      failed(
        "default branch",
        `drift: served sha256 ${servedDigest} differs from ${PUBLISHED_INSTALLER} ` +
          `sha256 ${sha256(published.value)}; the deployment is not the committed file`,
      ),
    );
  }

  // 2. The release: the newest one, so an older release's installer cannot pass.
  if (!release.ok) {
    legs.push(unproven("release", `could not read the newest core release: ${release.error}`));
  } else if (!served.ok) {
    legs.push(unproven("release", "nothing served to compare"));
  } else {
    const releaseDigest = sha256(release.value.installer);
    if (releaseDigest === servedDigest) {
      legs.push(passed("release", `served bytes equal ${releaseLabel}'s ${INSTALLER_PATH}`));
    } else {
      legs.push(
        failed(
          "release",
          `served sha256 ${servedDigest} is not ${releaseLabel}'s ${INSTALLER_PATH} ` +
            `(sha256 ${releaseDigest}): the site serves another release's installer, so ` +
            `re-pin to ${release.value.tag} and sync`,
        ),
      );
    }
  }

  // 3. The checksum core publishes beside the installer at the release commit.
  if (!release.ok) {
    legs.push(unproven("checksum", "the newest core release could not be read"));
  } else {
    const releaseDigest = sha256(release.value.installer);
    const named = checksumsFor(release.value.installerChecksum, INSTALLER_NAME);
    if (named.length !== 1) {
      legs.push(
        failed(
          "checksum",
          `${INSTALLER_CHECKSUM_PATH} at ${release.value.tag} must name ${INSTALLER_NAME} ` +
            `exactly once; it names it ${named.length} times`,
        ),
      );
    } else if (named[0] !== releaseDigest) {
      legs.push(
        failed(
          "checksum",
          `checksum mismatch: ${INSTALLER_CHECKSUM_PATH} at ${release.value.tag} gives ` +
            `${named[0]}, but the release's installer hashes to ${releaseDigest}`,
        ),
      );
    } else if (served.ok && named[0] !== servedDigest) {
      legs.push(
        failed(
          "checksum",
          `checksum mismatch: served sha256 ${servedDigest} is not the ${named[0]} ` +
            `${INSTALLER_CHECKSUM_PATH} gives at ${release.value.tag}`,
        ),
      );
    } else if (!served.ok) {
      legs.push(unproven("checksum", "nothing served to compare"));
    } else {
      legs.push(passed("checksum", `served bytes match ${INSTALLER_CHECKSUM_PATH} at ${release.value.tag}`));
    }
  }

  // 4. The release's own checksum file, when core attaches one: a hard check of the
  //    served bytes against its installer line. It needs no key.
  if (!release.ok) {
    legs.push(unproven("release checksums", "the newest core release could not be read"));
  } else if (release.value.sums == null) {
    legs.push(
      unproven("release checksums", `core attaches no ${RELEASE_CHECKSUMS} to ${release.value.tag} yet`),
    );
  } else {
    const named = checksumsFor(release.value.sums, INSTALLER_NAME);
    if (named.length === 0) {
      legs.push(
        unproven(
          "release checksums",
          `${RELEASE_CHECKSUMS} for ${release.value.tag} names no ${INSTALLER_NAME}: core does not attach the installer to the release yet`,
        ),
      );
    } else if (named.length > 1) {
      legs.push(
        failed("release checksums", `${RELEASE_CHECKSUMS} for ${release.value.tag} gives ${INSTALLER_NAME} ${named.length} different digests`),
      );
    } else if (!served.ok) {
      legs.push(unproven("release checksums", "nothing served to compare"));
    } else if (named[0] !== servedDigest) {
      legs.push(
        failed(
          "release checksums",
          `checksum mismatch: ${RELEASE_CHECKSUMS} for ${release.value.tag} gives ` +
            `${named[0]} for ${INSTALLER_NAME}, but the served bytes hash to ${servedDigest}`,
        ),
      );
    } else {
      legs.push(passed("release checksums", `served bytes match ${RELEASE_CHECKSUMS} for ${release.value.tag}`));
    }
  }

  // 5. The signature. Absent today, so unproven; present without a verifier, so failed
  //    closed: an unread signature must never read as a verified one.
  if (!release.ok) {
    legs.push(unproven("signature", "the newest core release could not be read"));
  } else {
    const signatureName = release.value.assetNames.find((name) => SIGNATURE_ASSET.test(name));
    if (!signatureName) {
      legs.push(unproven("signature", "core publishes no signature for this release yet"));
    } else if (typeof verifySignature !== "function") {
      legs.push(
        failed(
          "signature",
          `${release.value.tag} carries ${signatureName}: a signature exists but no release ` +
            `key and verifier are configured here`,
        ),
      );
    } else {
      const result = verifySignature({ release: release.value, signatureName });
      legs.push(
        result?.ok
          ? passed("signature", result.detail ?? `${signatureName} verifies`)
          : failed("signature", result?.detail ?? `${signatureName} does not verify`),
      );
    }
  }

  const checkedAt = now.toISOString();
  const base = {
    checkedAt,
    windowHours,
    servedSha256: servedDigest,
    release: release.ok ? { tag: release.value.tag, commit: release.value.commit } : null,
  };

  if (legs.some((leg) => leg.status === "fail")) return { verdict: "fail", legs, ...base };

  const bound = ["default branch", "release", "checksum"].every(
    (name) => legs.find((leg) => leg.name === name)?.status === "pass",
  );
  if (bound) return { verdict: "pass", legs, ...base };

  // Not proven this run: the last proven run decides.
  let freshness;
  let verdict;
  if (!lastSuccess.ok) {
    verdict = "stale";
    freshness = failed("freshness", `could not read when the check last passed: ${lastSuccess.error}`);
  } else if (!lastSuccess.value) {
    verdict = "stale";
    freshness = failed("freshness", `no proven run within the last ${windowHours} hours`);
  } else {
    const ageHours = (now.getTime() - Date.parse(lastSuccess.value)) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours <= windowHours) {
      verdict = "unproven";
      freshness = unproven(
        "freshness",
        `last proven ${lastSuccess.value} (${ageHours.toFixed(1)}h ago), inside the ${windowHours}h window`,
      );
    } else {
      verdict = "stale";
      freshness = failed(
        "freshness",
        `last proven ${lastSuccess.value} (${Number.isFinite(ageHours) ? `${ageHours.toFixed(1)}h ago` : "unreadable time"}), older than the ${windowHours}h window`,
      );
    }
  }
  return { verdict, legs: [...legs, freshness], lastSuccessAt: lastSuccess.ok ? lastSuccess.value : null, ...base };
}

export function renderAssessment(result) {
  const width = Math.max(...result.legs.map((leg) => leg.name.length));
  return [
    `Served installer: ${result.verdict.toUpperCase()} (checked ${result.checkedAt})`,
    ...result.legs.map((leg) => `  ${leg.name.padEnd(width)}  ${leg.status.padEnd(8)}  ${leg.detail}`),
  ].join("\n");
}
