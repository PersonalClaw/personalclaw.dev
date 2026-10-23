// /release's top slot (#93): the release in its own words, and its clip (#97) once one ships,
// played through the site's one player. Three states, each from a fixture manifest: no clip
// entry, an entry whose brief names the pinned release before it ships, and a shipping clip.
// The checks validate-build runs on the built page, with each failure planted.

import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "cheerio";
import { loopVideoMarkup } from "../src/components/loop-video.mjs";
import {
  RELEASE_CLIP_ID,
  RELEASE_CLIP_PLACEMENT,
  longDate,
  releaseClipEntry,
  releaseLead,
  releaseSlotProblems,
  servedPath,
  slotWords
} from "../src/data/release-slot.mjs";

const version = "0.2.6";
const changelog = {
  date: "2026-10-22",
  summary:
    "The app's redesign. Home is what needs you, what is running and what finished. Everything waiting on you is one list."
};
const brief = {
  release: version,
  date: "2026-10-22",
  highlights: [
    { text: "Home is what needs you.", source: "home-lanes" },
    { text: "Everything waiting on you is one list.", source: "approval-wait" }
  ],
  shareCopy: "x"
};
const clip = {
  id: RELEASE_CLIP_ID,
  kind: "narrative",
  width: 1280,
  height: 720,
  output: "public/media/release-clip.mp4",
  poster: "public/media/release-clip-poster.webp",
  captions: "public/media/release-clip.vtt",
  autoplay: "none",
  fallback: "The poster, and the release's highlights as text beside it.",
  placements: [{ ...RELEASE_CLIP_PLACEMENT, caption: "c", alt: "a" }],
  brief,
  status: "shipping"
};

/** The three manifests the slot meets. */
const noEntry = { videos: [] };
const briefed = { videos: [{ ...clip, status: "new-needs-placement" }] };
const shipping = { videos: [clip] };

const player = (overrides = {}) =>
  loopVideoMarkup({
    src: servedPath(clip.output),
    poster: servedPath(clip.poster),
    width: clip.width,
    height: clip.height,
    label: "The PersonalClaw 0.2.6 release clip",
    fallback: clip.fallback,
    loop: false,
    captions: servedPath(clip.captions),
    ...overrides
  });

/** The built hero, as ReleaseClip.astro renders it from *words*; each option plants a defect. */
function page(words, { player = "", state = player ? "clip" : "text", name = `PersonalClaw ${version}`, inHero = true, date = words.date } = {}) {
  const text =
    `<h2 class="release-name">${name}</h2>` +
    (date ? `<p class="release-date">Released <time datetime="${date}">${longDate(date)}</time></p>` : "") +
    (words.lead ? `<p class="release-summary">${words.lead}</p>` : "") +
    (words.highlights ? `<ul class="release-highlights">${words.highlights.map((line) => `<li>${line}</li>`).join("")}</ul>` : "");
  const slot = `<div class="release-clip" data-release-clip data-state="${state}">${player}<div data-release-highlights>${text}</div></div>`;
  return load(inHero ? `<section data-release-provenance>${slot}</section>` : `<section></section>${slot}`);
}

const check = (manifest, $) =>
  releaseSlotProblems($, { version, words: slotWords(manifest, version, changelog), entry: releaseClipEntry(manifest, version) });

test("the summary's opening is its first two sentences, and a version's dots don't end one", () => {
  assert.equal(releaseLead(changelog.summary), "The app's redesign. Home is what needs you, what is running and what finished.");
  assert.equal(releaseLead("One sentence about 0.2.3."), "One sentence about 0.2.3.");
  assert.equal(releaseLead("A patch on 0.2.3 for Pillow 13. It installs. More."), "A patch on 0.2.3 for Pillow 13. It installs.");
  assert.equal(longDate("2026-10-22"), "22 October 2026");
});

test("with no clip entry, the slot is the summary's opening and the changelog's date, and passes", () => {
  const words = slotWords(noEntry, version, changelog);
  assert.deepEqual(words, { date: "2026-10-22", lead: releaseLead(changelog.summary), highlights: null });
  assert.equal(releaseClipEntry(noEntry, version), null);
  assert.deepEqual(check(noEntry, page(words)), []);
});

