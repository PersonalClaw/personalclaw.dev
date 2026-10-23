// render:videos (#94), held without rendering: which entries it renders, where each source comes
// from, that a listed composition that is missing fails before anything runs, that the CLI in
// npx's cache is the pinned tarball or nothing runs, and that the pinned CLI always runs with
// everything it would send or change on its own turned off.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cachedCliProblems,
  HYPERFRAMES,
  HYPERFRAMES_ENV,
  HYPERFRAMES_INTEGRITY,
  main,
  sourceFiles,
  videosToRender
} from "../scripts/render-videos.mjs";

const loop = (over = {}) => ({
  id: "hero-loop",
  kind: "loop",
  composition: "marketing/compositions/hero-loop/index.html",
  sources: ["home-lanes", "chat"],
  status: "shipping",
  ...over
});
const manifest = {
  shots: [{ id: "chat", asset: "src/assets/chat.png" }],
  clips: [{ id: "home-lanes", file: "marketing/.captures/clips/home-lanes.webm" }],
  videos: [loop(), loop({ id: "tour", composition: null }), loop({ id: "old", status: "retired" })]
};

test("it renders the shipping entries that have a composition, and --only narrows them", () => {
  assert.deepEqual(videosToRender(manifest).map((v) => v.id), ["hero-loop"]);
  assert.deepEqual(videosToRender(manifest, ["hero-loop"]).map((v) => v.id), ["hero-loop"]);
  assert.throws(() => videosToRender(manifest, ["tour"]), /no shipping video with a composition is named tour/);
});

test("a source is a clip's capture or a shot's asset, and an unknown one fails", () => {
  assert.deepEqual(sourceFiles(manifest, loop()), [
    { id: "home-lanes", file: "marketing/.captures/clips/home-lanes.webm" },
    { id: "chat", file: "src/assets/chat.png" }
  ]);
  assert.throws(() => sourceFiles(manifest, loop({ sources: ["nope"] })), /neither as a shot nor a clip: nope/);
});

test("a listed composition that is missing fails before anything runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "render-videos-"));
  try {
    mkdirSync(join(dir, "marketing"), { recursive: true });
    writeFileSync(join(dir, "marketing", "screenshots.manifest.json"), JSON.stringify(manifest));
    assert.deepEqual(main([], dir), [
      'video "hero-loop": its composition marketing/compositions/hero-loop/index.html is missing'
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI is the pinned release, with telemetry, updates, self-install and skills refresh off", () => {
  assert.equal(HYPERFRAMES, "hyperframes@0.8.186");
  assert.deepEqual(HYPERFRAMES_ENV, {
    DO_NOT_TRACK: "1",
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
    HYPERFRAMES_SKIP_SKILLS: "1"
  });
});

/** An npm cache whose npx folders hold *copies*: each a hyperframes lock entry. */
function npmCache(copies) {
  const dir = mkdtempSync(join(tmpdir(), "npm-cache-"));
  copies.forEach((entry, index) => {
    mkdirSync(join(dir, "_npx", `copy${index}`), { recursive: true });
    writeFileSync(
      join(dir, "_npx", `copy${index}`, "package-lock.json"),
      JSON.stringify({ packages: { "": {}, "node_modules/hyperframes": entry } })
    );
  });
  return dir;
}
const pinned = {
  version: "0.8.186",
  integrity: HYPERFRAMES_INTEGRITY,
  resolved: "https://registry.npmjs.org/hyperframes/-/hyperframes-0.8.186.tgz"
};

test("the CLI in npx's cache is the pinned tarball, or nothing runs", () => {
  const caches = [];
  const cache = (copies) => {
    const dir = npmCache(copies);
    caches.push(dir);
    return dir;
  };
  try {
    assert.deepEqual(cachedCliProblems(cache([pinned])), []);
    assert.deepEqual(cachedCliProblems(cache([pinned, { ...pinned, version: "0.8.190", integrity: "sha512-other" }])), [], "another release is not run");
    assert.match(cachedCliProblems(cache([])).join(), /is not in npx's cache.*never fetches it/);
    const planted = cachedCliProblems(cache([pinned, { ...pinned, integrity: "sha512-planted" }]));
    assert.equal(planted.length, 1);
    assert.match(planted[0], /integrity sha512-planted, not the pinned sha512-JcBRm/);
    assert.match(cachedCliProblems(cache([{ ...pinned, resolved: "https://example.test/hyperframes.tgz" }])).join(), /came from https:\/\/example\.test/);
    assert.match(cachedCliProblems(cache([{ ...pinned, integrity: undefined }])).join(), /\(none recorded\)/);
  } finally {
    for (const dir of caches) rmSync(dir, { recursive: true, force: true });
  }
});

test("the README records the integrity the script checks", () => {
  const readme = readFileSync(new URL("../.agents/skills/README.md", import.meta.url), "utf8");
  assert.ok(readme.includes(HYPERFRAMES_INTEGRITY), ".agents/skills/README.md names the pinned CLI's dist.integrity");
});
