// Every release's clip (#97), written from its brief in the marketing manifest.
//
//   npm run release-clip     write each brief's compositions and captions track
//
// A release clip is a manifest video with a `brief`: the release, its date, three or four
// highlight lines taken from that release's changelog, the capture each line plays over (a clip
// or shot the manifest records), and the share copy. From the brief this writes the clip's
// composition, landscape for the site (1280 x 720) and vertical for short-form social
// (720 x 1280), and one captions track holding every word the clip shows. `npm run render:videos`
// renders them like any other composition. The compositions are written, not edited:
// tests/release-clip.test.mjs fails one that the brief no longer yields, and holds the brief's
// words to the changelog, to the /compare ledger and to the words #97 bans.
//
// The clip shows nothing but real captures and the source mark: a title card with the release,
// one line per highlight over its capture, and an end card naming /release.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stamp } from "./tour-tracks.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** How long each part of a clip lasts, in seconds. */
export const TITLE_SECONDS = 3.5;
export const LINE_SECONDS = 4.5;
export const END_SECONDS = 3;

/** Words #97 keeps out of every clip and its share copy. */
export const BANNED_WORDS = Object.freeze(["revolutionize", "revolutionise", "seamless", "unleash"]);

/** The canvas of each format. */
export const FORMATS = Object.freeze({
  landscape: { width: 1280, height: 720 },
  vertical: { width: 720, height: 1280 }
});

/** The source mark, as public/brand/personalclaw-mark.svg draws it. */
const MARK =
  "M256 16C106 76 46 226 46 226c0 45 60 90 90 90 90 0 180-195 135-285l-15-15zm45 15c30 60 0 135 0 135 120 30 120 180 75 330 75-75 90-150 90-210 0-90-15-225-165-255z";

/** A clip's length: its title, its lines and its end. */
export const clipSeconds = (brief) => TITLE_SECONDS + LINE_SECONDS * brief.highlights.length + END_SECONDS;

