// The pinned visual image: the one Playwright container the visual baselines are made
// and compared in. tests/browser/visual-image.json names it by digest for one platform
// (linux/amd64, the CI runners'), with the release tag and index digest it was read
// from, and the Playwright version it ships, which must be the lock's. A Playwright bump
// updates the lock and this file in one change. Nothing else may name the image by tag.
// tests/visual-environment.test.mjs plants each rule.
import fs from "node:fs";
import path from "node:path";

export const PIN_FILE = "tests/browser/visual-image.json";
export const PLATFORM = "linux/amd64";
const IMAGE = /^mcr\.microsoft\.com\/playwright@sha256:[0-9a-f]{64}$/;
const INDEX = /^sha256:[0-9a-f]{64}$/;
const LOCKED = ["@playwright/test", "playwright", "playwright-core"];
const TAG_REFERENCE = /mcr\.microsoft\.com\/playwright:[A-Za-z0-9._-]+/g;

export function readPin(root) {
  return JSON.parse(fs.readFileSync(path.join(root, PIN_FILE), "utf8"));
}

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

export function checkPin(pin, lock) {
  if (!pin || typeof pin !== "object") return [`${PIN_FILE} must be a JSON object`];
  const problems = [];
  if (!IMAGE.test(String(pin.image))) {
    problems.push(`${PIN_FILE}: image must be mcr.microsoft.com/playwright@sha256:<digest>, found ${pin.image}`);
  }
  if (pin.platform !== PLATFORM) {
    problems.push(`${PIN_FILE}: platform must be ${PLATFORM}, the CI runners' platform, found ${pin.platform}`);
  }
  if (!nonEmpty(pin.tag)) {
    problems.push(`${PIN_FILE}: tag must name the release tag the digest was read from`);
  } else if (!new RegExp(`^v${String(pin.playwright).replace(/\./g, "\\.")}(?:-|$)`).test(pin.tag)) {
    problems.push(`${PIN_FILE}: tag ${pin.tag} is not Playwright ${pin.playwright}`);
  }
  if (!INDEX.test(String(pin.index))) {
    problems.push(`${PIN_FILE}: index must be the tag's sha256 index digest, found ${pin.index}`);
  }
  for (const name of LOCKED) {
    const version = lock?.packages?.[`node_modules/${name}`]?.version ?? "none";
    if (version !== pin.playwright) {
      problems.push(`${PIN_FILE} pins Playwright ${pin.playwright}, but the lock has ${name} ${version}: update both in one change`);
    }
  }
  return problems;
}

// What may name the image: every workflow, script and config that could run it.
export function scannedFiles(root) {
  const files = {};
  const add = (relative) => {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) files[relative] = fs.readFileSync(file, "utf8");
  };
  for (const name of fs.readdirSync(path.join(root, ".github", "workflows")).sort()) {
    if (/\.ya?ml$/.test(name)) add(`.github/workflows/${name}`);
  }
  for (const name of fs.readdirSync(path.join(root, "scripts")).sort()) {
    if (/\.(?:mjs|js|sh)$/.test(name)) add(`scripts/${name}`);
  }
  add("playwright.config.ts");
  add("package.json");
  return files;
}

export function tagReferences(files) {
  const found = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(TAG_REFERENCE)) {
        found.push(`${file}:${index + 1} names ${match[0]}; use the digest in ${PIN_FILE}`);
      }
    });
  }
  return found;
}
