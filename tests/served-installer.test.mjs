// The installer this site serves: the offline and strict checks that hold
// `public/install` to the pinned core commit, and the served check that binds the bytes
// at /install to the newest core release, its checksums and a freshness window.
//
// Every failure is planted against fixture bytes, so none of this needs a network. The
// offline layer is also run end to end, through validate-release-parity, on a copy of
// the repository's own manifest and installer.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FRESHNESS_WINDOW_HOURS,
  assessServedInstaller,
  checkPinnedCopy,
  checkPublishedInstaller,
  checksumsFor,
  newestRelease,
  recordInstaller,
  sha256,
} from "../scripts/served-installer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIN = "a".repeat(40);
const NEXT_PIN = "b".repeat(40);
const OLD_INSTALLER = Buffer.from("#!/bin/sh\necho 'installer from v9.8.0'\n");
const NEW_INSTALLER = Buffer.from("#!/bin/sh\necho 'installer from v9.9.0'\n");
const NOW = new Date("2026-01-02T12:00:00Z");
const hoursBefore = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const ok = (value) => ({ ok: true, value });
const unreachable = (error = "getaddrinfo ENOTFOUND www.example.com") => ({ ok: false, error });
const checksumFile = (bytes, name = "install.sh") => `${sha256(bytes)}  ${name}\n`;

function release(overrides = {}) {
  return {
    tag: "v9.9.0",
    commit: NEXT_PIN,
    installer: NEW_INSTALLER,
    installerChecksum: checksumFile(NEW_INSTALLER),
    assetNames: ["example-9.9.0.tar.gz"],
    sums: null,
    ...overrides,
  };
}

function assess(overrides = {}) {
  return assessServedInstaller({
    served: ok(NEW_INSTALLER),
    published: ok(NEW_INSTALLER),
    release: ok(release()),
    lastSuccess: ok(null),
    now: NOW,
    url: "https://www.example.com/install",
    ...overrides,
  });
}

const leg = (result, name) => result.legs.find((each) => each.name === name);

function core(overrides = {}) {
  return {
    repository: "PersonalClaw/PersonalClaw",
    commit: PIN,
    tag: "v9.9.0",
    installSha256: sha256(NEW_INSTALLER),
    installCommit: PIN,
    ...overrides,
  };
}

// ── offline: public/install is the synced copy of the pinned installer ───────

test("a synced installer passes the offline check", () => {
  assert.deepEqual(checkPublishedInstaller({ core: core(), installBytes: NEW_INSTALLER }), []);
});

test("a hand-edited byte in public/install fails the offline check", () => {
  const edited = Buffer.from(NEW_INSTALLER);
  edited[edited.length - 2] ^= 0x01;
  const problems = checkPublishedInstaller({ core: core(), installBytes: edited });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sha256\(public\/install\) is [0-9a-f]{64}, but core\.installSha256/);
});

