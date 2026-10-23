// Render every page's social frame (#97) from marketing/social-card/frame.html, and stamp them.
//
//   npm run render:social-frames             render, and write the map and the stamp
//   npm run render:social-frames -- --check  render again and compare with the committed frames
//
// Each frame is the template filled from scripts/social-frames.mjs (as text and one image path,
// never as markup) and screenshot at 1200 x 630 in Playwright's Chromium with the site's own DM
// Sans, as scripts/render-social-card.mjs renders the card. It writes:
//
//   public/social/<route>.png          the frames;
//   src/data/social-frames.json        each route's frame, size and alt text, which the pages,
//                                      their structured data and the /docs head declare;
//   marketing/social-card/frames-stamp.json
//                                      each frame's inputs hash and PNG hash. The unit tests hold
//                                      the committed PNGs to it; validate:build holds it to the
//                                      build's route data and release.
//
// It reads each framed page as `npm run build` built it (its headline and support sentence), the
// release facts and the pinned captures, and nothing else: no video render, no clock, no network.
// Run it in the release capture pass, after the captures are re-taken and the site is built, and
// commit what it writes.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import {
  FRAME_HEIGHT,
  FRAME_TEMPLATE,
  FRAME_WIDTH,
  FRAMES_MAP,
  FRAMES_STAMP,
  currentSpecs,
  fileSha256,
  frameMap,
  inputsOf
} from "./social-frames.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Render every frame into *outDir* (public/ by default). */
export async function renderFrames(specs, outDir = join(root, "public")) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT }, deviceScaleFactor: 1 });
    for (const spec of specs) {
      await page.goto(pathToFileURL(FRAME_TEMPLATE).href);
      await page.evaluate(
        async ({ spec, capture }) => {
          for (const slot of ["title", "description", "release"]) {
            document.querySelector(`[data-slot="${slot}"]`).textContent = spec[slot];
          }
          const image = document.querySelector('[data-slot="capture"]');
          image.src = capture;
          await image.decode();
          await document.fonts.ready;
          // A long headline steps down in size until the copy fits: the same words always land
          // on the same size, so this is as deterministic as the rest of the frame.
          const copy = document.querySelector(".copy");
          const title = document.querySelector('[data-slot="title"]');
          for (const size of [60, 54, 48, 44, 40]) {
            title.style.fontSize = `${size}px`;
            if (copy.scrollHeight <= copy.clientHeight) break;
          }
          // Two frames after the image and the font, so the capture's rounded corner is painted
          // before the screenshot: without it the first frame of a run can differ at its edge.
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        },
        { spec, capture: pathToFileURL(join(root, spec.capture.asset)).href }
      );
      const { loaded, overflow } = await page.evaluate(() => {
        const copy = document.querySelector(".copy");
        return { loaded: document.fonts.check('300 40px "DM Sans Variable"'), overflow: copy.scrollHeight > copy.clientHeight };
      });
      if (!loaded) throw new Error("the frame's DM Sans did not load: run npm ci first");
      // A clipped line would leave the alt text describing words the frame does not show.
      if (overflow) throw new Error(`${spec.route}'s frame text does not fit its column: its headline or support sentence is too long`);
      const file = join(outDir, spec.image);
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT } });
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const specs = await currentSpecs();
  if (process.argv.includes("--check")) {
    // Render again into a scratch folder and compare: the same inputs must make the same bytes.
    const scratch = mkdtempSync(join(tmpdir(), "social-frames-"));
    try {
      await renderFrames(specs, scratch);
      const differ = specs.filter((spec) => fileSha256(join(scratch, spec.image)) !== fileSha256(join(root, "public", spec.image)));
      if (differ.length) {
        console.error(`These frames rendered differently from the committed ones: ${differ.map((spec) => spec.route).join(", ")}`);
        process.exitCode = 1;
      } else {
        console.log(`Rendered ${specs.length} social frames again: every one is byte-identical to the committed frame.`);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  } else {
    await renderFrames(specs);
    writeFileSync(FRAMES_MAP, `${JSON.stringify(frameMap(specs), null, 2)}\n`);
    const stamp = {
      frames: Object.fromEntries(
        specs.map((spec) => [spec.route, { inputs: inputsOf(spec), png: fileSha256(join(root, "public", spec.image)) }])
      )
    };
    writeFileSync(FRAMES_STAMP, `${JSON.stringify(stamp, null, 2)}\n`);
    console.log(`Rendered ${specs.length} social frames into public/social, and wrote their map and stamp.`);
  }
}
