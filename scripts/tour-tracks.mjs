// The tour's captions and chapters tracks, written from its composition's beats (#96).
//
// marketing/compositions/tour/index.html cuts the click-path recording into beats, and each beat
// carries what it shows (data-caption) and, when it is a chapter, its id and title (data-chapter,
// data-title). The tracks are those words at the cut's own times, so they cannot drift from the
// video: render:videos writes them with each render of an entry whose composition has beats, and
// tests/tour-tracks.test.mjs fails a committed track that the composition no longer yields.

import { load } from "cheerio";

/**
 * The composition's beats, in order: each one's times, its caption, and its chapter if it is one.
 * A beat runs from its first clip's start to its last clip's end, and its clips play back to back
 * (a beat cut around a view's load is two clips). The beats run end to end from 0 to the
 * composition's length, or this throws.
 *
 * @param {string} html the composition's index.html
 * @returns {{ chapter: string | null, title: string | null, caption: string, start: number, end: number }[]}
 */
export function beatsOf(html) {
  const page = load(html);
  const length = Number(page("[data-composition-id]").first().attr("data-duration"));
  const beats = page(".beat")
    .toArray()
    .map((element) => {
      const beat = page(element);
      const clips = beat
        .find("video.clip")
        .toArray()
        .map((clip) => ({ start: Number(page(clip).attr("data-start")), duration: Number(page(clip).attr("data-duration")) }));
      const start = clips[0]?.start;
      const caption = String(beat.attr("data-caption") ?? "").replace(/\s+/g, " ").trim();
      const chapter = beat.attr("data-chapter") ?? null;
      const title = beat.attr("data-title") ?? null;
      const named = chapter ?? `the beat at ${start} s`;
      if (clips.length === 0 || clips.some((clip) => !Number.isFinite(clip.start) || !(clip.duration > 0))) {
        throw new Error(`${named} has no timed clip`);
      }
      for (const [index, clip] of clips.entries()) {
        const before = clips[index - 1];
        if (before && Math.abs(clip.start - (before.start + before.duration)) > 1e-6) {
          throw new Error(`${named} has a clip at ${clip.start} s, not where the one before it ends (${before.start + before.duration} s)`);
        }
      }
      const duration = clips.at(-1).start + clips.at(-1).duration - start;
      if (!caption) throw new Error(`${named} has no data-caption`);
      if (chapter !== null && !/^[a-z][a-z-]*$/.test(chapter)) throw new Error(`chapter id "${chapter}" is not a lower-case slug`);
      if (chapter !== null && !title) throw new Error(`chapter ${chapter} has no data-title`);
      return { chapter, title, caption, start, end: start + duration };
    });
  if (beats.length === 0) throw new Error("the composition has no .beat");
  let at = 0;
  for (const beat of beats) {
    if (Math.abs(beat.start - at) > 1e-6) throw new Error(`a beat starts at ${beat.start} s, not where the one before it ends (${at} s)`);
    at = beat.end;
  }
  if (Math.abs(at - length) > 1e-6) throw new Error(`the beats end at ${at} s, not at the composition's ${length} s`);
  const ids = beats.map((beat) => beat.chapter).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error("two beats share a chapter id");
  if (ids.length === 0) throw new Error("no beat is a chapter");
  return beats;
}

const pad = (n, width = 2) => String(n).padStart(width, "0");

/** Seconds as a WebVTT time, `HH:MM:SS.mmm`. */
export function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** The captions track: one cue per beat, describing what is on screen. */
export function captionsTrack(beats) {
  const cues = beats.map((beat, index) => `${index + 1}\n${stamp(beat.start)} --> ${stamp(beat.end)}\n${beat.caption}`);
  return [
    "WEBVTT",
    "NOTE\nThe tour is a silent screen capture, so these cues describe the beat on screen rather\nthan transcribe speech. render:videos writes them from the tour's composition\n(marketing/compositions/tour/index.html); edit them there.",
    ...cues
  ].join("\n\n") + "\n";
}

/** The chapters track: one cue per chapter, named by its id, running until the next one starts. */
export function chaptersTrack(beats) {
  const chapters = beats.filter((beat) => beat.chapter !== null);
  const end = beats.at(-1).end;
  const cues = chapters.map(
    (beat, index) => `${beat.chapter}\n${stamp(beat.start)} --> ${stamp(chapters[index + 1]?.start ?? end)}\n${beat.title}`
  );
  return ["WEBVTT", ...cues].join("\n\n") + "\n";
}