test("a pin bump without a sync fails the offline check", () => {
  const problems = checkPublishedInstaller({
    core: core({ commit: NEXT_PIN }),
    installBytes: NEW_INSTALLER,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /the pin moved without a sync/);
});

test("a manifest with nothing recorded fails the offline check rather than passing it", () => {
  const problems = checkPublishedInstaller({
    core: core({ installSha256: undefined, installCommit: undefined }),
    installBytes: NEW_INSTALLER,
  });
  assert.match(problems.join("\n"), /must be recorded/);
});

test("the sync records the installer's digest and the commit it read", () => {
  const manifest = { sources: { core: core({ commit: NEXT_PIN }), apps: { tag: "v9.9.0" } } };
  const recorded = recordInstaller(manifest, OLD_INSTALLER);
  assert.equal(recorded.sources.core.installSha256, sha256(OLD_INSTALLER));
  assert.equal(recorded.sources.core.installCommit, NEXT_PIN);
  assert.deepEqual(recorded.sources.apps, manifest.sources.apps);
  assert.deepEqual(
    checkPublishedInstaller({ core: recorded.sources.core, installBytes: OLD_INSTALLER }),
    [],
  );
});

test("the strict check compares public/install with the pinned commit's bytes", () => {
  assert.deepEqual(
    checkPinnedCopy({ core: core(), installBytes: NEW_INSTALLER, pinnedBytes: NEW_INSTALLER }),
    [],
  );
  const problems = checkPinnedCopy({
    core: core(),
    installBytes: NEW_INSTALLER,
    pinnedBytes: OLD_INSTALLER,
  });
  assert.match(problems.join("\n"), /differs from PersonalClaw\/PersonalClaw@aaaaaaaaaaaa:deploy\/website\/install\.sh/);
});

// ── offline, end to end through validate-release-parity ──────────────────────

function parityRun(plant) {
  const scratch = path.join(root, ".generated");
  mkdirSync(scratch, { recursive: true });
  const copy = mkdtempSync(path.join(scratch, "served-installer-test-"));
  try {
    for (const directory of ["scripts", "sources", "public"]) {
      mkdirSync(path.join(copy, directory));
    }
    for (const file of [
      "scripts/validate-release-parity.mjs",
      "scripts/served-installer.mjs",
      "scripts/github-api.mjs",
      "scripts/release-assets.mjs",
      "sources/personalclaw.sources.json",
      "sources/personalclaw.sources.schema.json",
      "package.json",
      "public/install",
    ]) {
      copyFileSync(path.join(root, file), path.join(copy, file));
    }
    symlinkSync(path.join(root, "node_modules"), path.join(copy, "node_modules"), "dir");

    const manifestPath = path.join(copy, "sources", "personalclaw.sources.json");
    const installPath = path.join(copy, "public", "install");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const result = plant({ manifest, install: readFileSync(installPath) });
    writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`);
    writeFileSync(installPath, result.install);

    return spawnSync(process.execPath, [path.join(copy, "scripts", "validate-release-parity.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_PARITY_OFFLINE: "1",
        PERSONALCLAW_CORE_DIR: path.join(copy, "no-core-checkout"),
      },
    });
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

test("validate-release-parity passes the committed installer and manifest", () => {
  const run = parityRun((tree) => tree);
  assert.equal(run.status, 0, run.stderr);
});

test("validate-release-parity fails a hand-edited byte in public/install", () => {
  const run = parityRun(({ manifest, install }) => {
    const edited = Buffer.from(install);
    edited[0] ^= 0x01;
    return { manifest, install: edited };
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /sha256\(public\/install\)/);
});

test("validate-release-parity fails a pin bump without a sync", () => {
  const run = parityRun(({ manifest, install }) => {
    manifest.sources.core.commit = NEXT_PIN;
    return { manifest, install };
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the pin moved without a sync/);
});

test("validate-release-parity passes a pin bump followed by a sync", () => {
  const run = parityRun(({ manifest }) => {
    manifest.sources.core.commit = NEXT_PIN;
    return { manifest: recordInstaller(manifest, OLD_INSTALLER), install: OLD_INSTALLER };
  });
  assert.equal(run.status, 0, run.stderr);
});

// ── served: the bytes at /install, bound to the newest release ───────────────

test("the current release's installer, served and committed, passes", () => {
  const result = assess();
  assert.equal(result.verdict, "pass", JSON.stringify(result.legs, null, 2));
  assert.equal(result.release.tag, "v9.9.0");
});

test("an older release's installer fails once a newer release exists, though it matches its own checksum", () => {
  const result = assess({
    served: ok(OLD_INSTALLER),
    published: ok(OLD_INSTALLER),
  });
  assert.equal(result.verdict, "fail");
  assert.equal(leg(result, "default branch").status, "pass");
  assert.equal(leg(result, "release").status, "fail");
  assert.match(leg(result, "release").detail, /another release's installer, so re-pin to v9\.9\.0/);
});

test("served bytes that drift from public/install fail", () => {
  const result = assess({ published: ok(OLD_INSTALLER) });
  assert.equal(result.verdict, "fail");
  assert.match(leg(result, "default branch").detail, /^drift:/);
});

test("a checksum that does not match the release's installer fails", () => {
  const result = assess({
    release: ok(release({ installerChecksum: checksumFile(OLD_INSTALLER) })),
  });
  assert.equal(result.verdict, "fail");
  assert.match(leg(result, "checksum").detail, /^checksum mismatch/);
});

test("a checksum file that does not name the installer fails", () => {
  const result = assess({
    release: ok(release({ installerChecksum: checksumFile(NEW_INSTALLER, "other.sh") })),
  });
  assert.equal(result.verdict, "fail");
  assert.match(leg(result, "checksum").detail, /must name install\.sh exactly once/);
});

test("a release SHA256SUMS line is a hard check of the served bytes when it exists", () => {
  const matching = assess({
    release: ok(release({ assetNames: ["SHA256SUMS"], sums: checksumFile(NEW_INSTALLER) })),
  });
  assert.equal(leg(matching, "release checksums").status, "pass");
  assert.equal(matching.verdict, "pass");

  const mismatched = assess({
    release: ok(release({ assetNames: ["SHA256SUMS"], sums: checksumFile(OLD_INSTALLER) })),
  });
  assert.equal(mismatched.verdict, "fail");
  assert.match(leg(mismatched, "release checksums").detail, /^checksum mismatch/);
});

test("no SHA256SUMS, and one that does not list the installer, leave that leg unproven", () => {
  assert.equal(leg(assess(), "release checksums").status, "unproven");
  const unlisted = assess({
    release: ok(release({ assetNames: ["SHA256SUMS"], sums: checksumFile(OLD_INSTALLER, "example.tar.gz") })),
  });
  assert.equal(leg(unlisted, "release checksums").status, "unproven");
  assert.equal(unlisted.verdict, "pass");
});

test("no signature is reported unproven, never as a pass, and does not fail the run", () => {
  const result = assess();
  assert.equal(leg(result, "signature").status, "unproven");
  assert.equal(leg(result, "signature").detail, "core publishes no signature for this release yet");
  assert.equal(result.verdict, "pass");
});

test("a signature with no release key and verifier configured fails closed", () => {
  const result = assess({
    release: ok(release({ assetNames: ["SHA256SUMS", "SHA256SUMS.sig"], sums: checksumFile(NEW_INSTALLER) })),
  });
  assert.equal(result.verdict, "fail");
  assert.match(
    leg(result, "signature").detail,
    /a signature exists but no release key and verifier are configured here/,
  );
});

test("the verifier seam decides the signature leg once one is supplied", () => {
  const withSignature = release({ assetNames: ["SHA256SUMS", "SHA256SUMS.sig"], sums: checksumFile(NEW_INSTALLER) });
  const verified = assess({
    release: ok(withSignature),
    verifySignature: ({ signatureName }) => ({ ok: true, detail: `${signatureName} verifies` }),
  });
  assert.equal(leg(verified, "signature").status, "pass");
  assert.equal(verified.verdict, "pass");

  const refused = assess({
    release: ok(withSignature),
    verifySignature: () => ({ ok: false, detail: "bad signature" }),
  });
  assert.equal(refused.verdict, "fail");
  assert.equal(leg(refused, "signature").detail, "bad signature");
});

test("a fetch failure inside the window is unproven, not a pass", () => {
  const result = assess({
    served: unreachable(),
    lastSuccess: ok(hoursBefore(FRESHNESS_WINDOW_HOURS - 1)),
  });
  assert.equal(result.verdict, "unproven");
  assert.equal(leg(result, "served").status, "unproven");
  assert.match(leg(result, "freshness").detail, /inside the 36h window/);
});

test("a last success older than the window is stale", () => {
  const result = assess({
    served: unreachable(),
    lastSuccess: ok(hoursBefore(FRESHNESS_WINDOW_HOURS + 1)),
  });
  assert.equal(result.verdict, "stale");
  assert.match(leg(result, "freshness").detail, /older than the 36h window/);
});

test("no proven run at all, or an unreadable record of one, is stale", () => {
  assert.equal(assess({ served: unreachable(), lastSuccess: ok(null) }).verdict, "stale");
  assert.equal(
    assess({ release: unreachable("GitHub request failed (403)"), lastSuccess: unreachable("403") }).verdict,
    "stale",
  );
});

test("an unreachable release cannot pass, even when the served bytes equal public/install", () => {
  const result = assess({
    release: unreachable("GitHub request failed (403)"),
    lastSuccess: ok(hoursBefore(1)),
  });
  assert.equal(result.verdict, "unproven");
  assert.equal(leg(result, "release").status, "unproven");
});

test("a failure outranks freshness: a recent success does not hide drift", () => {
  const result = assess({ published: ok(OLD_INSTALLER), lastSuccess: ok(hoursBefore(1)) });
  assert.equal(result.verdict, "fail");
});

test("the newest release skips drafts and prereleases", () => {
  const newest = newestRelease([
    { tag_name: "v9.8.0", draft: false, prerelease: false },
    { tag_name: "v10.0.0", draft: true, prerelease: false },
    { tag_name: "v9.10.0-rc1", draft: false, prerelease: true },
    { tag_name: "v9.10.0", draft: false, prerelease: false },
    { tag_name: "nightly", draft: false, prerelease: false },
  ]);
  assert.equal(newest.tag_name, "v9.10.0");
});

test("checksum lines are read in both text and binary form, by file name", () => {
  const digest = sha256(NEW_INSTALLER);
  assert.deepEqual(checksumsFor(`${digest}  install.sh\n`, "install.sh"), [digest]);
  assert.deepEqual(checksumsFor(`${digest.toUpperCase()} *deploy/website/install.sh\r\n`, "install.sh"), [digest]);
  assert.deepEqual(checksumsFor(`${digest}  install.sh.sha256\n`, "install.sh"), []);
});
