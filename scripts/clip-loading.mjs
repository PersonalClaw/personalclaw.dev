// Where a video's composition cuts into a stretch of its source that shows a view still loading.
//
// A recorded take cannot keep a load off camera: every navigation records the moment before the
// view has its data (a spinner, skeleton rows, an empty list). The manifest marks those stretches
// on each clip (`loading`, in seconds from the take's first frame: measured from its frames, or
// written by scripts/capture-tour.mjs into tour.beats.json), and the composition has to cut around
// them. validate:marketing-manifest runs this over every shipping composition, so a re-cut, or a
// new take with its own windows, cannot put a load back on screen.

import { load } from "cheerio";

/**
 * Every clip in `html` that plays into a loading stretch of its source, one line each; empty when
 * none does. A clip plays its source from `data-media-start` for `data-duration` seconds, and its
 * source is the clip named by its `src` (`assets/<id>.webm`). Touching a window's edge is not
 * playing into it.
 *
 * @param {string} html  a composition's index.html
 * @param {Record<string, [number, number][]>} windows  each source clip's loading stretches, by id
 * @returns {string[]}
 */
export function loadingCuts(html, windows) {
  const page = load(html);
  const problems = [];
  page("video.clip").each((_, element) => {
    const clip = page(element);
    const source = /^assets\/([a-z0-9-]+)\.(?:webm|mp4)$/.exec(clip.attr("src") ?? "")?.[1];
    const marked = source ? windows[source] ?? [] : [];
    const from = Number(clip.attr("data-media-start") ?? 0);
    const to = from + Number(clip.attr("data-duration"));
    for (const [start, end] of marked) {
      if (from < end && start < to) {
        problems.push(
          `clip "${clip.attr("id") ?? "(no id)"}" plays ${source} from ${from} to ${round(to)} s, into ` +
            `its loading stretch at ${start}–${end} s`
        );
      }
    }
  });
  return problems;
}

/**
 * What is wrong with a clip's `loading` stretches: each must end after it starts. The schema
 * holds their shape.
 *
 * @param {{ id: string, loading?: [number, number][] }} clip
 * @returns {string[]}
 */
export function windowProblems(clip) {
  return (clip.loading ?? [])
    .filter(([start, end]) => !(end > start))
    .map(([start, end]) => `clip "${clip.id}" marks a loading stretch that does not end after it starts: ${start}–${end} s`);
}

const round = (seconds) => Math.round(seconds * 1000) / 1000;
