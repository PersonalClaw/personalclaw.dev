// What scripts/validate-build.mjs holds each built page's social image and videos to (#97).
// Pure: the caller reads the page and the files, so tests/social-image-check.test.mjs can plant
// every defect without a build.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's real size, from its IHDR (bytes 16..24), or undefined for a file that is no PNG. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * The problems with one page's declared social image.
 *
 * @param {{
 *   route: string,
 *   origin: string,
 *   head: { image?: string, width?: string, height?: string, alt?: string, twitterImage?: string, twitterAlt?: string },
 *   expected: { image: string, alt?: string },
 *   sizeOf: (imagePath: string) => { width: number, height: number } | undefined
 * }} input `expected` is the page's frame (with the alt text the map gives it) or the card;
 *   `sizeOf` measures the built file at a site path, undefined when it is missing or no PNG.
 * @returns {string[]}
 */
export function socialImageProblems({ route, origin, head, expected, sizeOf }) {
  const problems = [];
  const want = `${origin}${expected.image}`;
  if (head.image !== want) problems.push(`${route}: og:image must be ${want} (got ${head.image ?? "none"})`);
  if (head.twitterImage !== head.image) {
    problems.push(`${route}: twitter:image must equal og:image (got ${head.twitterImage ?? "none"})`);
  }
  if (!head.alt) problems.push(`${route}: og:image:alt must be non-empty`);
  else if (expected.alt !== undefined && head.alt !== expected.alt) {
    problems.push(`${route}: og:image:alt must be the frame's alt text from src/data/social-frames.json`);
  }
  if (head.twitterAlt !== head.alt) problems.push(`${route}: twitter:image:alt must equal og:image:alt`);
  const imagePath = head.image?.startsWith(`${origin}/`) ? head.image.slice(origin.length) : undefined;
  const size = imagePath && sizeOf(imagePath);
  if (!size) {
    problems.push(`${route}: the declared og:image ${head.image ?? "none"} is not a PNG in the build`);
  } else if (head.width !== String(size.width) || head.height !== String(size.height)) {
    problems.push(
      `${route}: og:image declares ${head.width ?? "?"}x${head.height ?? "?"}, but ${imagePath} is ${size.width}x${size.height}`
    );
  }
  return problems;
}

/**
 * The problems with one page's videos. A video is never the only way to read what it shows: it
 * renders as its poster, or as the still its loop shows instead (src/components/loop-video.mjs),
 * until a reader starts it, so that image is the page's deterministic no-video fallback, and it
 * must exist. It asks for no byte before then, never starts itself, and is named, and any
 * captions it names exist.
 *
 * @param {{
 *   route: string,
 *   videos: { poster?: string, still?: string, preload?: string, autoplay: boolean, label?: string, tracks: string[] }[],
 *   exists: (sitePath: string) => boolean
 * }} input
 * @returns {string[]}
 */
export function videoProblems({ route, videos, exists }) {
  const problems = [];
  videos.forEach((video, index) => {
    const which = `${route}: video ${index + 1}`;
    const fallback = video.poster ?? video.still;
    if (!fallback) problems.push(`${which} has no poster or still, so with no playback it shows nothing`);
    else if (!exists(fallback)) problems.push(`${which}'s ${video.poster ? "poster" : "still"} ${fallback} is not in the build`);
    if (video.preload !== "none") problems.push(`${which} must be preload="none" (got ${video.preload ?? "none set"})`);
    if (video.autoplay) problems.push(`${which} must not autoplay`);
    if (!video.label) problems.push(`${which} has no accessible name`);
    for (const track of video.tracks) {
      if (!exists(track)) problems.push(`${which}'s track ${track} is not in the build`);
    }
  });
  return problems;
}
