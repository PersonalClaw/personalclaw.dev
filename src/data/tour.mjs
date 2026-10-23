// The tour's chapters, read from its tracks (#96).
//
// public/media/personalclaw-tour-chapters.vtt names each chapter by its cue id, with its title
// and its start; render:videos writes it, and the captions track beside it, from the tour's
// composition (scripts/tour-tracks.mjs). /product lists those chapters, and the one chosen is
// kept in the URL (`?chapter=`). A chapter's start is the track's, never typed beside it, so a
// re-cut tour carries its new times onto the page in the same change. Each chapter's caption,
// what it shows, is the captions cue that starts with it: /product's text outline when the video
// cannot play. A chapter with no caption at its start fails the build rather than outlining
// something nobody checked.

import { readFileSync } from "node:fs";
import path from "node:path";

const media = path.join(process.cwd(), "public", "media");
const chaptersPath = path.join(media, "personalclaw-tour-chapters.vtt");
const captionsPath = path.join(media, "personalclaw-tour.vtt");

/** The query parameter that keeps the chosen chapter. */
export const CHAPTER_PARAM = "chapter";

/** `HH:MM:SS.mmm` or `MM:SS.mmm` as seconds. */
function seconds(stamp) {
  const parts = stamp.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Every cue in *vtt*: its identifier (null when it has none), its start and end in seconds, and
 * its text.
 *
 * @param {string} vtt
 * @returns {{ id: string | null, start: number, end: number, text: string }[]}
 */
export function cuesOf(vtt) {
  const cues = [];
  for (const block of vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const times = /^\s*([\d:.]+)\s*-->\s*([\d:.]+)/.exec(lines[at]);
    if (!times) continue;
    cues.push({
      id: at > 0 ? lines[at - 1].trim() || null : null,
      start: seconds(times[1]),
      end: seconds(times[2]),
      text: lines.slice(at + 1).join(" ").trim()
    });
  }
  return cues;
}

/**
 * The chapters, in the tour's order: each one's id, title, start, and the caption of what it shows.
 *
 * @param {string} [chapters] the chapters track's text, read from public/media when absent
 * @param {string} [captions] the captions track's text, read from public/media when absent
 * @returns {{ id: string, label: string, start: number, caption: string }[]}
 */
export function tourChapters(chapters = readFileSync(chaptersPath, "utf8"), captions = readFileSync(captionsPath, "utf8")) {
  const cues = cuesOf(chapters);
  if (cues.length === 0) throw new Error("public/media/personalclaw-tour-chapters.vtt has no chapters");
  const described = cuesOf(captions);
  return cues.map((cue) => {
    if (!cue.id) throw new Error(`the chapter at ${cue.start} s in personalclaw-tour-chapters.vtt has no id`);
    const caption = described.find((c) => Math.abs(c.start - cue.start) < 0.001);
    if (!caption) {
      throw new Error(
        `public/media/personalclaw-tour.vtt has no caption starting where the "${cue.id}" chapter ` +
          `does (${cue.start} s), so /product cannot outline it. Write both tracks from the composition.`
      );
    }
    return { id: cue.id, label: cue.text, start: cue.start, caption: caption.text };
  });
}
