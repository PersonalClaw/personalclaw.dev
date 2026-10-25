// The action recorder (scripts/capture-action-clip.mjs) changes the home it records: it only takes
// a scratch gateway on this machine, names everything it needs, reads its token from a file only
// its owner may read, and refuses a frame that shows a capture folder.

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CLIPS, keepTake, leaksIn, parseArgs, permissionsIn, readToken } from "../scripts/capture-action-clip.mjs";
import { denied } from "../scripts/capture-guard.mjs";

const named = ["--base", "http://127.0.0.1:10240", "--token-file", "/tmp/t", "--out", "/tmp/o"];

test("every clip takes a scratch gateway's address, its token file and where the take goes, with no default", () => {
  for (const id of CLIPS) {
    const extra = { "thread-turn": ["--chat", "c"], "approve-enter": ["--chat", "c"] }[id] ?? (id.startsWith("loop-") ? ["--loop", "l"] : []);
    assert.equal(parseArgs(["--id", id, ...named, ...extra]).id, id);
    for (const missing of ["--base", "--token-file", "--out"]) {
      const argv = ["--id", id, ...named, ...extra];
      argv.splice(argv.indexOf(missing), 2);
      assert.throws(() => parseArgs(argv), new RegExp(`${missing} is required`), `${id} without ${missing}`);
    }
  }
  assert.throws(() => parseArgs(["--id", "home-lanes", ...named]), /--id has to be one of/);
});

test("it refuses an address off this machine, and an install's own port", () => {
  const at = (base) => () => parseArgs(["--id", "app-install", "--base", base, "--token-file", "/tmp/t", "--out", "/tmp/o"]);
  assert.equal(at("http://localhost:10240/")().base, "http://localhost:10240");
  assert.throws(at("http://192.168.1.20:10240"), /a gateway on this machine/);
  assert.throws(at("https://127.0.0.1:10240"), /a gateway on this machine/);
  assert.throws(at("http://127.0.0.1:10000"), /port 10000, an install's own gateway/);
  assert.throws(at("127.0.0.1:10240"), /a gateway on this machine|not an address/);
});

test("a clip that acts on a chat or a loop is told which one", () => {
  const ask = (...argv) => () => parseArgs([...argv, ...named]);
  assert.throws(ask("--id", "thread-turn"), /--chat, or --project and --model/);
  assert.throws(ask("--id", "thread-turn", "--project", "p"), /--chat, or --project and --model/);
  assert.equal(parseArgs(["--id", "thread-turn", "--project", "p", "--model", "m", ...named]).model, "m");
  // A rehearsal makes no chat, so it needs none named; it still needs the chat holding the approval.
  assert.equal(parseArgs(["--id", "thread-turn", "--rehearse", ...named]).rehearse, true);
  assert.throws(ask("--id", "approve-enter", "--rehearse"), /approve-enter needs --chat/);
  assert.throws(ask("--id", "approve-enter"), /approve-enter needs --chat/);
  assert.throws(ask("--id", "loop-pause"), /loop-pause needs --loop/);
});

test("the token comes from a file only its owner may read, and is never in the error", () => {
  const dir = mkdtempSync(join(tmpdir(), "action-clip-"));
  try {
    const file = join(dir, "token");
    writeFileSync(file, "secret-value\n");
    chmodSync(file, 0o600);
    assert.equal(readToken(file), "secret-value");
    for (const mode of [0o640, 0o604, 0o644]) {
      chmodSync(file, mode);
      assert.throws(
        () => readToken(file),
        (error) => /readable by more than its owner/.test(error.message) && !error.message.includes("secret-value")
      );
    }
    writeFileSync(file, "\n");
    chmodSync(file, 0o600);
    assert.throws(() => readToken(file), /is empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a frame that shows a capture folder fails the take, by the deny list every recorder shares", () => {
  assert.equal(leaksIn, denied);
  assert.deepEqual(leaksIn("Read tidetable/parse.py and tell me in two sentences what it does."), []);
  for (const text of ["~/work/capture-030/home", "/tmp/capture-031/takes/thread-turn.webm", "cd capture-027/workspace"]) {
    assert.match(leaksIn(text).join(), /a host path/, text);
  }
});

test("a take is kept with a video, a beat, no failure and nothing denied, and its folder goes either way", () => {
  const out = mkdtempSync(join(tmpdir(), "action-clip-out-"));
  const take = (changes = {}) => {
    const folder = join(out, ".take-thread-turn");
    mkdirSync(folder, { recursive: true });
    const path = join(folder, "page@1.webm");
    writeFileSync(path, "video");
    return { path, failure: null, leaks: [], beat: "4.20", id: "thread-turn", out, loading: [[0.23, 2.77]], ...changes };
  };
  try {
    assert.equal(keepTake(take()), true);
    assert.equal(readFileSync(join(out, "thread-turn.webm"), "utf8"), "video");
    assert.deepEqual(JSON.parse(readFileSync(join(out, "thread-turn.beat.json"), "utf8")), {
      id: "thread-turn",
      start: 4.2,
      loading: [[0.23, 2.77]]
    });
    assert.equal(existsSync(join(out, ".take-thread-turn")), false);

    for (const [why, changes] of [
      ["no video", { path: null }],
      ["a failure", { failure: new Error("the turn asked for approval") }],
      ["something denied on screen", { leaks: ['a host path ("/Users/…")'] }],
      ["no beat", { beat: null }]
    ]) {
      rmSync(join(out, "thread-turn.webm"), { force: true });
      rmSync(join(out, "thread-turn.beat.json"), { force: true });
      assert.equal(keepTake(take(changes)), false, why);
      assert.deepEqual(readdirSync(out), [], `${why}: nothing is kept, and the take's folder is gone`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("a chat's approvals are read from its transcript's permission rows, answered or waiting", () => {
  const session = {
    messages: [
      { role: "user", content: "That makes sense. Go ahead and fix it." },
      { role: "permission", content: "edit_file", cls: JSON.stringify({ request_id: "r1", resolved: "approved" }) },
      { role: "permission", content: "edit_file", cls: JSON.stringify({ request_id: "r2" }) },
      { role: "permission", content: "edit_file", cls: "not a record" }
    ]
  };
  assert.deepEqual(permissionsIn(session), [{ request_id: "r1", resolved: "approved" }, { request_id: "r2" }, {}]);
  assert.deepEqual(permissionsIn({}), []);
});
