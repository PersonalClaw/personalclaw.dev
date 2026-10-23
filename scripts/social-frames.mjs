// The site's social frames (#97): one Open Graph image per page, made from the page's own data
// and one pinned capture of the product, so a shared link shows that page, not the site's card.
//
// WHAT A FRAME IS MADE OF, and only that, so the same release always yields the same frames:
//
//   - the page's own headline and the one factual sentence under it (`[data-support]`, #98), as
//     the BUILT page shows them, so a frame never says what its page does not. A page with no
//     support sentence (the /docs landing, a post) gives its meta description, and Home, whose
//     headline is the wordmark the frame already shows, gives its <title> less the site's name;
//   - the release it speaks for: the release this site publishes, from releaseFacts, or for a
//     post, the release its claims were verified against (its `verifiedAgainst`);
//   - one capture from marketing/screenshots.manifest.json, chosen per route below, with the
//     alt text the manifest gives it where it is placed.
//
// No clock, no network, no video: a frame renders from these inputs and the template
// (marketing/social-card/frame.html) alone, so the frames build when no video renders at all.
// scripts/render-social-frames.mjs renders them and stamps each frame's inputs and PNG.
// tests/social-frames.test.mjs holds the committed PNGs and map to the stamp, and
// scripts/validate-build.mjs holds the stamp to this build's route data and release.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const FRAME_TEMPLATE = join(root, "marketing", "social-card", "frame.html");
export const FRAMES_STAMP = join(root, "marketing", "social-card", "frames-stamp.json");
export const FRAMES_MAP = join(root, "src", "data", "social-frames.json");
export const FRAME_FONT = join(root, "node_modules", "@fontsource-variable", "dm-sans", "files", "dm-sans-latin-wght-normal.woff2");

/** A frame's size: the Open Graph image shape most link previews crop to (1.91:1). */
export const FRAME_WIDTH = 1200;
export const FRAME_HEIGHT = 630;

/**
 * The capture each route's frame shows, by the manifest's shot id, and why: the one that shows
 * what the page is about. A route not listed here has no frame of its own.
 */
export const FRAME_CAPTURES = {
  "/": "dashboard", // Home: what waits on you, from one home.
  "/product": "chat", // the tour opens on a chat and the approval it stops on.
  "/apps": "apps", // the app directory itself.
  "/security": "inbox", // the approval waiting on the owner: the host decides.
  "/release": "dashboard", // the release's own home view, as the release ships it.
  "/compare": "agents", // swappable runtimes: what the matrix checks, row by row.
  "/blog": "loops", // writing about work it did: a finished goal loop.
  "/blog/launch": "loops",
  "/registry": "apps", // where an app is installed from.
  "/docs": "knowledge" // the documentation tier: reference material, kept apart.
};

/** The file a route's frame is written to, under public/. */
export function framePath(route) {
  const slug = route === "/" ? "home" : route.replace(/^\//, "").replaceAll("/", "-");
  return `/social/${slug}.png`;
}

const SUFFIX = " · PersonalClaw";
const PREFIX = "PersonalClaw · ";

/** A page's <title> without the site name the frame's wordmark already shows. */
export function frameTitle(title) {
  if (title.endsWith(SUFFIX)) return title.slice(0, -SUFFIX.length);
  if (title.startsWith(PREFIX)) return title.slice(PREFIX.length);
  return title;
}

/** The capture's alt text where the manifest places it, or its view's name. */
function captureAlt(shot) {
  const placed = (shot.placements ?? []).find((placement) => placement.alt)?.alt;
  return placed ?? shot.appView;
}

/**
 * Every frame's inputs, in route order.
 *
 * @param {{
 *   routes: { path: string, title: string, description: string, verifiedAgainst?: string }[],
 *     where `title` and `description` are the frame's two lines (see `pageWords`),
 *   release: { versionLabel: string, statusLabel: string },
 *   shots: { id: string, asset: string, appView: string, placements?: { alt?: string }[] }[]
 * }} input
 */
export function frameSpecs({ routes, release, shots }) {
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  return routes
    .filter((route) => Object.hasOwn(FRAME_CAPTURES, route.path))
    .map((route) => {
      const shot = byId.get(FRAME_CAPTURES[route.path]);
      if (!shot) throw new Error(`${route.path}'s frame names the capture ${FRAME_CAPTURES[route.path]}, which the manifest does not have`);
      return {
        route: route.path,
        image: framePath(route.path),
        title: route.title,
        description: route.description,
        release: route.verifiedAgainst
          ? `Checked against PersonalClaw ${route.verifiedAgainst}`
          : `PersonalClaw ${release.versionLabel} · ${release.statusLabel}`,
        capture: { id: shot.id, asset: shot.asset, alt: captureAlt(shot) }
      };
    });
}

/**
 * The frame's alt text: what the frame shows, in the order it shows it. It names the page's own
 * words rather than restating a slogan, as the card's alt text does (src/data/social-card.ts).
 *
 * @param {ReturnType<typeof frameSpecs>[number]} spec
 */
export function frameAlt(spec) {
  const capture = spec.capture.alt.replace(/\.$/, "");
  return (
    `The PersonalClaw mark and wordmark in dark ink on coral, with the title “${spec.title}”, ` +
    `the line “${spec.description}”, and “${spec.release}”, beside a capture: ${capture}.`
  );
}

/** A frame's inputs as one hash: its words, its capture's bytes and the template's. */
export function frameInputsHash(spec, { captureSha, templateSha, fontSha }) {
  const words = JSON.stringify({ title: spec.title, description: spec.description, release: spec.release });
  return createHash("sha256")
    .update(`${words}\n${spec.capture.id}\n${captureSha}\n${templateSha}\n${fontSha}`)
    .digest("hex");
}

export const fileSha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** What the stamp records for a frame's inputs, read from the files it is made of. */
export function inputsOf(spec) {
  return frameInputsHash(spec, {
    captureSha: fileSha256(join(root, spec.capture.asset)),
    templateSha: fileSha256(FRAME_TEMPLATE),
    fontSha: fileSha256(FRAME_FONT)
  });
}

/** A post's `verifiedAgainst`, from its frontmatter. */
function verifiedAgainst(slug) {
  const text = readFileSync(join(root, "src", "content", "blog", `${slug}.md`), "utf8");
  return /^verifiedAgainst:\s*"?([^"\n]+)"?\s*$/m.exec(text)?.[1];
}

