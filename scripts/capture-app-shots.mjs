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
//   PERSONALCLAW_TOKEN=… node scripts/capture-app-shots.mjs --base http://127.0.0.1:10001 [--only chat,loops]
//     [--out <dir>] [--settle <ms>] [--loading-wait <ms>]
//
// The gateway keeps its own sign-in: the browser signs in the way the link `personalclaw token`
// prints does (`/?token=…`), with the token taken from PERSONALCLAW_TOKEN and never printed. A
// gateway run with its auth switched off needs no token.
//
// Every shot is written to marketing/.captures/<id>.png (or --out) for review BEFORE anything is
// copied into src/assets/ — a screenshot that silently replaces a good one is worse than a
// missing one, so promotion is a separate, deliberate step.
//
// A view still loading is never written. Before each still, the script waits (--loading-wait,
// 30 s by default) for the screen to show no skeleton, no `aria-busy="true"` and no "Loading…"
// (scripts/capture-guard.mjs), and for the shot's own `ready` mark when it has one. A shot that
// does not settle in that time is refused: no PNG, and the run exits 1. So is a shot whose top bar
// says "Chat provider not answering". A fixed settle time alone is how the Store shot once shipped
// its catalog's skeleton. --settle replaces every shot's settle time;
// tests/browser/capture-guard.spec.ts uses it with a planted page.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PROVIDER_DOWN, settled, textOnScreen } from "./capture-guard.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
const outDir = argOf("out", join(repoRoot, "marketing", ".captures"));
const settleOverride = args.includes("--settle") ? Number(argOf("settle", "")) : null;
const loadingWait = Number(argOf("loading-wait", "30000"));

// path: where the view lives. settle: extra ms for animation/data to land. prep: optional
// in-page setup (open a tab, apply a filter) done through the real UI, never by URL hacking
// a state the user can't reach. ready: what the view shows once its data is in, for a view
// whose failure looks settled (the Store's "Couldn't load your Store catalog" carries no
// loading mark).
const SHOTS = [
  // The dashboard is a HASH-routed SPA (`useHashRoute`): `#/route/sub`. Path-style URLs all
  // resolve to the dashboard, which would have produced 13 copies of the same shot.
  { id: "dashboard", hash: "#/dashboard", settle: 2800 },
  { id: "inbox", hash: "#/inbox", settle: 2400 },
  {
    // `#/chat` with no sub-route is the NEW-CHAT launcher, which photographs an empty
    // prompt. The manifest wants a real multi-turn thread with a visible tool call, and
    // that lives at `#/chat/<sessionKey>`. Pass SESSION_KEY to select it.
    id: "chat",
    hash: process.env.SESSION_KEY
      ? `#/chat/${encodeURIComponent(process.env.SESSION_KEY)}`
      : "#/chat",
    settle: 3200,
    // The thread opens at its top, and the approval card the manifest asks for sits under
    // the last turn.
    scrollToEnd: true,
  },
  // Knowledge and Memory are tabs of the Library destination (0.2.4); each keeps its own address.
  { id: "knowledge", hash: "#/knowledge", settle: 2600 },
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
    // The cockpit opens on the loop's working log. The deliverable the manifest asks for (the
    // report) is a tab beside it, named after the artifact, so LOOP_TAB names it per instance.
    clickText: process.env.LOOP_TAB,
  },
  { id: "triggers", hash: "#/triggers", settle: 2400 },
  // The Store is a tab of the Capabilities destination (0.2.4), still the Apps page's store view;
  // `#/settings/apps` is the Store-sources settings. The catalog loads after the page, from the
  // Store's git sources, and a cold first fetch can outlast the Store's own 8 s wait; the shot is
  // ready once a listing's Install button shows (not "Install from URL").
  {
    id: "apps",
    hash: "#/apps?view=store",
    settle: 6000,
    ready: (page) => page.getByRole("button", { name: /^Install\b/ }).filter({ hasNotText: "URL" }).first(),
  },
  { id: "agents", hash: "#/agents", settle: 2600 },
  // Memory left Settings for Library's Memory tab in 0.2.4; `#/settings/memory` now redirects.
  {
    id: "memory",
    hash: "#/memory",
    settle: 2600,
    // The studio opens with nothing inspected. MEMORY_PICK names an entry to select, so the shot
    // shows one memory with its neighbourhood lit in the graph.
    clickText: process.env.MEMORY_PICK,
  },
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
if (process.env.PERSONALCLAW_TOKEN) {
  let signIn;
  try {
    signIn = await context.request.get(
      `${base}/?token=${encodeURIComponent(process.env.PERSONALCLAW_TOKEN)}`
    );
  } catch {
    // Playwright's error carries the call log, and the call log carries the URL with the token
    // in it, so the error is not printed: only that the gateway could not be reached.
    console.error(`Could not reach the gateway at ${base} to sign this browser in.`);
    process.exit(2);
  }
  if (!signIn.ok()) {
    console.error(`The gateway at ${base} did not sign this browser in: HTTP ${signIn.status()}`);
    process.exit(2);
  }
}
const page = await context.newPage();

