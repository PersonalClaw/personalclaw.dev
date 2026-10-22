import assert from "node:assert/strict";
import { test } from "node:test";
import { runsDownloadUnseen } from "../scripts/install-commands.mjs";

// The rule scripts/validate-build.mjs holds every built page to: no copyable command runs a download
// unseen. One planted case per form, and the site's own two steps, which must pass.
const URL = "https://personalclaw.dev/install";

const unseen = {
  "a pipe into a shell": [
    `curl -fsSL ${URL} | sh`,
    `curl -fsSL ${URL} | bash`,
    `wget -qO- ${URL} | sudo -E bash -s -- --yes`,
    `curl -fsSL ${URL} | zsh`,
    `curl -fsSL ${URL} | env FOO=1 sh`,
    `curl -fsSL https://example.test/get.py | python3`
  ],
  "process substitution": [
    `sh <(curl -fsSL ${URL})`,
    `bash <(wget -qO- ${URL})`,
    `source <(curl -fsSL ${URL})`,
    `. <(curl -fsSL ${URL})`
  ],
  "command substitution": [
    `bash -c "$(curl -fsSL ${URL})"`,
    `sh -c "$(wget -qO- ${URL})"`,
    `eval "$(curl -fsSL ${URL})"`,
    "bash -c \"`curl -fsSL " + URL + "`\""
  ],
  "a download chained to a run": [
    `curl -fsSLO ${URL} && sh install`,
    `wget ${URL}; bash install`
  ]
};

for (const [form, commands] of Object.entries(unseen)) {
  for (const command of commands) {
    test(`flags ${form}: ${command}`, () => {
      assert.equal(runsDownloadUnseen(command), form);
    });
  }
}

test("passes the site's own steps and the commands around them", () => {
  for (const command of [
    `curl -fsSLO ${URL}`,
    "sh install",
    'echo "5412d85e1d997122eb4203fdc7a7d7864b44fe00c803b21a51267fc98e06febd  install" | shasum -a 256 -c',
    "sha256sum -c install.sha256",
    `wget -qO install ${URL}`,
    `curl -fsSL ${URL} | tee install`,
    `curl -fsSL ${URL} -o install`,
    "personalclaw snapshot"
  ]) {
    assert.equal(runsDownloadUnseen(command), null, command);
  }
});

test("reads a multi-line block line by line", () => {
  assert.equal(runsDownloadUnseen(`curl -fsSLO ${URL}\nsh install`), null);
  assert.equal(runsDownloadUnseen(`cd /tmp\ncurl -fsSL ${URL} | sh`), "a pipe into a shell");
});
