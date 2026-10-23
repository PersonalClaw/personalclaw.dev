// The tour's tracks, held to its composition (#96).
//
// render:videos writes the captions and chapters tracks from the tour composition's beats
// (scripts/tour-tracks.mjs). This fails a committed track that the composition no longer yields,
// so a caption edited in one place and not the other, or a beat re-timed without its tracks, is
// caught without a render; and it plants each way a composition's beats can be wrong.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { beatsOf, captionsTrack, chaptersTrack, stamp } from "../scripts/tour-tracks.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const composition = read("marketing/compositions/tour/index.html");
const manifest = JSON.parse(read("marketing/screenshots.manifest.json"));
const tour = manifest.videos.find((video) => video.id === "tour");

test("the committed tracks are the ones the tour's composition yields", () => {
  const beats = beatsOf(composition);
  assert.equal(read(tour.captions), captionsTrack(beats), `${tour.captions} drifted from the composition`);
  assert.equal(read(tour.chapters), chaptersTrack(beats), `${tour.chapters} drifted from the composition`);
});

test("the tour's beats are the click-path's, end to end, and every chapter but the close is one", () => {
  const beats = beatsOf(composition);
  assert.deepEqual(
    beats.map((beat) => beat.chapter),
    ["home", "chat", "approval", "loops", "knowledge", "artifacts", null]
  );
  const length = Number(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/.exec(composition)[1]);
  assert.ok(Math.abs(beats.at(-1).end - length) < 1e-6, `the beats end at ${beats.at(-1).end} s, the composition at ${length} s`);
});

test("a time is written as WebVTT's HH:MM:SS.mmm", () => {
  assert.equal(stamp(0), "00:00:00.000");
  assert.equal(stamp(67.5), "00:01:07.500");
  assert.equal(stamp(3725.25), "01:02:05.250");
});

const root = (beats, length) =>
  `<div data-composition-id="main" data-duration="${length}">${beats
    .map(
      ([start, duration, caption, chapter, title]) =>
        `<div class="beat"${chapter ? ` data-chapter="${chapter}"` : ""}${title ? ` data-title="${title}"` : ""}` +
        `${caption ? ` data-caption="${caption}"` : ""}><video class="clip" data-start="${start}" data-duration="${duration}"></video></div>`
    )
    .join("")}</div>`;

test("beats with a gap, a missing caption, an untitled chapter or a short end all fail", () => {
  const ok = [
    [0, 4, "Home.", "home", "Home"],
    [4, 2, "Close.", null, null]
  ];
  assert.equal(beatsOf(root(ok, 6)).length, 2);
  assert.throws(() => beatsOf(root([ok[0], [5, 1, "Close."]], 6)), /starts at 5 s, not where the one before it ends \(4 s\)/);
  assert.throws(() => beatsOf(root([ok[0], [4, 2, ""]], 6)), /has no data-caption/);
  assert.throws(() => beatsOf(root([[0, 4, "Home.", "home", null], ok[1]], 6)), /chapter home has no data-title/);
  assert.throws(() => beatsOf(root(ok, 8)), /end at 6 s, not at the composition's 8 s/);
  assert.throws(() => beatsOf(root([ok[0], [4, 2, "Again.", "home", "Home"]], 6)), /share a chapter id/);
});

test("a chapter runs until the next one starts, and the last one to the end", () => {
  const beats = beatsOf(root([[0, 4, "Home.", "home", "Home"], [4, 3, "Chat.", "chat", "Chat"], [7, 2, "Close."]], 9));
  assert.equal(
    chaptersTrack(beats),
    "WEBVTT\n\nhome\n00:00:00.000 --> 00:00:04.000\nHome\n\nchat\n00:00:04.000 --> 00:00:09.000\nChat\n"
  );
});
