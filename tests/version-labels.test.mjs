// A hero carries no version label (DESIGN.md's hard rules, #91). Each shape is planted here.

import assert from "node:assert/strict";
import test from "node:test";

import { versionLabels } from "../scripts/version-labels.mjs";

test("a hero with counts and no version has no version label", () => {
  assert.deepEqual(versionLabels("It lists the 69 first-party apps in 14 categories.", ["v0.2.2", "v0.2.6"]), []);
});

test("a tag, a bare version, a prerelease and a pin this build names are each a version label", () => {
  assert.deepEqual(versionLabels("It lists the 69 first-party apps of PersonalClaw/PersonalClawApps v0.2.2."), ['"v0.2.2"']);
  assert.deepEqual(versionLabels("Built for 0.2.6."), ['"0.2.6"']);
  assert.deepEqual(versionLabels("Try v1.0.0-rc.1 now."), ['"v1.0.0-rc.1"']);
  assert.deepEqual(versionLabels("Pinned at 467cda1.", ["467cda1"]), ['"467cda1"'], "a commit pin is a version label too");
});
