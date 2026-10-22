import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

// scripts/github-api.mjs keeps only content-addressed GitHub API answers, only outside CI, and never
// answers an error from its cache. Each test counts the requests a fake fetch receives.
const cacheDir = mkdtempSync(path.join(tmpdir(), "github-api-cache-"));
process.env.GITHUB_API_CACHE_DIR = cacheDir;
const { githubJson, isContentAddressed, cacheEnabled } = await import("../scripts/github-api.mjs");
after(() => rmSync(cacheDir, { recursive: true, force: true }));

const SHA = "2ba0fb86a138f77d9284f89f86e58882d104e823";
const local = { HOME: "/home/someone" };

function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return respond(url);
  };
  return { calls, fetchImpl };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const refused = (status) => ({ ok: false, status, json: async () => ({ message: "rate limited" }) });

test("a commit, tree or tag object named by its sha is content-addressed; refs and heads are not", () => {
  const repo = "https://api.github.com/repos/PersonalClaw/PersonalClaw";
  assert.equal(isContentAddressed(`${repo}/commits/${SHA}`), true);
  assert.equal(isContentAddressed(`${repo}/git/trees/${SHA}?recursive=1`), true);
  assert.equal(isContentAddressed(`${repo}/git/tags/${SHA}`), true);
  assert.equal(isContentAddressed(`${repo}/commits/HEAD`), false);
  assert.equal(isContentAddressed(`${repo}/git/ref/tags/v0.2.4`), false);
  assert.equal(isContentAddressed(`${repo}/git/refs/tags`), false);
  assert.equal(isContentAddressed(`${repo}/commits/${SHA.slice(0, 12)}`), false);
  assert.equal(isContentAddressed(`${repo}/releases?per_page=30`), false);
});

test("a content-addressed answer is read once, then served from disk", async () => {
  const url = `https://api.github.com/repos/PersonalClaw/PersonalClaw/git/tags/${SHA}`;
  const { calls, fetchImpl } = fakeFetch(() => ok({ object: { type: "commit", sha: SHA } }));
  const first = await githubJson(url, {}, { env: local, fetchImpl });
  const second = await githubJson(url, {}, { env: local, fetchImpl });
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
});

test("a tag ref is read live every time, so a moved tag is seen on the next build", async () => {
  const url = "https://api.github.com/repos/PersonalClaw/PersonalClaw/git/ref/tags/v0.2.4";
  let sha = SHA;
  const { calls, fetchImpl } = fakeFetch(() => ok({ object: { type: "commit", sha } }));
  await githubJson(url, {}, { env: local, fetchImpl });
  sha = "f".repeat(40);
  const moved = await githubJson(url, {}, { env: local, fetchImpl });
  assert.equal(moved.object.sha, sha);
  assert.equal(calls.length, 2);
});

test("CI and deploy builds neither read nor write the cache", async () => {
  assert.equal(cacheEnabled({ CI: "true" }), false);
  assert.equal(cacheEnabled({ VERCEL: "1" }), false);
  assert.equal(cacheEnabled(local), true);
  const url = `https://api.github.com/repos/PersonalClaw/PersonalClawApps/commits/${"a".repeat(40)}`;
  const before = readdirSync(cacheDir).length;
  const { calls, fetchImpl } = fakeFetch(() => ok({ sha: "a".repeat(40) }));
  await githubJson(url, {}, { env: { CI: "true" }, fetchImpl });
  await githubJson(url, {}, { env: { CI: "true" }, fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(readdirSync(cacheDir).length, before);
});

test("an error is thrown with its status and is never answered or kept by the cache", async () => {
  const url = `https://api.github.com/repos/PersonalClaw/PersonalClaw/git/trees/${"b".repeat(40)}?recursive=1`;
  const { calls, fetchImpl } = fakeFetch(() => refused(403));
  await assert.rejects(githubJson(url, {}, { env: local, fetchImpl }), (error) => {
    assert.equal(error.status, 403);
    assert.match(error.message, /GitHub request failed \(403\) for /);
    return true;
  });
  await assert.rejects(githubJson(url, {}, { env: local, fetchImpl }));
  assert.equal(calls.length, 2);
});

test("within one gate run, a live URL is read once; the next run reads it again", async () => {
  const url = "https://api.github.com/repos/PersonalClaw/PersonalClawApps/git/ref/tags/v0.2.2";
  const { calls, fetchImpl } = fakeFetch(() => ok({ object: { type: "commit", sha: SHA } }));
  const firstRun = { ...local, GITHUB_API_RUN_DIR: path.join(cacheDir, "run-one") };
  await githubJson(url, {}, { env: firstRun, fetchImpl });
  await githubJson(url, {}, { env: firstRun, fetchImpl });
  assert.equal(calls.length, 1);
  await githubJson(url, {}, { env: { ...local, GITHUB_API_RUN_DIR: path.join(cacheDir, "run-two") }, fetchImpl });
  assert.equal(calls.length, 2);
  // CI ignores a run folder too.
  await githubJson(url, {}, { env: { ...firstRun, CI: "1" }, fetchImpl });
  assert.equal(calls.length, 3);
});
