// Render every shipping video the marketing manifest names from its composition (#94).
//
//   npm run render:videos                  every shipping entry with a composition
//   npm run render:videos -- --only tour   the named entries
//   npm run render:videos -- --check       stage and run `hyperframes check` only, render nothing
//
// For each entry it:
//   1. stages the composition (marketing/compositions/<id>/) in a scratch folder under
//      .generated/, with each source the entry names copied into its assets/: a shot's PNG
//      (src/assets/) or a recorded clip (marketing/.captures/clips/, captured at the release
//      like every shot, and not committed);
//   2. runs `hyperframes check --json`, the CLI's gate, and stops on any error;
//   3. renders it with `hyperframes render --quality delivery` (at the entry's `crf` when it names
//      one, so a loop fits its budget), and confirms with ffprobe that the output lasts the
//      entry's `durationSeconds`;
//   4. extracts its poster with FFmpeg at `posterAtSeconds` (0 by default), as a PNG that cwebp
//      encodes, since many FFmpeg builds carry no WebP encoder;
//   5. moves the output and the poster to the entry's `output` and `poster`, prints the sizes,
//      and fails over the entry's `budgetBytes`.
//
// It fails before rendering anything when FFmpeg, ffprobe or cwebp is not on PATH, or when the pinned
// Hyperframes CLI is not already in npx's cache: fetching it is a supply-chain step the
// maintainer approves (.agents/skills/README.md), so this script never fetches it. Every cached
// copy of the pinned release must carry the npm tarball's integrity the README records, as npm
// wrote it in that copy's package-lock.json, or nothing runs. The CLI runs with telemetry, its
// update check, its self-install and its skills refresh all off.
//
// Renders run on the release operator's machine, against captures of the released tag
// (marketing/README.md). Nothing here runs in CI.

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** The CLI release the skills are pinned to (.agents/skills/README.md). */
export const HYPERFRAMES = "hyperframes@0.8.186";

/** That release's npm tarball, by the integrity the registry publishes for it (`dist.integrity`). */
export const HYPERFRAMES_INTEGRITY =
  "sha512-JcBRmBdr955LU40+yWarQFL6c3MLeuJqPnYW9tFCS7yLiQGbB5YyoOuhJw5VaDbNHkmM0afn77Dlup5d2q3Anw==";

/** Everything the CLI would otherwise send or change on its own, off. */
export const HYPERFRAMES_ENV = Object.freeze({
  DO_NOT_TRACK: "1",
  HYPERFRAMES_NO_TELEMETRY: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_NO_AUTO_INSTALL: "1",
  HYPERFRAMES_SKIP_SKILLS: "1"
});

/** How far an output's duration may stray from its entry's, in seconds. */
const DURATION_SLACK = 0.1;

/**
 * Where each of an entry's sources is found: a shot by its asset, a clip by its capture.
 *
 * @param {any} manifest
 * @param {any} video
 * @returns {{ id: string, file: string }[]}
 */
export function sourceFiles(manifest, video) {
  const shots = new Map((manifest.shots ?? []).map((shot) => [shot.id, shot.asset]));
  const clips = new Map((manifest.clips ?? []).map((clip) => [clip.id, clip.file]));
  return (video.sources ?? []).map((id) => {
    const file = clips.get(id) ?? shots.get(id);
    if (!file) throw new Error(`video "${video.id}" names a source the manifest has neither as a shot nor a clip: ${id}`);
    return { id, file };
  });
}

/**
 * The shipping entries this run renders: each has a composition, and `only` narrows them.
 *
 * @param {any} manifest
 * @param {string[]} [only]
 */
