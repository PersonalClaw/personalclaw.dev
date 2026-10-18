// Prints, as JSON, the environment the visual specs render in: the image, platform and
// Playwright version, the browser build, the WebGL renderer, and the installed fonts
// (their count and one sha256 over the sorted list of font files and their sizes). It
// runs inside the pinned Playwright image, started by scripts/run-visual.mjs, which
// writes it into the baselines' manifest on a refresh and compares it with the manifest
// on every other run. The fonts are read from the font directories rather than through
// fc-list, so the probe needs nothing the image may not ship.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const FONT_DIRECTORIES = ["/usr/share/fonts", "/usr/local/share/fonts"];
const FONT_FILE = /\.(?:ttf|otf|ttc|pfb|pcf(?:\.gz)?|woff2?)$/i;

function fontFiles(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) fontFiles(file, found);
    else if (FONT_FILE.test(entry.name)) found.push(`${file} ${fs.statSync(file).size}`);
  }
  return found;
}

const playwright = JSON.parse(fs.readFileSync("node_modules/playwright-core/package.json", "utf8")).version;
const fonts = FONT_DIRECTORIES.flatMap((directory) => fontFiles(directory)).sort();
if (fonts.length === 0) throw new Error(`no font files under ${FONT_DIRECTORIES.join(" or ")}`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "none";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  process.stdout.write(
    `${JSON.stringify({
      image: process.env.VISUAL_IMAGE ?? null,
      platform: `${process.platform}/${process.arch === "x64" ? "amd64" : process.arch}`,
      playwright,
      browser: `chromium ${browser.version()}`,
      renderer,
      fonts: { count: fonts.length, sha256: createHash("sha256").update(fonts.join("\n")).digest("hex") },
    })}\n`,
  );
} finally {
  await browser.close();
}