/** `2026-10-22` as `22 October 2026`. */
export function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${day} ${months[month - 1]} ${year}`;
}

const escape = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Where each part starts. */
function timeline(brief) {
  const lines = brief.highlights.map((highlight, index) => ({
    ...highlight,
    start: TITLE_SECONDS + LINE_SECONDS * index
  }));
  return { lines, end: TITLE_SECONDS + LINE_SECONDS * lines.length, length: clipSeconds(brief) };
}

/**
 * The composition of a brief's clip in one format.
 *
 * @param {{ release: string, date: string, highlights: { text: string, source: string }[] }} brief
 * @param {{ id: string, format: "landscape" | "vertical", extensions: Record<string, string> }} options
 *   extensions: each source's file extension as render:videos stages it (`.webm`, `.png`)
 */
export function releaseClipComposition(brief, { id, format, extensions }) {
  const { width, height } = FORMATS[format];
  const { lines, end, length } = timeline(brief);
  const vertical = format === "vertical";
  const media = (line, index) => {
    const extension = extensions[line.source];
    if (!extension) throw new Error(`the brief's line "${line.text}" plays over ${line.source}, which the video names no source for`);
    const timing = `data-start="${line.start}" data-duration="${LINE_SECONDS}"`;
    return extension === ".png"
      ? `<img id="capture-${index + 1}" class="clip" src="assets/${line.source}.png" alt="" ${timing} data-track-index="${index + 2}" />`
      : `<video id="capture-${index + 1}" class="clip" src="assets/${line.source}${extension}" muted playsinline ${timing} data-media-start="${line.mediaStart ?? 1}" data-track-index="${index + 2}"></video>`;
  };
  const beats = lines
    .map(
      (line, index) => `      <div class="beat" data-line="${index + 1}">
        <p id="line-${index + 1}" class="clip line" data-start="${line.start}" data-duration="${LINE_SECONDS}" data-track-index="${index + 2}">${escape(line.text)}</p>
        <div class="window">
          ${media(line, index)}
        </div>${vertical ? `\n        <p class="footer">PersonalClaw ${escape(brief.release)}</p>` : ""}
      </div>`
    )
    .join("\n");

  return `<!doctype html>
<!--
  The ${brief.release} release clip (#97), ${format}, ${width} x ${height}, ${length} s.
  Written by \`npm run release-clip\` from the "${id}" entry's brief in
  marketing/screenshots.manifest.json: edit the brief, never this file
  (tests/release-clip.test.mjs fails a composition the brief no longer yields).

  A title card with the release, one line of its changelog over each capture it names, and an end
  card naming /release. Real captures and the source mark only, nothing drawn in their place. The
  fades are paused Web Animations the runtime seeks, on a root marked data-no-timeline.
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "DM Sans";
        font-weight: 100 1000;
        src: url("assets/fonts/dm-sans.woff2") format("woff2");
      }
      html,
      body {
        margin: 0;
        background: #121416;
      }
      #main {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background: #121416;
        color: #f2f1ed;
        font-family: "DM Sans", sans-serif;
      }
      .card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .card svg {
        width: ${vertical ? 120 : 96}px;
        height: ${vertical ? 120 : 96}px;
        margin-bottom: 28px;
      }
      .card p {
        margin: 0;
      }
      .name {
        font-size: ${vertical ? 44 : 36}px;
        font-weight: 500;
      }
      .release {
        margin: 6px 0 14px;
        color: #ff6b5b;
        font-size: ${vertical ? 150 : 132}px;
        font-weight: 300;
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .date,
      .note {
        color: #c4c4bf;
        font-size: ${vertical ? 34 : 28}px;
      }
      .url {
        margin-top: 10px;
        color: #ff6b5b;
        font-size: ${vertical ? 48 : 40}px;
        font-weight: 500;
      }
      .beat {
        position: absolute;
        inset: 0;
      }
      .line {
        position: absolute;
        top: ${vertical ? 250 : 52}px;
        right: ${vertical ? 56 : 120}px;
        left: ${vertical ? 56 : 120}px;
        margin: 0;
        font-size: ${vertical ? 58 : 44}px;
        font-weight: 450;
        line-height: 1.12;
        text-align: center;
        text-wrap: balance;
      }
      .window {
        position: absolute;
        top: ${vertical ? 600 : 148}px;
        left: ${vertical ? 40 : 200}px;
        width: ${vertical ? 640 : 880}px;
        height: ${vertical ? 400 : 550}px;
        overflow: hidden;
        border: 1px solid #3b3e41;
        border-radius: 14px;
        background: #171819;
      }
      .footer {
        position: absolute;
        right: 0;
        bottom: 120px;
        left: 0;
        margin: 0;
        color: #92938f;
        font-size: 30px;
        text-align: center;
      }
      .window video,
      .window img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-no-timeline data-start="0" data-duration="${length}" data-width="${width}" data-height="${height}">
      <div id="title" class="card" data-part-start="0">
        <svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#ff6b5b" d="${MARK}" /></svg>
        <p class="name">PersonalClaw</p>
        <p class="release">${escape(brief.release)}</p>
        <p class="date">Released ${escape(longDate(brief.date))}</p>
      </div>
${beats}
      <div id="end" class="card" data-part-start="${end}">
        <svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#ff6b5b" d="${MARK}" /></svg>
        <p class="note">Every change in ${escape(brief.release)}, with its source:</p>
        <p class="url">personalclaw.dev/release</p>
      </div>
    </div>
    <script>
      // The runtime seeks every paused Web Animation to timeline time: each part fades up from the
      // theater's dark over 0.3 s and down over its last 0.3 s, and each capture eases into a slow
      // punch-in. Animation times are document time, so each part's start is its delay.
      const FADE = 0.3;
      const fade = (element, start, length, first) =>
        element
          .animate(
            [
              { opacity: first ? 1 : 0 },
              { opacity: 1, offset: first ? 0 : FADE / length },
              { opacity: 1, offset: 1 - FADE / length },
              { opacity: 0 }
            ],
            { delay: start * 1000, duration: length * 1000, fill: "both" }
          )
          .pause();
      fade(document.getElementById("title"), 0, ${TITLE_SECONDS}, true);
      for (const beat of document.querySelectorAll(".beat")) {
        const line = beat.querySelector(".line");
        const start = Number(line.dataset.start);
        fade(beat, start, ${LINE_SECONDS}, false);
        beat
          .querySelector(".window")
          .animate([{ transform: "scale(1)" }, { transform: "scale(1.035)" }], {
            delay: start * 1000,
            duration: ${LINE_SECONDS} * 1000,
            easing: "cubic-bezier(0.33, 1, 0.68, 1)",
            fill: "both"
          })
          .pause();
      }
      fade(document.getElementById("end"), ${end}, ${END_SECONDS}, false);
    </script>
  </body>
</html>
`;
}

