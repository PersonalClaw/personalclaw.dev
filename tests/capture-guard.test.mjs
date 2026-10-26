// The deny list every clip recorder checks the screen against (scripts/capture-guard.mjs), planted.

import assert from "node:assert/strict";
import test from "node:test";

import { denied } from "../scripts/capture-guard.mjs";

test("a host path, the account name, the provider, a key and a provider not answering each fail a take, by name", () => {
  assert.deepEqual(denied("Needs you: an approval, a loop's question"), []);
  for (const [text, what] of [
    ["REPORT.md at /Users/someone/projects", "a host path"],
    ["~/PersonalClawWork/capture-026/home", "a host path"],
    ["cd capture-027/workspace", "a host path"],
    ["rootdir: /private/var/folders/8q/abc/T/tmp.Q8YmiXPE0W/tidetable", "a host path"],
    ["cd tmp.Q8YmiXPE0W/tidetable", "a host path"],
    ["rootdir: /private/tmp/projects.q7Rt2x/tidetable", "a host path"],
    ["cd /tmp/projects.q7Rt2x/tidetable", "a host path"],
    ["signed in as golani", "the account name"],
    ["on us.anthropic.claude-sonnet", "the model provider"],
    ["Amazon Bedrock", "the model provider"],
    ["Chat provider not answering", "a chat provider not answering"],
    // Assembled here, so this file holds nothing shaped like a key.
    [`AKIA${"X".repeat(16)}`, "a key"],
    [`sk-${"x".repeat(20)}`, "a key"]
  ]) {
    assert.match(denied(text).join(), new RegExp(what), text);
  }
});