export function videosToRender(manifest, only = []) {
  const shipping = (manifest.videos ?? []).filter((video) => video.status === "shipping" && video.composition);
  const unknown = only.filter((id) => !shipping.some((video) => video.id === id));
  if (unknown.length) throw new Error(`no shipping video with a composition is named ${unknown.join(", ")}`);
  return only.length ? shipping.filter((video) => only.includes(video.id)) : shipping;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function requireTool(command, why, install) {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} is not on PATH; ${why}. Install ${install}, then run again.`);
  }
}

function hyperframes(args, cwd) {
  return run("npx", ["--no-install", HYPERFRAMES, ...args], {
    cwd,
    env: { ...process.env, ...HYPERFRAMES_ENV }
  });
}

/**
 * What is wrong with npx's cached copies of the pinned CLI: none at all, or one whose
 * package-lock.json says npm installed another tarball than the pinned one, or from elsewhere
 * than the npm registry. Empty when every cached copy is the pinned release.
 *
 * @param {string} cacheRoot npm's cache folder (`npm_config_cache`, else ~/.npm)
 * @param {string} [integrity]
 * @returns {string[]}
 */
export function cachedCliProblems(cacheRoot, integrity = HYPERFRAMES_INTEGRITY) {
  const [name, version] = HYPERFRAMES.split("@");
  const npx = join(cacheRoot, "_npx");
  const copies = [];
  for (const folder of existsSync(npx) ? readdirSync(npx) : []) {
    const lock = join(npx, folder, "package-lock.json");
    if (!existsSync(lock)) continue;
    const entry = JSON.parse(readFileSync(lock, "utf8")).packages?.[`node_modules/${name}`];
    if (entry?.version === version) copies.push({ folder: join(npx, folder), entry });
  }
  if (copies.length === 0) {
    return [
      `${HYPERFRAMES} is not in npx's cache (${npx}), and this script never fetches it. Fetching it ` +
        "is a supply-chain step the maintainer approves (.agents/skills/README.md)."
    ];
  }
  const tarball = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
  const problems = [];
  for (const { folder, entry } of copies) {
    if (entry.integrity !== integrity) {
      problems.push(
        `the cached ${HYPERFRAMES} in ${folder} was installed from a tarball with integrity ` +
          `${entry.integrity ?? "(none recorded)"}, not the pinned ${integrity}. Remove that folder.`
      );
    }
    if (entry.resolved !== tarball) {
      problems.push(`the cached ${HYPERFRAMES} in ${folder} came from ${entry.resolved ?? "(nowhere recorded)"}, not ${tarball}`);
    }
  }
  return problems;
}

function durationOf(file) {
  const probe = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(probe.stdout.trim());
}

