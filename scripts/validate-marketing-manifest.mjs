// Validate the marketing screenshot + content manifest against its schema AND
// against the actual repository state, so the manifest can never silently drift
// from what's on disk / rendered. Mirrors the validate-visual-baselines guard:
// prints a summary and sets a non-zero exit code on any problem.
//
// Checks:
//   1. marketing/screenshots.manifest.json validates against its JSON Schema.
//   2. every "shipping" shot has its `asset` PNG present in src/assets/ (a shot
//      that ships on the site must have its image).
//   3. no orphan: every src/assets/*.png is referenced by exactly one shot (a new
//      screenshot committed without a manifest entry, or a manifest entry whose
//      file was deleted, both fail here).
//   4. every placement `file` exists in the repo (the site location is real).
//   5. manifest targetRelease === package.json version (captures were taken for
//      the release the site publishes; a new release without a re-capture reds).
//   6. videos (#94): every shipping video's output, poster and captions exist, a
//      narrative video has captions, each source names a shot, each output fits its
//      byte budget, each audio asset has its file (its source and licence are the
//      schema's), and every file in public/media/ belongs to a video.
//
// A "new-needs-placement" shot is allowed to have a not-yet-committed asset (the
// image is captured later in the release flow) and empty placements — it is a
// candidate the manifest tracks, not a drift error. (There is no "still current,
// skip it" state: every SHIPPING shot is re-captured each release, because even a
// small UI shift changes the shot.)

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const siteRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatAjvErrors(errors = []) {
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

/**
 * Everything wrong with the manifest under *repositoryRoot*, against its schema and the files
 * there, with the counts the summary line says.
 *
 * @param {string} [repositoryRoot]
 * @returns {{ problems: string[], summary: string }}
 */
export function manifestProblems(repositoryRoot = siteRoot) {
  const manifestPath = join(repositoryRoot, "marketing", "screenshots.manifest.json");
  const schemaPath = join(repositoryRoot, "marketing", "screenshots.schema.json");
  const assetsDir = join(repositoryRoot, "src", "assets");
  const mediaDir = join(repositoryRoot, "public", "media");
  const problems = [];

  const manifest = readJson(manifestPath);
  const schema = readJson(schemaPath);

  // 1. schema
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    problems.push(`schema: ${formatAjvErrors(validate.errors)}`);
  }

  const shots = Array.isArray(manifest.shots) ? manifest.shots : [];

  // unique ids
  const seenIds = new Set();
  for (const shot of shots) {
    if (seenIds.has(shot.id)) problems.push(`duplicate shot id: ${shot.id}`);
    seenIds.add(shot.id);
  }

  // 2. shipping shots must have their asset on disk; 3. build the referenced set
  const referenced = new Set();
  for (const shot of shots) {
    const rel = shot.asset; // e.g. src/assets/dashboard.png
    const abs = join(repositoryRoot, rel);
    referenced.add(rel);
    const shipping = shot.status === "shipping";
    if (shipping && !existsSync(abs)) {
      problems.push(`shot "${shot.id}" is ${shot.status} but its asset is missing: ${rel}`);
    }
    // 4. placement files must exist
    for (const placement of shot.placements || []) {
      if (!existsSync(join(repositoryRoot, placement.file))) {
        problems.push(`shot "${shot.id}" placement file does not exist: ${placement.file}`);
      }
    }
    // a shipping shot must name at least one placement (where it renders)
    if (shipping && (shot.placements || []).length === 0) {
      problems.push(`shot "${shot.id}" is ${shot.status} but has no placements`);
    }
  }

  // 3. orphan check — every committed src/assets/*.png must be in the manifest
  const onDisk = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((f) => f.endsWith(".png"))
    : [];
  for (const file of onDisk) {
    const rel = `src/assets/${file}`;
    if (!referenced.has(rel)) {
      problems.push(`orphan asset (no manifest entry): ${rel} — add a shot or remove the file`);
    }
  }

  // 5. capture ↔ release parity — the shots must have been (re-)captured for the
  // version this site publishes. validate-release-parity already pins package.json
  // to the published core tag; pinning targetRelease to package.json closes the
  // loop: the day a new release ships without a re-capture pass, this reds instead
  // of the site silently showing the previous release's chrome. (The manifest's own
  // rule: every SHIPPING shot is re-captured each release — this makes that rule
  // mechanical rather than remembered.)
  const siteVersion = readJson(join(repositoryRoot, "package.json")).version;
  if (manifest.targetRelease !== siteVersion) {
    problems.push(
      `capture/release drift: manifest targetRelease is "${manifest.targetRelease}" but the site ` +
        `publishes ${siteVersion} — re-capture the shipping shots against a ${siteVersion} gateway ` +
        `(scripts/capture-app-shots.mjs + the manifest runbook), then bump targetRelease`,
    );
  }

  // 6. videos — the files each shipping entry plays, its budget, and nothing unowned in
  // public/media/.
  const videos = Array.isArray(manifest.videos) ? manifest.videos : [];
  const shotIds = new Set(shots.map((s) => s.id));
  const videoIds = new Set();
  const mediaReferenced = new Set();
  for (const video of videos) {
    if (videoIds.has(video.id)) problems.push(`duplicate video id: ${video.id}`);
    videoIds.add(video.id);
    const files = [video.output, video.poster, video.captions].filter(Boolean);
    for (const rel of files) mediaReferenced.add(rel);
    for (const placement of video.placements || []) {
      if (!existsSync(join(repositoryRoot, placement.file))) {
        problems.push(`video "${video.id}" placement file does not exist: ${placement.file}`);
      }
    }
    for (const source of video.sources || []) {
      if (!shotIds.has(source)) problems.push(`video "${video.id}" names a source no shot has: ${source}`);
    }
    for (const asset of video.audio || []) {
      if (!existsSync(join(repositoryRoot, asset.file))) {
        problems.push(`video "${video.id}" names an audio file that is missing: ${asset.file}`);
      }
    }
    if (video.status !== "shipping") continue;
    if ((video.placements || []).length === 0) {
      problems.push(`video "${video.id}" is shipping but has no placements`);
    }
    if (video.kind === "narrative" && !video.captions) {
      problems.push(`video "${video.id}" is narrative but has no captions track`);
    }
    for (const rel of files) {
      if (!existsSync(join(repositoryRoot, rel))) {
        problems.push(`video "${video.id}" is shipping but a file it plays is missing: ${rel}`);
      }
    }
    const output = join(repositoryRoot, video.output);
    if (existsSync(output) && statSync(output).size > video.budgetBytes) {
      problems.push(
        `video "${video.id}" is over its budget: ${video.output} is ${statSync(output).size} bytes, ` +
          `its budget ${video.budgetBytes}`
      );
    }
  }
  const mediaOnDisk = existsSync(mediaDir) ? readdirSync(mediaDir).filter((f) => !f.startsWith(".")) : [];
  for (const file of mediaOnDisk) {
    const rel = `public/media/${file}`;
    if (!mediaReferenced.has(rel)) {
      problems.push(`orphan media file (no video plays it): ${rel} — add it to a video or remove it`);
    }
  }

  const shipping = shots.filter((s) => s.status === "shipping").length;
  const pending = shots.filter((s) => s.status === "new-needs-placement").length;
  const shippingVideos = videos.filter((v) => v.status === "shipping").length;
  return {
    problems,
    summary:
      `Marketing manifest OK: ${shots.length} shot(s) (${shipping} shipping, ${pending} pending placement), ` +
      `${onDisk.length} asset(s) on disk, all referenced; ${videos.length} video(s) (${shippingVideos} shipping), ` +
      `${mediaOnDisk.length} media file(s), all owned and within budget.`
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { problems, summary } = manifestProblems();
  if (problems.length > 0) {
    console.error("Marketing manifest validation FAILED:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(summary);
  }
}
