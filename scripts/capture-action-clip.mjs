// Record one action clip for the marketing manifest: a take that does the one thing it shows (#95).
//
//   node scripts/capture-action-clip.mjs --id thread-turn --base http://127.0.0.1:10240 \
//     --token-file <path> --out <dir> [--chat <key> | --project <id> --model <ref>] [--rehearse]
//   node scripts/capture-action-clip.mjs --id app-install --base … --token-file … --out …
//   node scripts/capture-action-clip.mjs --id approve-enter --base … --token-file … --out … --chat <key>
//   node scripts/capture-action-clip.mjs --id loop-planning|loop-pause --base … --token-file … --out … --loop <id>
//
// A held clip (scripts/capture-clip.mjs) changes nothing. Each of these does the one thing its
// clip is about, on the gateway it is pointed at:
// - thread-turn sends one prompt in a chat (a new one in --project on --model, unless --chat names
//   one) and holds until the reply is done. A turn that asks for an approval is discarded.
// - app-install searches the Store for DuckDuckGo, opens its consent, holds it 2 s, installs it,
//   and holds until the app is installed. The install downloads the app.
// - approve-enter tabs to the pending edit_file approval in --chat and answers it with ⌘Enter, so
//   it is recorded last. The take is kept only once the chat's transcript records the approval
//   approved and its card is gone.
// - loop-planning presses Start on --loop and holds until its first cycle is working;
//   loop-pause presses Pause, then Resume.
// So point it only at a scratch home's gateway: it refuses an address that is not loopback, and
// core's default port 10000, where an install's own gateway listens.
//
// --rehearse walks a clip up to its action and stops there, recording nothing: the composer is
// found and nothing is typed, the Install button is found and not pressed, Tab reaches the
// approval and ⌘Enter is not pressed, Start or Pause is found and not pressed. With --rehearse,
// thread-turn without --chat opens a new chat's page rather than making one. It is how a run
// checks every flow before the takes that cost a model turn, a download or the approval.
//
// It records 1440 x 900, dark, into <out>/<id>.webm, and writes <out>/<id>.beat.json: where the
// beat starts, and each stretch of the take that showed a loading state (`loading`, [from, to]
// seconds from the first frame), to copy into the clip's `loading` in the marketing manifest.
// Every 1.5 s, and at its named points, it checks the text on screen against the deny list
// (scripts/capture-guard.mjs); a take that showed any of it is deleted. The gateway's token is read
// from --token-file, which only its owner may read, and is never printed.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { denied, loadingOnScreen, settled, textOnScreen } from "./capture-guard.mjs";

export const CLIPS = Object.freeze(["thread-turn", "app-install", "approve-enter", "loop-planning", "loop-pause"]);
const PROMPT = "Read tidetable/parse.py and tell me in two sentences what it does.";
const APP = "DuckDuckGo";
const VIEWPORT = { width: 1440, height: 900 };
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** Core's default gateway port: an install's own gateway, whose home a take would change. */
const INSTALL_PORT = "10000";

export const USAGE =
  "usage: --id <" + CLIPS.join("|") + "> --base http://127.0.0.1:<port> --token-file <path> --out <dir> [--rehearse]\n" +
  "  thread-turn: --chat <key>, or --project <id> and --model <ref>; approve-enter: --chat <key>;\n" +
  "  loop-planning and loop-pause: --loop <id>";

/** What a frame shows that no take may: the shared deny list, the same one every recorder checks. */
export const leaksIn = denied;

