// The desktop app's downloads, read from the pinned core release (Home's install panel, /release).
//
// Each file is the pinned release's own asset, linked at its tag and never at "latest", with the
// size and SHA-256 GitHub's release record holds (`core.releaseAssets`, which
// validate:release-parity holds to GitHub's). The files are found by name:
// - `-arm64.dmg`, the Mac download, labelled "Apple silicon" on every Mac;
// - `-x64.dmg`, the Intel Mac download, shown only when the pin has one. Without one, the page
//   says Intel Macs use the install script instead;
// - `.AppImage` and `_amd64.deb`, for x86-64 Linux.
// A re-pin that adds or drops one changes the page by itself, and scripts/validate-build.mjs fails a
// built page whose links, sizes or digests are not the pin's (desktopDownloadProblems).

import { assetUrl } from "./release-assets.mjs";

const KINDS = [
  { kind: "mac", pattern: /-arm64\.dmg$/, label: "Mac", detail: "Apple silicon" },
  { kind: "intel", pattern: /-x64\.dmg$/, label: "Intel Mac", detail: "Intel" },
  { kind: "appimage", pattern: /\.AppImage$/, label: "AppImage", detail: "x86-64 Linux" },
  { kind: "deb", pattern: /_amd64\.deb$/, label: ".deb", detail: "x86-64 Linux, Debian and Ubuntu" }
];

/** A size as /release writes it: one decimal of a megabyte. */
export const megabytes = (bytes) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} kB`;

/** The one-line check of a downloaded file: macOS's `shasum`, which prints "<file>: OK". */
export const shasumCheck = (asset) => `echo "${asset.sha256}  ${asset.name}" | shasum -a 256 -c`;

/**
 * @typedef {{ kind: string, label: string, detail: string, name: string, size: number, sha256: string,
 *   url: string, megabytes: string, check: string }} DesktopDownload
 */

/**
 * The desktop downloads the pinned release has, by kind; a kind the release lacks is null.
 *
 * @param {{ repository: string, tag: string, assets: { name: string, size: number, sha256: string }[] }} release
 * @returns {{ mac: DesktopDownload | null, intel: DesktopDownload | null, appimage: DesktopDownload | null, deb: DesktopDownload | null }}
 */
export function desktopDownloads(release) {
  /** @type {Record<string, DesktopDownload | null>} */
  const downloads = {};
  for (const { kind, pattern, label, detail } of KINDS) {
    const asset = release.assets.find((candidate) => pattern.test(candidate.name));
    downloads[kind] = asset
      ? {
          kind,
          label,
          detail,
          name: asset.name,
          size: asset.size,
          sha256: asset.sha256,
          url: assetUrl(release.repository, release.tag, asset.name),
          megabytes: megabytes(asset.size),
          check: shasumCheck(asset)
        }
      : null;
  }
  return /** @type {any} */ (downloads);
}

/**
 * What is wrong with the desktop downloads on a built page, against the pinned release: each
 * download link is a pinned asset at its tag, never "latest", carrying that asset's size and
 * SHA-256 (as `data-size` and `data-sha256`, and in the text it shows); each kind the release has
 * is offered once, and a kind it lacks is not; and without an Intel dmg the page says Intel Macs
 * use the install script, and with one it does not.
 *
 * @param {import("cheerio").CheerioAPI} $  the page
 * @param {string} page  its path, for the messages
 * @param {{ repository: string, tag: string, assets: { name: string, size: number, sha256: string }[] }} release
 * @returns {string[]}
 */
export function desktopDownloadProblems($, page, release) {
  const problems = [];
  const expected = desktopDownloads(release);
  const section = $("[data-desktop-downloads]");
  if (section.length !== 1) return [`${page}: expected one desktop downloads section, found ${section.length}`];

  for (const link of section.find("a[href*='/releases/']").toArray()) {
    const href = $(link).attr("href") ?? "";
    if (/\/releases\/latest\b/.test(href)) problems.push(`${page}: a desktop download links "latest" (${href}), not the pinned release`);
  }
  for (const [kind, download] of Object.entries(expected)) {
    const links = section.find(`a[data-desktop-download="${kind}"]`);
    if (!download) {
      if (links.length) problems.push(`${page} offers a download (${kind}) that the pinned ${release.tag} release does not have`);
      continue;
    }
    if (links.length !== 1) {
      problems.push(`${page} offers the ${download.name} download ${links.length} times, expected once`);
      continue;
    }
    if (links.attr("href") !== download.url) {
      problems.push(`${page}: the ${kind} download links ${links.attr("href")}, not the pinned asset ${download.url}`);
    }
    if (Number(links.attr("data-size")) !== download.size || !links.text().includes(download.megabytes)) {
      problems.push(`${page}: the ${kind} download does not carry ${download.name}'s size, ${download.size} bytes (${download.megabytes})`);
    }
    if (links.attr("data-sha256") !== download.sha256) {
      problems.push(`${page}: the ${kind} download's SHA-256 is ${links.attr("data-sha256") ?? "missing"}, the release records ${download.sha256}`);
    }
    if (!links.text().includes(download.name)) problems.push(`${page}: the ${kind} download does not name its file, ${download.name}`);
    const shown = section.find(`[data-desktop-sha256="${download.name}"]`).first().text().trim();
    if (shown !== download.sha256) problems.push(`${page} shows ${download.name}'s SHA-256 as ${shown || "nothing"}, the release records ${download.sha256}`);
    // As a reader copies it: the prompt off, whitespace as one space (as releasePageProblems reads).
    const asCopied = (text) => text.replace(/\s+/g, " ").trim().replace(/^\$ /, "");
    const check = asCopied(section.find(`[data-desktop-check="${download.name}"] code`).first().text());
    if (check !== asCopied(download.check)) {
      problems.push(`${page}: ${download.name}'s check is \`${check}\`, expected \`${download.check}\``);
    }
  }
  const fallback = section.find("[data-desktop-intel-fallback]").length;
  if (!expected.intel && fallback !== 1) problems.push(`${page} has no Intel dmg to offer, so it must say Intel Macs use the install script`);
  if (expected.intel && fallback !== 0) problems.push(`${page} offers the Intel dmg, so it must not send Intel Macs to the install script`);
  if (expected.mac && !/Apple silicon/.test(section.find('a[data-desktop-download="mac"]').text())) {
    problems.push(`${page}: the Mac download does not say it is for Apple silicon`);
  }
  return problems;
}