const squash = (text) => text.replace(/\s+/g, " ").trim();

/**
 * A built page's two lines for its frame: its headline (or, where the headline is only the
 * site's name, its <title> less that name), and its support sentence (or its meta description).
 *
 * @param {string} html the built page
 */
export function pageWords(html) {
  const $ = load(html);
  const headline = squash($("h1").first().text());
  const support = squash($("[data-support]").first().text());
  return {
    title: headline && headline !== "PersonalClaw" ? headline : frameTitle(squash($("title").text())),
    description: support || ($('meta[name="description"]').attr("content") ?? "").trim()
  };
}

/**
 * Every frame's inputs as this checkout has them: each framed page as *distDir* built it, the
 * release facts (`npm run sync`), each post's frontmatter, and the screenshot manifest.
 *
 * @param {{ distDir?: string }} [options]
 */
export async function currentSpecs({ distDir = join(root, "dist") } = {}) {
  const routes = Object.keys(FRAME_CAPTURES).map((path) => {
    const file = join(distDir, path === "/" ? "index.html" : `${path.slice(1)}/index.html`);
    if (!existsSync(file)) throw new Error(`${path} has a frame but ${file} is not built: npm run build first`);
    const words = pageWords(readFileSync(file, "utf8"));
    return path.startsWith("/blog/") ? { path, ...words, verifiedAgainst: verifiedAgainst(path.slice(6)) } : { path, ...words };
  });
  const facts = JSON.parse(readFileSync(join(root, ".generated", "release-facts.json"), "utf8"));
  const shots = JSON.parse(readFileSync(join(root, "marketing", "screenshots.manifest.json"), "utf8")).shots;
  return frameSpecs({
    routes,
    release: { versionLabel: facts.core.versionLabel, statusLabel: facts.status.label },
    shots
  });
}

/** What src/data/social-frames.json says of each frame. */
export function frameMap(specs) {
  return Object.fromEntries(
    specs.map((spec) => [spec.route, { image: spec.image, width: FRAME_WIDTH, height: FRAME_HEIGHT, alt: frameAlt(spec) }])
  );
}

/**
 * The ways the committed stamp and map have fallen behind *specs*, the inputs this build has:
 * a route with no frame, a frame for no route, a frame made from other inputs, or a map entry
 * that says something else.
 */
export function staleFrames(specs, { stamp, map }) {
  const problems = [];
  const want = frameMap(specs);
  for (const spec of specs) {
    const stamped = stamp.frames?.[spec.route];
    if (!stamped) problems.push(`${spec.route} has no frame`);
    else if (stamped.inputs !== inputsOf(spec)) problems.push(`${spec.route}'s frame was made from other words, release or capture than this build's`);
    if (JSON.stringify(map[spec.route]) !== JSON.stringify(want[spec.route])) {
      problems.push(`${spec.route}'s entry in src/data/social-frames.json is not this build's`);
    }
  }
  for (const route of Object.keys(stamp.frames ?? {})) {
    if (!Object.hasOwn(want, route)) problems.push(`the stamp has a frame for ${route}, which has no frame inputs`);
  }
  return problems;
}
