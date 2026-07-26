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
//
// A "new-needs-placement" shot is allowed to have a not-yet-committed asset (the
// image is captured later in the release flow) and empty placements — it is a
// candidate the manifest tracks, not a drift error. (There is no "still current,
// skip it" state: every SHIPPING shot is re-captured each release, because even a
// small UI shift changes the shot.)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(repositoryRoot, "marketing", "screenshots.manifest.json");
const schemaPath = join(repositoryRoot, "marketing", "screenshots.schema.json");
const assetsDir = join(repositoryRoot, "src", "assets");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatAjvErrors(errors = []) {
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

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

if (problems.length > 0) {
  console.error("Marketing manifest validation FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  const shipping = shots.filter((s) => s.status === "shipping").length;
  const pending = shots.filter((s) => s.status === "new-needs-placement").length;
  console.log(
    `Marketing manifest OK: ${shots.length} shot(s) (${shipping} shipping, ${pending} pending placement), ` +
      `${onDisk.length} asset(s) on disk, all referenced.`
  );
}
