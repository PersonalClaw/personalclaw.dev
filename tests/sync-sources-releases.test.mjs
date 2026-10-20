// The three latest releases Home's maturity chapter lists, read from core's CHANGELOG.md.
//
// The sync keeps the newest release entries of the pinned changelog in the release facts, so
// no version or date is typed into a page. The pick is latestReleases() in
// scripts/sync-sources.mjs, the function main() calls, run here over
// tests/fixtures/core-changelog-v0.2.3.md: an excerpt of CHANGELOG.md at core v0.2.3
// (c705b30), with its preamble, the empty Unreleased heading and four releases, each with its
// real heading, lead paragraph and first item. No generated file is read: the unit tier runs
// before any build.
//
// Each planted changelog below differs from that excerpt by one thing a changelog can hold
// that is not one of the newest releases: a draft (Unreleased with work in it), a pre-release
// heading, an older version added later, a release without a date, and too few releases.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { latestReleases } from "../scripts/sync-sources.mjs";

const excerpt = readFileSync(
  new URL("./fixtures/core-changelog-v0.2.3.md", import.meta.url),
  "utf8"
);

/** The excerpt with `block` planted just below Unreleased, above the newest release. */
function plantedAbove(text, block) {
  const anchor = "## [Unreleased]\n";
  assert.ok(text.includes(anchor), "the excerpt opens its entries with Unreleased");
  return text.replace(anchor, `${anchor}\n${block.trim()}\n\n`);
}

const headings = (entries) => entries.map((entry) => entry.heading);

test("the newest three releases of the pinned changelog, newest first, with date and summary", () => {
  const latest = latestReleases(excerpt, 3);

  assert.deepEqual(headings(latest), ["0.2.3", "0.2.2", "0.2.1"]);
  assert.deepEqual(
    latest.map((entry) => entry.date),
    ["2026-10-19", "2026-10-18", "2026-10-15"]
  );
  assert.ok(latest[0].summary.startsWith("A patch release on 0.2.2. ⌘Enter approves only"));
  assert.ok(latest[1].summary.startsWith("A patch release on 0.2.1. A long shell command"));
  assert.ok(latest[2].summary.startsWith("A patch release on 0.2.0. On Linux an agent"));
  for (const entry of latest) {
    assert.deepEqual(Object.keys(entry).sort(), ["date", "heading", "summary"]);
    assert.ok(entry.summary.endsWith("."), `${entry.heading}'s summary is its whole lead paragraph`);
    assert.doesNotMatch(entry.summary, /\n|###|Focus mode|An agent's shell command/);
  }
});

test("a fourth release is the next one down, with its markdown cleaned from the summary", () => {
  const latest = latestReleases(excerpt, 4);

  assert.deepEqual(headings(latest), ["0.2.3", "0.2.2", "0.2.1", "0.2.0"]);
  assert.equal(latest[3].date, "2026-10-07");
  assert.ok(latest[3].summary.startsWith("The first release since 0.1.3, and its theme is work that answers to you."));
  assert.ok(latest[3].summary.endsWith("run personalclaw snapshot and read Updating before you upgrade."));
});

test("a draft: Unreleased with work in it is never a release", () => {
  const planted = excerpt.replace(
    "## [Unreleased]\n",
    "## [Unreleased]\n\n### Added\n\n- **Something not yet released.**\n"
  );
  assert.deepEqual(headings(latestReleases(planted, 3)), ["0.2.3", "0.2.2", "0.2.1"]);
  assert.ok(!headings(latestReleases(planted, 10)).includes("Unreleased"));
});

test("a pre-release heading is not a release", () => {
  const planted = plantedAbove(
    excerpt,
    "## [0.3.0-rc.1] — 2026-10-20\n\nA release candidate for 0.3.0."
  );
  assert.deepEqual(headings(latestReleases(planted, 3)), ["0.2.3", "0.2.2", "0.2.1"]);
  assert.ok(!headings(latestReleases(planted, 10)).includes("0.3.0-rc.1"));
});

test("an older version added later, above the newest, does not displace a newer one", () => {
  const planted = plantedAbove(excerpt, "## [0.1.4] — 2026-10-20\n\nA patch release on 0.1.3.");
  assert.deepEqual(headings(latestReleases(planted, 3)), ["0.2.3", "0.2.2", "0.2.1"]);
  assert.deepEqual(headings(latestReleases(planted, 5)), ["0.2.3", "0.2.2", "0.2.1", "0.2.0", "0.1.4"]);
});

test("versions order by number, not as text: 0.10.0 is newer than 0.9.0", () => {
  const planted = plantedAbove(
    excerpt,
    [
      "## [0.9.0] — 2026-11-01\n\nNine.",
      "## [0.10.0] — 2026-12-01\n\nTen."
    ].join("\n\n")
  );
  assert.deepEqual(headings(latestReleases(planted, 3)), ["0.10.0", "0.9.0", "0.2.3"]);
});

test("a release heading without a date keeps the release, with no date", () => {
  const planted = excerpt.replace("## [0.2.3] — 2026-10-19\n", "## [0.2.3]\n");
  const [newest] = latestReleases(planted, 3);
  assert.equal(newest.heading, "0.2.3");
  assert.equal(newest.date, null);
});

test("a changelog with fewer releases than asked for gives what it has, padding nothing", () => {
  const onlyNewest = excerpt.slice(0, excerpt.indexOf("## [0.2.2]"));
  assert.deepEqual(headings(latestReleases(onlyNewest, 3)), ["0.2.3"]);

  const onlyUnreleased = excerpt.slice(0, excerpt.indexOf("## [0.2.3]"));
  assert.deepEqual(latestReleases(onlyUnreleased, 3), []);
});

test("the count is a positive whole number", () => {
  for (const count of [0, -1, 1.5, "3", undefined, Number.NaN]) {
    assert.throws(() => latestReleases(excerpt, count), /positive whole number/, String(count));
  }
});
