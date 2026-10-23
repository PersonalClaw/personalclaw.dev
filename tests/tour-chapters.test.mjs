// The tour's chapters, held to the shots they show.
//
// /product lists the tour's beats as chapters, each showing one manifest shot (src/data/tour.mjs).
// This holds the list to the manifest: every chapter names a shot that ships, so it is
// re-captured at every re-pin, and that shot's file is there. Ids are unique, since the chosen one
// is kept in the URL.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { TOUR_CHAPTERS } from "../src/data/tour.mjs";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, "marketing/screenshots.manifest.json"), "utf8"));

test("every chapter shows a shipping shot whose file is there", () => {
  assert.ok(TOUR_CHAPTERS.length > 0, "the tour has chapters");
  for (const chapter of TOUR_CHAPTERS) {
    const shot = manifest.shots.find((s) => s.id === chapter.shot);
    assert.ok(shot, `the "${chapter.id}" chapter names a shot the manifest has: ${chapter.shot}`);
    assert.equal(shot.status, "shipping", `the "${chapter.id}" chapter's shot ships, so a re-pin re-captures it`);
    assert.ok(existsSync(join(root, shot.asset)), `${shot.asset} is there`);
  }
});

test("chapter ids are unique, and every chapter has a label and a text alternative", () => {
  assert.equal(new Set(TOUR_CHAPTERS.map((c) => c.id)).size, TOUR_CHAPTERS.length);
  for (const chapter of TOUR_CHAPTERS) {
    assert.ok(chapter.label.trim(), `${chapter.id} has a label`);
    assert.ok(chapter.alt.trim().length > 40, `${chapter.id} has a text alternative that describes the screen`);
  }
});