/**
 * Render the videos *argv* names, under *repoRoot*. Exported so tests/render-videos.test.mjs can
 * run it on a site of its own; returns the problems it found, which the command prints.
 *
 * @param {string[]} argv
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function main(argv, repoRoot = root) {
  const only = [];
  let checkOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") only.push(...String(argv[++i] ?? "").split(",").filter(Boolean));
    else if (argv[i] === "--check") checkOnly = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }

  const manifest = JSON.parse(readFileSync(join(repoRoot, "marketing", "screenshots.manifest.json"), "utf8"));
  const videos = videosToRender(manifest, only);
  if (videos.length === 0) {
    console.log("No shipping video has a composition yet, so there is nothing to render.");
    return [];
  }
  // Every listed composition is there before anything runs, so a missing one fails at once.
  const missing = videos.filter((video) => !existsSync(join(repoRoot, video.composition)));
  if (missing.length) {
    return missing.map((video) => `video "${video.id}": its composition ${video.composition} is missing`);
  }

  requireTool("ffmpeg", "it extracts each poster", "FFmpeg (it ships ffprobe)");
  requireTool("ffprobe", "it confirms each render's duration", "FFmpeg (it ships ffprobe)");
  requireTool("cwebp", "it encodes each poster as WebP", "libwebp (it ships cwebp)");
  const cached = cachedCliProblems(process.env.npm_config_cache || join(homedir(), ".npm"));
  if (cached.length) throw new Error(cached.join("\n"));
  const version = hyperframes(["--version"], repoRoot);
  if (version.status !== 0) {
    throw new Error(`${HYPERFRAMES} would not start from npx's cache:\n${version.stdout}${version.stderr}`);
  }

  const scratchRoot = join(repoRoot, ".generated");
  mkdirSync(scratchRoot, { recursive: true });
  const problems = [];
  for (const video of videos) {
    const composition = join(repoRoot, dirname(video.composition));
    const work = mkdtempSync(join(scratchRoot, `render-${video.id}-`));
    try {
      cpSync(composition, work, { recursive: true });
      mkdirSync(join(work, "assets"), { recursive: true });
      for (const source of sourceFiles(manifest, video)) {
        const from = join(repoRoot, source.file);
        if (!existsSync(from)) {
          throw new Error(`video "${video.id}": its source ${source.id} is not captured yet (${source.file})`);
        }
        copyFileSync(from, join(work, "assets", `${source.id}${extname(source.file)}`));
      }

      const check = hyperframes(["check", "--json"], work);
      if (check.status !== 0) {
        problems.push(`video "${video.id}": hyperframes check failed:\n${check.stdout}${check.stderr}`);
        continue;
      }
      if (checkOnly) {
        console.log(`${video.id}: check passed`);
        continue;
      }

      const rendered = join(work, `${video.id}${extname(video.output)}`);
      const format = extname(video.output).slice(1);
      const rate = video.crf === undefined ? [] : ["--crf", String(video.crf)];
      const render = hyperframes(["render", "--quality", "delivery", ...rate, "--format", format, "--output", rendered], work);
      if (render.status !== 0 || !existsSync(rendered)) {
        problems.push(`video "${video.id}": hyperframes render failed:\n${render.stdout}${render.stderr}`);
        continue;
      }
      const lasts = durationOf(rendered);
      if (Math.abs(lasts - video.durationSeconds) > DURATION_SLACK) {
        problems.push(`video "${video.id}" rendered ${lasts.toFixed(2)} s long, its entry says ${video.durationSeconds} s`);
        continue;
      }

      const poster = join(work, basename(video.poster));
      const frame = join(work, "poster.png");
      const at = String(video.posterAtSeconds ?? 0);
      const still = run("ffmpeg", ["-v", "error", "-y", "-ss", at, "-i", rendered, "-frames:v", "1", frame]);
      if (still.status !== 0 || !existsSync(frame)) {
        problems.push(`video "${video.id}": ffmpeg could not extract its poster at ${at} s:\n${still.stderr}`);
        continue;
      }
      const encoded = run("cwebp", ["-quiet", "-q", "86", frame, "-o", poster]);
      if (encoded.status !== 0 || !existsSync(poster)) {
        problems.push(`video "${video.id}": cwebp could not encode its poster:\n${encoded.stderr}`);
        continue;
      }

      const size = statSync(rendered).size;
      if (size > video.budgetBytes) {
        problems.push(`video "${video.id}" is over its budget: ${size} bytes, its budget ${video.budgetBytes}`);
        continue;
      }
      // public/media/ is absent on a site that ships no video yet.
      for (const rel of [video.output, video.poster]) mkdirSync(dirname(join(repoRoot, rel)), { recursive: true });
      renameSync(rendered, join(repoRoot, video.output));
      renameSync(poster, join(repoRoot, video.poster));
      console.log(
        `${video.id}: ${video.output} ${size} bytes (budget ${video.budgetBytes}), ${lasts.toFixed(2)} s; ` +
          `poster ${video.poster} ${statSync(join(repoRoot, video.poster)).size} bytes`
      );
    } catch (error) {
      problems.push(String(error?.message ?? error));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const problems = main(process.argv.slice(2));
    if (problems.length) {
      console.error(`render:videos FAILED:\n- ${problems.join("\n- ")}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`render:videos: ${error.message}`);
    process.exitCode = 1;
  }
}
