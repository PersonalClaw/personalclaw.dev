// The Python the served one-liner installs PersonalClaw on, read from the installer itself.
//
// public/install is what /install serves, a byte-for-byte mirror of core's
// deploy/website/install.sh (core's install-smoke job fails when the served bytes differ from
// it). The home page says which Python the installer uses, so that sentence is derived from the
// file it describes instead of being typed beside it: re-applying the mirror carries a new
// version onto the page in the same change. A mirror that names no PC_PYTHON fails the build
// rather than letting the page print a version nobody checked.

import { readFileSync } from "node:fs";
import path from "node:path";

const installerPath = path.join(process.cwd(), "public", "install");

/**
 * The `X.Y` the installer hands `uv tool install --python`.
 *
 * @returns {string}
 */
export function installerPython() {
  const match = /^PC_PYTHON="(\d+\.\d+)"$/m.exec(readFileSync(installerPath, "utf8"));
  if (!match) {
    throw new Error(
      'public/install names no PC_PYTHON="X.Y", so the home page cannot say which Python the ' +
        "installer uses. Re-apply core's deploy/website/install.sh to public/install."
    );
  }
  return match[1];
}
