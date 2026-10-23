// The marketing manifest's videos (#94), held to the files they play.
//
// Each case copies the manifest and its schema into a throwaway site with the files they
// name, plants one defect, and expects the validator to name it: a missing output, a file in
// public/media/ that no video plays, an output over its byte budget, an audio asset with no
// licence, a narrative video with no captions track, and a source no shot has. The real
// manifest passes as it is.

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { manifestProblems } from "../scripts/validate-marketing-manifest.mjs";

const root = new URL("..", import.meta.url).pathname;
const real = JSON.parse(readFileSync(join(root, "marketing/screenshots.manifest.json"), "utf8"));

/** A site holding *manifest*, the schema, every file the manifest names, and *extra* files. */
function site(manifest, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  mkdirSync(join(dir, "marketing"), { recursive: true });
  mkdirSync(join(dir, "src", "assets"), { recursive: true });
  mkdirSync(join(dir, "public", "media"), { recursive: true });
  cpSync(join(root, "marketing/screenshots.schema.json"), join(dir, "marketing/screenshots.schema.json"));
  writeFileSync(join(dir, "marketing/screenshots.manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: manifest.targetRelease }));
  const files = new Set();
  for (const shot of manifest.shots) {
    if (shot.status === "shipping") files.add(shot.asset);
    for (const placement of shot.placements) files.add(placement.file);
  }
  for (const video of manifest.videos ?? []) {
    for (const rel of [video.output, video.poster, video.captions, video.chapters]) if (rel) files.add(rel);
    for (const placement of video.placements) files.add(placement.file);
  }
  for (const rel of files) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), "x");
  }
  for (const [rel, body] of Object.entries(extra)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

/** The problems the validator finds once *plant* changes a copy of the real manifest. */
function problemsAfter(plant, extra) {
  const manifest = structuredClone(real);
  const without = plant(manifest) ?? {};
  const dir = site(manifest, extra);
  try {
    for (const rel of without.remove ?? []) rmSync(join(dir, rel));
    return manifestProblems(dir).problems;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tour = (manifest) => manifest.videos.find((v) => v.id === "tour");

test("the real manifest passes, with the tour declared", () => {
  assert.deepEqual(manifestProblems().problems, []);
  assert.ok(tour(real), "the tour is a video entry");
  assert.equal(tour(real).autoplay, "none", "the tour waits for its play control");
});

test("a copy of the manifest with every file it names passes", () => {
  assert.deepEqual(problemsAfter(() => {}), []);
});

test("a shipping video whose output is missing fails", () => {
  const problems = problemsAfter(() => ({ remove: [tour(real).output] }));
  assert.ok(problems.some((p) => /"tour" is shipping but a file it plays is missing: public\/media\/personalclaw-tour\.mp4/.test(p)), problems.join("\n"));
});

test("a file in public/media that no video plays fails", () => {
  const problems = problemsAfter(() => {}, { "public/media/stray-loop.mp4": "x" });
  assert.ok(problems.some((p) => /orphan media file .*public\/media\/stray-loop\.mp4/.test(p)), problems.join("\n"));
});

test("an output over its byte budget fails", () => {
  const problems = problemsAfter((m) => {
    tour(m).budgetBytes = 1;
  }, { "public/media/personalclaw-tour.mp4": "two bytes and more" });
  assert.ok(problems.some((p) => /"tour" is over its budget/.test(p)), problems.join("\n"));
});

test("an audio asset with no licence fails", () => {
  const problems = problemsAfter((m) => {
    tour(m).audio = [{ file: "marketing/audio/bed.mp3", source: "made here", licence: "" }];
  }, { "marketing/audio/bed.mp3": "x" });
  assert.ok(problems.some((p) => /schema: .*\/videos\/0\/audio\/0\/licence/.test(p)), problems.join("\n"));
});

test("a narrative video with no captions track fails", () => {
  const problems = problemsAfter((m) => {
    tour(m).captions = null;
    tour(m).chapters = null;
  }, { "public/media/personalclaw-tour.vtt": "x" });
  assert.ok(problems.some((p) => /"tour" is narrative but has no captions track/.test(p)), problems.join("\n"));
});

test("a video made from a shot the manifest does not have fails", () => {
  const problems = problemsAfter((m) => {
    tour(m).sources = ["no-such-shot"];
  });
  assert.ok(problems.some((p) => /"tour" names a source no shot or clip has: no-such-shot/.test(p)), problems.join("\n"));
});

test("a loop that may start on its own outside the two policies fails the schema", () => {
  const problems = problemsAfter((m) => {
    tour(m).autoplay = "on-load";
  });
  assert.ok(problems.some((p) => /schema: .*\/videos\/0\/autoplay/.test(p)), problems.join("\n"));
});
