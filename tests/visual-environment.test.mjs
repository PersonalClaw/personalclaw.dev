// The visual environment: baselines are compared only inside one Playwright image, pinned
// by digest and architecture (tests/browser/visual-image.json), and each baseline set
// records the environment it was made in. Each rule below plants its violation; the last
// tests read the committed tree.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { COMPARED, MANIFEST, compareEnvironment, dockerArgs, main } from "../scripts/run-visual.mjs";
import { checkBaselines, expectedBaselines } from "../scripts/validate-visual-baselines.mjs";
import { PIN_FILE, checkPin, readPin, tagReferences, scannedFiles } from "./support/visual-image.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIGEST = `sha256:${"b".repeat(64)}`;
const PIN = {
  image: `mcr.microsoft.com/playwright@${DIGEST}`,
  platform: "linux/amd64",
  playwright: "1.64.0",
  tag: "v1.64.0-noble",
  index: `sha256:${"c".repeat(64)}`,
};
const LOCK = {
  packages: {
    "node_modules/@playwright/test": { version: "1.64.0" },
    "node_modules/playwright": { version: "1.64.0" },
    "node_modules/playwright-core": { version: "1.64.0" },
  },
};
const ENVIRONMENT = {
  image: PIN.image,
  platform: "linux/amd64",
  playwright: "1.64.0",
  browser: "chromium 140.0.7339.16",
  renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
  fonts: { count: 42, sha256: "d".repeat(64) },
};

// ── the baselines: one linux set, nothing else ───────────────────────────────────

const REFRESH = "npm run build && node scripts/run-visual.mjs --update-snapshots=all";
const FULL = [...expectedBaselines()].sort();

test("the baseline set is linux only: 15 files, one per route and viewport plus the states", () => {
  assert.equal(FULL.length, 15);
  assert.ok(FULL.every((name) => name.endsWith("-linux.png")));
  assert.deepEqual(checkBaselines(FULL, REFRESH), []);
});

const baselinePlants = [
  ["a stray -darwin baseline", [...FULL, "home-page-desktop-darwin.png"], REFRESH, /Unexpected visual baselines:\n- home-page-desktop-darwin\.png/],
  ["a missing linux baseline", FULL.filter((name) => name !== "home-page-mobile-linux.png"), REFRESH, /Missing visual baselines:\n- home-page-mobile-linux\.png/],
  ["a refresh that only rewrites failed snapshots", FULL, "npm run build && node scripts/run-visual.mjs --update-snapshots", /must pass --update-snapshots=all/],
  ["a refresh that does not run in the image", FULL, "npm run build && playwright test --update-snapshots=all", /must run through scripts\/run-visual\.mjs/],
];

for (const [why, names, refresh, message] of baselinePlants) {
  test(`the baseline check fails on ${why}`, () => {
    const problems = checkBaselines(names, refresh);
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], message);
  });
}

// ── the pin: digest, architecture, and the lock's Playwright ─────────────────────

test("the planted pin holds", () => {
  assert.deepEqual(checkPin(PIN, LOCK), []);
});

