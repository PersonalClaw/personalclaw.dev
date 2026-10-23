// Each page's social frame (#97), held to its stamp and to what it is made of.
//
// These read committed files only (the unit tier runs before any sync). That the stamp was made
// from THIS release's route data is scripts/validate-build.mjs's check, against the synced facts.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { pngSize } from "../scripts/social-image-check.mjs";
import {
  FRAME_CAPTURES,
  FRAME_HEIGHT,
  FRAME_TEMPLATE,
  FRAME_WIDTH,
  FRAMES_MAP,
  FRAMES_STAMP,
  fileSha256,
  frameAlt,
  frameInputsHash,
  framePath,
  frameSpecs,
  frameTitle,
  pageWords,
  staleFrames
} from "../scripts/social-frames.mjs";
import { frameFor } from "../src/data/section-frame.mjs";
import { qualityRoutes } from "./support/site-contract.mjs";

const stamp = JSON.parse(readFileSync(FRAMES_STAMP, "utf8"));
const map = JSON.parse(readFileSync(FRAMES_MAP, "utf8"));
const shots = JSON.parse(readFileSync(new URL("../marketing/screenshots.manifest.json", import.meta.url), "utf8")).shots;
const publicFile = (sitePath) => new URL(`../public${sitePath}`, import.meta.url);

test("every committed frame is the PNG its render stamped, at 1200 x 630", () => {
  assert.deepEqual(Object.keys(map).sort(), Object.keys(stamp.frames).sort(), "the map and the stamp list the same frames");
  for (const [route, frame] of Object.entries(map)) {
    assert.equal(frame.image, framePath(route));
    assert.equal(frame.width, FRAME_WIDTH);
    assert.equal(frame.height, FRAME_HEIGHT);
    assert.ok(existsSync(publicFile(frame.image)), `${frame.image} is committed`);
    assert.deepEqual(pngSize(readFileSync(publicFile(frame.image))), { width: FRAME_WIDTH, height: FRAME_HEIGHT });
    assert.equal(
      fileSha256(publicFile(frame.image)),
      stamp.frames[route].png,
      `${frame.image} is not the PNG its render stamped: run npm run render:social-frames`
    );
  }
});

test("every file under public/social is a frame the map and the stamp own", () => {
  const owned = Object.values(map).map((frame) => frame.image.replace("/social/", "")).sort();
  assert.deepEqual(readdirSync(new URL("../public/social/", import.meta.url)).sort(), owned);
});

test("every page this site writes, and the docs landing, has a frame of its own; a sheet takes its section's", () => {
  // An install-safety sheet (/registry/<name>, #112) is made from the pinned apps release, one
  // per app, so it shares the /registry frame rather than having one of its own.
  const sheets = qualityRoutes.map((route) => route.path).filter((path) => path.startsWith("/registry/"));
  const pages = [...qualityRoutes.map((route) => route.path).filter((path) => !sheets.includes(path)), "/docs"].sort();
  assert.deepEqual(Object.keys(FRAME_CAPTURES).sort(), pages);
  assert.deepEqual(Object.keys(map).sort(), pages);
  assert.ok(sheets.length > 0, "the contract names a sheet to check");
  for (const sheet of sheets) assert.equal(frameFor(map, sheet), map["/registry"], `${sheet} shares the /registry frame`);
});

test("every frame's capture is a pinned screenshot in the manifest", () => {
  const ids = new Map(shots.map((shot) => [shot.id, shot]));
  for (const [route, id] of Object.entries(FRAME_CAPTURES)) {
    assert.ok(ids.has(id), `${route}'s capture ${id} is in marketing/screenshots.manifest.json`);
    assert.ok(existsSync(new URL(`../${ids.get(id).asset}`, import.meta.url)), `${ids.get(id).asset} is committed`);
  }
});

