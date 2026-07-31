// Capture the app screenshots the marketing manifest declares.
//
// This is NOT the "reproducible pipeline" — `marketing/README.md` is explicit that seeding
// real-world data can't be scripted reliably, and the manifest is what carries the
// reproducibility. What CAN be mechanised is the part that is pure mechanism: navigate to a
// view, wait for it to settle, and write a dark-theme PNG at the exact 8:5 spec. Doing that
// by hand is how a shot ends up at the wrong ratio and forces a CSS change.
//
// Run against an ALREADY-SEEDED gateway (see the runbook): the scenarios in the manifest are
// interaction, done first; this only photographs the result.
//
//   node scripts/capture-app-shots.mjs --base http://127.0.0.1:10001 [--only inbox,artifacts]
//
// Every shot is written to marketing/.captures/<id>.png for review BEFORE anything is copied
// into src/assets/ — a screenshot that silently replaces a good one is worse than a missing
// one, so promotion is a separate, deliberate step.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, "marketing", ".captures");

// The manifest's spec: 8:5, at least 1200x750. Captured at 1.5x that (1800x1125) so the
// largest responsive variant never upscales, then Astro derives the smaller WebPs.
const WIDTH = 1800;
const HEIGHT = 1125;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = argOf("base", "http://127.0.0.1:10001").replace(/\/$/, "");
const only = argOf("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// path: where the view lives. settle: extra ms for animation/data to land. prep: optional
// in-page setup (open a tab, apply a filter) done through the real UI, never by URL hacking
// a state the user can't reach.
const SHOTS = [
  // The dashboard is a HASH-routed SPA (`useHashRoute`): `#/route/sub`. Path-style URLs all
  // resolve to the dashboard, which would have produced 13 copies of the same shot.
  { id: "dashboard", hash: "#/dashboard", settle: 2800 },
  { id: "inbox", hash: "#/inbox", settle: 2400 },
  { id: "chat", hash: "#/chat", settle: 2800 },
  { id: "knowledge", hash: "#/knowledge", settle: 2600 },
  { id: "artifacts", hash: "#/artifacts", settle: 2600 },
  {
    // `#/loops` is the LAUNCHER ("What do you want to accomplish?"), which photographs an
    // empty prompt. The manifest asks for a loop MID-RUN, and that lives at `#/loop/<id>`.
    // The id is per-instance, so it comes from --loop (see the runbook step for seeding one).
    id: "loops",
    // NOTE the PLURAL: the cockpit is `#/loops/<id>` (LoopsSection reads the id from its
    // `sub` segment). `#/loop/<id>` is a different section and renders the launcher, which
    // photographs an empty "What do you want to accomplish?" prompt.
    hash: process.env.LOOP_ID ? `#/loops/${process.env.LOOP_ID}` : "#/loops",
    settle: 3000,
  },
  { id: "triggers", hash: "#/triggers", settle: 2400 },
  { id: "apps", hash: "#/settings/apps", settle: 2800 },
  { id: "agents", hash: "#/settings/providers", settle: 2600 },
  { id: "memory", hash: "#/settings/memory", settle: 2600 },
  {
    id: "notification-rules",
    hash: "#/settings/notifications",
    settle: 2600,
    // The per-kind matrix IS the feature, and it sits below the generic Delivery /
    // Quiet-hours controls. Without this the shot photographs a severity dropdown and
    // crops out the thing the release added.
    scrollToText: "Per-kind delivery",
  },
  { id: "doctor", hash: "#/settings/doctor", settle: 3400 },
  { id: "guardrails", hash: "#/settings/guardrails", settle: 2400 },
];

const wanted = only.length ? SHOTS.filter((s) => only.includes(s.id)) : SHOTS;
if (only.length) {
  const missing = only.filter((id) => !SHOTS.some((s) => s.id === id));
  if (missing.length) {
    console.error(`Unknown shot id(s): ${missing.join(", ")}`);
    process.exit(2);
  }
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  colorScheme: "dark", // the site renders app imagery on a dark surface
  deviceScaleFactor: 1,
  reducedMotion: "reduce", // no half-played transitions in a still
});
const page = await context.newPage();

const problems = [];
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console: ${msg.text().slice(0, 160)}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${String(err).slice(0, 160)}`));

let failures = 0;
let loaded = false;
for (const shot of wanted) {
  const before = problems.length;
  if (!loaded) {
    // One real load for the whole run; every later shot is a same-document hash change.
    try {
      await page.goto(`${base}/${shot.hash}`, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      // networkidle never arrives on a page holding a live WebSocket — expected here.
      await page.goto(`${base}/${shot.hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    loaded = true;
  } else {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, shot.hash);
  }
  await page.waitForTimeout(shot.settle);

  if (shot.scrollToText) {
    // The dashboard scrolls an INNER pane, not the window, so `window.scrollBy` is a no-op
    // here and `scrollIntoViewIfNeeded` alone leaves the heading pinned to the very bottom
    // edge. Scroll the element's own scrollable ancestor and put the heading near the top.
    const moved = await page.evaluate((needle) => {
      const heading = [...document.querySelectorAll("h2, h3, h4, p, div, span")].find(
        (el) => el.textContent?.trim().startsWith(needle) && el.children.length === 0
      );
      if (!heading) return false;
      let pane = heading.parentElement;
      while (pane && pane !== document.body) {
        const style = getComputedStyle(pane);
        const scrollable = /auto|scroll/.test(style.overflowY);
        if (scrollable && pane.scrollHeight > pane.clientHeight + 8) break;
        pane = pane.parentElement;
      }
      const box = heading.getBoundingClientRect();
      if (pane && pane !== document.body) {
        const paneBox = pane.getBoundingClientRect();
        pane.scrollTop += box.top - paneBox.top - 24;
      } else {
        window.scrollBy(0, box.top - 24);
      }
      return true;
    }, shot.scrollToText);
    if (!moved) problems.push(`scrollTo: never found ${JSON.stringify(shot.scrollToText)}`);
    await page.waitForTimeout(800);
  }

  const file = join(outDir, `${shot.id}.png`);
  await page.screenshot({ path: file, fullPage: false });

  const fresh = problems.slice(before);
  const note = fresh.length ? `  ⚠ ${fresh.length} console error(s)` : "";
  console.log(`captured ${shot.id.padEnd(20)} ${WIDTH}x${HEIGHT}  ${shot.hash}${note}`);
  if (fresh.length) failures += 1;
}

await browser.close();

console.log(`\n${wanted.length} shot(s) → marketing/.captures/`);
if (failures) {
  console.log(
    `${failures} view(s) logged console errors — inspect those before promoting them, ` +
      `a screenshot of a broken surface is worse than no screenshot.`
  );
}
console.log("Review each PNG, then promote deliberately into src/assets/.");