/** The captions track: every word the clip shows, when it shows it. */
export function releaseClipCaptions(brief) {
  const { lines, end, length } = timeline(brief);
  const cues = [
    [0, TITLE_SECONDS, `PersonalClaw ${brief.release}, released ${longDate(brief.date)}.`],
    ...lines.map((line) => [line.start, line.start + LINE_SECONDS, line.text]),
    [end, length, `Every change in ${brief.release}, with its source: personalclaw.dev/release.`]
  ];
  return [
    "WEBVTT",
    "NOTE\nThe release clip is silent, so these cues are the words it shows. npm run release-clip writes\nthem from the clip's brief in marketing/screenshots.manifest.json; edit them there.",
    ...cues.map(([from, to, text], index) => `${index + 1}\n${stamp(from)} --> ${stamp(to)}\n${text}`)
  ].join("\n\n") + "\n";
}

const words = (text) => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/**
 * What is wrong with a brief, held to its release's changelog entry (releaseFacts'
 * `core.changelog.currentVersion` once the site pins that release) and to the /compare ledger:
 * a line the changelog does not say, a date that is not the release's, a banned word, or a claim
 * a `partial` or `no` row says does not hold.
 *
 * @param {any} brief
 * @param {{ heading: string, date?: string, summary: string, sections: { items: string[] }[] } | null} changelog
 *   the release's changelog entry, or null when the site pins another release
 * @param {(text: string) => { row: string }[]} overclaims leadOverclaims, bound to the ledger's rows
 * @returns {string[]}
 */
export function briefProblems(brief, changelog, overclaims) {
  const problems = [];
  const said = [brief.shareCopy, ...brief.highlights.map((highlight) => highlight.text)];
  for (const text of said) {
    for (const banned of BANNED_WORDS) {
      if (words(text).includes(` ${banned}`)) problems.push(`the ${brief.release} brief says "${banned}": "${text}"`);
    }
    for (const finding of overclaims(text)) {
      problems.push(`the ${brief.release} brief says what /compare row \`${finding.row}\` says does not hold: "${text}"`);
    }
  }
  if (changelog === null) return problems;
  if (changelog.heading !== brief.release) {
    problems.push(`the ${brief.release} brief was held to the ${changelog.heading} changelog`);
    return problems;
  }
  if (changelog.date && changelog.date !== brief.date) {
    problems.push(`the ${brief.release} brief is dated ${brief.date}; its changelog says ${changelog.date}`);
  }
  const entry = words([changelog.summary, ...changelog.sections.flatMap((section) => section.items)].join(" "));
  for (const highlight of brief.highlights) {
    if (!entry.includes(words(highlight.text))) {
      problems.push(`the ${brief.release} brief's line "${highlight.text}" is not in its changelog's words`);
    }
  }
  return problems;
}

/** The format of a release clip entry, from its canvas. */
export const formatOf = (video) => (video.height > video.width ? "vertical" : "landscape");

/**
 * Each source's file extension as render:videos stages it: a clip's capture, or a shot's PNG.
 *
 * @param {any} manifest
 */
export function sourceExtensions(manifest) {
  const extensions = {};
  for (const shot of manifest.shots ?? []) extensions[shot.id] = ".png";
  for (const clip of manifest.clips ?? []) extensions[clip.id] = clip.file.slice(clip.file.lastIndexOf("."));
  return extensions;
}

/**
 * The files every brief in *manifest* yields: each clip's composition and its captions track.
 *
 * @param {any} manifest
 * @returns {Map<string, string>} repo-relative path → contents
 */
export function releaseClipFiles(manifest) {
  const files = new Map();
  const extensions = sourceExtensions(manifest);
  for (const video of (manifest.videos ?? []).filter((entry) => entry.brief)) {
    const only = Object.fromEntries(video.sources.map((id) => [id, extensions[id]]));
    files.set(
      video.composition,
      releaseClipComposition(video.brief, { id: video.id, format: formatOf(video), extensions: only })
    );
    if (video.captions) files.set(video.captions, releaseClipCaptions(video.brief));
  }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const manifest = JSON.parse(readFileSync(join(root, "marketing", "screenshots.manifest.json"), "utf8"));
  for (const [file, contents] of releaseClipFiles(manifest)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
    console.log(`wrote ${file}`);
  }
}