test("the frame is coral and coral ink, and nothing else", () => {
  const source = readFileSync(FRAME_TEMPLATE, "utf8");
  const colours = [...new Set(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].map((c) => c.toLowerCase());
  assert.deepEqual(colours.sort(), ["#3f1008", "#ff6b5b"]);
  assert.doesNotMatch(source, /gradient\(/i, "no gradient on the field");
  assert.doesNotMatch(source, /https?:\/\//, "the template loads nothing from the network");
});

const routes = [
  { path: "/product", title: "Watch it do the work.", description: "One unedited run on one machine." },
  { path: "/", title: "Your personal agentic OS", description: "The home page." },
  { path: "/blog/launch", title: "A post", description: "A post.", verifiedAgainst: "v0.1.3" },
  { path: "/not-framed", title: "Elsewhere", description: "No frame." }
];

test("a frame's lines are its page's headline and support sentence, as the page was built", () => {
  const page = (body, head = "") =>
    `<html><head><title>Product · PersonalClaw</title><meta name="description" content="The meta description.">${head}</head><body>${body}</body></html>`;
  assert.deepEqual(pageWords(page(`<h1><span>The model proposes.</span>\n<span>The host decides.</span></h1><p data-support>Host code  decides.</p>`)), {
    title: "The model proposes. The host decides.",
    description: "Host code decides."
  });
  assert.deepEqual(pageWords(page("<h1>Documentation</h1><p>Body.</p>")), {
    title: "Documentation",
    description: "The meta description."
  }, "a page with no support sentence gives its meta description");
  const home = "<html><head><title>PersonalClaw · Your personal agentic OS</title></head><body><h1>PersonalClaw</h1><p data-support>One gateway.</p></body></html>";
  assert.deepEqual(pageWords(home), { title: "Your personal agentic OS", description: "One gateway." }, "a headline that is the wordmark gives the title");
});
const release = { versionLabel: "v0.2.6", statusLabel: "Verified release" };

test("a frame says its page's lines and release, and a post says its own release", () => {
  const specs = frameSpecs({ routes, release, shots });
  assert.deepEqual(
    specs.map((spec) => spec.route),
    ["/product", "/", "/blog/launch"],
    "a route with no capture has no frame"
  );
  const [product, home, post] = specs;
  assert.equal(product.title, "Watch it do the work.");
  assert.equal(home.title, "Your personal agentic OS");
  assert.equal(product.release, "PersonalClaw v0.2.6 · Verified release");
  assert.equal(post.release, "Checked against PersonalClaw v0.1.3");
  assert.equal(frameTitle("Writing"), "Writing");
});

test("a frame's alt text describes what it shows, in its own words", () => {
  const [product] = frameSpecs({ routes, release, shots });
  const alt = frameAlt(product);
  for (const words of [product.title, product.description, product.release]) assert.ok(alt.includes(words), `the alt text names "${words}"`);
  assert.ok(alt.includes(product.capture.alt.replace(/\.$/, "")), "the alt text names the capture it shows");
  assert.ok(alt.startsWith("The PersonalClaw mark and wordmark in dark ink on coral"));
});

test("a frame's inputs hash moves with its words, its capture and its template, and nothing else", () => {
  const [product] = frameSpecs({ routes, release, shots });
  const files = { captureSha: "a", templateSha: "b", fontSha: "c" };
  const base = frameInputsHash(product, files);
  assert.equal(frameInputsHash({ ...product }, { ...files }), base, "the same inputs make the same hash");
  assert.notEqual(frameInputsHash({ ...product, release: "PersonalClaw v0.2.7 · Verified release" }, files), base);
  assert.notEqual(frameInputsHash({ ...product, description: "Other words." }, files), base);
  assert.notEqual(frameInputsHash(product, { ...files, captureSha: "d" }), base);
  assert.notEqual(frameInputsHash(product, { ...files, templateSha: "d" }), base);
});

test("a re-pin, a reworded page or a new page leaves the committed frames stale, and says which", () => {
  const specs = frameSpecs({ routes, release, shots });
  const fresh = { frames: Object.fromEntries(specs.map((spec) => [spec.route, { inputs: "x", png: "y" }])) };
  // The planted inputs are not the real hashes, so every route reads as made from other inputs.
  const problems = staleFrames(specs, { stamp: fresh, map: {} });
  assert.ok(problems.some((p) => p.startsWith("/product's frame was made from other words")));
  assert.ok(problems.some((p) => p.startsWith("/product's entry in src/data/social-frames.json")));

  const missing = staleFrames(specs, { stamp: { frames: {} }, map: {} });
  assert.ok(missing.includes("/product has no frame"));

  const extra = staleFrames(specs.slice(0, 1), { stamp: fresh, map: {} });
  assert.ok(extra.includes("the stamp has a frame for /, which has no frame inputs"));
});
