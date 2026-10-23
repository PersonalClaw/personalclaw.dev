// Record the product tour's clip (#96) from a released, already-seeded gateway.
//
//   SESSION_KEY=… LOOP_ID=… KNOWLEDGE_QUERY=… ARTIFACT_NAME=… \
//     node scripts/capture-tour.mjs --base http://127.0.0.1:10200 --token-file <path>
//
// It plays core's demo click-path (docs/demo/CLICKPATH.md at the pinned tag) through the
// release's own UI, one beat at a time at the path's per-beat budget, and records it silently
// at 1440 x 810 with Playwright's screencast: Home, a chat, the approval it waits on, a goal
// loop, Knowledge narrowed by a search, an artifact, and back to Home. It reads what the home
// already holds and writes nothing: it never sends a message and never answers an approval
// (it shows the card and its chips), so a take costs no model call and changes no state.
// Typing into a search box is the one input.
//
// It writes marketing/.captures/clips/tour.webm and tour.beats.json beside it: where each beat
// starts in the recording, which the tour's composition takes as each beat's data-media-start
// (marketing/compositions/tour/index.html). The gateway's sign-in token is read from
// --token-file (or PERSONALCLAW_TOKEN) and never printed.
//
// Twice in every beat it reads the text on screen, inside the viewport and inside every pane that
// clips it, and fails the take when that text shows a host path, the account name, the capture
// home's own folders, the model provider or anything shaped like a key. A failed take's video is
// deleted, so a frame that leaks one is never kept. Review every frame before it is used anyway.
//
// The synthetic pointer, the glide and the beat runner follow core's docs/demo/capture_demo.mjs
// (MIT), since Playwright's screencast draws no cursor.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { denied, textOnScreen } from "./capture-guard.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, "marketing", ".captures", "clips");
const VIEWPORT = { width: 1440, height: 810 };

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = argOf("base", "http://127.0.0.1:10200").replace(/\/$/, "");
const need = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set: the tour reads a ${name.toLowerCase().replace("_", " ")} the home already holds.`);
    process.exit(2);
  }
  return value;
};
const SESSION_KEY = need("SESSION_KEY");
const LOOP_ID = need("LOOP_ID");
const KNOWLEDGE_QUERY = need("KNOWLEDGE_QUERY");
const ARTIFACT_NAME = need("ARTIFACT_NAME");
const CHAT_PROMPT = need("CHAT_PROMPT");
const LOOP_REPORT = process.env.LOOP_REPORT || "report";
const tokenFile = argOf("token-file", "");
const TOKEN = tokenFile ? readFileSync(tokenFile, "utf8").trim() : process.env.PERSONALCLAW_TOKEN;

// ── the synthetic pointer (after core's capture_demo.mjs) ─────────────────────
function installCursor() {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  function mount() {
    const style = document.createElement("style");
    style.textContent = `
      #pc-tour-cursor{position:fixed;left:-40px;top:-40px;width:15px;height:15px;border-radius:50%;
        pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);
        background:radial-gradient(circle at 34% 32%,#fff,#e3e3e3 58%,rgba(227,227,227,.35) 72%,rgba(227,227,227,0) 74%);
        box-shadow:0 1px 6px rgba(0,0,0,.55),0 0 0 1px rgba(15,15,15,.55)}
      .pc-tour-ripple{position:fixed;width:16px;height:16px;border-radius:50%;pointer-events:none;
        z-index:2147483646;transform:translate(-50%,-50%);border:2px solid #ff6b5b;
        animation:pc-tour-ripple 520ms cubic-bezier(.16,.84,.44,1) forwards}
      @keyframes pc-tour-ripple{from{opacity:.9;width:14px;height:14px}to{opacity:0;width:64px;height:64px}}`;
    document.documentElement.appendChild(style);
    const dot = document.createElement("div");
    dot.id = "pc-tour-cursor";
    document.documentElement.appendChild(dot);
    addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    }, true);
    addEventListener("mousedown", (e) => {
      const ripple = document.createElement("div");
      ripple.className = "pc-tour-ripple";
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.documentElement.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);
  }
}

let page;
const dwell = (ms) => page.waitForTimeout(ms);
const nav = (label) => page.locator("nav").getByRole("button", { name: label, exact: true }).first();

async function firstVisible(locator, what, ms = 8000) {
  const deadline = Date.now() + ms;
  do {
    for (const candidate of await locator.all()) {
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await page.waitForTimeout(200);
  } while (Date.now() < deadline);
  throw new Error(`the tour is broken: no visible ${what}`);
}

/** Move the real mouse to an element in visible steps. */
async function glide(locator, what, { xFrac = 0.5, yFrac = 0.5 } = {}) {
  const element = await firstVisible(locator, what);
  await element.scrollIntoViewIfNeeded();
  await page.waitForTimeout(140);
  const box = await element.boundingBox();
  if (!box) throw new Error(`the tour is broken: ${what} has no box`);
  await page.mouse.move(box.x + box.width * xFrac, box.y + box.height * yFrac, { steps: 26 });
  await page.waitForTimeout(180);
}

async function tap(locator, what, options) {
  await glide(locator, what, options);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(450);
}

/** Open a hash route the way a link does, and wait for the gateway's socket to settle. */
async function route(hash, settle = 1600) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(settle);
}

/** Fail the take if the screen shows anything the deny list names (scripts/capture-guard.mjs). */
async function guard(beat) {
  const found = denied(await page.evaluate(textOnScreen));
  if (found.length) throw new Error(`the ${beat} beat shows ${found.join(", ")}: fix the home, then record again`);
}

// The click-path's beats, at its per-beat budgets (CLICKPATH.md: 9, 14, 18, 14, 12, 12, 4 s).
const BEATS = [
  {
    id: "home",
    seconds: 9,
    act: async () => {
      await dwell(1500);
      await glide(page.getByText(/needs you/i), "Home's needs-you list");
      await dwell(1800);
      await glide(page.getByText(/running|finished/i), "Home's running and finished work");
    }
  },
  {
    id: "chat",
    seconds: 14,
    act: async () => {
      await route(`#/chat/${encodeURIComponent(SESSION_KEY)}`, 2200);
      await glide(page.locator("main p, main div").filter({ hasText: CHAT_PROMPT }).last(), "the prompt sent");
      await dwell(1600);
      await glide(page.getByRole("button", { name: /^Tool / }).first(), "a tool row");
      await dwell(1200);
      await glide(page.getByRole("button", { name: /^Tool / }).last(), "the last tool row");
    }
  },
  {
    id: "approval",
    seconds: 18,
    act: async () => {
      // The approval waits in this chat; the take shows it and never answers it.
      await glide(page.getByRole("button", { name: /^Show all of what .* would run/ }), "the approval card");
      await dwell(2500);
      await glide(page.getByText("Just this once", { exact: true }), "how far the answer is remembered");
      await dwell(1500);
      await glide(page.getByText("This chat", { exact: true }), "the wider scopes");
    }
  },
  {
    id: "loops",
    seconds: 14,
    act: async () => {
      // The cockpit opens on its Deliverable tab, which no address can skip, so the switch to the
      // report happens under a dark mask: the take never shows the Deliverable, and the
      // composition's cut starts after the mask lifts (the beat's `shown` time).
      await page.evaluate(() => {
        const mask = document.createElement("div");
        mask.id = "pc-tour-mask";
        mask.style.cssText = "position:fixed;inset:0;background:#121416;z-index:2147483645";
        document.documentElement.appendChild(mask);
      });
      await route(`#/loops/${encodeURIComponent(LOOP_ID)}`, 2200);
      // A DOM click: the mask is on top, so a pointer click would land on it.
      await page.getByRole("tab", { name: new RegExp(LOOP_REPORT, "i") }).first().evaluate((tab) => tab.click());
      await dwell(900);
      await page.evaluate(() => document.getElementById("pc-tour-mask")?.remove());
      shown.loops = Number(((Date.now() - recording) / 1000).toFixed(2));
      await guard("loops");
      await glide(page.getByText(/goal|prompt/i), "the loop's goal");
      await dwell(1500);
      await glide(page.getByRole("tab", { name: new RegExp(LOOP_REPORT, "i") }), "the loop's report");
      await dwell(1200);
    }
  },
  {
    id: "knowledge",
    seconds: 12,
    act: async () => {
      await tap(nav("Library"), "Library in the rail");
      await dwell(1200);
      const search = await firstVisible(page.getByLabel("Search knowledge"), "Knowledge's search");
      await tap(search, "Knowledge's search");
      await page.keyboard.type(KNOWLEDGE_QUERY, { delay: 160 });
    }
  },
  {
    id: "artifacts",
    seconds: 12,
    act: async () => {
      await route("#/artifacts", 2000);
      await tap(page.getByText(ARTIFACT_NAME, { exact: false }), `the "${ARTIFACT_NAME}" artifacts`);
      await dwell(1500);
    }
  },
  {
    id: "close",
    seconds: 4,
    act: async () => {
      await tap(nav("Home"), "Home in the rail");
    }
  }
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "no-preference",
  recordVideo: { dir: outDir, size: VIEWPORT }
});
if (TOKEN) {
  const signIn = await context.request
    .get(`${base}/?token=${encodeURIComponent(TOKEN)}`)
    .catch(() => null);
  if (!signIn?.ok()) {
    // Never print the error: its call log carries the URL, and the URL carries the token.
    console.error(`The gateway at ${base} did not sign this browser in.`);
    process.exit(2);
  }
}
await context.addInitScript(() => {
  localStorage.setItem("mode", "dark");
  document.documentElement.setAttribute("data-mode", "dark");
});
await context.addInitScript(installCursor);

