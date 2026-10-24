// The desktop downloads (scripts/desktop-downloads.mjs): the files come from the pinned release by
// name, and a built page that links anything else, at "latest" or with another size or digest,
// fails. Planted on the v0.2.6 record, which has an Apple-silicon dmg and no Intel one, and on a
// release that adds an `-x64.dmg`, as core plans from 0.3.0.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { load } from "cheerio";

import { desktopDownloadProblems, desktopDownloads } from "../scripts/desktop-downloads.mjs";

const root = new URL("..", import.meta.url).pathname;
const core = JSON.parse(readFileSync(join(root, "sources/personalclaw.sources.json"), "utf8")).sources.core;
const pinned = { repository: core.repository, tag: core.tag, assets: core.releaseAssets };

/** A release that adds an Intel dmg, as 0.3.0 will. */
const withIntel = {
  ...pinned,
  assets: [...pinned.assets, { name: "PersonalClaw-0.2.6-x64.dmg", size: 231_500_000, sha256: "c".repeat(64) }]
};

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

test("at v0.2.6 the files are the Apple-silicon dmg, the AppImage and the deb, and no Intel dmg", () => {
  const downloads = desktopDownloads(pinned);
  assert.equal(downloads.mac.name, "PersonalClaw-0.2.6-arm64.dmg");
  assert.equal(downloads.mac.size, 222005580);
  assert.equal(downloads.mac.megabytes, "222.0 MB");
  assert.equal(downloads.mac.url, `https://github.com/${core.repository}/releases/download/${core.tag}/PersonalClaw-0.2.6-arm64.dmg`);
  assert.equal(downloads.mac.check, `echo "${downloads.mac.sha256}  PersonalClaw-0.2.6-arm64.dmg" | shasum -a 256 -c`);
  assert.equal(downloads.intel, null);
  assert.equal(downloads.appimage.name, "PersonalClaw-0.2.6.AppImage");
  assert.equal(downloads.deb.name, "personalclaw-desktop_0.2.6_amd64.deb");
});

test("at v0.2.6 the page passes with the Mac dmg and the Intel line, and fails with an Intel link", () => {
  const downloads = desktopDownloads(pinned);
  assert.deepEqual(desktopDownloadProblems(page(downloads), "/", pinned), []);
  assert.match(
    desktopDownloadProblems(page(downloads, { fallback: false }), "/", pinned).join("\n"),
    /no Intel dmg to offer, so it must say Intel Macs use the install script/
  );
  const planted = page(downloads, { extra: '<a href="#" data-desktop-download="intel">Intel Mac</a>' });
  assert.match(desktopDownloadProblems(planted, "/", pinned).join("\n"), /offers a download \(intel\) that the pinned v0\.2\.6 release does not have/);
});

test("with an Intel dmg the page links it, and no longer sends Intel Macs to the script", () => {
  const downloads = desktopDownloads(withIntel);
  assert.equal(downloads.intel.name, "PersonalClaw-0.2.6-x64.dmg");
  assert.equal(downloads.mac.name, "PersonalClaw-0.2.6-arm64.dmg", "the default Mac download stays the Apple-silicon dmg");
  assert.deepEqual(desktopDownloadProblems(page(downloads), "/", withIntel), []);
  assert.match(desktopDownloadProblems(page(downloads, { drop: ["intel"] }), "/", withIntel).join("\n"), /PersonalClaw-0\.2\.6-x64\.dmg download 0 times/);
  assert.match(
    desktopDownloadProblems(page(downloads, { fallback: true }), "/", withIntel).join("\n"),
    /offers the Intel dmg, so it must not send Intel Macs to the install script/
  );
});

test("a link at latest, another size, another digest or a missing file fails, by name", () => {
  const downloads = desktopDownloads(pinned);
  const problems = (plant) => desktopDownloadProblems(page(downloads, plant), "/release", pinned).join("\n");
  assert.match(
    problems({ href: { mac: `https://github.com/${core.repository}/releases/latest/download/PersonalClaw-0.2.6-arm64.dmg` } }),
    /links "latest"/
  );
  assert.match(problems({ size: { appimage: 1 } }), /does not carry PersonalClaw-0\.2\.6\.AppImage's size, 253364411 bytes/);
  assert.match(problems({ sha: { deb: "0".repeat(64) } }), /deb download's SHA-256 is 0{64}, the release records 1f341b15/);
  assert.match(problems({ shown: { mac: "f".repeat(64) } }), /shows PersonalClaw-0\.2\.6-arm64\.dmg's SHA-256 as f{64}/);
  assert.match(problems({ drop: ["deb"] }), /personalclaw-desktop_0\.2\.6_amd64\.deb download 0 times/);
  assert.match(problems({ macText: "Download for Mac" }), /does not say it is for Apple silicon/);
  assert.match(
    desktopDownloadProblems(load("<main></main>"), "/release", pinned).join("\n"),
    /expected one desktop downloads section, found 0/
  );
});
