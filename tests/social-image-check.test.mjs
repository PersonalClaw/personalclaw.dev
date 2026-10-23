// What the build holds each page's social image and videos to (#97), with each defect planted.

import assert from "node:assert/strict";
import test from "node:test";

import { pngSize, socialImageProblems, videoProblems } from "../scripts/social-image-check.mjs";
import { frameFor } from "../src/data/section-frame.mjs";

const origin = "https://personalclaw.dev";

function png(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test("a PNG's size is read from its header, and a file that is no PNG has none", () => {
  assert.deepEqual(pngSize(png(1200, 630)), { width: 1200, height: 630 });
  assert.equal(pngSize(Buffer.from("<svg/>")), undefined);
  assert.equal(pngSize(undefined), undefined);
});

const files = new Map([
  ["/social/product.png", { width: 1200, height: 630 }],
  ["/brand/social-preview.png", { width: 1200, height: 600 }]
]);
const sizeOf = (imagePath) => files.get(imagePath);
const frame = { image: "/social/product.png", alt: "The frame of /product." };
const good = {
  image: `${origin}/social/product.png`,
  width: "1200",
  height: "630",
  alt: "The frame of /product.",
  twitterImage: `${origin}/social/product.png`,
  twitterAlt: "The frame of /product."
};

test("a page that declares its own frame, at its real size, passes", () => {
  assert.deepEqual(socialImageProblems({ route: "/product", origin, head: good, expected: frame, sizeOf }), []);
});

test("a page that has a frame but declares the card fails", () => {
  const head = { ...good, image: `${origin}/brand/social-preview.png`, twitterImage: `${origin}/brand/social-preview.png`, height: "600" };
  const problems = socialImageProblems({ route: "/product", origin, head, expected: frame, sizeOf });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /og:image must be https:\/\/personalclaw\.dev\/social\/product\.png/);
});

test("a frame of the wrong size fails, in either dimension", () => {
  const short = socialImageProblems({ route: "/product", origin, head: { ...good, height: "600" }, expected: frame, sizeOf });
  assert.deepEqual(short, ["/product: og:image declares 1200x600, but /social/product.png is 1200x630"]);
  const narrow = socialImageProblems({ route: "/product", origin, head: { ...good, width: "1080" }, expected: frame, sizeOf });
  assert.deepEqual(narrow, ["/product: og:image declares 1080x630, but /social/product.png is 1200x630"]);
});

test("a frame missing from the build fails", () => {
  const problems = socialImageProblems({ route: "/product", origin, head: good, expected: frame, sizeOf: () => undefined });
  assert.match(problems.join("\n"), /is not a PNG in the build/);
});

test("alt text that is empty, or not the frame's, fails, and so does a twitter tag that differs", () => {
  assert.match(
    socialImageProblems({ route: "/product", origin, head: { ...good, alt: "", twitterAlt: "" }, expected: frame, sizeOf }).join("\n"),
    /og:image:alt must be non-empty/
  );
  assert.match(
    socialImageProblems({ route: "/product", origin, head: { ...good, alt: "A slogan.", twitterAlt: "A slogan." }, expected: frame, sizeOf }).join("\n"),
    /the frame's alt text/
  );
  assert.match(
    socialImageProblems({ route: "/product", origin, head: { ...good, twitterImage: `${origin}/other.png` }, expected: frame, sizeOf }).join("\n"),
    /twitter:image must equal og:image/
  );
});

test("a page with no frame shares the card, at the card's size", () => {
  const head = {
    image: `${origin}/brand/social-preview.png`,
    width: "1200",
    height: "600",
    alt: "The card.",
    twitterImage: `${origin}/brand/social-preview.png`,
    twitterAlt: "The card."
  };
  assert.deepEqual(socialImageProblems({ route: "/404", origin, head, expected: { image: "/brand/social-preview.png" }, sizeOf }), []);
});

test("a page takes its own frame, else its section's, and Home's frame is Home's alone", () => {
  const frames = { "/": "home", "/registry": "registry", "/blog": "blog", "/blog/launch": "launch", "/docs": "docs" };
  assert.equal(frameFor(frames, "/"), "home");
  assert.equal(frameFor(frames, "/blog/launch"), "launch");
  assert.equal(frameFor(frames, "/blog/next-post"), "blog");
  assert.equal(frameFor(frames, "/registry/some-app/"), "registry");
  assert.equal(frameFor(frames, "/docs/guides/install"), "docs");
  assert.equal(frameFor(frames, "/404"), undefined);
});

const tour = { poster: "/media/tour-poster.webp", preload: "none", autoplay: false, label: "The tour", tracks: ["/media/tour.vtt"] };
const built = new Set(["/media/tour-poster.webp", "/media/tour.vtt"]);
const exists = (sitePath) => built.has(sitePath);

test("a video with a poster in the build, no early byte, a name and its captions passes", () => {
  assert.deepEqual(videoProblems({ route: "/product", videos: [tour], exists }), []);
});

test("a video with no poster or still, or one missing from the build, fails; a loop's still stands in for its poster", () => {
  assert.match(videoProblems({ route: "/product", videos: [{ ...tour, poster: undefined }], exists }).join("\n"), /has no poster or still/);
  const loop = { ...tour, poster: undefined, still: "/_astro/dashboard.webp", tracks: [] };
  assert.deepEqual(videoProblems({ route: "/", videos: [loop], exists: (p) => p === "/_astro/dashboard.webp" }), []);
  assert.match(videoProblems({ route: "/", videos: [loop], exists: () => false }).join("\n"), /still \/_astro\/dashboard\.webp is not in the build/);
  assert.match(
    videoProblems({ route: "/product", videos: [{ ...tour, poster: "/media/gone.webp" }], exists }).join("\n"),
    /poster \/media\/gone\.webp is not in the build/
  );
});

test("a video that loads early, starts itself, has no name or loses its captions fails", () => {
  const problems = videoProblems({
    route: "/product",
    videos: [{ ...tour, preload: "auto", autoplay: true, label: "", tracks: ["/media/gone.vtt"] }],
    exists
  });
  assert.equal(problems.length, 4);
  assert.match(problems.join("\n"), /preload="none"/);
  assert.match(problems.join("\n"), /must not autoplay/);
  assert.match(problems.join("\n"), /no accessible name/);
  assert.match(problems.join("\n"), /track \/media\/gone\.vtt/);
});