/**
 * The options from the command line. Throws, naming what is wrong, on an unknown clip, a missing
 * argument, or an address that is not a scratch gateway on this machine. Nothing has a default:
 * the address, the token, and where the take goes are always named.
 *
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
  };
  const options = {
    id: value("id"),
    base: value("base")?.replace(/\/$/, ""),
    tokenFile: value("token-file"),
    out: value("out"),
    chat: value("chat"),
    project: value("project"),
    model: value("model"),
    loop: value("loop"),
    rehearse: argv.includes("--rehearse")
  };
  if (!CLIPS.includes(options.id ?? "")) throw new Error(`--id has to be one of ${CLIPS.join(", ")}`);
  for (const name of ["base", "token-file", "out"]) {
    if (!value(name)) throw new Error(`--${name} is required`);
  }
  let url;
  try {
    url = new URL(options.base);
  } catch {
    throw new Error(`--base ${options.base} is not an address`);
  }
  if (url.protocol !== "http:" || !LOOPBACK.has(url.hostname)) {
    throw new Error(`--base has to be a gateway on this machine (http://127.0.0.1:<port>), not ${url.host}`);
  }
  if (url.port === INSTALL_PORT) {
    throw new Error(`--base is on port ${INSTALL_PORT}, an install's own gateway: point it at a scratch home's`);
  }
  if (options.id === "thread-turn" && !options.rehearse && !options.chat && !(options.project && options.model)) {
    throw new Error("thread-turn needs --chat, or --project and --model for a new chat");
  }
  if (options.id === "approve-enter" && !options.chat) throw new Error("approve-enter needs --chat");
  if (options.id.startsWith("loop-") && !options.loop) throw new Error(`${options.id} needs --loop`);
  return options;
}

/**
 * The gateway's sign-in token from a file only its owner may read. Throws, without the token, on
 * a file group or others can read, and on an empty one.
 *
 * @param {string} path
 */
export function readToken(path) {
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) {
    throw new Error(`${path} is readable by more than its owner (mode ${mode.toString(8)}): chmod 600 it`);
  }
  const token = readFileSync(path, "utf8").trim();
  if (!token) throw new Error(`${path} is empty`);
  return token;
}

/**
 * The approvals a chat's transcript records, from its session as the gateway serves it: each
 * `permission` row's record, `{ request_id, resolved, … }`, where `resolved` is how it was answered
 * and is absent while it waits.
 *
 * @param {{ messages?: { role?: string, cls?: unknown }[] }} session
 */
export function permissionsIn(session) {
  return (session.messages ?? [])
    .filter((m) => m.role === "permission")
    .map((m) => {
      try {
        const record = typeof m.cls === "string" ? JSON.parse(m.cls) : m.cls;
        return record && typeof record === "object" ? record : {};
      } catch {
        return {};
      }
    });
}

/**
 * Keep a take, or discard it. It is kept only with a video, a beat, no failure and nothing denied
 * on screen: the video becomes <out>/<id>.webm beside <out>/<id>.beat.json, `{ id, start,
 * loading }`. Either way the take's own folder, <out>/.take-<id>, is removed. Returns whether it
 * was kept.
 *
 * @param {{ path: string | null, failure: unknown, leaks: string[], beat: string | null, id: string, out: string, loading: number[][] }} take
 */
export function keepTake({ path, failure, leaks, beat, id, out, loading }) {
  const keep = Boolean(path) && !failure && leaks.length === 0 && beat !== null;
  if (keep) {
    renameSync(path, join(out, `${id}.webm`));
    writeFileSync(join(out, `${id}.beat.json`), `${JSON.stringify({ id, start: Number(beat), loading }, null, 2)}\n`);
  }
  rmSync(join(out, `.take-${id}`), { recursive: true, force: true });
  return keep;
}