const problems = [];
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console: ${msg.text().slice(0, 160)}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${String(err).slice(0, 160)}`));

let failures = 0;
const refusedShots = [];
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
    // Set the hash, then RELOAD. A same-document hash change re-renders from whatever the
    // SPA already has in memory, so a shot taken after the underlying data changed can show
    // a stale view — which is exactly how a chat capture missed two turns that were on disk.
    await page.evaluate((h) => {
      window.location.hash = h;
    }, shot.hash);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await page.waitForTimeout(settleOverride ?? shot.settle);
  // After the reload the status line says it is connecting until the gateway's socket is back;
  // a still of that moment shows a transient banner, not the view.
  await page
    .getByText("Connecting to gateway", { exact: false })
    .first()
    .waitFor({ state: "hidden", timeout: 20000 })
    .catch(() => problems.push("status line: still connecting to the gateway"));

  if (shot.clickText) {
    const target = page.getByText(shot.clickText, { exact: false }).first();
    try {
      await target.click({ timeout: 10000 });
      await page.waitForTimeout(1200);
    } catch {
      problems.push(`click: never found ${JSON.stringify(shot.clickText)}`);
    }
  }

  if (shot.scrollToEnd) {
    // The same inner-pane rule as scrollToText below: scroll every scrollable pane to its
    // end, since the window itself does not scroll.
    await page.evaluate(() => {
      for (const pane of document.querySelectorAll("*")) {
        const style = getComputedStyle(pane);
        if (/auto|scroll/.test(style.overflowY) && pane.scrollHeight > pane.clientHeight + 8) {
          pane.scrollTop = pane.scrollHeight;
        }
      }
    });
    await page.waitForTimeout(800);
  }

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

  // A public shot shows no host path and nothing of the capturing instance's own setup. A home
  // directory path is refused by pattern; anything instance-specific (an account name, a model
  // provider the site must not show) comes in through CAPTURE_FORBID as a regex, so it is never
  // written into this file. Only text inside the viewport counts, since that is all the PNG holds.
  const leaks = await page.evaluate((forbid) => {
    const patterns = [/\/(Users|home)\/[^\s/]+/];
    if (forbid) patterns.push(new RegExp(forbid, "i"));
    const hits = patterns.map(() => 0);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const matched = patterns.map((pattern) => pattern.test(text));
      if (!matched.some(Boolean) || !node.parentElement?.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const inView = [...range.getClientRects()].some(
        (rect) => rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
      );
      if (inView) matched.forEach((hit, index) => (hits[index] += hit ? 1 : 0));
    }
    return hits;
  }, process.env.CAPTURE_FORBID ?? "");
  if (leaks[0]) problems.push(`leak: a home-directory path is visible (${leaks[0]} text run(s))`);
  if (leaks[1]) problems.push(`leak: CAPTURE_FORBID matches visible text (${leaks[1]} text run(s))`);

  // Refuse a view still loading: no PNG is written for it, and the run fails.
  let refused = null;
  if (shot.ready) {
    await shot
      .ready(page)
      .waitFor({ state: "visible", timeout: loadingWait })
      .catch(() => (refused = "its data never showed (the shot's ready mark)"));
  }
  if (!refused) {
    const loading = await settled(page, loadingWait);
    if (loading.length) refused = `still loading after ${loadingWait} ms: ${loading.slice(0, 4).join(", ")}`;
  }
  // The top bar says so when chat has no model answering, on every page: start the home's model first.
  if (!refused && PROVIDER_DOWN.test(await page.evaluate(textOnScreen))) {
    refused = "the top bar says the chat provider is not answering";
  }
  if (refused) {
    console.log(`refused  ${shot.id.padEnd(20)} ${shot.hash}  ✗ ${refused}`);
    refusedShots.push(shot.id);
    continue;
  }

  const file = join(outDir, `${shot.id}.png`);
  await page.screenshot({ path: file, fullPage: false });

  const fresh = problems.slice(before);
  const note = fresh.length ? `  ⚠ ${fresh.join("; ")}` : "";
  console.log(`captured ${shot.id.padEnd(20)} ${WIDTH}x${HEIGHT}  ${shot.hash}${note}`);
  if (fresh.length) failures += 1;
}

await browser.close();

console.log(`\n${wanted.length - refusedShots.length} of ${wanted.length} shot(s) written`);
if (failures) {
  console.log(
    `${failures} view(s) logged console errors or a leak — inspect those before promoting ` +
      `them: a screenshot of a broken surface, or of the capturing machine, is worse than none.`
  );
}
console.log("Review each PNG, then promote deliberately into src/assets/.");
if (refusedShots.length) {
  console.error(
    `${refusedShots.length} shot(s) refused, still loading: ${refusedShots.join(", ")}. Nothing was ` +
      `written for them; wait for the view (or fix the gateway), then capture again.`
  );
  process.exit(1);
}
