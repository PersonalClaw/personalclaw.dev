// The Python the served one-liner installs PersonalClaw on, read from the installer itself.
//
// public/install is what /install serves, a byte-for-byte mirror of core's
// deploy/website/install.sh (core's install-smoke job fails when the served bytes differ from
// it). The home page says which Python the installer uses, so that sentence is derived from the
// file it describes instead of being typed beside it: re-applying the mirror carries a new
// version onto the page in the same change. A mirror that names no PC_PYTHON fails the build
// rather than letting the page print a version nobody checked.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const installerPath = path.join(process.cwd(), "public", "install");

/**
 * The `X.Y` the installer hands `uv tool install --python`.
 *
 * @returns {string}
 */
export function installerPython() {
  return installerPythonOf(readFileSync(installerPath, "utf8"));
}

/**
 * The `X.Y` an installer's text hands `uv tool install --python`.
 *
 * @param {string} text
 * @returns {string}
 */
export function installerPythonOf(text) {
  const match = /^PC_PYTHON="(\d+\.\d+)"$/m.exec(text);
  if (!match) {
    throw new Error(
      'public/install names no PC_PYTHON="X.Y", so the home page cannot say which Python the ' +
        "installer uses. Re-apply core's deploy/website/install.sh to public/install."
    );
  }
  return match[1];
}

/**
 * The requirement an installer's text hands `uv tool install`: the package name, with any extras
 * (`personalclaw`, or `personalclaw[x]`). /release installs the checked wheel with the same.
 *
 * @param {string} text
 * @returns {string}
 */
export function installerPackageOf(text) {
  const match = /^PC_PACKAGE="([^"\s]+)"$/m.exec(text);
  if (!match) {
    throw new Error(
      'public/install names no PC_PACKAGE="…", so /release cannot install the checked wheel the ' +
        "way the installer does. Re-apply core's deploy/website/install.sh to public/install."
    );
  }
  return match[1];
}

/** The requirement the served installer hands `uv tool install` (installerPackageOf). */
export function installerPackage() {
  return installerPackageOf(readFileSync(installerPath, "utf8"));
}

/**
 * The installer's exact text, as /install serves it. Home's install panel shows it in full before
 * the run step, so what a reader reads is what `sh install` runs; scripts/validate-build.mjs holds
 * the built page to the built /install.
 *
 * @returns {string}
 */
export function installerScript() {
  return readFileSync(installerPath, "utf8");
}

/**
 * The SHA-256 of the served installer, lowercase hex: what `shasum -a 256 install` prints for the
 * downloaded file.
 *
 * @returns {string}
 */
export function installerSha256() {
  return createHash("sha256").update(readFileSync(installerPath)).digest("hex");
}