async function main() {
  let options;
  let token;
  try {
    options = parseArgs(process.argv.slice(2));
    token = readToken(options.tokenFile);
  } catch (error) {
    console.error(String(error.message ?? error));
    console.error(USAGE);
    process.exit(2);
  }
  const { id, base, out, rehearse } = options;
  const { chromium } = await import("playwright");
  const tmp = join(out, `.take-${id}`);
  if (!rehearse) mkdirSync(tmp, { recursive: true });

  const api = async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return response.json();
  };
  const loop = async (loopId) => {
    const d = await api("GET", `/api/loops/${loopId}`);
    return d.loop ?? d;
  };
  const until = async (what, test, seconds) => {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      if (await test()) return true;
      await new Promise((r) => setTimeout(r, 750));
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
    ...(rehearse ? {} : { recordVideo: { dir: tmp, size: VIEWPORT } })
  });
  const signIn = await context.request.get(`${base}/?token=${encodeURIComponent(token)}`).catch(() => null);
  if (!signIn?.ok()) {
    // Never print the error: its call log carries the URL, and the URL carries the token.
    console.error(`The gateway at ${base} did not sign this browser in.`);
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
  const page = await context.newPage();
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000).toFixed(2);
  const leaks = [];
  const guard = async (when) => {
    const found = leaksIn(await page.evaluate(textOnScreen));
    if (found.length) {
      leaks.push(...found);
      console.log(`guard: ${found.join(", ")} on screen at ${when}`);
    }
  };
  const go = async (hash, settle) => {
    await page.goto(`${base}/${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(settle);
    await page.getByText("Connecting to gateway").first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
    const still = await settled(page, 30000);
    if (still.length) throw new Error(`still loading: ${still.join(", ")}`);
  };
  /** The control a clip acts on, once it shows; a rehearsal stops here. */
  const ready = async (locator, what) => {
    await locator.waitFor({ state: "visible", timeout: 30000 }).catch(() => {
      throw new Error(`the clip is broken: no visible ${what}`);
    });
    if (rehearse) console.log(`rehearse: ${what} is there`);
    return locator;
  };
  // A steady guard through the take, so a frame between the named checks is covered too.
  const ticker = setInterval(() => guard(`t=${at()}`).catch(() => {}), 1500);
  // Where the take shows a loading state, as [start, end] windows in seconds from the first frame,
  // for the manifest's `loading` and the compositions' cuts.
  const windows = [];
  let open = null;
  const loadTicker = setInterval(async () => {
    const found = await page.evaluate(loadingOnScreen).catch(() => null);
    if (found === null) return;
    const t = Number(at());
    if (found.length && open === null) open = [Math.max(0, t - 0.25), t, found.slice(0, 2).join(", ")];
    else if (found.length) open[1] = t;
    else if (open !== null) {
      windows.push([open[0], t, open[2]]);
      open = null;
    }
  }, 120);

  let beat = null;
  let failure = null;
  try {
    if (id === "thread-turn") {
      const chat =
        options.chat ??
        (rehearse ? null : (await api("POST", "/api/chat/sessions", { project_id: options.project, model: options.model })).key);
      if (chat) console.log(`chat ${chat}`);
      await go(chat ? `#/chat/${encodeURIComponent(chat)}` : "#/chat", 3000);
      const composer = await ready(page.getByRole("textbox", { name: "Message input" }), "composer");
      if (!rehearse) {
        await composer.click();
        await page.keyboard.type(PROMPT, { delay: 18 });
        await page.waitForTimeout(600);
        beat = at();
        await page.keyboard.press("Enter");
        await until("the turn to finish", async () => {
          const d = await api("GET", `/api/chat/sessions/${encodeURIComponent(chat)}`);
          if ((d.messages ?? []).some((m) => m.role === "permission")) throw new Error("the turn asked for approval: take discarded");
          return (d.messages ?? []).some((m) => m.role === "assistant") && d.run_state?.phase === "idle";
        }, 300);
        await page.waitForTimeout(1800);
      }
    } else if (id === "loop-planning") {
      await go(`#/loops/${encodeURIComponent(options.loop)}`, 3500);
      const start = await ready(page.getByRole("button", { name: "Start", exact: true }), "the loop's Start");
      if (!rehearse) {
        beat = at();
        await start.click();
        // The beat ends once the first cycle is working: its session has a step on the page.
        await until("the first cycle to start working", async () => {
          const d = await api("GET", `/api/chat/sessions/loop-${encodeURIComponent(options.loop)}`);
          return (d.messages ?? []).some((m) => m.role === "tool" || m.role === "assistant");
        }, 600);
        await page.waitForTimeout(5000);
      }
    } else if (id === "loop-pause") {
      await go(`#/loops/${encodeURIComponent(options.loop)}`, 3500);
      const pause = await ready(page.getByRole("button", { name: "Pause", exact: true }), "the loop's Pause");
      if (!rehearse) {
        beat = at();
        await pause.click();
        await until("paused", async () => (await loop(options.loop)).status === "paused", 60);
        await page.waitForTimeout(2000);
        await page.getByRole("button", { name: "Resume", exact: true }).click();
        await until("running again", async () => (await loop(options.loop)).status === "running", 60);
        await page.waitForTimeout(2000);
      }
    } else if (id === "app-install") {
      await go("#/apps?view=store", 6000);
      // The Store lists only apps not installed yet: an installed one shows "No matching apps".
      await page.getByPlaceholder("Search the Store").fill(APP);
      await page.waitForTimeout(1500);
      await settled(page, 30000);
      const install = await ready(
        page.getByRole("button", { name: /^Install/ }).filter({ hasNotText: "URL" }).first(),
        `${APP}'s Install`
      );
      if (!rehearse) {
        beat = at();
        await install.click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ timeout: 30000 });
        // The dialog opens on its own check ("Checking DuckDuckGo and what it gets"), which carries no
        // loading mark: wait for the consent itself, then let it be read before the click.
        await dialog.getByText("Permissions the gateway enforces").waitFor({ timeout: 60000 });
        await settled(page, 30000);
        await page.waitForTimeout(2000);
        await guard("consent dialog");
        await dialog.getByRole("button", { name: /install|allow|confirm|continue/i }).last().click();
        await until("the app installed", async () => {
          const apps = await api("GET", "/api/apps");
          return (apps.apps ?? apps).some((a) => new RegExp(APP, "i").test(a.name ?? ""));
        }, 240);
        // The Store re-reads its list after an install: hold long enough for a clean 2 s after it.
        await page.waitForTimeout(4500);
      }
    } else if (id === "approve-enter") {
      await go(`#/chat/${encodeURIComponent(options.chat)}`, 3500);
      const card = await ready(page.getByRole("group", { name: /Permission needed to run edit_file/ }), "edit_file's approval");
      // The transcript's own record of it: the take is kept only once that record says it was answered.
      const waiting = async () =>
        permissionsIn(await api("GET", `/api/chat/sessions/${encodeURIComponent(options.chat)}`));
      const pending = (await waiting()).filter((p) => p.request_id && !p.resolved).at(-1);
      if (!pending) throw new Error("the chat's transcript records no approval waiting");
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      if (!rehearse) beat = at();
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(110);
        if (await card.evaluate((el) => el.contains(document.activeElement))) break;
      }
      if (!(await card.evaluate((el) => el.contains(document.activeElement)))) throw new Error("Tab never reached the approval card");
      if (rehearse) console.log("rehearse: Tab reaches the approval");
      else {
        await page.waitForTimeout(700);
        await page.keyboard.press("Meta+Enter");
        const answered = async () => (await waiting()).find((p) => p.request_id === pending.request_id)?.resolved;
        await until("the approval's answer", async () => Boolean(await answered()), 30).catch(() => {
          throw new Error("⌘Enter did not answer the approval: its record still waits");
        });
        const how = await answered();
        if (how !== "approved") throw new Error(`⌘Enter answered the approval "${how}", not "approved"`);
        await card.waitFor({ state: "detached", timeout: 30000 }).catch(() => {
          throw new Error("⌘Enter did not answer the approval: its card is still there");
        });
        await page.waitForTimeout(2500);
      }
    }
    await guard("end");
  } catch (error) {
    failure = error;
  }
  clearInterval(ticker);
  clearInterval(loadTicker);
  if (open !== null) windows.push([open[0], Number(at()), open[2]]);
  const loading = windows.map(([a, b]) => [Number(a.toFixed(2)), Number(b.toFixed(2))]);
  console.log(`loading windows: ${JSON.stringify(windows.map(([a, b, what]) => [Number(a.toFixed(2)), Number(b.toFixed(2)), what]))}`);
  const video = page.video();
  await context.close();
  await browser.close();
  if (rehearse) {
    if (failure || leaks.length) {
      console.error(failure ? String(failure.message ?? failure) : `it showed ${leaks.join(", ")}`);
      console.error(`The ${id} rehearsal failed.`);
      process.exit(1);
    }
    console.log(`Rehearsed ${id}: it reaches its action. Nothing was done or recorded.`);
    return;
  }
  const path = video ? await video.path() : null;
  if (keepTake({ path, failure, leaks, beat, id, out, loading })) {
    console.log(`Recorded ${join(out, `${id}.webm`)}; its beat starts at ${beat} s. Review every frame.`);
  } else {
    if (failure) console.error(String(failure.message ?? failure));
    console.error(`The take is discarded (${leaks.length ? `it showed ${leaks.join(", ")}` : failure ? "it failed" : "no beat"}); nothing was kept.`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
