// /release's top slot (#93): the pinned release in its own words, and its clip (#97) once the
// marketing manifest ships one. The words are the clip's brief once the manifest has one for the
// pinned release (its lines are that release's changelog's own words, held there by the clip's
// tests), and until then the opening of the pinned changelog's summary.
// src/components/ReleaseClip.astro renders the slot from these functions, and
// scripts/validate-build.mjs holds the built page to them, so the two can't drift.

/** The manifest entry the slot plays, and the placement that puts it there. */
export const RELEASE_CLIP_ID = "release-clip";
export const RELEASE_CLIP_PLACEMENT = Object.freeze({ file: "src/pages/release.astro", kind: "release-page" });

/**
 * The opening of a release's changelog summary: its first two sentences.
 *
 * @param {string} summary
 * @returns {string}
 */
export function releaseLead(summary) {
  return summary
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .slice(0, 2)
    .join(" ");
}

/**
 * A changelog date (YYYY-MM-DD) as the slot and the clip's first caption say it: "22 October 2026".
 *
 * @param {string} iso
 */
export function longDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

/**
 * The words the slot shows for *version*: the release clip's brief when the manifest has one for
 * that release, in any status, else the opening of the pinned changelog's summary.
 *
 * @param {{ videos?: Array<object> }} manifest
 * @param {string} version
 * @param {{ summary: string, date?: string | null }} changelog  the pinned version's entry
 * @returns {{ date: string | null, lead: string | null, highlights: string[] | null }}
 */
export function slotWords(manifest, version, changelog) {
  const brief = (manifest.videos ?? []).find((video) => video.id === RELEASE_CLIP_ID)?.brief;
  if (brief?.release === version) {
    return { date: brief.date, lead: null, highlights: brief.highlights.map((line) => line.text) };
  }
  return { date: changelog.date ?? null, lead: releaseLead(changelog.summary), highlights: null };
}

/**
 * The release clip the slot plays for *version*, or null while none ships. A shipping clip made
 * for another release, or without its /release placement, is refused: it would show one release's
 * words on another's page, or play somewhere the manifest doesn't say.
 *
 * @param {{ videos?: Array<object> }} manifest  marketing/screenshots.manifest.json
 * @param {string} version  the pinned core version, without the "v"
 */
export function releaseClipEntry(manifest, version) {
  const entry = (manifest.videos ?? []).find((video) => video.id === RELEASE_CLIP_ID);
  if (entry?.status !== "shipping") return null;
  if (entry.brief?.release !== version) {
    throw new Error(
      `video "${RELEASE_CLIP_ID}" is shipping for ${entry.brief?.release ?? "no release"}, but the site pins ${version}: ` +
        "write its brief for the pinned release and render it again (marketing/README.md)"
    );
  }
  const { file, kind } = RELEASE_CLIP_PLACEMENT;
  if (!(entry.placements ?? []).some((placement) => placement.file === file && placement.kind === kind)) {
    throw new Error(`video "${RELEASE_CLIP_ID}" is shipping without its ${kind} placement in ${file}`);
  }
  return entry;
}

/** A manifest path under public/ as the site serves it. */
export const servedPath = (file) => `/${file.replace(/^public\//, "")}`;

/**
 * What is wrong with the slot on the built /release: one slot, in the hero, naming the pinned
 * version with its date and its words (slotWords); the text alone while no clip ships, and once
 * one does, the clip as the site's player renders it: its poster, its captions as the default
 * track, played once, and no source before its control. `$` is the page, loaded.
 *
 * @param {import("cheerio").CheerioAPI} $
 * @param {{ version: string, words: ReturnType<typeof slotWords>, entry: object | null }} release
 * @returns {string[]}
 */
export function releaseSlotProblems($, { version, words, entry }) {
  const slots = $("[data-release-clip]");
  if (slots.length !== 1) return [`/release: expected one release slot, found ${slots.length}`];
  const problems = [];
  const slot = slots.first();
  if (slot.closest("[data-release-provenance]").length !== 1) {
    problems.push("/release: the release slot is not in the hero");
  }
  const name = slot.find(".release-name").text().replace(/\s+/g, " ").trim();
  if (name !== `PersonalClaw ${version}`) {
    problems.push(`/release: the release slot names "${name}", not PersonalClaw ${version}`);
  }
  const squash = (text) => text.replace(/\s+/g, " ").trim();
  const date = slot.find(".release-date time");
  if (words.date && (date.attr("datetime") !== words.date || squash(date.text()) !== longDate(words.date))) {
    problems.push(`/release: the release slot does not date the release ${longDate(words.date)}`);
  }
  const lead = squash(slot.find(".release-summary").text());
  const lines = slot.find(".release-highlights li").map((_, li) => squash($(li).text())).get();
  if (words.highlights) {
    if (lines.join("\n") !== words.highlights.map(squash).join("\n") || lead) {
      problems.push("/release: the release slot's lines are not the clip's brief for the pinned release");
    }
  } else if (lead !== squash(words.lead) || lines.length) {
    problems.push("/release: the release slot's text is not the opening of the pinned release's summary");
  }

  const videos = slot.find("video");
  if (!entry) {
    if (slot.attr("data-state") !== "text" || videos.length !== 0) {
      problems.push("/release: no release clip ships, but the slot is not its text alone");
    }
    return problems;
  }
  if (slot.attr("data-state") !== "clip" || videos.length !== 1) {
    return [...problems, "/release: the release clip ships, but the slot does not play it"];
  }
  const video = videos.first();
  if (video.attr("poster") !== servedPath(entry.poster)) {
    problems.push(`/release: the release clip's poster is ${video.attr("poster") ?? "missing"}, not ${servedPath(entry.poster)}`);
  }
  const track = video.find('track[kind="captions"]');
  if (track.length !== 1 || track.attr("src") !== servedPath(entry.captions) || track.attr("default") === undefined) {
    problems.push(`/release: the release clip does not carry ${servedPath(entry.captions)} as its default captions track`);
  }
  if (video.attr("loop") !== undefined) problems.push("/release: the release clip loops; it plays once");
  if (video.attr("preload") !== "none" || video.find("source").length !== 0) {
    problems.push("/release: the release clip asks for bytes before its play control");
  }
  if (slot.find("[data-loop-video]").attr("data-src") !== servedPath(entry.output)) {
    problems.push(`/release: the release clip plays something other than ${servedPath(entry.output)}`);
  }
  return problems;
}
