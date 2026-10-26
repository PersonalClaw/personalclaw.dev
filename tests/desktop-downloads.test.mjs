// The desktop downloads (scripts/desktop-downloads.mjs): the files come from the pinned release by
// name, and a built page that links anything else, at "latest" or with another size or digest,
// fails. Planted on the pinned release's record (from v0.3.0, a dmg for each kind of Mac), and on
// one without its `-x64.dmg`, as every release before 0.3.0 was.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { load } from "cheerio";

import { desktopDownloadProblems, desktopDownloads } from "../scripts/desktop-downloads.mjs";

const root = new URL("..", import.meta.url).pathname;
const core = JSON.parse(readFileSync(join(root, "sources/personalclaw.sources.json"), "utf8")).sources.core;
const pinned = { repository: core.repository, tag: core.tag, assets: core.releaseAssets };
const version = core.tag.replace(/^v/, "");
const asset = (name) => core.releaseAssets.find((a) => a.name === name);
const dmg = `PersonalClaw-${version}-arm64.dmg`;
const appImage = `PersonalClaw-${version}.AppImage`;
const deb = `personalclaw-desktop_${version}_amd64.deb`;
const x64 = `PersonalClaw-${version}-x64.dmg`;
const re = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A release with no Intel dmg, as every one before 0.3.0 was. */
const withoutIntel = { ...pinned, assets: pinned.assets.filter((a) => a.name !== x64) };

/** A section as DesktopDownloads.astro renders it, from `downloads`, with `plant` edits. */
function page(downloads, plant = {}) {
  const link = (d, text) =>
    `<a href="${plant.href?.[d.kind] ?? d.url}" data-desktop-download="${d.kind}" data-size="${plant.size?.[d.kind] ?? d.size}" ` +
    `data-sha256="${plant.sha?.[d.kind] ?? d.sha256}">${text} ${d.name} ${d.megabytes}</a>` +
    `<code data-desktop-sha256="${d.name}">${plant.shown?.[d.kind] ?? d.sha256}</code>` +
    `<div data-desktop-check="${d.name}"><div class="command-block"><code>$ ${d.check}</code></div></div>`;
  const parts = [];
  if (downloads.mac && !plant.drop?.includes("mac")) parts.push(link(downloads.mac, plant.macText ?? "Download for Mac Apple silicon"));
  if (downloads.intel && !plant.drop?.includes("intel")) parts.push(link(downloads.intel, "Intel Mac"));
  if (plant.fallback ?? !downloads.intel) parts.push('<p data-desktop-intel-fallback>Intel Mac? <a href="#steps">Use the install script</a></p>');
  for (const kind of ["appimage", "deb"]) if (downloads[kind] && !plant.drop?.includes(kind)) parts.push(link(downloads[kind], kind));
  if (plant.extra) parts.push(plant.extra);
  return load(`<section data-desktop-downloads>${parts.join("")}</section>`);
}

test("at the pin the files are the two Mac dmgs, the AppImage and the deb", () => {
  const downloads = desktopDownloads(pinned);
  assert.equal(downloads.mac.name, dmg);
  assert.equal(downloads.mac.size, asset(dmg).size);
  assert.equal(downloads.mac.megabytes, `${(asset(dmg).size / 1e6).toFixed(1)} MB`);
  assert.equal(downloads.mac.url, `https://github.com/${core.repository}/releases/download/${core.tag}/${dmg}`);
  assert.equal(downloads.mac.check, `echo "${asset(dmg).sha256}  ${dmg}" | shasum -a 256 -c`);
  assert.equal(downloads.intel.name, x64);
  assert.equal(downloads.intel.size, asset(x64).size);
  assert.equal(downloads.intel.url, `https://github.com/${core.repository}/releases/download/${core.tag}/${x64}`);
  assert.equal(downloads.appimage.name, appImage);
  assert.equal(downloads.deb.name, deb);
});

test("at the pin the page links the Intel dmg, and no longer sends Intel Macs to the script", () => {
  const downloads = desktopDownloads(pinned);
  assert.equal(downloads.mac.name, dmg, "the default Mac download stays the Apple-silicon dmg");
  assert.deepEqual(desktopDownloadProblems(page(downloads), "/", pinned), []);
  assert.match(desktopDownloadProblems(page(downloads, { drop: ["intel"] }), "/", pinned).join("\n"), new RegExp(`${re(x64)} download 0 times`));
  assert.match(
    desktopDownloadProblems(page(downloads, { fallback: true }), "/", pinned).join("\n"),
    /offers the Intel dmg, so it must not send Intel Macs to the install script/
  );
});

test("without an Intel dmg the page sends Intel Macs to the script, and fails with an Intel link", () => {
  const downloads = desktopDownloads(withoutIntel);
  assert.equal(downloads.intel, null);
  assert.deepEqual(desktopDownloadProblems(page(downloads), "/", withoutIntel), []);
  assert.match(
    desktopDownloadProblems(page(downloads, { fallback: false }), "/", withoutIntel).join("\n"),
    /no Intel dmg to offer, so it must say Intel Macs use the install script/
  );
  const planted = page(downloads, { extra: '<a href="#" data-desktop-download="intel">Intel Mac</a>' });
  assert.match(desktopDownloadProblems(planted, "/", withoutIntel).join("\n"), new RegExp(`offers a download \\(intel\\) that the pinned ${re(core.tag)} release does not have`));
});

test("a link at latest, another size, another digest or a missing file fails, by name", () => {
  const downloads = desktopDownloads(pinned);
  const problems = (plant) => desktopDownloadProblems(page(downloads, plant), "/release", pinned).join("\n");
  assert.match(
    problems({ href: { mac: `https://github.com/${core.repository}/releases/latest/download/${dmg}` } }),
    /links "latest"/
  );
  assert.match(problems({ size: { appimage: 1 } }), new RegExp(`does not carry ${re(appImage)}'s size, ${asset(appImage).size} bytes`));
  assert.match(problems({ sha: { deb: "0".repeat(64) } }), new RegExp(`deb download's SHA-256 is 0{64}, the release records ${asset(deb).sha256.slice(0, 8)}`));
  assert.match(problems({ shown: { mac: "f".repeat(64) } }), new RegExp(`shows ${re(dmg)}'s SHA-256 as f{64}`));
  assert.match(problems({ drop: ["deb"] }), new RegExp(`${re(deb)} download 0 times`));
  assert.match(problems({ macText: "Download for Mac" }), /does not say it is for Apple silicon/);
  assert.match(
    desktopDownloadProblems(load("<main></main>"), "/release", pinned).join("\n"),
    /expected one desktop downloads section, found 0/
  );
});