page = await context.newPage();
const recording = Date.now();
const starts = {};
/** Where a beat that opens under a mask is first shown, when that is after its start. */
const shown = {};
let failure = null;
try {
  await page.goto(`${base}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("Connecting to gateway", { exact: false }).first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  await dwell(1000);
  for (const beat of BEATS) {
    const t0 = Date.now();
    starts[beat.id] = Number(((t0 - recording) / 1000).toFixed(2));
    await beat.act();
    await guard(beat.id);
    const rest = beat.seconds * 1000 - (Date.now() - t0);
    if (rest > 0) await dwell(rest);
    else console.warn(`! ${beat.id} overran its ${beat.seconds} s by ${-rest} ms`);
    await guard(beat.id);
    console.log(`${beat.id.padEnd(10)} starts at ${starts[beat.id]} s`);
  }
} catch (error) {
  failure = error;
}
const video = page.video();
await context.close();
await browser.close();

if (failure) {
  console.error(String(failure.message ?? failure));
  rmSync(await video.path(), { force: true });
  console.error("The take is discarded; nothing was kept.");
  process.exit(1);
}
const webm = join(outDir, "tour.webm");
renameSync(await video.path(), webm);
writeFileSync(join(outDir, "tour.beats.json"), `${JSON.stringify({ base, starts, shown }, null, 2)}\n`);
console.log(`Recorded ${webm} and tour.beats.json. Review every frame before the composition uses it.`);
