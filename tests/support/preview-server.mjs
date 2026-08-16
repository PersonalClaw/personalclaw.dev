// Preview server lifecycle for the Playwright run.
//
// Playwright's own `webServer` option cannot be used here. It watches the process it
// spawns and aborts the whole run the moment that process exits, but `astro preview`
// (7.2.0, on macOS) spawns a detached daemon and returns immediately, so Playwright
// reports `Process from config.webServer exited early` while the server is up and
// answering 200. See issue #25.
//
// So we own the lifecycle instead: start it, prove the URL is live, prove it is serving
// the build that is on disk right now, and stop it afterwards. That is correct whether
// astro daemonises or stays in the foreground, which is the reason this does not simply
// pass a different flag and hope.

import { spawn, execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOST = "127.0.0.1";
const PORT = 4321;

export const BASE_URL = `http://${HOST}:${PORT}`;

const ASTRO_BIN = join(process.cwd(), "node_modules", ".bin", "astro");
const DIST_INDEX = join(process.cwd(), "dist", "index.html");
// Keyed by port: only one server can hold it, so two worktrees cannot disagree here.
const PID_FILE = join(tmpdir(), `personalclaw-dev-preview-${PORT}.pid`);

const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const STOP_TIMEOUT_MS = 15_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A hashed asset reference is the cheapest proof of freshness we have: the hash changes
// on every build, so a server left over from an earlier build cannot echo the current
// one back. Absence is a hard failure rather than a skipped check — a freshness assertion
// that silently matches nothing is worse than no assertion, because it reads as green.
function currentBuildMarker() {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(
      `No build to serve: ${DIST_INDEX} does not exist. Run \`npm run build\` before the browser suite.`,
    );
  }
  const html = readFileSync(DIST_INDEX, "utf8");
  const marker = html.match(/\/_astro\/[A-Za-z0-9._-]+\.(?:js|css)/)?.[0];
  if (!marker) {
    throw new Error(
      `Expected a hashed /_astro/ asset reference in ${DIST_INDEX} to fingerprint the build, and found none. ` +
        `If the site legitimately stopped emitting hashed assets, this freshness check needs a new marker — ` +
        `do not delete it, or a stale preview server will pass the suite against the wrong bytes.`,
    );
  }
  return marker;
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function waitForServedBuild(marker) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastBody = null;
  while (Date.now() < deadline) {
    lastBody = await fetchText(`${BASE_URL}/`);
    if (lastBody?.includes(marker)) return;
    await sleep(POLL_INTERVAL_MS);
  }
  if (lastBody === null) {
    throw new Error(
      `Preview server never answered on ${BASE_URL} within ${READY_TIMEOUT_MS / 1000}s.`,
    );
  }
  throw new Error(
    `Preview server on ${BASE_URL} is serving a different build than dist/ on disk ` +
      `(expected asset ${marker}). A server left running from an earlier build was reused. ` +
      `Stop it with \`npx astro preview stop\` and re-run.`,
  );
}

// Best effort: astro owns the daemon, so ask astro to stop it. Bounded because a hung
// stop must not become a hung test run.
async function astroPreviewStop() {
  if (!existsSync(ASTRO_BIN)) return;
  try {
    await execFileAsync(ASTRO_BIN, ["preview", "stop"], { timeout: STOP_TIMEOUT_MS });
  } catch {
    // Nothing running, or astro declined. The pid kill below is the other half.
  }
}

// The other half: if astro ever stays in the foreground, the process we spawned IS the
// server and `astro preview stop` knows nothing about it.
async function killTrackedProcess() {
  let pid = null;
  try {
    pid = Number.parseInt(await readFile(PID_FILE, "utf8"), 10);
  } catch {
    return;
  }
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {
      // Already gone, which is the common case when astro daemonised.
    }
  }
  await rm(PID_FILE, { force: true });
}

export async function stopPreview() {
  await astroPreviewStop();
  await killTrackedProcess();
}

export async function startPreview() {
  const marker = currentBuildMarker();

  // Stop first, always. Starting on top of a server from an earlier build is the exact
  // failure this module exists to prevent, and it cannot be detected after the fact.
  await stopPreview();

  const child = spawn(ASTRO_BIN, ["preview", "--host", HOST, "--port", String(PORT)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  child.unref();
  if (child.pid) await writeFile(PID_FILE, String(child.pid), "utf8");

  try {
    await waitForServedBuild(marker);
  } catch (error) {
    await stopPreview();
    throw error;
  }
}
