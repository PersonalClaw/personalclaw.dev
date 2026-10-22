// The tour's chapters, read from its captions track.
//
// public/media/personalclaw-tour.vtt names each beat of the capture in its first word
// ("Chat. A prompt sent…"), with the cue's start. /product lists those beats as chapters a
// visitor chooses, and the one chosen is kept in the URL (`?chapter=`). The start of each
// chapter is the track's, never typed beside it: a re-cut tour carries its new times onto the
// page in the same change. A chapter whose beat the track no longer names fails the build
// rather than seeking to a time nobody checked.

import { readFileSync } from "node:fs";
import path from "node:path";

const trackPath = path.join(process.cwd(), "public", "media", "personalclaw-tour.vtt");

/** The query parameter that keeps the chosen chapter. */
export const CHAPTER_PARAM = "chapter";

/**
 * The chapters /product lists, in the tour's order: the beat each names in the track, and
 * what the list calls it.
 */
export const TOUR_CHAPTERS = Object.freeze([
  { id: "home", beat: "Home", label: "The gateway's own dashboard" },
  { id: "chat", beat: "Chat", label: "Chat with a model on this machine" },
  { id: "approval", beat: "Approval", label: "The approval it stops on" },
  { id: "loops", beat: "Loops", label: "A goal loop and its findings" },
  { id: "knowledge", beat: "Knowledge", label: "Knowledge searched locally" },
  { id: "artifacts", beat: "Artifacts", label: "The file it wrote, on disk" }
]);

/** `HH:MM:SS.mmm` or `MM:SS.mmm` as seconds. */
function seconds(stamp) {
  const parts = stamp.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Every cue in *vtt*: its start in seconds and its text.
 *
 * @param {string} vtt
 * @returns {{ start: number, text: string }[]}
 */
export function cuesOf(vtt) {
  const cues = [];
  for (const block of vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const start = /^\s*([\d:.]+)\s*-->/.exec(lines[at]);
    if (!start) continue;
    cues.push({ start: seconds(start[1]), text: lines.slice(at + 1).join(" ").trim() });
  }
  return cues;
}

/**
 * The chapters with the start the track gives each beat.
 *
 * @param {string} [vtt] the track's text, read from public/media when absent
 * @returns {{ id: string, label: string, start: number }[]}
 */
export function tourChapters(vtt = readFileSync(trackPath, "utf8")) {
  const cues = cuesOf(vtt);
  return TOUR_CHAPTERS.map(({ id, beat, label }) => {
    const cue = cues.find((c) => c.text.startsWith(`${beat}.`));
    if (!cue) {
      throw new Error(
        `public/media/personalclaw-tour.vtt has no cue that begins "${beat}.", so /product ` +
          `cannot say where the "${id}" chapter starts. Name the beat in the track, or drop the chapter.`
      );
    }
    return { id, label, start: cue.start };
  });
}
