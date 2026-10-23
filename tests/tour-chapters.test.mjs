// The tour's chapters, held to its tracks (#96).
//
// /product lists the tour's chapters, seeks to a chapter's start, and outlines each chapter in
// text when the video cannot play. Those starts, titles and captions are read from the chapters
// and captions tracks (src/data/tour.mjs), so this holds the reading: every chapter has an id and
// a caption at its start, in the tour's order, and a track that loses one fails by name.

import assert from "node:assert/strict";
import test from "node:test";

import { cuesOf, tourChapters } from "../src/data/tour.mjs";

test("every chapter has an id, a title and a caption at its start, in order", () => {
  const chapters = tourChapters();
  assert.ok(chapters.length >= 2, "the tour has chapters");
  assert.equal(chapters[0].start, 0, "the tour opens on its first chapter");
  for (let i = 1; i < chapters.length; i++) {
    assert.ok(chapters[i].start > chapters[i - 1].start, `${chapters[i].id} starts after ${chapters[i - 1].id}`);
  }
  assert.equal(new Set(chapters.map((c) => c.id)).size, chapters.length, "chapter ids are unique");
  for (const chapter of chapters) {
    assert.match(chapter.id, /^[a-z][a-z-]*$/);
    assert.ok(chapter.label.length > 0, `${chapter.id} has a title`);
    assert.ok(chapter.caption.length > 0, `${chapter.id} has a caption`);
  }
});

test("a cue's id, start and end are read in hours, minutes and seconds", () => {
  const cues = cuesOf("WEBVTT\n\nartifacts\n00:01:07.500 --> 00:01:19.000\nThe file.\n\n01:00.250 --> 01:01.000\nNo id.\n");
  assert.deepEqual(cues, [
    { id: "artifacts", start: 67.5, end: 79, text: "The file." },
    { id: null, start: 60.25, end: 61, text: "No id." }
  ]);
});

test("a chapter with no caption at its start, or no id, fails by name", () => {
  const chapters = "WEBVTT\n\nhome\n00:00:00.000 --> 00:00:09.000\nHome\n\nchat\n00:00:09.000 --> 00:00:23.000\nChat\n";
  const captions = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:09.000\nHome. The home.\n";
  assert.throws(() => tourChapters(chapters, captions), /no caption starting where the "chat" chapter does \(9 s\)/);
  assert.throws(() => tourChapters("WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nHome\n", captions), /has no id/);
  assert.throws(() => tourChapters("WEBVTT\n", captions), /has no chapters/);
});
