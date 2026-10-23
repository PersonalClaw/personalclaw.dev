// Every release's clip, held to its brief (#97).
//
// `npm run release-clip` writes each release clip's composition and captions from its brief in
// the marketing manifest (scripts/release-clip.mjs). This fails a committed file the brief no
// longer yields, a clip whose entry's length is not its brief's, and a brief that says what its
// release's changelog does not, a banned word, or a claim the /compare ledger narrows. Once the
// site pins the brief's release, its lines are held to that release's own changelog entry.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { leadOverclaims } from "../scripts/llms-lead.mjs";
import {
  briefProblems,
  clipSeconds,
  formatOf,
  longDate,
  releaseClipCaptions,
  releaseClipFiles
} from "../scripts/release-clip.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("marketing/screenshots.manifest.json"));
const rows = JSON.parse(read("src/data/capabilities.json")).rows;
const overclaims = (text) => leadOverclaims(text, rows);
const clips = manifest.videos.filter((video) => video.brief);

const brief = {
  release: "0.2.6",
  date: "2026-10-22",
  highlights: [{ text: "Home is what needs you.", source: "home-lanes" }],
  shareCopy: "PersonalClaw 0.2.6: Home is what needs you."
};
const changelog = {
  heading: "0.2.6",
  date: "2026-10-22",
  summary: "The app's redesign. Home is what needs you, what is running and what finished.",
  sections: [{ title: "Added", items: ["Everything waiting on you is one list."] }]
};

test("the committed compositions and captions are the ones the briefs yield", () => {
  assert.ok(clips.length > 0, "the manifest has a release clip");
  for (const [file, contents] of releaseClipFiles(manifest)) {
    assert.equal(read(file), contents, `${file} drifted from its brief: run npm run release-clip`);
  }
});

test("each clip lasts what its brief does, in a landscape for the site and a vertical for social", () => {
  for (const video of clips) {
    assert.equal(video.durationSeconds, clipSeconds(video.brief), `${video.id}'s length`);
  }
  const formats = clips.map((video) => `${formatOf(video)}:${video.use ?? "site"}`).sort();
  assert.deepEqual(formats, ["landscape:site", "vertical:social"]);
});

test("each committed brief keeps its words, and its lines when the site pins its release", () => {
  const facts = existsSync(new URL("../.generated/release-facts.json", import.meta.url))
    ? JSON.parse(read(".generated/release-facts.json")).core.changelog.currentVersion
    : null;
  for (const video of clips) {
    const pinned = facts && facts.heading === video.brief.release ? facts : null;
    assert.deepEqual(briefProblems(video.brief, pinned, overclaims), [], video.id);
  }
});

test("a line its changelog does not say, a wrong date, a banned word and a narrowed claim all fail", () => {
  assert.deepEqual(briefProblems(brief, changelog, overclaims), []);
  const line = (text) => ({ ...brief, highlights: [{ text, source: "home-lanes" }] });
  assert.match(briefProblems(line("Home is what you need."), changelog, overclaims).join(), /is not in its changelog's words/);
  assert.deepEqual(briefProblems(line("Everything waiting on you is one list."), changelog, overclaims), [], "an item's words count");
  assert.match(briefProblems({ ...brief, date: "2026-10-21" }, changelog, overclaims).join(), /dated 2026-10-21; its changelog says 2026-10-22/);
  assert.match(briefProblems({ ...brief, shareCopy: "A seamless redesign." }, changelog, overclaims).join(), /says "seamless"/);
  assert.match(briefProblems({ ...brief, shareCopy: "Zero telemetry." }, changelog, overclaims).join(), /row `telemetry`/);
  assert.match(briefProblems(brief, { ...changelog, heading: "0.2.5" }, overclaims).join(), /held to the 0\.2\.5 changelog/);
});

test("the captions say every word the clip shows, when it shows it", () => {
  assert.equal(longDate("2026-10-22"), "22 October 2026");
  assert.equal(
    releaseClipCaptions(brief).split("\n\n").slice(2).join("\n\n"),
    [
      "1\n00:00:00.000 --> 00:00:03.500\nPersonalClaw 0.2.6, released 22 October 2026.",
      "2\n00:00:03.500 --> 00:00:08.000\nHome is what needs you.",
      "3\n00:00:08.000 --> 00:00:11.000\nEvery change in 0.2.6, with its source: personalclaw.dev/release.\n"
    ].join("\n\n")
  );
});