const pinPlants = [
  ["an image named by tag", { ...PIN, image: "mcr.microsoft.com/playwright:v1.64.0-noble" }, LOCK, /image must be mcr\.microsoft\.com\/playwright@sha256:<digest>/],
  ["an image from another repository", { ...PIN, image: `docker.io/library/node@${DIGEST}` }, LOCK, /image must be mcr\.microsoft\.com\/playwright@sha256/],
  ["an arm64 pin", { ...PIN, platform: "linux/arm64" }, LOCK, /platform must be linux\/amd64, the CI runners' platform/],
  ["a pin whose Playwright differs from the lock", { ...PIN, playwright: "1.63.0" }, LOCK, /pins Playwright 1\.63\.0, but the lock has @playwright\/test 1\.64\.0/],
  ["a lock whose playwright-core moved alone", PIN, { packages: { ...LOCK.packages, "node_modules/playwright-core": { version: "1.65.0" } } }, /the lock has playwright-core 1\.65\.0/],
  ["a pin with no tag it was read from", { ...PIN, tag: "" }, LOCK, /tag must name the release tag the digest was read from/],
  ["a tag for another Playwright", { ...PIN, tag: "v1.63.0-noble" }, LOCK, /tag v1\.63\.0-noble is not Playwright 1\.64\.0/],
  ["a pin with no index digest", { ...PIN, index: "latest" }, LOCK, /index must be the tag's sha256 index digest/],
];

for (const [why, pin, lock, message] of pinPlants) {
  test(`the pin check fails on ${why}`, () => {
    const problems = checkPin(pin, lock);
    assert.ok(problems.length >= 1, "no problem reported");
    assert.ok(problems.some((problem) => message.test(problem)), problems.join("\n"));
  });
}

test("a file that names the image by tag fails the pin check", () => {
  const found = tagReferences({
    ".github/workflows/ci.yml": "      - run: docker run mcr.microsoft.com/playwright:v1.64.0-noble npx playwright test\n",
    "scripts/other.mjs": `const image = "mcr.microsoft.com/playwright@${DIGEST}";\n`,
  });
  assert.deepEqual(found, ['.github/workflows/ci.yml:1 names mcr.microsoft.com/playwright:v1.64.0-noble; use the digest in tests/browser/visual-image.json']);
});

// ── the environment manifest ─────────────────────────────────────────────────────

test("an identical environment matches the committed manifest", () => {
  assert.deepEqual(compareEnvironment(ENVIRONMENT, structuredClone(ENVIRONMENT), PIN), []);
  assert.deepEqual(COMPARED, ["image", "platform", "playwright", "browser", "renderer", "fonts"]);
});

const environmentPlants = [
  ["another browser build", { browser: "chromium 141.0.0.0" }, /browser: the baselines were made with "chromium 140\.0\.7339\.16", this run has "chromium 141\.0\.0\.0"/],
  ["another renderer", { renderer: "ANGLE (Intel)" }, /renderer: the baselines were made with/],
  ["other fonts", { fonts: { count: 43, sha256: "e".repeat(64) } }, /fonts: the baselines were made with/],
  ["another image", { image: `mcr.microsoft.com/playwright@sha256:${"f".repeat(64)}` }, /image: the baselines were made with/],
  ["another platform", { platform: "linux/arm64" }, /platform: the baselines were made with "linux\/amd64"/],
  ["another Playwright", { playwright: "1.65.0" }, /playwright: the baselines were made with "1\.64\.0"/],
];

for (const [why, change, message] of environmentPlants) {
  test(`the environment check fails on ${why}`, () => {
    const problems = compareEnvironment(ENVIRONMENT, { ...ENVIRONMENT, ...change }, PIN);
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], message);
  });
}

test("a manifest made in another image than the pin fails, even when this run matches it", () => {
  const other = { ...ENVIRONMENT, image: `mcr.microsoft.com/playwright@sha256:${"f".repeat(64)}` };
  const problems = compareEnvironment(other, other, PIN);
  assert.deepEqual(problems, [`${MANIFEST} names image ${other.image}, not the pinned ${PIN.image}: regenerate the baselines`]);
});

test("a manifest missing a field fails", () => {
  const { renderer: _renderer, ...partial } = ENVIRONMENT;
  const problems = compareEnvironment(partial, ENVIRONMENT, PIN);
  assert.ok(problems.some((problem) => /missing renderer/.test(problem)), problems.join("\n"));
});

// ── the runner: refusals and the container it starts ─────────────────────────────

function tree({ pin = PIN, manifest = ENVIRONMENT } = {}) {
  const scratch = path.join(root, ".generated");
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "run-visual-test-"));
  fs.mkdirSync(path.join(dir, path.dirname(PIN_FILE)), { recursive: true });
  fs.writeFileSync(path.join(dir, PIN_FILE), JSON.stringify(pin));
  fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(LOCK));
  if (manifest) {
    fs.mkdirSync(path.join(dir, path.dirname(MANIFEST)), { recursive: true });
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest));
  }
  return dir;
}

