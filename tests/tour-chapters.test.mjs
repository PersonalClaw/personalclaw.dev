// The tour's chapters, held to its captions track.
//
// /product lists the tour's beats as chapters, and seeks to a chapter's start on the first
// play. Those starts are read from the track (src/data/tour.mjs), so this holds the reading:
// every chapter is a beat the track names, in the tour's order, and a track that stops naming
// one fails rather than seeking somewhere nobody checked.

import assert from "node:assert/strict";
import test from "node:test";

import { cuesOf, TOUR_CHAPTERS, tourChapters } from "../src/data/tour.mjs";

test("every chapter starts where the track says its beat does, in order", () => {
  const chapters = tourChapters();
  assert.deepEqual(
    chapters.map((c) => c.id),
    TOUR_CHAPTERS.map((c) => c.id)
  );
  assert.equal(chapters[0].start, 0, "the tour opens on its first chapter");
  for (let i = 1; i < chapters.length; i++) {
    assert.ok(chapters[i].start > chapters[i - 1].start, `${chapters[i].id} starts after ${chapters[i - 1].id}`);
  }
  assert.equal(new Set(chapters.map((c) => c.id)).size, chapters.length, "chapter ids are unique");
});

test("a cue's start is read in hours, minutes and seconds", () => {
  const cues = cuesOf("WEBVTT\n\n1\n00:01:07.500 --> 00:01:19.000\nArtifacts. On disk.\n\n2\n01:00.250 --> 01:01.000\nChat. Short form.\n");
  assert.deepEqual(cues, [
    { start: 67.5, text: "Artifacts. On disk." },
    { start: 60.25, text: "Chat. Short form." }
  ]);
});

test("a track that no longer names a chapter's beat fails, by name", () => {
  const without = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:09.000\nHome. The dashboard.\n";
  assert.throws(() => tourChapters(without), /no cue that begins "Chat\."/);
});

test("a beat named later in a cue is not its start", () => {
  const track = TOUR_CHAPTERS.map((c, i) => `${i}\n00:00:${String(i * 5).padStart(2, "0")}.000 --> 00:00:59.000\n${c.beat}. x`).join("\n\n");
  const closing = "\n\n9\n00:00:58.000 --> 00:00:59.000\nBack to Home. Again.";
  const home = tourChapters(`WEBVTT\n\n${track}${closing}`).find((c) => c.id === "home");
  assert.equal(home.start, 0, "the closing 'Back to Home.' is not where Home starts");
});
