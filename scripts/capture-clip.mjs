// Record one held clip for the marketing manifest from a released, already-seeded gateway (#95).
//
//   node scripts/capture-clip.mjs --id home-lanes --hash '#/dashboard' --seconds 4 \
//     --base http://127.0.0.1:10200 --token-file <path> [--scroll-to 'Needs your OK']
//
// A held clip shows one view, still, for its beat: the gateway's own screen with the work it
// already holds, the cursor off-screen. It reads and writes nothing else: no turn, no answer, no
// setting. A clip that needs an action (a chat turn, a key press, an install) is recorded by hand
// by whoever owns the home it changes. It records 1440 x 900, dark, with 1.5 s before and after
// the beat, into marketing/.captures/clips/<id>.webm, and writes <id>.beat.json with where the
// beat starts. Before and after the hold it checks the text on screen against the deny list
// (scripts/capture-guard.mjs) and deletes the take when any of it shows. A view still loading is
// refused the same way: the hold waits up to 30 s for no skeleton, `aria-busy` or "Loading…" on
// screen, and the take is deleted if one is there before or after it.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { denied, loadingOnScreen, settled, textOnScreen } from "./capture-guard.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, "marketing", ".captures", "clips");
const VIEWPORT = { width: 1440, height: 900 };
const LEAD = 1.5;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const id = argOf("id", "");
const hash = argOf("hash", "");
const seconds = Number(argOf("seconds", "4"));
const scrollTo = argOf("scroll-to", "");
const base = argOf("base", "http://127.0.0.1:10200").replace(/\/$/, "");
const tokenFile = argOf("token-file", "");
if (!/^[a-z0-9-]+$/.test(id) || !hash.startsWith("#/") || !(seconds > 0)) {
  console.error("usage: --id <clip-id> --hash '#/route' --seconds <n> [--scroll-to <text>] [--token-file <path>]");
  process.exit(2);
}
const TOKEN = tokenFile ? readFileSync(tokenFile, "utf8").trim() : process.env.PERSONALCLAW_TOKEN;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: "dark",
  recordVideo: { dir: outDir, size: VIEWPORT }
});
if (TOKEN) {
  const signIn = await context.request.get(`${base}/?token=${encodeURIComponent(TOKEN)}`).catch(() => null);
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
const page = await context.newPage();
const recording = Date.now();
let failure = null;
let start = 0;
try {
  await page.goto(`${base}/${hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("Connecting to gateway", { exact: false }).first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (scrollTo) {
    const target = page.getByText(scrollTo, { exact: false }).last();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
  }
  const check = async (when) => {
    const found = denied(await page.evaluate(textOnScreen));
    if (found.length) throw new Error(`${id} shows ${found.join(", ")} ${when}: fix the home, then record again`);
    const loading = await page.evaluate(loadingOnScreen);
    if (loading.length) throw new Error(`${id} is still loading ${when} (${loading.slice(0, 4).join(", ")}): record again`);
  };
  const loading = await settled(page, 30000);
  if (loading.length) throw new Error(`${id} never finished loading (${loading.slice(0, 4).join(", ")}): record again`);
  await check("before its hold");
  await page.waitForTimeout(LEAD * 1000);
  start = Number(((Date.now() - recording) / 1000).toFixed(2));
  await page.waitForTimeout((seconds + LEAD) * 1000);
  await check("after its hold");
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
renameSync(await video.path(), join(outDir, `${id}.webm`));
writeFileSync(join(outDir, `${id}.beat.json`), `${JSON.stringify({ id, base, hash, start, seconds }, null, 2)}\n`);
console.log(`Recorded marketing/.captures/clips/${id}.webm; its beat starts at ${start} s. Review every frame.`);