function runVisual({ argv = [], host = { platform: "linux", arch: "x64" }, probe = { status: 0, stdout: JSON.stringify(ENVIRONMENT) }, suite = { status: 0 }, ...plant } = {}) {
  const dir = tree(plant);
  const calls = [];
  const lines = [];
  try {
    const status = main(argv, {
      root: dir,
      ...host,
      execPath: "/opt/hostedtoolcache/node/22.23.3/x64/bin/node",
      uid: 1001,
      gid: 118,
      log: (line) => lines.push(line),
      run: (command, args) => {
        calls.push([command, ...args]);
        const probing = args.includes("scripts/visual-environment.mjs");
        const result = probing ? probe : suite;
        return typeof result === "function" ? result() : result;
      },
    });
    const manifest = fs.existsSync(path.join(dir, MANIFEST)) ? JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8")) : null;
    return { status, calls, output: lines.join("\n"), manifest };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("on a linux/amd64 host it checks the environment, then runs only the visual specs in the image", () => {
  const result = runVisual();
  assert.equal(result.status, 0, result.output);
  assert.equal(result.calls.length, 2);
  const [probe, suite] = result.calls;
  assert.equal(probe[0], "docker");
  assert.ok(probe.includes("scripts/visual-environment.mjs"));
  // A compare run never writes a baseline: a missing one fails instead of being created.
  assert.deepEqual(suite.slice(-5), ["/opt/node/bin/node", "node_modules/@playwright/test/cli.js", "test", "--output=test-results/visual", "--update-snapshots=none"]);
});

test("the container is the pinned image, for amd64, with the runner's exact Node first on PATH", () => {
  const args = dockerArgs({ root: "/work-root", nodePrefix: "/opt/hostedtoolcache/node/22.23.3/x64", pin: PIN, uid: 1001, gid: 118, command: ["true"] });
  const at = (flag, value) => args.some((arg, index) => arg === flag && args[index + 1] === value);
  assert.equal(args[0], "run");
  assert.ok(at("--platform", "linux/amd64"));
  assert.ok(at("-v", "/opt/hostedtoolcache/node/22.23.3/x64:/opt/node:ro"));
  assert.ok(at("-v", "/work-root:/work"));
  assert.ok(at("-e", "PLAYWRIGHT_VISUAL=1"));
  assert.ok(at("-e", `VISUAL_IMAGE=${PIN.image}`));
  assert.ok(args.some((arg) => arg.startsWith("PATH=/opt/node/bin:")));
  assert.ok(at("--user", "1001:118"));
  assert.equal(args.at(-2), PIN.image);
  assert.equal(args.at(-1), "true");
});

test("--update-snapshots=all writes the manifest from the probe and refreshes every baseline", () => {
  const result = runVisual({ argv: ["--update-snapshots=all"], manifest: null });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.manifest, ENVIRONMENT);
  assert.equal(result.calls[1].at(-1), "--update-snapshots=all");
});

const refusals = [
  ["a macOS host (its Node cannot run in the image)", { host: { platform: "darwin", arch: "arm64" } }, 2, /run only on a linux\/amd64 host[^]*Refresh visual baselines/],
  ["no container runtime", { probe: { error: Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }) } }, 2, /need docker, and none was found/],
  ["an environment probe that fails", { probe: { status: 1, stdout: "", stderr: "Executable doesn't exist" } }, 2, /the environment probe failed \(exit 1\): Executable doesn't exist/],
  ["an environment probe that prints no JSON", { probe: { status: 0, stdout: "chromium" } }, 2, /the environment probe printed no JSON/],
  ["no committed manifest", { manifest: null }, 1, /no environment manifest[^]*Refresh visual baselines/],
  ["a run in another environment than the baselines'", { probe: { status: 0, stdout: JSON.stringify({ ...ENVIRONMENT, browser: "chromium 141.0.0.0" }) } }, 1, /browser: the baselines were made with/],
  ["a pin that does not hold", { pin: { ...PIN, platform: "linux/arm64" } }, 2, /platform must be linux\/amd64/],
  ["an unknown argument", { argv: ["--grep", "home"] }, 2, /unknown argument --grep/],
  ["a failing visual spec", { suite: { status: 1 } }, 1, /visual specs failed in the pinned image/],
];

for (const [why, plant, status, message] of refusals) {
  test(`run-visual refuses ${why}`, () => {
    const result = runVisual(plant);
    assert.equal(result.status, status, result.output);
    assert.match(result.output, message);
  });
}

test("a refused environment runs no visual spec", () => {
  const result = runVisual({ manifest: null });
  assert.equal(result.calls.length, 1);
});

// ── the committed tree ───────────────────────────────────────────────────────────

test("the committed pin holds against the committed lock", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.deepEqual(checkPin(readPin(root), lock), []);
});

test("no workflow, script or config names the image by tag", () => {
  const files = scannedFiles(root);
  assert.ok(Object.keys(files).includes(".github/workflows/ci.yml"));
  assert.ok(Object.keys(files).includes("playwright.config.ts"));
  assert.deepEqual(tagReferences(files), []);
});

// The baselines are compared only against the environment they were made in, so the
// manifest must be committed with them, made in the image the pin names. Without it the
// browser job refuses at its last step; this fails it in the unit tier first.
test("the committed environment manifest records every field, made in the pinned image", () => {
  const file = path.join(root, MANIFEST);
  assert.ok(fs.existsSync(file), `${MANIFEST} is missing: commit the Refresh visual baselines workflow's artifact`);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const pin = readPin(root);
  assert.deepEqual(compareEnvironment(manifest, { ...manifest, image: pin.image, platform: pin.platform, playwright: pin.playwright }, pin), []);
});

test("the committed baselines are the linux set, and test:visual:update refreshes it in the image", () => {
  const names = fs.readdirSync(path.join(root, "tests/browser/__screenshots__/visual.spec.ts")).filter((name) => name.endsWith(".png"));
  const refresh = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts["test:visual:update"];
  assert.deepEqual(checkBaselines(names, refresh), []);
});
