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

import { loadingCuts } from "../scripts/clip-loading.mjs";
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

test("a release clip /release plays ships only for the release the site describes", () => {
  const clip = (m) => m.videos.find((video) => video.id === "release-clip");
  const now = problemsAfter((m) => {
    clip(m).status = "shipping";
    clip(m).brief.release = m.targetRelease;
  });
  assert.ok(!now.some((p) => /plays on \/release but its brief is for/.test(p)), now.join("\n"));
  const next = problemsAfter((m) => {
    clip(m).status = "shipping";
    clip(m).brief.release = "9.9.9";
  });
  assert.ok(next.some((p) => /"release-clip" plays on \/release but its brief is for 9\.9\.9/.test(p)), next.join("\n"));
  const waiting = problemsAfter((m) => {
    clip(m).status = "new-needs-placement";
    clip(m).brief.release = "9.9.9";
  });
  assert.ok(!waiting.some((p) => /plays on \/release/.test(p)), "a brief for the next release may wait unshipped");
});

// A take cannot keep a view's load off camera, so each clip marks where its take shows one, and
// no composition may cut into it (scripts/clip-loading.mjs).
const clip = (id, start, duration, mediaStart) =>
  `<video id="${id}" class="clip" src="assets/tour.webm" data-start="${start}" data-duration="${duration}" data-media-start="${mediaStart}"></video>`;

test("a clip that plays into its take's loading stretch fails, and one that stops at its edge passes", () => {
  const windows = { tour: [[57.36, 57.84]] };
  // The knowledge beat as main cut it, from 56.43 s for 12 s: through the Library's spinner.
  assert.deepEqual(loadingCuts(clip("knowledge", 51.9, 12, 56.43), windows), [
    'clip "knowledge" plays tour from 56.43 to 68.43 s, into its loading stretch at 57.36–57.84 s'
  ]);
  assert.deepEqual(loadingCuts(clip("loops", 41, 11.77, 45.53) + clip("knowledge", 52.77, 3.58, 57.84), windows), []);
  assert.deepEqual(loadingCuts(clip("knowledge", 0, 3, 57.84), { other: [[57.36, 57.84]] }), [], "another clip's stretch");
});

test("the manifest fails a shipping composition that cuts into a marked loading stretch", () => {
  const html = readFileSync(join(root, "marketing/compositions/tour/index.html"), "utf8");
  // Home's clip as the composition cuts it, and a stretch planted in its middle.
  const home = html.match(/<video id="home"[^>]*data-duration="([\d.]+)" data-media-start="([\d.]+)"/);
  assert.ok(home, "the tour composition has its home clip");
  const [from, to] = [Number(home[2]), Number((Number(home[2]) + Number(home[1])).toFixed(2))];
  const planted = [Math.floor(from) + 2, Math.floor(from) + 3];
  const problems = problemsAfter(
    (manifest) => {
      const tour = manifest.clips.find((entry) => entry.id === "tour");
      tour.loading = [...(tour.loading ?? []), planted];
    },
    { "marketing/compositions/tour/index.html": html }
  );
  assert.ok(
    problems.includes(`video "tour": clip "home" plays tour from ${from} to ${to} s, into its loading stretch at ${planted[0]}–${planted[1]} s`),
    problems.join("\n")
  );
});

test("a loading stretch that does not end after it starts fails", () => {
  const problems = problemsAfter((manifest) => {
    manifest.clips.find((entry) => entry.id === "app-install").loading = [[5, 5]];
  });
  assert.ok(problems.some((problem) => /app-install" marks a loading stretch that does not end after it starts: 5–5 s/.test(problem)), problems.join("\n"));
});