test("a brief for the pinned release, not yet shipping, gives the slot its words, and passes", () => {
  const words = slotWords(briefed, version, changelog);
  assert.deepEqual(words, { date: brief.date, lead: null, highlights: brief.highlights.map((line) => line.text) });
  assert.equal(releaseClipEntry(briefed, version), null);
  assert.deepEqual(check(briefed, page(words)), []);
  // A brief for the next release, before its re-pin, leaves the slot on the pinned summary.
  const next = { videos: [{ ...clip, status: "new-needs-placement", brief: { ...brief, release: "0.2.7" } }] };
  assert.deepEqual(slotWords(next, version, changelog).highlights, null);
});

test("a shipping clip plays in the slot through the player, with its brief beside it, and passes", () => {
  assert.equal(releaseClipEntry(shipping, version), clip);
  assert.deepEqual(check(shipping, page(slotWords(shipping, version, changelog), { player: player() })), []);
});

test("a shipping clip made for another release, or without its /release placement, is refused", () => {
  assert.throws(() => releaseClipEntry({ videos: [{ ...clip, brief: { ...brief, release: "0.2.5" } }] }, version), /shipping for 0\.2\.5, but the site pins 0\.2\.6/);
  assert.throws(() => releaseClipEntry({ videos: [{ ...clip, brief: undefined }] }, version), /shipping for no release/);
  assert.throws(() => releaseClipEntry({ videos: [{ ...clip, placements: [] }] }, version), /without its release-page placement/);
});

test("the built slot fails when it is missing, doubled, out of the hero, or names or dates another release", () => {
  const words = slotWords(noEntry, version, changelog);
  assert.match(check(noEntry, load("<main></main>")).join(), /expected one release slot, found 0/);
  assert.match(check(noEntry, load(`${page(words).html()}${page(words).html()}`)).join(), /found 2/);
  assert.match(check(noEntry, page(words, { inHero: false })).join(), /not in the hero/);
  assert.match(check(noEntry, page(words, { name: "PersonalClaw 0.2.5" })).join(), /names "PersonalClaw 0\.2\.5"/);
  assert.match(check(noEntry, page(words, { date: "2026-10-21" })).join(), /does not date the release 22 October 2026/);
});

test("the built slot fails words that aren't the summary's opening, or the brief's lines once there is one", () => {
  assert.match(check(noEntry, page({ ...slotWords(noEntry, version, changelog), lead: "Something else." })).join(), /not the opening of the pinned release's summary/);
  // The summary where the brief's lines belong, and a brief line changed.
  assert.match(check(briefed, page(slotWords(noEntry, version, changelog))).join(), /not the clip's brief/);
  const changed = { ...slotWords(briefed, version, changelog), highlights: ["Home is what you need.", "Everything waiting on you is one list."] };
  assert.match(check(briefed, page(changed)).join(), /not the clip's brief/);
});

test("the built slot fails a clip that shows while none ships, or that plays wrong once one does", () => {
  assert.match(
    check(briefed, page(slotWords(briefed, version, changelog), { player: player() })).join(),
    /no release clip ships, but the slot is not its text alone/
  );
  const words = slotWords(shipping, version, changelog);
  const problems = (overrides) => check(shipping, page(words, { player: player(overrides) })).join("\n");
  assert.match(check(shipping, page(words)).join(), /ships, but the slot does not play it/);
  assert.match(problems({ poster: "/media/other.webp" }), /poster is \/media\/other\.webp/);
  assert.match(problems({ captions: undefined }), /default captions track/);
  assert.match(problems({ loop: true }), /loops; it plays once/);
  assert.match(problems({ src: "/media/other.mp4" }), /plays something other than \/media\/release-clip\.mp4/);
  const eager = page(words, { player: player().replace('preload="none"', 'preload="auto"') });
  assert.match(check(shipping, eager).join(), /asks for bytes before its play control/);
});
