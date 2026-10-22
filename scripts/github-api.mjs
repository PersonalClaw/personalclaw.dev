// The build's reads from api.github.com, kept on disk so a repeat local build spends little of the
// unauthenticated quota (60 requests an hour per address, shared by everything on the machine; the
// build and its hooks never carry a token). A spent quota answers 403, and the pre-push gate then
// refuses the push for a reason that has nothing to do with the change.
//
// Two kinds of answer are kept, and neither can go stale:
// - A commit, tree or tag object named by its 40-hex sha. GitHub never changes what such a URL
//   returns, so after the first read it is served from .cache/github-api/ with no request at all.
// - Within one run of the local gate, a live URL (a tag ref, refs/tags, a branch head). The gate
//   syncs the sources three times and checks the same tags each time; scripts/run-ci-gates.mjs
//   names a folder for the run alone in GITHUB_API_RUN_DIR, each live URL is read once and its
//   answer reused by the run's later steps, and the folder is deleted when the run ends. The next
//   run reads them again, so a moved tag is seen by the next build, as before.
// A conditional request would not help: GitHub counts an unauthenticated 304 against the quota
// (measured 2026-10-22: 59, 58, 57 for one 200 and two 304s). An error is never answered from a
// cache; it fails as it did before.
//
// CI and deploy builds (CI or VERCEL set) neither read nor write either cache, so they behave
// exactly as they did: every request goes to GitHub.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.resolve(process.env.GITHUB_API_CACHE_DIR ?? path.join(".cache", "github-api"));

/** A commit, tree or tag object addressed by its full sha: its response never changes. */
const CONTENT_ADDRESSED =
  /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/(?:commits|git\/commits|git\/trees|git\/tags)\/[0-9a-f]{40}(?:\?recursive=1)?$/;

/** The folder for content-addressed answers (a run's folder lives inside it). */
export const GITHUB_API_CACHE_DIR = CACHE_DIR;

/** Whether this process may use the on-disk cache: never in CI or a deploy build. */
export function cacheEnabled(env = process.env) {
  return !env.CI && !env.VERCEL;
}

/** Whether a URL's response can be kept for good. */
export function isContentAddressed(url) {
  return CONTENT_ADDRESSED.test(url);
}

function cachePath(directory, url) {
  return path.join(directory, `${createHash("sha256").update(url).digest("hex")}.json`);
}

async function readCached(directory, url) {
  try {
    const entry = JSON.parse(await readFile(cachePath(directory, url), "utf8"));
    return entry.url === url ? entry.body : undefined;
  } catch {
    return undefined;
  }
}

async function writeCached(directory, url, body) {
  const target = cachePath(directory, url);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ url, body })}\n`);
  await rename(temporary, target);
}

/**
 * GET a GitHub API URL as JSON. A failed response throws an Error whose message names the status
 * and the URL, with `status` set, as each caller's own helper did.
 *
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [options]
 */
export async function githubJson(url, headers, { env = process.env, fetchImpl = fetch } = {}) {
  const directory = !cacheEnabled(env)
    ? undefined
    : isContentAddressed(url)
      ? CACHE_DIR
      : env.GITHUB_API_RUN_DIR || undefined;
  if (directory) {
    const cached = await readCached(directory, url);
    if (cached !== undefined) return cached;
  }

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const error = new Error(`GitHub request failed (${response.status}) for ${url}`);
    /** @type {Error & { status?: number }} */ (error).status = response.status;
    throw error;
  }
  const body = await response.json();
  if (directory) await writeCached(directory, url, body);
  return body;
}
