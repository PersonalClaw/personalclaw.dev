// Render the site's social card, public/brand/social-preview.png, from its source,
// marketing/social-card/card.html (#98), and stamp the pair.
//
//   npm run render:social-card
//
// The card is a 1200 x 600 screenshot of the source in Playwright's Chromium, with the site's
// own DM Sans. It writes marketing/social-card/stamp.json: the SHA-256 of the source and of the
// PNG it rendered, which tests/social-card.test.mjs holds the committed files to, so the card a
// link preview shows is the one its source says. Its words are held to the /compare ledger in
// the same test.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const CARD_SOURCE = join(root, "marketing", "social-card", "card.html");
export const CARD_STAMP = join(root, "marketing", "social-card", "stamp.json");
export const CARD_PNG = join(root, "public", "brand", "social-preview.png");

export const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(CARD_SOURCE).href);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => document.fonts.check('300 104px "DM Sans Variable"'));
    if (!loaded) throw new Error("the card's DM Sans did not load: run npm ci first");
    await page.screenshot({ path: CARD_PNG, clip: { x: 0, y: 0, width: 1200, height: 600 } });
  } finally {
    await browser.close();
  }
  writeFileSync(
    CARD_STAMP,
    `${JSON.stringify({ source: sha256(CARD_SOURCE), png: sha256(CARD_PNG) }, null, 2)}\n`
  );
  console.log(`Rendered ${CARD_PNG} from ${CARD_SOURCE}; stamped ${CARD_STAMP}.`);
}
